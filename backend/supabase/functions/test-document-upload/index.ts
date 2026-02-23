/// <reference path="../deno.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, x-test-upload-token",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const PATH_SEPARATORS_REGEX = /[\\/]+/g;
const DISALLOWED_SEGMENT_CHARS_REGEX = /[^A-Za-z0-9._-]+/g;
const DASH_RUN_REGEX = /-+/g;
const LEADING_OR_TRAILING_DASHES_REGEX = /^-+|-+$/g;

function sanitizeStorageKeySegment(value: string, fallback = "segment") {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "")
    .replace(PATH_SEPARATORS_REGEX, "-")
    .replace(DISALLOWED_SEGMENT_CHARS_REGEX, "-")
    .replace(DASH_RUN_REGEX, "-")
    .replace(LEADING_OR_TRAILING_DASHES_REGEX, "");
  return normalized.length > 0 ? normalized : fallback;
}

function buildSafeStoragePath(parts: string[]) {
  if (parts.length === 0) return "segment";
  return parts
    .map((part, index) =>
      sanitizeStorageKeySegment(part, index === parts.length - 1 ? "file" : "segment")
    )
    .join("/");
}

function buildStoragePath(params: {
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

type ExistingDocument = {
  id: string;
  storage_path: string;
};

async function sha256Hex(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return toHex(digest);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

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

async function findDocumentByHash(
  supabase: any,
  tenantId: string,
  fileHash: string
): Promise<ExistingDocument | null> {
  const { data, error } = await (supabase.from("documents") as any)
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) throw error;
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

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, headers: cors }
    );
  }

  // Optional shared-secret to protect this function. If set, client must provide it.
  const requiredToken = Deno.env.get("TEST_DOCUMENT_UPLOAD_TOKEN") ?? "";
  if (requiredToken) {
    const provided = request.headers.get("x-test-upload-token") ?? "";
    if (provided !== requiredToken) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401, headers: cors });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function env." },
      { status: 500, headers: cors }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(
      { error: "Expected multipart/form-data" },
      { status: 400, headers: cors }
    );
  }

  const tenantId = (form.get("tenantId") ?? "").toString().trim();
  const uploadedByRaw = (form.get("uploadedBy") ?? "").toString().trim();
  const uploadedBy = uploadedByRaw ? uploadedByRaw : null;
  const pdfPassword = (form.get("pdfPassword") ?? "").toString().trim();
  const file = form.get("file");

  if (!tenantId) {
    return jsonResponse({ error: "Missing tenantId" }, { status: 400, headers: cors });
  }
  if (!(file instanceof File)) {
    return jsonResponse({ error: "Missing file" }, { status: 400, headers: cors });
  }

  const originalFilename = file.name || "upload.bin";
  const contentType = file.type || "application/octet-stream";
  const isPdf = contentType === "application/pdf" || originalFilename.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isPdfLikelyEncrypted(bytes)) {
      if (pdfPassword) {
        return jsonResponse(
          {
            error:
              "PDF is password-protected. Password-based decryption is not supported in this upload function yet.",
          },
          { status: 400, headers: cors }
        );
      }
      return jsonResponse(
        { error: "PDF is password-protected. Please upload an unprotected PDF." },
        { status: 400, headers: cors }
      );
    }
  }
  const fileHash = await sha256Hex(file);
  const storageBucket = "documents";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await findDocumentByHash(supabase, tenantId, fileHash);
  if (existing) {
    console.log("[test-document-upload] duplicate_reused", {
      tenant_id: tenantId,
      document_id: existing.id,
      file_hash_prefix: fileHash.slice(0, 12),
    });
    return jsonResponse(
      {
        documentId: existing.id,
        duplicateOfDocumentId: existing.id,
        storageBucket,
        storagePath: existing.storage_path,
        originalFilename,
        fileSize: file.size,
        reused: true,
      },
      { status: 200, headers: cors }
    );
  }

  const documentId = crypto.randomUUID();
  const storagePath = buildStoragePath({ tenantId, documentId, originalFilename });

  const uploadRes = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, file, { contentType, upsert: false });
  if (uploadRes.error) {
    return jsonResponse({ error: uploadRes.error.message }, { status: 400, headers: cors });
  }

  const insertRes = await supabase.from("documents").insert({
    id: documentId,
    tenant_id: tenantId,
    uploaded_by: uploadedBy,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    original_filename: originalFilename,
    mime_type: contentType,
    file_size: file.size,
    file_hash: fileHash,
    status: "uploaded",
  });

  if (insertRes.error) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    if (isUniqueViolation(insertRes.error)) {
      const racedExisting = await findDocumentByHash(supabase, tenantId, fileHash);
      if (racedExisting) {
        console.log("[test-document-upload] duplicate_reused", {
          tenant_id: tenantId,
          document_id: racedExisting.id,
          file_hash_prefix: fileHash.slice(0, 12),
        });
        return jsonResponse(
          {
            documentId: racedExisting.id,
            duplicateOfDocumentId: racedExisting.id,
            storageBucket,
            storagePath: racedExisting.storage_path,
            originalFilename,
            fileSize: file.size,
            reused: true,
          },
          { status: 200, headers: cors }
        );
      }
    }
    return jsonResponse({ error: insertRes.error.message }, { status: 400, headers: cors });
  }

  const processToken = Deno.env.get("PROCESS_DOCUMENT_TOKEN") ?? "";
  const invokeRes = await supabase.functions.invoke("process-document", {
    body: { documentId },
    headers: processToken ? { "x-process-token": processToken } : undefined,
  });

  if (invokeRes.error) {
    console.warn("Failed to trigger process-document:", invokeRes.error);
  }

  return jsonResponse(
    { documentId, storageBucket, storagePath, originalFilename, fileSize: file.size, reused: false },
    { status: 200, headers: cors }
  );
});
