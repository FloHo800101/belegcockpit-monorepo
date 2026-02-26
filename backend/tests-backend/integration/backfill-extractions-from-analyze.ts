/// <reference path="../../supabase/functions/deno.d.ts" />
// Run from backend/: pnpm test:backfill-extractions
//
// Backfill-Skript: Liest alle vorhandenen Azure-Analyze-Ergebnisse aus der Tabelle
// "document_analyze_runs", erkennt den Dokumenttyp (Rechnung, Beleg, Kontoauszug),
// mappt das Azure-Ergebnis über die passenden Mapper in ein einheitliches ParseResult
// und schreibt das Ergebnis per Upsert in die Tabelle "document_extractions".
// Zweck: Nachträgliches Befüllen der Extractions-Tabelle für Dokumente, die vor
// Einführung der automatischen Extraktion analysiert wurden.

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
let TENANT_ID: string | null = null;
let FROM: string | null = null;
let TO: string | null = null;
let LIMIT_DOCS: number | null = null;

type AnalyzeRun = {
  id: string;
  document_id?: string | null;
  storage_path: string;
  model_id: string;
  analyze_result: unknown;
  parse_confidence?: number | null;
};

type DocumentRow = {
  id: string;
  storage_path: string;
  tenant_id: string | null;
  created_at: string | null;
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
  const map = new Map<string, DocumentRow>();
  for (const group of chunk(storagePaths, 200)) {
    const { data, error } = await (supabase.from(DOCUMENTS_TABLE) as any)
      .select("id, storage_path, tenant_id, created_at")
      .in("storage_path", group);
    if (error) {
      throw new Error(`Failed to load documents: ${error.message}`);
    }
    for (const row of (data ?? []) as DocumentRow[]) {
      map.set(row.storage_path, row);
    }
  }
  return map;
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
    if (error) {
      throw new Error(`Failed to load documents by id: ${error.message}`);
    }
    for (const row of (data ?? []) as DocumentRow[]) {
      map.set(row.id, row);
    }
  }
  return map;
}

function toDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.toISOString();
}

function toOptionalInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesFilters(row: DocumentRow | null): boolean {
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

  const { data: runs, error } = await (supabase.from(RUNS_TABLE) as any)
    .select("id, document_id, storage_path, model_id, analyze_result, parse_confidence");
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
  const documentMapByPath = await loadDocumentsByPath(supabase, storagePaths);
  const documentIds = Array.from(
    new Set(runList.map((run) => run.document_id ?? null).filter(Boolean) as string[])
  );
  const documentMapById = await loadDocumentsById(supabase, documentIds);

  let updated = 0;
  let skipped = 0;
  let considered = 0;

  for (const run of runList) {
    const rowById = run.document_id ? documentMapById.get(run.document_id) ?? null : null;
    const rowByPath = documentMapByPath.get(run.storage_path) ?? null;
    const docRow = rowById ?? rowByPath;
    const documentId = docRow?.id ?? null;
    if (!documentId) {
      skipped += 1;
      continue;
    }
    if (!matchesFilters(docRow)) {
      skipped += 1;
      continue;
    }
    if (LIMIT_DOCS && considered >= LIMIT_DOCS) {
      break;
    }
    considered += 1;
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

  console.log("[backfill] done", { updated, skipped, considered, total: runList.length });
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
}
