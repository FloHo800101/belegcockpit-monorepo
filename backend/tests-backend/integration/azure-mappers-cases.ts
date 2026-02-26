// Run from backend/: pnpm test:azure-mappers
//
// Integrationstest: Liest bestehende Azure-Analyze-Ergebnisse aus document_analyze_runs,
// wendet die passenden Mapper (Invoice, Receipt, BankStatement, Layout) an und validiert
// die geparsten Felder (Rechnungsnummer, Beträge, Adressen, MwSt, Transaktionen) gegen
// die Azure-Rohdaten. Das geparste Ergebnis wird zurück in die DB geschrieben.
// Mit FORCE_REPARSE=1 werden auch bereits geparste Einträge erneut verarbeitet.

import {
  mapAzureBankStatementToParseResult,
  mapAzureInvoiceToParseResult,
  mapAzureLayoutToParseResult,
  mapAzureReceiptToParseResult,
} from "../../supabase/functions/_shared/azure-mappers.ts";
import { detectDocumentType } from "../../supabase/functions/_shared/document-type-detection.ts";
import {
  assert,
  assertClose,
  createSupabaseTestClient,
  loadEnvFiles,
} from "./_shared.ts";

const RUNS_TABLE = "document_analyze_runs";
const FORCE_REPARSE = Deno.env.get("FORCE_REPARSE") === "1";
const SHOULD_ASSERT = !FORCE_REPARSE;
let TENANT_ID: string | null = null;
let FROM: string | null = null;
let TO: string | null = null;
let LIMIT_DOCS: number | null = null;
const DOCUMENTS_TABLE = "documents";

function assertIf(condition: unknown, message: string) {
  if (!SHOULD_ASSERT) return;
  assert(condition, message);
}

function assertCloseIf(
  actual: number | null | undefined,
  expected: number | null | undefined,
  delta?: number
) {
  if (!SHOULD_ASSERT) return;
  if (actual == null || expected == null) return;
  assertClose(actual, expected, delta);
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const percent = Number(normalized);
  if (Number.isNaN(percent)) return null;
  return percent / 100;
}

type AnalyzeRun = {
  id: string;
  document_id?: string | null;
  storage_path?: string | null;
  model_id: string;
  analyze_result: unknown;
  parsed_data?: unknown;
};

type DocumentRow = {
  id: string;
  storage_path: string;
  tenant_id: string | null;
  created_at: string | null;
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadDocumentsById(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  documentIds: string[]
) {
  const map = new Map<string, DocumentRow>();
  for (const group of chunk(documentIds, 200)) {
    const { data, error } = await (supabase.from(DOCUMENTS_TABLE) as any)
      .select("id, storage_path, tenant_id, created_at")
      .in("id", group);
    if (error) throw new Error(`Failed to load documents by id: ${error.message}`);
    for (const row of (data ?? []) as DocumentRow[]) map.set(row.id, row);
  }
  return map;
}

async function loadDocumentsByPath(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  storagePaths: string[]
) {
  const map = new Map<string, DocumentRow>();
  for (const group of chunk(storagePaths, 200)) {
    const { data, error } = await (supabase.from(DOCUMENTS_TABLE) as any)
      .select("id, storage_path, tenant_id, created_at")
      .in("storage_path", group);
    if (error) throw new Error(`Failed to load documents by path: ${error.message}`);
    for (const row of (data ?? []) as DocumentRow[]) map.set(row.storage_path, row);
  }
  return map;
}

function toDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString();
}

function toOptionalInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesFilters(row: DocumentRow | null): boolean {
  if (!TENANT_ID && !FROM && !TO) return true;
  if (!row) return false;
  if (TENANT_ID && row.tenant_id !== TENANT_ID) return false;
  if ((FROM || TO) && !row.created_at) return false;
  if (FROM && row.created_at && row.created_at < toDateTime(FROM)) return false;
  if (TO && row.created_at && row.created_at > toDateTime(TO)) return false;
  return true;
}

async function run() {
  await loadEnvFiles();
  TENANT_ID = Deno.env.get("TENANT_ID") ?? Deno.env.get("SUPABASE_LIVE_TENANT_ID") ?? null;
  FROM = Deno.env.get("FROM") ?? null;
  TO = Deno.env.get("TO") ?? null;
  LIMIT_DOCS = toOptionalInt(Deno.env.get("LIMIT_DOCS"));
  const supabase = createSupabaseTestClient();
  type AzureAnalyzeResult = {
    content?: string;
    documents?: Array<{ fields?: Record<string, any> }>;
    keyValuePairs?: unknown[];
    tables?: unknown[];
  };

  let query = (supabase.from(RUNS_TABLE) as any).select(
    "id, document_id, model_id, analyze_result, parsed_data, storage_path"
  );
  if (!FORCE_REPARSE) {
    query = query.is("parsed_data", null);
  }
  const { data: runs, error } = await query;
  if (error) {
    throw new Error(`Failed to load analyze runs: ${error.message}`);
  }
  const runList = (runs ?? []) as AnalyzeRun[];
  if (!runList.length) {
    console.log(
      "[azure-mappers] nothing to do (all parsed_data present).",
      FORCE_REPARSE ? "FORCE_REPARSE=1 was set." : ""
    );
    return;
  }

  const documentIds = Array.from(
    new Set(runList.map((run) => run.document_id ?? null).filter(Boolean) as string[])
  );
  const storagePaths = Array.from(
    new Set(runList.map((run) => run.storage_path ?? null).filter(Boolean) as string[])
  );
  const documentMapById = await loadDocumentsById(supabase, documentIds);
  const documentMapByPath = await loadDocumentsByPath(supabase, storagePaths);

  let processed = 0;

  for (const run of runList) {
    const rowById = run.document_id ? documentMapById.get(run.document_id) ?? null : null;
    const rowByPath = run.storage_path ? documentMapByPath.get(run.storage_path) ?? null : null;
    const docRow = rowById ?? rowByPath;
    if (!matchesFilters(docRow)) continue;
    if (LIMIT_DOCS && processed >= LIMIT_DOCS) break;

    const modelId = run.model_id as string;
    const analyze = run.analyze_result as AzureAnalyzeResult | null;
    if (!analyze) {
      throw new Error(`Analyze result is empty for run ${run.id} (${modelId}).`);
    }

    if (modelId === "prebuilt-invoice") {
      const detectionMeta = detectDocumentType({
        text: (analyze.content ?? "").toString(),
        fileName: (run.storage_path as string | null)?.split("/").pop() ?? null,
        azureResult: analyze,
      });

      if (detectionMeta.documentType === "bank_statement") {
        const bankRes = mapAzureBankStatementToParseResult(
          analyze,
          (run.storage_path as string | null)?.split("/").pop() ?? null
        );
        assertIf(bankRes.parsed, "Bank statement parsed result missing");
        if (!bankRes.parsed) continue;
        const parsed = bankRes.parsed;
        const transactions = parsed.transactions ?? [];
        assertIf(parsed.documentType === "bank_statement", "Bank statement documentType");
        assertIf(transactions.length > 0, "Bank statement transactions present");

        const periodYear = parsed.statementPeriod?.to
          ? Number(parsed.statementPeriod.to.slice(0, 4))
          : null;
        if (periodYear && Number.isFinite(periodYear)) {
          for (const tx of transactions) {
            const bookingYear = tx.bookingDate ? Number(tx.bookingDate.slice(0, 4)) : Number.NaN;
            assertIf(bookingYear === periodYear, "Bank tx year follows statement period year");
          }
        }

        const mergedCount = Number(
          (parsed.rawMeta as { mergedCount?: number } | null)?.mergedCount ?? Number.NaN
        );
        if (Number.isFinite(mergedCount)) {
          assertIf(mergedCount === transactions.length, "Bank mergedCount equals tx length");
        }

        const storagePath = (run.storage_path as string | null) ?? "";
        if (storagePath.includes("2025-05-digitalwirt-gmbh-7953-hauptkonto-1-statement.pdf")) {
          assertIf(transactions.length > 34, "Regression: expected >34 transactions for target statement");
          for (const tx of transactions) {
            const bookingYear = tx.bookingDate ? Number(tx.bookingDate.slice(0, 4)) : Number.NaN;
            assertIf(bookingYear === 2025, "Regression: target statement transactions must use year 2025");
          }
          const hasForeignCurrency = transactions.some(
            (tx: any) =>
              typeof tx.foreignCurrency === "string" &&
              tx.foreignCurrency.trim().length > 0 &&
              Number.isFinite(Number(tx.foreignAmount))
          );
          assertIf(
            hasForeignCurrency,
            "Regression: target statement should include at least one foreign-currency transaction"
          );
        }

        const { error: updateError } = await (supabase.from(RUNS_TABLE) as any)
          .update({
            parsed_data: parsed,
            parse_confidence: bankRes.confidence,
          })
          .eq("id", run.id);
        if (updateError) {
          throw new Error(`Failed to update bank-statement run ${run.id}: ${updateError.message}`);
        }
        processed += 1;
        continue;
      }

      const invoiceRes = mapAzureInvoiceToParseResult(analyze);
      assertIf(invoiceRes.parsed, "Invoice parsed result missing");
      if (!invoiceRes.parsed) continue;
      const parsed = invoiceRes.parsed;
      assertIf(parsed.sourceType === "invoice", "Invoice sourceType");
      const invoiceDoc = analyze.documents?.[0];
      const invoiceFields = invoiceDoc?.fields ?? {};
      const expectedInvoiceId =
        invoiceFields.InvoiceId?.valueString ??
        invoiceFields.InvoiceId?.content ??
        undefined;
      if (expectedInvoiceId) {
        assertIf(
          parsed.invoiceNumber === expectedInvoiceId,
          "Invoice number"
        );
      }
      const expectedInvoiceDate = invoiceFields.InvoiceDate?.valueDate ?? undefined;
      if (expectedInvoiceDate) {
        assertIf(
          parsed.invoiceDate === expectedInvoiceDate,
          "Invoice date"
        );
      }
      const expectedDueDate = invoiceFields.DueDate?.valueDate ?? undefined;
      if (expectedDueDate) {
        assertIf(parsed.dueDate === expectedDueDate, "Invoice due date");
      }
      const expectedVendor =
        invoiceFields.VendorName?.valueString ??
        invoiceFields.VendorName?.content ??
        undefined;
      if (expectedVendor) {
        assertIf(parsed.vendorName === expectedVendor, "Invoice vendor");
      }
      const expectedBuyer =
        invoiceFields.CustomerName?.valueString ??
        invoiceFields.CustomerName?.content ??
        undefined;
      if (expectedBuyer) {
        assertIf(parsed.buyerName === expectedBuyer, "Invoice buyer");
      }
      const expectedNet =
        invoiceFields.SubTotal?.valueNumber ??
        invoiceFields.SubTotal?.valueCurrency?.amount ??
        null;
      if (expectedNet != null) {
        assertCloseIf(parsed.totalNet, Number(expectedNet));
      }
      const expectedTax =
        invoiceFields.TotalTax?.valueNumber ??
        invoiceFields.TotalTax?.valueCurrency?.amount ??
        null;
      if (expectedTax != null) {
        assertCloseIf(parsed.totalVat, Number(expectedTax));
      }
      const expectedGross =
        invoiceFields.InvoiceTotal?.valueNumber ??
        invoiceFields.InvoiceTotal?.valueCurrency?.amount ??
        null;
      if (expectedGross != null) {
        assertCloseIf(parsed.totalGross, Number(expectedGross));
      }
      const expectedVendorTaxId =
        invoiceFields.VendorTaxId?.valueString ??
        invoiceFields.VendorTaxId?.content ??
        undefined;
      if (expectedVendorTaxId) {
        assertIf(
          parsed.vendorTaxId === expectedVendorTaxId,
          "Invoice vendor tax id"
        );
      }
      const expectedCustomerId =
        invoiceFields.CustomerId?.valueString ??
        invoiceFields.CustomerId?.content ??
        undefined;
      if (expectedCustomerId) {
        assertIf(
          parsed.customerId === expectedCustomerId,
          "Invoice customer id"
        );
      }
      const vendorAddress = invoiceFields.VendorAddress?.valueAddress;
      if (vendorAddress) {
        assertIf(
          parsed.vendorAddress?.street != null,
          "Invoice vendor address street"
        );
        assertIf(
          parsed.vendorAddress?.postalCode != null,
          "Invoice vendor address postal"
        );
        assertIf(
          parsed.vendorAddress?.city != null,
          "Invoice vendor address city"
        );
      }
      const customerAddress = invoiceFields.CustomerAddress?.valueAddress;
      if (customerAddress) {
        assertIf(
          parsed.buyerAddress?.street != null,
          "Invoice buyer address street"
        );
        assertIf(
          parsed.buyerAddress?.postalCode != null,
          "Invoice buyer address postal"
        );
        assertIf(
          parsed.buyerAddress?.city != null,
          "Invoice buyer address city"
        );
      }
      const expectedTaxDetails = invoiceFields.TaxDetails?.valueArray ?? [];
      if (expectedTaxDetails.length > 0) {
        const expectedRate = parsePercent(
          expectedTaxDetails[0]?.valueObject?.Rate?.valueString ??
            expectedTaxDetails[0]?.valueObject?.Rate?.content ??
            null
        );
        if (expectedRate != null && parsed.vatItems?.length) {
          assertCloseIf(
            parsed.vatItems[0]?.rate ?? null,
            expectedRate,
            0.001
          );
        }
      }

      const { error: updateError } = await (supabase.from(RUNS_TABLE) as any)
        .update({
          parsed_data: parsed,
          parse_confidence: invoiceRes.confidence,
        })
        .eq("id", run.id);
      if (updateError) {
        throw new Error(`Failed to update invoice run ${run.id}: ${updateError.message}`);
      }
      processed += 1;
    } else if (modelId === "prebuilt-receipt") {
      const receiptRes = mapAzureReceiptToParseResult(analyze);
      assertIf(receiptRes.parsed, "Receipt parsed result missing");
      if (!receiptRes.parsed) continue;
      const parsed = receiptRes.parsed;
      assertIf(parsed.sourceType === "receipt", "Receipt sourceType");
      const receiptDoc = analyze.documents?.[0];
      const receiptFields = receiptDoc?.fields ?? {};
      const expectedReceiptDate =
        receiptFields.TransactionDate?.valueDate ?? undefined;
      if (expectedReceiptDate) {
        assertIf(
          parsed.invoiceDate === expectedReceiptDate,
          "Receipt date"
        );
      }
      const expectedMerchant =
        receiptFields.MerchantName?.valueString ??
        receiptFields.MerchantName?.content ??
        undefined;
      if (expectedMerchant) {
        assertIf(parsed.vendorName === expectedMerchant, "Receipt vendor");
      }
      const expectedReceiptNet =
        receiptFields.Subtotal?.valueNumber ??
        receiptFields.Subtotal?.valueCurrency?.amount ??
        null;
      if (expectedReceiptNet != null) {
        assertCloseIf(parsed.totalNet, Number(expectedReceiptNet));
      }
      const expectedReceiptTax =
        receiptFields.TotalTax?.valueNumber ??
        receiptFields.TotalTax?.valueCurrency?.amount ??
        null;
      if (expectedReceiptTax != null) {
        assertCloseIf(parsed.totalVat, Number(expectedReceiptTax));
      }
      const expectedReceiptGross =
        receiptFields.Total?.valueNumber ??
        receiptFields.Total?.valueCurrency?.amount ??
        null;
      if (expectedReceiptGross != null) {
        assertCloseIf(parsed.totalGross, Number(expectedReceiptGross));
      }

      const { error: updateError } = await (supabase.from(RUNS_TABLE) as any)
        .update({
          parsed_data: parsed,
          parse_confidence: receiptRes.confidence,
        })
        .eq("id", run.id);
      if (updateError) {
        throw new Error(`Failed to update receipt run ${run.id}: ${updateError.message}`);
      }
      processed += 1;
    } else if (modelId === "prebuilt-layout") {
      const layoutRes = mapAzureLayoutToParseResult(analyze);
      assertIf(layoutRes.parsed, "Layout parsed result missing");
      if (!layoutRes.parsed) continue;
      const parsed = layoutRes.parsed;
      assertIf(parsed.sourceType === "layout", "Layout sourceType");
      const meta = parsed.rawMeta as {
        keyValuePairs?: unknown[];
        tables?: unknown[];
      };
      const expectedKeys = analyze.keyValuePairs?.length ?? 0;
      const expectedTables = analyze.tables?.length ?? 0;
      assertIf(
        (meta.keyValuePairs?.length ?? 0) === expectedKeys,
        "Layout key values"
      );
      assertIf((meta.tables?.length ?? 0) === expectedTables, "Layout tables");

      const { error: updateError } = await (supabase.from(RUNS_TABLE) as any)
        .update({
          parsed_data: parsed,
          parse_confidence: layoutRes.confidence,
        })
        .eq("id", run.id);
      if (updateError) {
        throw new Error(`Failed to update layout run ${run.id}: ${updateError.message}`);
      }
      processed += 1;
    } else {
      console.log("[azure-mappers] skipped unknown model", run.id, modelId);
    }
  }

  console.log("[azure-mappers] ok", { updated: processed, total: runList.length });
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
