/// <reference path="../../supabase/functions/deno.d.ts" />
// Run from backend/: pnpm test:azure-analyze
// Reprocess existing files: FORCE_REPROCESS=1 pnpm test:azure-analyze
//
// Integrationstest: Nimmt PDF/Bilddateien aus dem Ordner documents-analyzes/azure-analyze/,
// lädt sie in Supabase Storage hoch und schickt sie an Azure Document Intelligence.
// Das Ergebnis wird per Dokumenttyp-Erkennung klassifiziert (Rechnung, Beleg, Kontoauszug),
// mit dem passenden Mapper geparst und in document_analyze_runs + document_extractions gespeichert.
// Verschlüsselte PDFs werden bei Bedarf per qpdf entschlüsselt, Duplikate per Hash erkannt.

import { analyzeWithAzure } from "../../supabase/functions/_shared/azure-analyze.ts";
import {
  mapAzureInvoiceToParseResult,
  mapAzureReceiptToParseResult,
  mapAzureBankStatementToParseResult,
} from "../../supabase/functions/_shared/azure-mappers.ts";
import { detectDocumentType } from "../../supabase/functions/_shared/document-type-detection.ts";
import { isImageExtension, pdfHasTextLayer } from "../../supabase/functions/_shared/decision.ts";
import {
  assert,
  buildStoragePath,
  createDocumentRow,
  createSupabaseTestClient,
  getFileName,
  getTestTenantId,
  loadEnvFiles,
  removeFile,
  sanitizeStorageFileName,
  uploadBytes,
} from "./_shared.ts";

const BUCKET = "documents";
const RUNS_TABLE = "document_analyze_runs";
const EXTRACTIONS_TABLE = "document_extractions";
const KEEP_FILES = Deno.env.get("SUPABASE_KEEP_TEST_FILES") !== "0";
const FORCE_REPROCESS = Deno.env.get("FORCE_REPROCESS") === "1";
const ANALYZE_DIR = new URL("../documents-analyzes/azure-analyze/", import.meta.url);

type ModelId = "prebuilt-invoice" | "prebuilt-receipt";

type AzureAnalyzeResult = {
  content?: string;
  documents?: Array<{ fields?: Record<string, unknown> }>;
};

class InvalidPdfPasswordError extends Error {}

function toLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function isPdfLikelyEncrypted(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  const head = toLatin1(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!head.includes("%PDF-")) return false;
  const sample = toLatin1(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
  return /\/Encrypt\b/.test(sample);
}

async function decryptPdfWithQpdf(
  encryptedPdf: Uint8Array,
  password: string,
  fileName: string
): Promise<Uint8Array> {
  const inputPath = await Deno.makeTempFile({ prefix: "belegcockpit-enc-", suffix: ".pdf" });
  const outputPath = await Deno.makeTempFile({ prefix: "belegcockpit-dec-", suffix: ".pdf" });
  try {
    await Deno.writeFile(inputPath, encryptedPdf);
    const cmd = new Deno.Command("qpdf", {
      args: [`--password=${password}`, "--decrypt", inputPath, outputPath],
      stdout: "null",
      stderr: "piped",
    });
    const out = await cmd.output();
    if (!out.success) {
      const stderr = new TextDecoder().decode(out.stderr);
      if (/invalid password|password/i.test(stderr)) {
        throw new InvalidPdfPasswordError(`Invalid password for ${fileName}`);
      }
      if (/not recognized|no such file|cannot find/i.test(stderr)) {
        throw new Error("qpdf is required to decrypt password-protected PDFs. Please install qpdf.");
      }
      throw new Error(`Failed to decrypt ${fileName}: ${stderr.trim() || "unknown qpdf error"}`);
    }
    return await Deno.readFile(outputPath);
  } finally {
    try {
      await Deno.remove(inputPath);
    } catch {
      // ignore cleanup errors
    }
    try {
      await Deno.remove(outputPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function requestPdfPassword(fileName: string, attempt: number): Promise<string> {
  const envPassword = Deno.env.get("PDF_PASSWORD");
  if (envPassword && envPassword.trim()) return envPassword.trim();
  if (!Deno.stdin.isTerminal()) {
    throw new Error(
      `PDF '${fileName}' appears password-protected. Run interactively or set PDF_PASSWORD env var.`
    );
  }
  const prefix = attempt > 1 ? `Attempt ${attempt}: ` : "";
  const value = prompt(
    `${prefix}PDF '${fileName}' is password-protected. Enter password (empty cancels):`
  );
  if (!value || !value.trim()) {
    throw new Error(`Missing password for protected PDF '${fileName}'.`);
  }
  return value.trim();
}

function parseResultForModel(
  modelId: ModelId,
  result: AzureAnalyzeResult,
  fileName: string
) {
  const detection = detectDocumentType({
    text: (result.content ?? "").toString(),
    fileName,
    azureResult: result,
  });

  if (detection.documentType === "bank_statement") {
    return {
      mapped: mapAzureBankStatementToParseResult(result, fileName),
      detectedType: detection.documentType,
      detectionConfidence: detection.confidence,
      detectionReasons: detection.reasons,
      parsingPath: "azure_bank_statement",
    };
  }

  if (detection.documentType === "invoice") {
    const mapped = mapAzureInvoiceToParseResult(result);
    return {
      mapped,
      detectedType: detection.documentType,
      detectionConfidence: detection.confidence,
      detectionReasons: detection.reasons,
      parsingPath: "azure_invoice",
    };
  }

  if (modelId === "prebuilt-receipt") {
    const mapped = mapAzureReceiptToParseResult(result);
    return {
      mapped,
      detectedType: mapped.parsed?.documentType ?? "receipt",
      detectionConfidence: detection.confidence || mapped.confidence || null,
      detectionReasons:
        detection.reasons.length > 0 ? detection.reasons : ["azure_analyze"],
      parsingPath: "azure_receipt",
    };
  }

  const mapped = mapAzureInvoiceToParseResult(result);
  return {
    mapped,
    detectedType: "invoice",
    detectionConfidence: detection.confidence,
    detectionReasons:
      detection.reasons.length > 0 ? detection.reasons : ["fallback:invoice"],
    parsingPath: "azure_invoice",
  };
}

function hasBankHintInFileName(fileName: string): boolean {
  const normalized = fileName
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  return (
    normalized.includes("kontoauszug") ||
    normalized.includes("statement") ||
    normalized.includes("hauptkonto") ||
    normalized.includes("bank")
  );
}

async function listAnalyzeFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(ANALYZE_DIR)) {
    if (!entry.isFile) continue;
    const lower = entry.name.toLowerCase();
    if (
      lower.endsWith(".pdf") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".tif") ||
      lower.endsWith(".tiff")
    ) {
      names.push(entry.name);
    }
  }
  return names;
}

async function hasAnalyzeRunForFile(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  fileName: string
): Promise<boolean> {
  const safeName = sanitizeStorageFileName(fileName);
  const likePattern = `tests/analyzes/azure-analyze/%/${safeName}`;
  const { data, error } = await (supabase.from(RUNS_TABLE) as any)
    .select("id")
    .ilike("storage_path", likePattern)
    .limit(1);
  if (error) {
    throw new Error(`Failed to check existing analyze runs: ${error.message}`);
  }
  return Boolean(data && data.length > 0);
}

async function findDocumentByHash(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  tenantId: string,
  fileHash: string
): Promise<{ id: string; tenant_id: string; storage_path: string } | null> {
  const { data, error } = await (supabase.from("documents") as any)
    .select("id, tenant_id, storage_path")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) {
    throw new Error(`Failed to check existing documents by hash: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: string; tenant_id?: string; storage_path?: string };
  if (!row.id || !row.tenant_id || !row.storage_path) return null;
  return { id: row.id, tenant_id: row.tenant_id, storage_path: row.storage_path };
}

async function findDocumentByHashAnyTenant(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  fileHash: string
): Promise<{ id: string; tenant_id: string; storage_path: string } | null> {
  const { data, error } = await (supabase.from("documents") as any)
    .select("id, tenant_id, storage_path")
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`Failed to check existing documents by hash across tenants: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: string; tenant_id?: string; storage_path?: string };
  if (!row.id || !row.tenant_id || !row.storage_path) return null;
  return { id: row.id, tenant_id: row.tenant_id, storage_path: row.storage_path };
}

async function copyAnalyzeDataToDocument(params: {
  supabase: ReturnType<typeof createSupabaseTestClient>;
  sourceDocumentId: string;
  targetDocumentId: string;
  targetStoragePath: string;
}): Promise<boolean> {
  const { supabase, sourceDocumentId, targetDocumentId, targetStoragePath } = params;

  const { data: runRows, error: runError } = await (supabase.from(RUNS_TABLE) as any)
    .select("model_id, source, analyze_result, parsed_data, parse_confidence, created_at")
    .eq("document_id", sourceDocumentId)
    .order("created_at", { ascending: true });
  if (runError) {
    throw new Error(`Failed to load existing analyze run: ${runError.message}`);
  }
  if (!Array.isArray(runRows) || runRows.length === 0) return false;

  const copiedRunRows = runRows.map((runRow) => ({
    document_id: targetDocumentId,
    storage_path: targetStoragePath,
    model_id: runRow.model_id,
    source: runRow.source ?? "fixture",
    analyze_result: runRow.analyze_result,
    parsed_data: runRow.parsed_data,
    parse_confidence: runRow.parse_confidence ?? null,
    created_at: runRow.created_at ?? undefined,
  }));

  const { error: insertRunError } = await (supabase.from(RUNS_TABLE) as any).insert(
    copiedRunRows
  );
  if (insertRunError) {
    throw new Error(`Failed to copy analyze run to target document: ${insertRunError.message}`);
  }

  const { data: extractionRow, error: extractionError } = await (supabase
    .from(EXTRACTIONS_TABLE) as any)
    .select(
      "status, parsing_path, model_used, decision_reason, parse_confidence, parsed_data, raw_result, raw_xml, error, detected_document_type, detection_confidence, detection_reasons"
    )
    .eq("document_id", sourceDocumentId)
    .maybeSingle();
  if (extractionError) {
    throw new Error(`Failed to load existing extraction: ${extractionError.message}`);
  }

  if (extractionRow) {
    const { error: upsertExtractionError } = await (supabase
      .from(EXTRACTIONS_TABLE) as any)
      .upsert({
        document_id: targetDocumentId,
        status: extractionRow.status ?? "succeeded",
        parsing_path: extractionRow.parsing_path ?? null,
        model_used: extractionRow.model_used ?? null,
        decision_reason: extractionRow.decision_reason ?? null,
        parse_confidence: extractionRow.parse_confidence ?? null,
        parsed_data: extractionRow.parsed_data ?? null,
        raw_result: extractionRow.raw_result ?? null,
        raw_xml: extractionRow.raw_xml ?? null,
        error: extractionRow.error ?? null,
        detected_document_type: extractionRow.detected_document_type ?? null,
        detection_confidence: extractionRow.detection_confidence ?? null,
        detection_reasons: extractionRow.detection_reasons ?? null,
      });
    if (upsertExtractionError) {
      throw new Error(
        `Failed to copy extraction to target document: ${upsertExtractionError.message}`
      );
    }
  }

  return true;
}

async function copyDerivedRowsToDocument(params: {
  supabase: ReturnType<typeof createSupabaseTestClient>;
  sourceDocumentId: string;
  targetDocumentId: string;
  targetTenantId: string;
  nowISO: string;
}): Promise<void> {
  const { supabase, sourceDocumentId, targetDocumentId, targetTenantId, nowISO } = params;

  const { data: sourceInvoice } = await (supabase.from("invoices") as any)
    .select(
      "amount, currency, invoice_date, due_date, invoice_no, iban, e2e_id, vendor_name, buyer_name, link_state, open_amount, matched_at, matched_by, match_reason, run_id, amount_candidates"
    )
    .eq("document_id", sourceDocumentId)
    .limit(1)
    .maybeSingle();

  if (sourceInvoice) {
    const { error: upsertInvoiceError } = await (supabase.from("invoices") as any).upsert(
      {
        id: targetDocumentId,
        tenant_id: targetTenantId,
        document_id: targetDocumentId,
        amount: sourceInvoice.amount ?? null,
        currency: sourceInvoice.currency ?? null,
        invoice_date: sourceInvoice.invoice_date ?? null,
        due_date: sourceInvoice.due_date ?? null,
        invoice_no: sourceInvoice.invoice_no ?? null,
        iban: sourceInvoice.iban ?? null,
        e2e_id: sourceInvoice.e2e_id ?? null,
        vendor_name: sourceInvoice.vendor_name ?? null,
        buyer_name: sourceInvoice.buyer_name ?? null,
        link_state: sourceInvoice.link_state ?? "unlinked",
        open_amount: sourceInvoice.open_amount ?? null,
        matched_at: sourceInvoice.matched_at ?? null,
        matched_by: sourceInvoice.matched_by ?? null,
        match_reason: sourceInvoice.match_reason ?? null,
        run_id: sourceInvoice.run_id ?? null,
        amount_candidates: sourceInvoice.amount_candidates ?? null,
        updated_at: nowISO,
      },
      { onConflict: "tenant_id,document_id" }
    );
    if (upsertInvoiceError) {
      throw new Error(`Failed to copy invoice to target document: ${upsertInvoiceError.message}`);
    }

    const { data: sourceItems, error: sourceItemsError } = await (supabase
      .from("invoice_line_items") as any)
      .select(
        "line_index, description, amount_signed, amount_abs, currency, link_state, open_amount, match_group_id, matched_at, meta"
      )
      .eq("invoice_id", sourceDocumentId)
      .order("line_index", { ascending: true });
    if (sourceItemsError) {
      throw new Error(
        `Failed to load source invoice_line_items for copy: ${sourceItemsError.message}`
      );
    }

    const { error: deleteItemsError } = await (supabase.from("invoice_line_items") as any)
      .delete()
      .eq("tenant_id", targetTenantId)
      .eq("invoice_id", targetDocumentId);
    if (deleteItemsError) {
      throw new Error(`Failed to replace target invoice_line_items: ${deleteItemsError.message}`);
    }

    if (Array.isArray(sourceItems) && sourceItems.length > 0) {
      const targetItems = sourceItems.map((item) => ({
        tenant_id: targetTenantId,
        invoice_id: targetDocumentId,
        document_id: targetDocumentId,
        line_index: item.line_index,
        description: item.description ?? null,
        amount_signed: item.amount_signed,
        amount_abs: item.amount_abs,
        currency: item.currency,
        link_state: item.link_state ?? "unlinked",
        open_amount: item.open_amount ?? item.amount_abs,
        match_group_id: item.match_group_id ?? null,
        matched_at: item.matched_at ?? null,
        meta: item.meta ?? {},
        updated_at: nowISO,
      }));
      const { error: upsertItemsError } = await (supabase.from("invoice_line_items") as any)
        .upsert(targetItems, { onConflict: "invoice_id,line_index" });
      if (upsertItemsError) {
        throw new Error(`Failed to copy invoice_line_items: ${upsertItemsError.message}`);
      }
    }
  }

  const { data: sourceTxRows, error: sourceTxError } = await (supabase
    .from("bank_transactions") as any)
    .select(
      "amount, currency, value_date, booking_date, iban, counterparty_name, end_to_end_id, reference, link_state, open_amount, match_group_id, matched_at, matched_by, match_reason, run_id, source_index, foreign_amount, foreign_currency, exchange_rate, mandant_resolution"
    )
    .eq("source_document_id", sourceDocumentId)
    .order("source_index", { ascending: true });
  if (sourceTxError) {
    throw new Error(`Failed to load source bank_transactions for copy: ${sourceTxError.message}`);
  }

  if (Array.isArray(sourceTxRows) && sourceTxRows.length > 0) {
    const { error: deleteTxError } = await (supabase.from("bank_transactions") as any)
      .delete()
      .eq("tenant_id", targetTenantId)
      .eq("source_document_id", targetDocumentId);
    if (deleteTxError) {
      throw new Error(`Failed to replace target bank_transactions: ${deleteTxError.message}`);
    }

    const targetTxRows = sourceTxRows.map((tx) => ({
      tenant_id: targetTenantId,
      source_document_id: targetDocumentId,
      source_index: tx.source_index,
      amount: tx.amount,
      currency: tx.currency,
      value_date: tx.value_date,
      booking_date: tx.booking_date ?? null,
      iban: tx.iban ?? null,
      counterparty_name: tx.counterparty_name ?? null,
      end_to_end_id: tx.end_to_end_id ?? null,
      reference: tx.reference ?? null,
      link_state: tx.link_state ?? "unlinked",
      open_amount: tx.open_amount ?? null,
      match_group_id: tx.match_group_id ?? null,
      matched_at: tx.matched_at ?? null,
      matched_by: tx.matched_by ?? null,
      match_reason: tx.match_reason ?? null,
      run_id: tx.run_id ?? null,
      foreign_amount: tx.foreign_amount ?? null,
      foreign_currency: tx.foreign_currency ?? null,
      exchange_rate: tx.exchange_rate ?? null,
      mandant_resolution: tx.mandant_resolution ?? null,
      updated_at: nowISO,
    }));
    const { error: upsertTxError } = await (supabase.from("bank_transactions") as any).upsert(
      targetTxRows,
      { onConflict: "tenant_id,source_document_id,source_index" }
    );
    if (upsertTxError) {
      throw new Error(`Failed to copy bank_transactions: ${upsertTxError.message}`);
    }
  }
}

function normalizeTextValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseNumberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isNaN(num) ? Number.NaN : num;
  }
  return Number.NaN;
}

function coerceDateOnlyValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildStatementReference(tx: Record<string, unknown>): string | null {
  const parts = [tx.description, tx.reference]
    .map(normalizeTextValue)
    .filter((value): value is string => Boolean(value));
  if (!parts.length) return null;
  return parts.join("\n");
}

async function ensureBankTransactionsForDocument(params: {
  supabase: ReturnType<typeof createSupabaseTestClient>;
  tenantId: string;
  documentId: string;
  nowISO: string;
}): Promise<number> {
  const { supabase, tenantId, documentId, nowISO } = params;

  const { count: existingCount, error: countError } = await (supabase
    .from("bank_transactions") as any)
    .select("id", { head: true, count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("source_document_id", documentId);
  if (countError) {
    throw new Error(`Failed to check existing bank_transactions: ${countError.message}`);
  }
  if ((existingCount ?? 0) > 0) return 0;

  const { data: extractionRow, error: extractionError } = await (supabase
    .from(EXTRACTIONS_TABLE) as any)
    .select("status, detected_document_type, parsed_data")
    .eq("document_id", documentId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (extractionError) {
    throw new Error(`Failed to load extraction for bank tx backfill: ${extractionError.message}`);
  }
  if (!extractionRow || extractionRow.detected_document_type !== "bank_statement") return 0;

  const parsed = (extractionRow.parsed_data ?? {}) as Record<string, unknown>;
  const parsedCurrency = normalizeTextValue(parsed.currency);
  const parsedIban = normalizeTextValue(parsed.iban);
  const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  if (!transactions.length) return 0;

  const payload = transactions
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const tx = row as Record<string, unknown>;
      const bookingDate = coerceDateOnlyValue(tx.bookingDate);
      const valueDate = coerceDateOnlyValue(tx.valueDate) ?? bookingDate;
      if (!valueDate) return null;

      const amount = parseNumberValue(tx.amount);
      if (!Number.isFinite(amount)) return null;

      const currency = normalizeTextValue(tx.currency) || parsedCurrency || "EUR";
      const foreignAmountRaw = parseNumberValue(tx.foreignAmount);
      const foreignAmount = Number.isFinite(foreignAmountRaw) ? foreignAmountRaw : null;
      const foreignCurrency = normalizeTextValue(tx.foreignCurrency);
      const exchangeRateRaw = parseNumberValue(tx.exchangeRate);
      const exchangeRate = Number.isFinite(exchangeRateRaw) ? exchangeRateRaw : null;
      const reference = buildStatementReference(tx);
      const counterpartyName = normalizeTextValue(tx.counterpartyName);
      const counterpartyIban = normalizeTextValue(tx.counterpartyIban) || parsedIban || null;
      const endToEndId = normalizeTextValue(tx.endToEndId);

      return {
        tenant_id: tenantId,
        source_document_id: documentId,
        source_index: index,
        amount,
        currency,
        foreign_amount: foreignAmount,
        foreign_currency: foreignCurrency,
        exchange_rate: exchangeRate,
        value_date: valueDate,
        booking_date: bookingDate,
        iban: counterpartyIban,
        counterparty_name: counterpartyName,
        end_to_end_id: endToEndId,
        reference,
        created_at: nowISO,
        updated_at: nowISO,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!payload.length) return 0;

  const { error: upsertError } = await (supabase.from("bank_transactions") as any).upsert(
    payload,
    { onConflict: "tenant_id,source_document_id,source_index" }
  );
  if (upsertError) {
    throw new Error(`Failed to backfill bank_transactions for duplicate document: ${upsertError.message}`);
  }

  return payload.length;
}

async function run() {
  await loadEnvFiles();
  const nowISO = new Date().toISOString();

  const endpoint = Deno.env.get("AZURE_DOCINT_ENDPOINT") ?? "";
  const apiKey = Deno.env.get("AZURE_DOCINT_KEY") ?? "";
  if (!endpoint || !apiKey) {
    console.log(
      "[azure-analyze] Skipping (missing AZURE_DOCINT_ENDPOINT or AZURE_DOCINT_KEY)."
    );
    return;
  }

  const supabase = createSupabaseTestClient();
  const tenantId = await getTestTenantId(supabase);
  const files = await listAnalyzeFiles();
  if (!files.length) {
    throw new Error(`No files found in ${ANALYZE_DIR.pathname}`);
  }

  for (const fileName of files) {
    const alreadyProcessed =
      FORCE_REPROCESS ? false : await hasAnalyzeRunForFile(supabase, fileName);
    if (alreadyProcessed) {
      console.log("[azure-analyze] skip (already processed)", { fileName });
      continue;
    }

    const fileUrl = new URL(fileName, ANALYZE_DIR);
    const storagePath = buildStoragePath("azure-analyze", fileName);

    const fileExt = fileName.split(".").pop()?.toLowerCase();
    let uploadBytesData: Uint8Array = await Deno.readFile(fileUrl);
    if (fileExt === "pdf" && isPdfLikelyEncrypted(uploadBytesData)) {
      let decrypted: Uint8Array | null = null;
      let attempt = 1;
      while (!decrypted && attempt <= 3) {
        const password = await requestPdfPassword(fileName, attempt);
        try {
          decrypted = await decryptPdfWithQpdf(uploadBytesData, password, fileName);
        } catch (error) {
          if (error instanceof InvalidPdfPasswordError && attempt < 3) {
            console.warn(`[azure-analyze] wrong PDF password for ${fileName}, retrying...`);
            attempt += 1;
            continue;
          }
          throw error;
        }
      }
      if (!decrypted) {
        throw new Error(`Could not decrypt password-protected PDF '${fileName}'.`);
      }
      uploadBytesData = new Uint8Array(decrypted);
    }

    const uploadMeta = await uploadBytes(
      supabase,
      BUCKET,
      uploadBytesData,
      fileName,
      storagePath
    );
    const duplicateDoc = await findDocumentByHash(supabase, tenantId, uploadMeta.fileHash);
    if (duplicateDoc) {
      const backfilledTxCount = await ensureBankTransactionsForDocument({
        supabase,
        tenantId,
        documentId: duplicateDoc.id,
        nowISO,
      });
      console.log("[azure-analyze] duplicate_reused", {
        fileName,
        tenant_id: tenantId,
        document_id: duplicateDoc.id,
        file_hash_prefix: uploadMeta.fileHash.slice(0, 12),
        backfilled_bank_transactions: backfilledTxCount,
      });
      await removeFile(supabase, BUCKET, storagePath);
      continue;
    }

    let documentId: string | null = null;
    const duplicateAnyTenant = await findDocumentByHashAnyTenant(supabase, uploadMeta.fileHash);
    if (duplicateAnyTenant && duplicateAnyTenant.tenant_id !== tenantId) {
      documentId = await createDocumentRow({
        supabase,
        tenantId,
        storageBucket: BUCKET,
        storagePath,
        originalFilename: fileName,
        mimeType: uploadMeta.contentType,
        fileSize: uploadMeta.size,
        fileHash: uploadMeta.fileHash,
      });

      const copied = await copyAnalyzeDataToDocument({
        supabase,
        sourceDocumentId: duplicateAnyTenant.id,
        targetDocumentId: documentId,
        targetStoragePath: storagePath,
      });

      if (copied) {
        await copyDerivedRowsToDocument({
          supabase,
          sourceDocumentId: duplicateAnyTenant.id,
          targetDocumentId: documentId,
          targetTenantId: tenantId,
          nowISO,
        });
        console.log("[azure-analyze] duplicate_copied_to_current_tenant", {
          fileName,
          tenant_id: tenantId,
          source_document_id: duplicateAnyTenant.id,
          source_tenant_id: duplicateAnyTenant.tenant_id,
          target_document_id: documentId,
          file_hash_prefix: uploadMeta.fileHash.slice(0, 12),
        });
        if (!KEEP_FILES) {
          await removeFile(supabase, BUCKET, storagePath);
        }
        continue;
      }
    }

    if (!documentId) {
      documentId = await createDocumentRow({
        supabase,
        tenantId,
        storageBucket: BUCKET,
        storagePath,
        originalFilename: fileName,
        mimeType: uploadMeta.contentType,
        fileSize: uploadMeta.size,
        fileHash: uploadMeta.fileHash,
      });
    }

    try {
      const isImage = isImageExtension(fileExt);
      const modelsToRun: ModelId[] = [];

      if (isImage) {
        modelsToRun.push("prebuilt-receipt");
      } else if (fileExt === "pdf") {
        const hasBankHint = hasBankHintInFileName(fileName);
        if (hasBankHint) {
          modelsToRun.push("prebuilt-invoice");
        } else {
          const hasTextLayer = await pdfHasTextLayer(supabase, storagePath, BUCKET);
          modelsToRun.push(hasTextLayer ? "prebuilt-invoice" : "prebuilt-receipt");
        }
      } else {
        modelsToRun.push("prebuilt-invoice");
      }

      for (const modelId of modelsToRun) {
        const result = (await analyzeWithAzure(
          supabase,
          storagePath,
          modelId,
          BUCKET
        )) as AzureAnalyzeResult | null;
        assert(result, `Azure analyze returned null for ${modelId}`);

        const documents = result.documents ?? [];
        assert(
          documents.length > 0,
          `Azure analyze returned no documents for ${modelId}`
        );

        const parsedResult = parseResultForModel(modelId, result, fileName);
        const mapped = parsedResult.mapped;
        const { data: saved, error: saveError } = await (supabase
          .from(RUNS_TABLE) as any)
          .insert({
            document_id: documentId,
            storage_path: storagePath,
            model_id: modelId,
            source: "fixture",
            analyze_result: result,
            parsed_data: mapped.parsed,
            parse_confidence: mapped.confidence,
          })
          .select("id")
          .single();
        if (saveError) {
          throw new Error(
            `Failed to save ${modelId} analyze result: ${saveError.message}`
          );
        }

        const { error: extractionError } = await (supabase
          .from(EXTRACTIONS_TABLE) as any)
          .upsert({
            document_id: documentId,
            status: "succeeded",
            parsing_path: parsedResult.parsingPath,
            model_used: modelId,
            parse_confidence: mapped.confidence ?? null,
            detected_document_type: parsedResult.detectedType ?? null,
            detection_confidence: parsedResult.detectionConfidence ?? null,
            detection_reasons: parsedResult.detectionReasons ?? null,
            parsed_data: mapped.parsed,
            raw_result: result,
          });
        if (extractionError) {
          throw new Error(
            `Failed to save extraction for ${modelId}: ${extractionError.message}`
          );
        }

        const fields = documents[0]?.fields ?? {};
        console.log("[azure-analyze] ok", {
          fileName,
          documentId,
          model: modelId,
          detectedType: parsedResult.detectedType,
          detectionReasons: parsedResult.detectionReasons,
          parsingPath: parsedResult.parsingPath,
          runId: saved?.id,
          fieldKeys: Object.keys(fields),
        });
      }
    } finally {
      if (!KEEP_FILES) {
        await removeFile(supabase, BUCKET, storagePath);
      }
    }
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    throw error;
  });
}
