/// <reference path="../../supabase/functions/deno.d.ts" />
// Review-Extraction: Lädt pro Dokument PDF + raw_result + parsed_data lokal herunter,
// damit Claude Code einen Dreifach-Vergleich machen kann (PDF visuell → Azure-Rohdaten → Mapper-Output).
//
// Usage (from backend/):
//   deno run -A tests-backend/integration/review-extraction.ts
//
// Env vars:
//   SUPABASE_LIVE_URL, SUPABASE_LIVE_SERVICE_ROLE_KEY  (from .env.live.local)
//   TENANT_ID         – filter by tenant (optional)
//   DOC_ID=<uuid>     – single document by ID (optional)
//   LIMIT_DOCS=N      – max number of documents (optional)
//   CLEANUP=1         – clear output directory before run (optional)

import { createSupabaseTestClient, loadEnvFiles } from "./_shared.ts";

const OUTPUT_DIR = new URL("../output/", import.meta.url);

await loadEnvFiles();

const TENANT_ID =
  Deno.env.get("TENANT_ID") ?? Deno.env.get("SUPABASE_LIVE_TENANT_ID") ?? null;
const DOC_ID = Deno.env.get("DOC_ID") ?? null;
const LIMIT_DOCS = toOptionalInt(Deno.env.get("LIMIT_DOCS"));
const CLEANUP = Deno.env.get("CLEANUP") === "1";

const supabase = createSupabaseTestClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOptionalInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureOutputDir() {
  try {
    await Deno.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

async function cleanOutputDir() {
  try {
    for await (const entry of Deno.readDir(OUTPUT_DIR)) {
      await Deno.remove(new URL(entry.name, OUTPUT_DIR));
    }
    console.log("[review] Output directory cleaned.");
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

type ExtractionRow = {
  document_id: string;
  status: string;
  detected_document_type: string | null;
  parsed_data: unknown;
  raw_result: unknown;
  documents: {
    id: string;
    tenant_id: string;
    original_filename: string;
    storage_path: string;
    storage_bucket: string;
    status: string;
  };
};

async function loadExtractions(): Promise<ExtractionRow[]> {
  let query = (supabase.from("document_extractions") as any)
    .select(
      "document_id, status, detected_document_type, parsed_data, raw_result, documents!inner(id, tenant_id, original_filename, storage_path, storage_bucket, status)"
    )
    .eq("status", "succeeded");

  if (DOC_ID) query = query.eq("document_id", DOC_ID);
  if (TENANT_ID) query = query.eq("documents.tenant_id", TENANT_ID);
  if (LIMIT_DOCS) query = query.limit(LIMIT_DOCS);

  query = query.order("document_id", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load extractions: ${error.message}`);
  return (data ?? []) as ExtractionRow[];
}

// ---------------------------------------------------------------------------
// File writing
// ---------------------------------------------------------------------------

async function downloadPdf(
  bucket: string,
  storagePath: string,
  localName: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);
  if (error) throw new Error(`Storage download failed for ${storagePath}: ${error.message}`);

  const bytes = new Uint8Array(await data.arrayBuffer());
  const filePath = new URL(localName, OUTPUT_DIR);
  await Deno.writeFile(filePath, bytes);
  return filePath.pathname;
}

async function writeJson(localName: string, data: unknown): Promise<string> {
  const filePath = new URL(localName, OUTPUT_DIR);
  const json = JSON.stringify(data, null, 2);
  await Deno.writeTextFile(filePath, json);
  return filePath.pathname;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  if (CLEANUP) await cleanOutputDir();
  await ensureOutputDir();

  const extractions = await loadExtractions();
  console.log(`[review] Found ${extractions.length} extraction(s).`);
  if (!extractions.length) {
    console.log("[review] No extractions found for the given filters.");
    return;
  }

  const usedNames = new Set<string>();
  let exported = 0;

  for (const ext of extractions) {
    const doc = Array.isArray(ext.documents) ? ext.documents[0] : ext.documents;
    const filename = doc?.original_filename ?? "unknown";
    const docId = ext.document_id;
    const docType = ext.detected_document_type ?? "unknown";

    // Build unique safe base name
    let baseName = safeName(filename.replace(/\.[^.]+$/, ""));
    if (usedNames.has(baseName)) {
      baseName = `${baseName}_${docId.slice(0, 8)}`;
    }
    usedNames.add(baseName);

    const ext_ = filename.match(/\.[^.]+$/)?.[0] ?? ".pdf";

    console.log(`\n--- ${filename} (${docType}) ---`);
    console.log(`    doc_id: ${docId}`);

    try {
      // 1. Download PDF from Storage
      const pdfPath = await downloadPdf(
        doc.storage_bucket,
        doc.storage_path,
        `${baseName}${ext_}`
      );
      console.log(`    PDF:    ${pdfPath}`);

      // 2. Write parsed_data
      const parsedPath = await writeJson(`${baseName}_parsed.json`, ext.parsed_data);
      console.log(`    PARSED: ${parsedPath}`);

      // 3. Write raw_result
      const rawPath = await writeJson(`${baseName}_raw.json`, ext.raw_result);
      console.log(`    RAW:    ${rawPath}`);

      exported += 1;
    } catch (err) {
      console.error(`    ERROR: ${(err as Error).message}`);
    }
  }

  console.log(`\n[review] Exported ${exported}/${extractions.length} document(s) to output/.`);
}

if (import.meta.main) {
  run().catch((err) => {
    console.error(err);
    Deno.exit(1);
  });
}
