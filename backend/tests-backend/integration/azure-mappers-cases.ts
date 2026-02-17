// Run with: pnpm test:azure-mappers/*  */

import {
  mapAzureInvoiceToParseResult,
  mapAzureLayoutToParseResult,
  mapAzureReceiptToParseResult,
} from "../../supabase/functions/_shared/azure-mappers.ts";
import {
  assert,
  assertClose,
  createSupabaseTestClient,
  loadEnvFiles,
} from "./_shared.ts";

const RUNS_TABLE = "document_analyze_runs";
const FORCE_REPARSE = Deno.env.get("FORCE_REPARSE") === "1";
const SHOULD_ASSERT = !FORCE_REPARSE;

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

async function run() {
  await loadEnvFiles();
  const supabase = createSupabaseTestClient();
  type AzureAnalyzeResult = {
    documents?: Array<{ fields?: Record<string, any> }>;
    keyValuePairs?: unknown[];
    tables?: unknown[];
  };

  let query = (supabase.from(RUNS_TABLE) as any).select(
    "id, model_id, analyze_result, parsed_data"
  );
  if (!FORCE_REPARSE) {
    query = query.is("parsed_data", null);
  }
  const { data: runs, error } = await query;
  if (error) {
    throw new Error(`Failed to load analyze runs: ${error.message}`);
  }
  if (!runs?.length) {
    console.log(
      "[azure-mappers] nothing to do (all parsed_data present).",
      FORCE_REPARSE ? "FORCE_REPARSE=1 was set." : ""
    );
    return;
  }

  for (const run of runs) {
    const modelId = run.model_id as string;
    const analyze = run.analyze_result as AzureAnalyzeResult | null;
    if (!analyze) {
      throw new Error(`Analyze result is empty for run ${run.id} (${modelId}).`);
    }

    if (modelId === "prebuilt-invoice") {
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
    } else {
      console.log("[azure-mappers] skipped unknown model", run.id, modelId);
    }
  }

  console.log("[azure-mappers] ok", { updated: runs.length });
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
