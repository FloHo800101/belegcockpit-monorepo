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

function sanitizeFilename(filename: string) {
  return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

function buildStoragePath(params: {
  tenantId: string;
  documentId: string;
  originalFilename: string;
}) {
  const safeFilename = sanitizeFilename(params.originalFilename);
  return `tenant/${params.tenantId}/document/${params.documentId}/${safeFilename}`;
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
  const file = form.get("file");

  if (!tenantId) {
    return jsonResponse({ error: "Missing tenantId" }, { status: 400, headers: cors });
  }
  if (!(file instanceof File)) {
    return jsonResponse({ error: "Missing file" }, { status: 400, headers: cors });
  }

  const originalFilename = file.name || "upload.bin";
  const contentType = file.type || "application/octet-stream";
  const documentId = crypto.randomUUID();
  const storageBucket = "documents";
  const storagePath = buildStoragePath({ tenantId, documentId, originalFilename });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
    status: "uploaded",
  });

  if (insertRes.error) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
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
    { documentId, storageBucket, storagePath, originalFilename, fileSize: file.size },
    { status: 200, headers: cors }
  );
});