/// <reference path="../../supabase/functions/deno.d.ts" />
// Run with: /* pnpm test:azure-analyze */
// Reprocess existing files: FORCE_REPROCESS=1 pnpm test:azure-analyze

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
  uploadLocalFile,
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

function toSafeName(fileName: string): string {
  return fileName.replaceAll("\\", "_").replaceAll("/", "_");
}

async function hasAnalyzeRunForFile(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  fileName: string
): Promise<boolean> {
  const safeName = toSafeName(fileName);
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

    const uploadMeta = await uploadLocalFile(
      supabase,
      BUCKET,
      fileUrl,
      storagePath
    );
    const documentId = await createDocumentRow({
      supabase,
      tenantId,
      storageBucket: BUCKET,
      storagePath,
      originalFilename: fileName,
      mimeType: uploadMeta.contentType,
      fileSize: uploadMeta.size,
    });

    try {
      const fileExt = fileName.split(".").pop()?.toLowerCase();
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
