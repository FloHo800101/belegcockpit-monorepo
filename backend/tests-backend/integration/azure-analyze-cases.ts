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
): Promise<{ id: string; storage_path: string } | null> {
  const { data, error } = await (supabase.from("documents") as any)
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) {
    throw new Error(`Failed to check existing documents by hash: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: string; storage_path?: string };
  if (!row.id || !row.storage_path) return null;
  return { id: row.id, storage_path: row.storage_path };
}

async function run() {
  await loadEnvFiles();

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
      console.log("[azure-analyze] duplicate_reused", {
        fileName,
        tenant_id: tenantId,
        document_id: duplicateDoc.id,
        file_hash_prefix: uploadMeta.fileHash.slice(0, 12),
      });
      await removeFile(supabase, BUCKET, storagePath);
      continue;
    }

    const documentId = await createDocumentRow({
      supabase,
      tenantId,
      storageBucket: BUCKET,
      storagePath,
      originalFilename: fileName,
      mimeType: uploadMeta.contentType,
      fileSize: uploadMeta.size,
      fileHash: uploadMeta.fileHash,
    });

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
            storage_path: storagePath,
            model_id: modelId,
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
