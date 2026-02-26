// How to run (from backend/):
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... pnpm test:backfill-analyze-runs
// Optional filters: FROM=YYYY-MM-DD TO=YYYY-MM-DD LIMIT_DOCS=... DRY_RUN=1
//
// Backfill-Skript: Erzeugt fehlende document_analyze_runs (source=live_seed) aus
// bereits vorhandenen document_extractions.raw_result fuer Azure-basierte Live-Dokumente.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const TENANT_ID =
  process.env.TENANT_ID ??
  process.env.SUPABASE_LIVE_TENANT_ID ??
  null;
const FROM = process.env.FROM ?? null;
const TO = process.env.TO ?? null;
const LIMIT_DOCS = toOptionalInt(process.env.LIMIT_DOCS);
const DRY_RUN = process.env.DRY_RUN === "1";
const AZURE_MODELS = ["prebuilt-invoice", "prebuilt-receipt", "prebuilt-layout"] as const;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ExtractionRow = {
  document_id: string;
  model_used: string | null;
  raw_result: unknown;
  parsed_data: unknown;
  parse_confidence: number | null;
  documents:
    | {
        tenant_id?: string | null;
        created_at?: string | null;
        storage_path?: string | null;
      }
    | Array<{
        tenant_id?: string | null;
        created_at?: string | null;
        storage_path?: string | null;
      }>
    | null;
};

type AnalyzeRunKey = {
  document_id: string;
  model_id: string;
};

async function main() {
  const rows = await loadExtractionCandidates();
  if (!rows.length) {
    console.log("No candidate extractions found.");
    return;
  }

  const existing = await loadExistingAnalyzeRunKeys(rows.map((row) => row.document_id));
  const existingKeySet = new Set(existing.map((row) => `${row.document_id}|${row.model_id}`));

  let created = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const modelId = (row.model_used ?? "").toString();
    if (!AZURE_MODELS.includes(modelId as (typeof AZURE_MODELS)[number])) {
      skippedInvalid += 1;
      continue;
    }

    const docRef = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    const storagePath = (docRef?.storage_path ?? "").toString();
    if (!storagePath || row.raw_result == null) {
      skippedInvalid += 1;
      continue;
    }

    const key = `${row.document_id}|${modelId}`;
    if (existingKeySet.has(key)) {
      skippedExisting += 1;
      continue;
    }

    if (!DRY_RUN) {
      const { error } = await supabase.from("document_analyze_runs").insert({
        document_id: row.document_id,
        storage_path: storagePath,
        model_id: modelId,
        source: "live_seed",
        analyze_result: row.raw_result,
        parsed_data: row.parsed_data ?? null,
        parse_confidence: row.parse_confidence ?? null,
      });
      if (error) {
        throw new Error(`Failed to insert analyze run for ${row.document_id}: ${error.message}`);
      }
    }

    existingKeySet.add(key);
    created += 1;
  }

  console.log("[backfill-analyze-runs] done", {
    dryRun: DRY_RUN,
    candidates: rows.length,
    created,
    skippedExisting,
    skippedInvalid,
  });
}

async function loadExtractionCandidates() {
  let query = supabase
    .from("document_extractions")
    .select(
      "document_id, model_used, raw_result, parsed_data, parse_confidence, documents(tenant_id, created_at, storage_path)"
    )
    .in("model_used", [...AZURE_MODELS])
    .not("raw_result", "is", null);

  if (TENANT_ID) query = query.eq("documents.tenant_id", TENANT_ID);
  if (FROM) query = query.gte("documents.created_at", toDateTime(FROM));
  if (TO) query = query.lte("documents.created_at", toDateTime(TO));
  if (LIMIT_DOCS) query = query.limit(LIMIT_DOCS);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load extraction candidates: ${error.message}`);
  return (data ?? []) as ExtractionRow[];
}

async function loadExistingAnalyzeRunKeys(documentIds: string[]): Promise<AnalyzeRunKey[]> {
  const uniqueIds = Array.from(new Set(documentIds.filter(Boolean)));
  if (!uniqueIds.length) return [];

  const out: AnalyzeRunKey[] = [];
  for (const group of chunk(uniqueIds, 200)) {
    const { data, error } = await supabase
      .from("document_analyze_runs")
      .select("document_id, model_id")
      .in("document_id", group)
      .in("source", ["live_process", "live_seed"])
      .in("model_id", [...AZURE_MODELS]);
    if (error) throw new Error(`Failed to load existing analyze runs: ${error.message}`);
    for (const row of data ?? []) {
      const documentId = (row as any).document_id as string | null;
      const modelId = (row as any).model_id as string | null;
      if (!documentId || !modelId) continue;
      out.push({ document_id: documentId, model_id: modelId });
    }
  }
  return out;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.toISOString();
}

function toOptionalInt(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
