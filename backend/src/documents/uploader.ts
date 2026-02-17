import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mime from "mime-types";

export const DEFAULT_DOCUMENTS_BUCKET = "documents";

type AsyncResult<T> = PromiseLike<T>;

export type SupabaseLike = {
  storage: {
    from(bucket: string): {
      upload(
        storagePath: string,
        body: unknown,
        options?: { contentType?: string; upsert?: boolean }
      ): AsyncResult<{ error: unknown | null }>;
      remove(paths: string[]): AsyncResult<{ error: unknown | null }>;
    };
  };
  from(table: string): {
    insert(row: unknown): AsyncResult<{ error: unknown | null }>;
  };
};

export function listFiles(targetPath: string, recursive: boolean): string[] {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) throw new Error(`Path not found: ${resolved}`);

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile()) out.push(full);
        else if (recursive && entry.isDirectory()) walk(full);
      }
    };
    walk(resolved);
    return out.sort();
  }

  return [resolved];
}

export function guessMimeType(filePath: string) {
  return (mime.lookup(filePath) || "application/octet-stream").toString();
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[/\\]/g, "_");
}

export function buildStoragePath(params: {
  tenantId: string;
  documentId: string;
  originalFilename: string;
}) {
  const safeFilename = sanitizeFilename(params.originalFilename);
  return `tenant/${params.tenantId}/document/${params.documentId}/${safeFilename}`;
}

export async function uploadDocument(params: {
  supabase: SupabaseLike;
  tenantId: string;
  filePath: string;
  uploadedBy?: string | null;
  storageBucket?: string;
  documentId?: string;
}) {
  const {
    supabase,
    tenantId,
    filePath,
    uploadedBy = null,
    storageBucket = DEFAULT_DOCUMENTS_BUCKET,
    documentId = crypto.randomUUID(),
  } = params;

  const originalFilename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const mimeType = guessMimeType(filePath);

  const storagePath = buildStoragePath({
    tenantId,
    documentId,
    originalFilename,
  });

  const { error: uploadErr } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });
  if (uploadErr) throw uploadErr;

  const { error: insertErr } = await supabase.from("documents").insert({
    id: documentId,
    tenant_id: tenantId,
    uploaded_by: uploadedBy,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    original_filename: originalFilename,
    mime_type: mimeType,
    file_size: fileSize,
    file_hash: fileHash,
    status: "uploaded",
  });

  if (insertErr) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    throw insertErr;
  }

  return { documentId, storagePath };
}
