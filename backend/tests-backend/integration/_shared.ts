import {
  createClient,
  type SupabaseClient as SupabaseClientType,
} from "npm:@supabase/supabase-js@2";
import { buildSafeStoragePath, sanitizeStorageKeySegment } from "../../src/documents/storagePath.ts";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: { id: string; name: string | null };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string | null };
        Relationships: [];
      };
      memberships: {
        Row: { id: string; tenant_id: string; user_id: string };
        Insert: { id?: string; tenant_id: string; user_id: string };
        Update: { id?: string; tenant_id?: string; user_id?: string };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          tenant_id: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size: number;
          file_hash: string | null;
          status: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          storage_bucket: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          file_size: number;
          file_hash?: string | null;
          status: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          storage_bucket?: string;
          storage_path?: string;
          original_filename?: string;
          mime_type?: string;
          file_size?: number;
          file_hash?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      document_xml_parse_runs: {
        Row: {
          id: string;
          storage_path: string;
          source_type: string | null;
          parsed_data: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          storage_path: string;
          source_type: string | null;
          parsed_data: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          storage_path?: string;
          source_type?: string | null;
          parsed_data?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      document_analyze_runs: {
        Row: {
          id: string;
          document_id: string | null;
          storage_path: string;
          model_id: string;
          source: string;
          analyze_result: Json | null;
          parsed_data: Json | null;
          parse_confidence: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          document_id?: string | null;
          storage_path: string;
          model_id: string;
          source?: string;
          analyze_result: Json | null;
          parsed_data: Json | null;
          parse_confidence: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          document_id?: string | null;
          storage_path?: string;
          model_id?: string;
          source?: string;
          analyze_result?: Json | null;
          parsed_data?: Json | null;
          parse_confidence?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type SupabaseClient = SupabaseClientType<Database>;

const ENV_FILES = [
  new URL("../../.env.live.local", import.meta.url),
  new URL("../../.env", import.meta.url),
];
let cachedTenantId: string | null = null;

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice(7).trim()
    : trimmed;
  const eqIndex = withoutExport.indexOf("=");
  if (eqIndex <= 0) return null;

  const key = withoutExport.slice(0, eqIndex).trim();
  let value = withoutExport.slice(eqIndex + 1).trim();
  if (!key) return null;

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export async function loadEnvFiles() {
  for (const url of ENV_FILES) {
    try {
      const text = await Deno.readTextFile(url);
      for (const line of text.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        if (Deno.env.get(parsed.key) == null) {
          Deno.env.set(parsed.key, parsed.value);
        }
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name} (load .env.live.local first).`);
  }
  return value;
}

export function createSupabaseTestClient(): SupabaseClient {
  const supabaseUrl = requireEnv("SUPABASE_LIVE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_LIVE_SERVICE_ROLE_KEY");
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getFileName(url: URL): string {
  const name = url.pathname.split("/").pop() ?? "file.bin";
  return decodeURIComponent(name);
}

export function contentTypeForName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export function buildStoragePath(group: string, fileName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return buildSafeStoragePath([
    "tests",
    "analyzes",
    group,
    `${stamp}-${crypto.randomUUID()}`,
    fileName,
  ]);
}

export function sanitizeStorageFileName(fileName: string): string {
  return sanitizeStorageKeySegment(fileName, "file");
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return toHex(digest);
}

export async function getTestTenantId(
  supabase: SupabaseClient
): Promise<string> {
  const envTenantId = Deno.env.get("SUPABASE_LIVE_TENANT_ID");
  if (envTenantId) return envTenantId;
  if (cachedTenantId) return cachedTenantId;

  const { data, error } = await (supabase
    .from("tenants") as any)
    .insert({
      name: `Integration Tests ${new Date().toISOString()}`,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Failed to create test tenant: ${error.message}`);
  }

  cachedTenantId = data.id as string;
  return cachedTenantId;
}

export async function uploadLocalFile(
  supabase: SupabaseClient,
  bucket: string,
  url: URL,
  storagePath: string
) {
  const bytes = await Deno.readFile(url);
  const fileName = getFileName(url);
  return await uploadBytes(supabase, bucket, bytes, fileName, storagePath);
}

export async function uploadBytes(
  supabase: SupabaseClient,
  bucket: string,
  bytes: Uint8Array,
  fileName: string,
  storagePath: string
) {
  const contentType = contentTypeForName(fileName);
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: contentType });
  const fileHash = await sha256Hex(bytes);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, blob, { contentType, upsert: false });
  if (error) {
    throw new Error(`Upload failed for ${fileName}: ${error.message}`);
  }

  return { contentType, size: bytes.byteLength, fileHash };
}

export async function downloadText(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  }
  return await data.text();
}

export async function createDocumentRow(params: {
  supabase: SupabaseClient;
  tenantId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
}) {
  const {
    supabase,
    tenantId,
    storageBucket,
    storagePath,
    originalFilename,
    mimeType,
    fileSize,
    fileHash,
  } =
    params;
  const { data, error } = await (supabase
    .from("documents") as any)
    .insert({
      tenant_id: tenantId,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      original_filename: originalFilename,
      mime_type: mimeType,
      file_size: fileSize,
      file_hash: fileHash,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const existingId = await findDocumentIdByHash(supabase, tenantId, fileHash);
      if (existingId) return existingId;
    }
    throw new Error(`Failed to create document row: ${error.message}`);
  }
  return data.id as string;
}

async function findDocumentIdByHash(
  supabase: SupabaseClient,
  tenantId: string,
  fileHash: string
): Promise<string | null> {
  const { data, error } = await (supabase
    .from("documents") as any)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("file_hash", fileHash)
    .limit(1);
  if (error) {
    throw new Error(`Failed to load duplicate document by hash: ${error.message}`);
  }
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id?: string };
  return row.id ?? null;
}

function isUniqueViolation(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /unique/i.test(message) && /file_hash|documents_tenant_file_hash_unique/i.test(message);
}

export async function removeFile(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string
) {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    throw new Error(`Remove failed: ${error.message}`);
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertClose(
  actual: number | null | undefined,
  expected: number,
  tolerance = 0.01
) {
  if (actual == null || Number.isNaN(actual)) {
    throw new Error(`Expected ${expected}, got ${String(actual)}`);
  }
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}
