import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";
import mime from "mime-types";
import { buildSafeStoragePath, sanitizeStorageKeySegment } from "./storagePath";

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

type ExistingDocumentRow = {
  id: string;
  storage_path: string;
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
  return sanitizeStorageKeySegment(filename, "file");
}

export function isPdfLikelyEncrypted(buffer: Buffer | Uint8Array): boolean {
  if (!buffer || buffer.length < 8) return false;
  const head = Buffer.from(buffer.subarray(0, Math.min(buffer.length, 1024))).toString("latin1");
  if (!head.includes("%PDF-")) return false;
  const sample = Buffer.from(buffer.subarray(0, Math.min(buffer.length, 2_000_000))).toString("latin1");
  return /\/Encrypt\b/.test(sample);
}

function decryptPdfWithQpdf(pdfBuffer: Buffer, pdfPassword: string): Buffer {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "belegcockpit-pdf-"));
  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "output.pdf");
  fs.writeFileSync(inputPath, pdfBuffer);

  try {
    execFileSync("qpdf", [`--password=${pdfPassword}`, "--decrypt", inputPath, outputPath], {
      stdio: "pipe",
    });
    const decrypted = fs.readFileSync(outputPath);
    return decrypted;
  } catch (error) {
    const message =
      typeof error === "object" && error && "stderr" in error
        ? String((error as any).stderr)
        : String(error);
    if (/qpdf/i.test(message) && /not recognized|enoent/i.test(message)) {
      throw new Error(
        "qpdf is required to decrypt password-protected PDFs. Please install qpdf and retry."
      );
    }
    if (/invalid password|password/i.test(message)) {
      throw new Error("Invalid PDF password.");
    }
    throw new Error(`Failed to decrypt password-protected PDF: ${message}`);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tempDir);
    } catch {
      // best effort temp cleanup
    }
  }
}

export function buildStoragePath(params: {
  tenantId: string;
  documentId: string;
  originalFilename: string;
}) {
  return buildSafeStoragePath([
    "tenant",
    params.tenantId,
    "document",
    params.documentId,
    params.originalFilename,
  ]);
}

export { buildSafeStoragePath, sanitizeStorageKeySegment };

export async function uploadDocument(params: {
  supabase: SupabaseLike;
  tenantId: string;
  filePath: string;
  uploadedBy?: string | null;
  pdfPassword?: string | null;
  storageBucket?: string;
  documentId?: string;
}) {
  const {
    supabase,
    tenantId,
    filePath,
    uploadedBy = null,
    pdfPassword = null,
    storageBucket = DEFAULT_DOCUMENTS_BUCKET,
    documentId = crypto.randomUUID(),
  } = params;

  const originalFilename = path.basename(filePath);
  const rawFileBuffer = fs.readFileSync(filePath);
  const mimeType = guessMimeType(filePath);
  const isPdf = mimeType === "application/pdf" || originalFilename.toLowerCase().endsWith(".pdf");
  let fileBuffer: Buffer = rawFileBuffer;
  if (isPdf && isPdfLikelyEncrypted(rawFileBuffer)) {
    if (pdfPassword && String(pdfPassword).trim()) {
      fileBuffer = decryptPdfWithQpdf(rawFileBuffer, String(pdfPassword).trim());
      if (isPdfLikelyEncrypted(fileBuffer)) {
        throw new Error("Failed to decrypt PDF with provided password.");
      }
    } else {
      throw new Error(
        "PDF is password-protected. Please upload an unprotected PDF."
      );
    }
  }
  const fileSize = fileBuffer.length;
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const existing = await findDocumentByHash(supabase, tenantId, fileHash);
  if (existing) {
    console.info("[documents.uploader] duplicate_reused", {
      tenant_id: tenantId,
      document_id: existing.id,
      file_hash_prefix: fileHash.slice(0, 12),
    });
    return { documentId: existing.id, storagePath: existing.storage_path, reused: true };
  }

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
    await safeRemoveUploadedFile(supabase, storageBucket, storagePath);
    if (isUniqueViolation(insertErr)) {
      const racedExisting = await findDocumentByHash(supabase, tenantId, fileHash);
      if (racedExisting) {
        console.info("[documents.uploader] duplicate_reused", {
          tenant_id: tenantId,
          document_id: racedExisting.id,
          file_hash_prefix: fileHash.slice(0, 12),
        });
        return {
          documentId: racedExisting.id,
          storagePath: racedExisting.storage_path,
          reused: true,
        };
      }
    }
    throw insertErr;
  }

  return { documentId, storagePath, reused: false };
}

async function findDocumentByHash(
  supabase: SupabaseLike,
  tenantId: string,
  fileHash: string
): Promise<ExistingDocumentRow | null> {
  const { data, error } = await (supabase.from("documents") as any)
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) {
    throw error;
  }
  if (!Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as { id?: string; storage_path?: string };
  if (!row.id || !row.storage_path) return null;
  return { id: row.id, storage_path: row.storage_path };
}

function isUniqueViolation(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? (error as any).code : null;
  if (code === "23505") return true;

  const message =
    typeof error === "object" && error && "message" in error ? String((error as any).message) : "";
  return /unique/i.test(message) && /file_hash|documents_tenant_file_hash_unique/i.test(message);
}

async function safeRemoveUploadedFile(
  supabase: SupabaseLike,
  storageBucket: string,
  storagePath: string
) {
  try {
    const result = await supabase.storage.from(storageBucket).remove([storagePath]);
    if (result && typeof result === "object" && "error" in result && (result as any).error) {
      return;
    }
  } catch {
    // Best effort cleanup; original DB error will be surfaced by caller.
  }
}
