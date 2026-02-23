/// <reference path="../../supabase/functions/deno.d.ts" />
// Run with: pnpm test:backfill-extractions

import {
  createSupabaseTestClient,
  loadEnvFiles,
} from "./_shared.ts";
import {
  mapAzureBankStatementToParseResult,
  mapAzureInvoiceToParseResult,
  mapAzureReceiptToParseResult,
} from "../../supabase/functions/_shared/azure-mappers.ts";
import { detectDocumentType } from "../../supabase/functions/_shared/document-type-detection.ts";

const RUNS_TABLE = "document_analyze_runs";
const EXTRACTIONS_TABLE = "document_extractions";
const DOCUMENTS_TABLE = "documents";

type AnalyzeRun = {
  id: string;
  storage_path: string;
  model_id: string;
  analyze_result: unknown;
  parse_confidence?: number | null;
};

type DocumentRow = {
  id: string;
  storage_path: string;
};

type AnalyzeResult = {
  content?: string;
};

function extractionStatusFromParsed(parsed: unknown): "succeeded" | "needs_review" {
  const qualityGatePassed = (parsed as any)?.rawMeta?.qualityGatePassed;
  return qualityGatePassed === false ? "needs_review" : "succeeded";
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function fileNameFromPath(storagePath: string) {
  return storagePath.split("/").pop() ?? "";
}

async function loadDocumentsByPath(
  supabase: ReturnType<typeof createSupabaseTestClient>,
  storagePaths: string[]
) {
  const map = new Map<string, string>();
  for (const group of chunk(storagePaths, 200)) {
    const { data, error } = await (supabase.from(DOCUMENTS_TABLE) as any)
      .select("id, storage_path")
      .in("storage_path", group);
    if (error) {
      throw new Error(`Failed to load documents: ${error.message}`);
    }
    for (const row of (data ?? []) as DocumentRow[]) {
      map.set(row.storage_path, row.id);
    }
  }
  return map;
}

async function run() {
  await loadEnvFiles();
  const supabase = createSupabaseTestClient();

  const { data: runs, error } = await (supabase.from(RUNS_TABLE) as any)
    .select("id, storage_path, model_id, analyze_result, parse_confidence");
  if (error) {
    throw new Error(`Failed to load analyze runs: ${error.message}`);
  }

  const runList = (runs ?? []) as AnalyzeRun[];
  if (!runList.length) {
    console.log("[backfill] no analyze runs found");
    return;
  }

  const storagePaths = Array.from(
    new Set(runList.map((run) => run.storage_path).filter(Boolean))
  );
  const documentMap = await loadDocumentsByPath(supabase, storagePaths);

  let updated = 0;
  let skipped = 0;

  for (const run of runList) {
    const documentId = documentMap.get(run.storage_path);
    if (!documentId) {
      skipped += 1;
      continue;
    }
    if (!run.analyze_result) {
      skipped += 1;
      continue;
    }

    const fileName = fileNameFromPath(run.storage_path);
    const analyze = run.analyze_result as AnalyzeResult;
    let parsed = null as ReturnType<typeof mapAzureInvoiceToParseResult> | null;
    let detectedDocumentType: string | null = null;
    let detectionConfidence: number | null = null;
    let detectionReasons: string[] | null = null;
    let parsingPath = "azure_invoice";

    if (run.model_id !== "prebuilt-receipt" && run.model_id !== "prebuilt-invoice") {
      skipped += 1;
      continue;
    }

    const detection = detectDocumentType({
      text: (analyze.content ?? "").toString(),
      fileName,
      azureResult: run.analyze_result,
    });
    detectedDocumentType = detection.documentType;
    detectionConfidence = detection.confidence;
    detectionReasons = detection.reasons;

    if (detection.documentType === "bank_statement") {
      parsed = mapAzureBankStatementToParseResult(run.analyze_result, fileName);
      parsingPath = "azure_bank_statement";
    } else if (detection.documentType === "invoice") {
      parsed = mapAzureInvoiceToParseResult(run.analyze_result);
      parsingPath = "azure_invoice";
    } else if (run.model_id === "prebuilt-receipt") {
      parsed = mapAzureReceiptToParseResult(run.analyze_result);
      if (!detectedDocumentType) detectedDocumentType = parsed.parsed?.documentType ?? "receipt";
      if (detectionConfidence == null) {
        detectionConfidence = parsed.confidence ?? run.parse_confidence ?? null;
      }
      if (!detectionReasons || detectionReasons.length === 0) detectionReasons = ["backfill"];
      parsingPath = "azure_receipt";
    } else {
      parsed = mapAzureInvoiceToParseResult(run.analyze_result);
      parsingPath = "azure_invoice";
    }

    if (!parsed?.parsed) {
      skipped += 1;
      continue;
    }

    const { error: upsertError } = await (supabase
      .from(EXTRACTIONS_TABLE) as any)
      .upsert(
        {
          document_id: documentId,
          status: extractionStatusFromParsed(parsed.parsed),
          parsing_path: parsingPath,
          model_used: run.model_id,
          parse_confidence: parsed.confidence ?? run.parse_confidence ?? null,
          detected_document_type: detectedDocumentType,
          detection_confidence: detectionConfidence,
          detection_reasons: detectionReasons,
          parsed_data: parsed.parsed,
          raw_result: run.analyze_result,
        },
        { onConflict: "document_id" }
      );
    if (upsertError) {
      throw new Error(
        `Failed to upsert extraction for ${run.id}: ${upsertError.message}`
      );
    }

    updated += 1;
  }

  console.log("[backfill] done", { updated, skipped, total: runList.length });
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
