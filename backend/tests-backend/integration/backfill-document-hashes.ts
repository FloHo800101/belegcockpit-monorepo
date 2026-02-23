// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... pnpm test:backfill-document-hashes
// Optional filters: FROM=YYYY-MM-DD TO=YYYY-MM-DD LIMIT_DOCS=...
// Optional: DRY_RUN=1 (no DB updates)

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const TENANT_ID = process.env.TENANT_ID ?? null;
const FROM = process.env.FROM ?? null;
const TO = process.env.TO ?? null;
const LIMIT_DOCS = toOptionalInt(process.env.LIMIT_DOCS);
const DRY_RUN = process.env.DRY_RUN === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type DocumentRow = {
  id: string;
  tenant_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  created_at: string;
};

type ExistingByHashRow = {
  id: string;
  storage_path: string;
};

async function main() {
  const rows = await loadDocumentsWithoutHash();
  console.log(`Found ${rows.length} document(s) with file_hash IS NULL.`);
  if (!rows.length) {
    console.log("Nothing to backfill.");
    return;
  }

  let updated = 0;
  let dryRunUpdated = 0;
  let skippedDuplicate = 0;
  let skippedDownloadError = 0;
  let skippedMissingStorage = 0;
  let failedUpdate = 0;

  for (const row of rows) {
    if (!row.storage_bucket || !row.storage_path) {
      skippedMissingStorage += 1;
      console.warn("[backfill-document-hashes] skip: missing storage pointer", {
        document_id: row.id,
      });
      continue;
    }

    const hash = await calculateHashFromStorage(row).catch((error) => {
      skippedDownloadError += 1;
      console.warn("[backfill-document-hashes] skip: storage download failed", {
        document_id: row.id,
        storage_path: row.storage_path,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (!hash) continue;

    const existing = await findExistingByHash(row.tenant_id, hash);
    if (existing && existing.id !== row.id) {
      skippedDuplicate += 1;
      console.log("[backfill-document-hashes] duplicate_reused", {
        tenant_id: row.tenant_id,
        document_id: existing.id,
        duplicate_document_id: row.id,
        file_hash_prefix: hash.slice(0, 12),
      });
      continue;
    }

    if (DRY_RUN) {
      dryRunUpdated += 1;
      console.log("[backfill-document-hashes] dry-run update", {
        document_id: row.id,
        file_hash_prefix: hash.slice(0, 12),
      });
      continue;
    }

    const { error } = await supabase
      .from("documents")
      .update({ file_hash: hash })
      .eq("id", row.id)
      .is("file_hash", null);

    if (error) {
      if (isUniqueViolation(error)) {
        skippedDuplicate += 1;
        const raced = await findExistingByHash(row.tenant_id, hash);
        console.log("[backfill-document-hashes] duplicate_reused", {
          tenant_id: row.tenant_id,
          document_id: raced?.id ?? "unknown",
          duplicate_document_id: row.id,
          file_hash_prefix: hash.slice(0, 12),
        });
        continue;
      }

      failedUpdate += 1;
      console.warn("[backfill-document-hashes] update failed", {
        document_id: row.id,
        error: error.message,
      });
      continue;
    }

    updated += 1;
  }

  console.log("[backfill-document-hashes] done", {
    total: rows.length,
    updated,
    dry_run_updates: dryRunUpdated,
    skipped_duplicate: skippedDuplicate,
    skipped_download_error: skippedDownloadError,
    skipped_missing_storage: skippedMissingStorage,
    failed_update: failedUpdate,
    dry_run: DRY_RUN,
  });
}

async function loadDocumentsWithoutHash(): Promise<DocumentRow[]> {
  let query = supabase
    .from("documents")
    .select("id, tenant_id, storage_bucket, storage_path, original_filename, created_at")
    .is("file_hash", null)
    .order("created_at", { ascending: true });

  if (TENANT_ID) query = query.eq("tenant_id", TENANT_ID);
  if (FROM) query = query.gte("created_at", toDateTime(FROM));
  if (TO) query = query.lte("created_at", toDateTime(TO));
  if (LIMIT_DOCS) query = query.limit(LIMIT_DOCS);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load documents without hash: ${error.message}`);
  return (data ?? []) as DocumentRow[];
}

async function calculateHashFromStorage(row: DocumentRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .download(row.storage_path);
  if (error || !data) {
    throw new Error(error?.message ?? "download returned no data");
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

async function findExistingByHash(
  tenantId: string,
  fileHash: string
): Promise<ExistingByHashRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) throw new Error(`Failed to lookup existing hash: ${error.message}`);
  if (!data || data.length === 0) return null;

  return data[0] as ExistingByHashRow;
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === "23505") return true;
  return /unique/i.test(error.message ?? "") &&
    /file_hash|documents_tenant_file_hash_unique/i.test(error.message ?? "");
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

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}
