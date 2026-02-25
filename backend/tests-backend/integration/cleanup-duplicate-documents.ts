// How to run (from backend/):
//   DRY_RUN=1 SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... pnpm cleanup:duplicate-documents
//   DRY_RUN=0 SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... pnpm cleanup:duplicate-documents
//
// Optional filters:
//   TENANT_ID=<uuid>        limit to one tenant
//   LIMIT_GROUPS=<number>   max duplicate groups to process
//
// Cleanup-Skript: Findet Dubletten in public.documents über (tenant_id, file_hash).
// Pro Gruppe wird das älteste Dokument behalten und die restlichen Duplikate gelöscht.
// Vor dem Löschen werden bank_transactions.source_document_id auf das Keep-Dokument umgehängt.
// Abhängige Daten wie document_extractions / invoices / invoice_line_items / match_edges_docs
// werden über ON DELETE CASCADE automatisch entfernt.

import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
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
const LIMIT_GROUPS = toOptionalInt(process.env.LIMIT_GROUPS);
const DRY_RUN = process.env.DRY_RUN !== "0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type DocumentRow = {
  id: string;
  tenant_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  file_hash: string | null;
  created_at: string;
};

type DuplicateGroup = {
  tenantId: string;
  fileHash: string;
  keepDocumentId: string;
  duplicateDocumentIds: string[];
};

async function main() {
  const documents = await loadDocumentsWithHash();
  const groups = buildDuplicateGroups(documents);
  const selectedGroups = LIMIT_GROUPS ? groups.slice(0, LIMIT_GROUPS) : groups;

  console.log("[cleanup-duplicate-documents] scan", {
    documents_with_hash: documents.length,
    duplicate_groups_found: groups.length,
    duplicate_groups_selected: selectedGroups.length,
    dry_run: DRY_RUN,
    tenant_id: TENANT_ID,
  });

  let duplicateDocsTotal = 0;
  let relinkedTxRows = 0;
  let deletedDocs = 0;
  let failedGroups = 0;
  let nullHashRows = 0;
  let nullHashUpdated = 0;
  let nullHashDeletedAsDuplicate = 0;
  let nullHashDownloadFailed = 0;
  let nullHashMissingStorage = 0;

  for (const group of selectedGroups) {
    duplicateDocsTotal += group.duplicateDocumentIds.length;
    try {
      const txRows = await countTransactionsLinkedToDuplicates(group);
      relinkedTxRows += txRows;

      console.log("[cleanup-duplicate-documents] group", {
        tenant_id: group.tenantId,
        keep_document_id: group.keepDocumentId,
        duplicate_document_ids: group.duplicateDocumentIds,
        file_hash_prefix: group.fileHash.slice(0, 12),
        bank_transactions_to_relink: txRows,
      });

      if (DRY_RUN) continue;

      if (txRows > 0) {
        await relinkTransactions(group);
      }

      const removed = await deleteDuplicateDocuments(group);
      deletedDocs += removed;
    } catch (error) {
      failedGroups += 1;
      console.warn("[cleanup-duplicate-documents] group_failed", {
        tenant_id: group.tenantId,
        keep_document_id: group.keepDocumentId,
        duplicate_document_ids: group.duplicateDocumentIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const withoutHash = await loadDocumentsWithoutHash();
  nullHashRows = withoutHash.length;
  for (const row of withoutHash) {
    try {
      if (!row.storage_bucket || !row.storage_path) {
        nullHashMissingStorage += 1;
        continue;
      }
      const hash = await calculateHashFromStorage(row);
      const existing = await findExistingByHash(row.tenant_id, hash);

      if (existing && existing.id !== row.id) {
        const txRows = await countTransactionsLinkedToDocument(row.tenant_id, row.id);
        relinkedTxRows += txRows;

        console.log("[cleanup-duplicate-documents] null_hash_duplicate", {
          tenant_id: row.tenant_id,
          keep_document_id: existing.id,
          duplicate_document_id: row.id,
          file_hash_prefix: hash.slice(0, 12),
          bank_transactions_to_relink: txRows,
        });

        if (!DRY_RUN) {
          if (txRows > 0) {
            await relinkTransactionsFromOne(row.tenant_id, row.id, existing.id);
          }
          await deleteOneDocument(row.tenant_id, row.id);
          nullHashDeletedAsDuplicate += 1;
          deletedDocs += 1;
        }
        continue;
      }

      if (!DRY_RUN) {
        const { error } = await supabase
          .from("documents")
          .update({ file_hash: hash })
          .eq("id", row.id)
          .is("file_hash", null);
        if (error) {
          throw new Error(`Failed to backfill file_hash: ${error.message}`);
        }
      }
      nullHashUpdated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/download/i.test(message)) {
        nullHashDownloadFailed += 1;
      } else {
        failedGroups += 1;
      }
      console.warn("[cleanup-duplicate-documents] null_hash_failed", {
        document_id: row.id,
        error: message,
      });
    }
  }

  console.log("[cleanup-duplicate-documents] done", {
    duplicate_groups_processed: selectedGroups.length,
    duplicate_documents_total: duplicateDocsTotal,
    bank_transactions_relinked: relinkedTxRows,
    documents_deleted: deletedDocs,
    null_hash_rows: nullHashRows,
    null_hash_backfilled: nullHashUpdated,
    null_hash_deleted_as_duplicate: nullHashDeletedAsDuplicate,
    null_hash_download_failed: nullHashDownloadFailed,
    null_hash_missing_storage: nullHashMissingStorage,
    failed_groups: failedGroups,
    dry_run: DRY_RUN,
  });
}

async function loadDocumentsWithHash(): Promise<DocumentRow[]> {
  let query = supabase
    .from("documents")
    .select("id, tenant_id, storage_bucket, storage_path, file_hash, created_at")
    .not("file_hash", "is", null)
    .order("created_at", { ascending: true });

  if (TENANT_ID) query = query.eq("tenant_id", TENANT_ID);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load documents with hash: ${error.message}`);
  }
  return (data ?? []) as DocumentRow[];
}

async function loadDocumentsWithoutHash(): Promise<DocumentRow[]> {
  let query = supabase
    .from("documents")
    .select("id, tenant_id, storage_bucket, storage_path, file_hash, created_at")
    .is("file_hash", null)
    .order("created_at", { ascending: true });
  if (TENANT_ID) query = query.eq("tenant_id", TENANT_ID);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load documents without hash: ${error.message}`);
  }
  return (data ?? []) as DocumentRow[];
}

function buildDuplicateGroups(rows: DocumentRow[]): DuplicateGroup[] {
  const byKey = new Map<string, DocumentRow[]>();
  for (const row of rows) {
    if (!row.file_hash) continue;
    const key = `${row.tenant_id}::${row.file_hash}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const list of byKey.values()) {
    if (list.length <= 1) continue;
    list.sort((a, b) => {
      const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });
    const keep = list[0];
    groups.push({
      tenantId: keep.tenant_id,
      fileHash: keep.file_hash as string,
      keepDocumentId: keep.id,
      duplicateDocumentIds: list.slice(1).map((row) => row.id),
    });
  }

  // oldest groups first by keep-document creation (already implied by source sort)
  return groups;
}

async function countTransactionsLinkedToDuplicates(group: DuplicateGroup): Promise<number> {
  const { count, error } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", group.tenantId)
    .in("source_document_id", group.duplicateDocumentIds);
  if (error) {
    throw new Error(`Failed to count bank_transactions to relink: ${error.message}`);
  }
  return count ?? 0;
}

async function countTransactionsLinkedToDocument(
  tenantId: string,
  documentId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("source_document_id", documentId);
  if (error) {
    throw new Error(`Failed to count bank_transactions to relink: ${error.message}`);
  }
  return count ?? 0;
}

async function relinkTransactions(group: DuplicateGroup): Promise<void> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("id, source_document_id")
    .eq("tenant_id", group.tenantId)
    .in("source_document_id", group.duplicateDocumentIds);
  if (error) throw new Error(`Failed to load bank_transactions for relink: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; source_document_id: string | null }>;
  for (const row of rows) {
    const { error: updateError } = await supabase
      .from("bank_transactions")
      .update({
        source_document_id: group.keepDocumentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("tenant_id", group.tenantId);
    if (updateError) {
      if (isBankTxSourceUniqueViolation(updateError)) {
        const { error: deleteError } = await supabase
          .from("bank_transactions")
          .delete()
          .eq("id", row.id)
          .eq("tenant_id", group.tenantId);
        if (deleteError) {
          throw new Error(`Failed to delete conflicting bank_transaction: ${deleteError.message}`);
        }
        continue;
      }
      throw new Error(`Failed to relink bank_transactions: ${updateError.message}`);
    }
  }
}

async function relinkTransactionsFromOne(
  tenantId: string,
  fromDocumentId: string,
  toDocumentId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_document_id", fromDocumentId);
  if (error) throw new Error(`Failed to load bank_transactions for relink: ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string }>;
  for (const row of rows) {
    const { error: updateError } = await supabase
      .from("bank_transactions")
      .update({
        source_document_id: toDocumentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    if (updateError) {
      if (isBankTxSourceUniqueViolation(updateError)) {
        const { error: deleteError } = await supabase
          .from("bank_transactions")
          .delete()
          .eq("id", row.id)
          .eq("tenant_id", tenantId);
        if (deleteError) {
          throw new Error(`Failed to delete conflicting bank_transaction: ${deleteError.message}`);
        }
        continue;
      }
      throw new Error(`Failed to relink bank_transactions: ${updateError.message}`);
    }
  }
}

async function deleteDuplicateDocuments(group: DuplicateGroup): Promise<number> {
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("tenant_id", group.tenantId)
    .in("id", group.duplicateDocumentIds)
    .select("id");
  if (error) {
    throw new Error(`Failed to delete duplicate documents: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function deleteOneDocument(tenantId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", documentId);
  if (error) {
    throw new Error(`Failed to delete duplicate document: ${error.message}`);
  }
}

async function calculateHashFromStorage(row: DocumentRow): Promise<string> {
  if (!row.storage_bucket || !row.storage_path) {
    throw new Error("missing storage pointer");
  }
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .download(row.storage_path);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message ?? "no data"}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

async function findExistingByHash(
  tenantId: string,
  fileHash: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) {
    throw new Error(`Failed to lookup existing hash: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const id = (data[0] as { id?: string }).id;
  if (!id) return null;
  return { id };
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

function isBankTxSourceUniqueViolation(error: { message?: string; code?: string }): boolean {
  if (error.code === "23505") return true;
  const message = `${error.message ?? ""}`;
  return /unique/i.test(message) && /bank_transactions_source_doc_unique/i.test(message);
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
