// How to run:
// pnpm test:integration

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { uploadDocument } from "../../src/documents/uploader";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_LIVE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY;

const shouldRun =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_SERVICE_ROLE_KEY);

const describeHosted = shouldRun ? describe : describe.skip;

if (!shouldRun) {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_LIVE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_LIVE_SERVICE_ROLE_KEY");
  // Helps diagnose why Vitest shows [skipped] without leaking secrets.
  // eslint-disable-next-line no-console
  console.warn(
    `[integration] Skipping hosted Supabase test. Missing/invalid: ${missing.join(
      ", "
    )}`
  );
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "belegcockpit-int-"));
}

describeHosted("upload documents (integration, hosted)", () => {
  it("uploads a file, creates DB row, and can read it back", async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Missing SUPABASE_LIVE_URL or SUPABASE_LIVE_SERVICE_ROLE_KEY."
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const tenantName = `Integration ${new Date()
      .toISOString()
      .slice(0, 19)} ${crypto.randomUUID()}`;
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .insert({ name: tenantName })
      .select("id")
      .single();
    if (tenantErr) throw tenantErr;
    const tenantId = tenant.id as string;

    const dir = makeTempDir();
    const file = path.join(dir, "test.txt");
    const contents = `hello ${crypto.randomUUID()}`;
    const expectedHash = crypto
      .createHash("sha256")
      .update(Buffer.from(contents, "utf8"))
      .digest("hex");
    fs.writeFileSync(file, contents, "utf8");

    let documentId: string | null = null;
    let storagePath: string | null = null;
    try {
      const res = await uploadDocument({
        supabase,
        tenantId,
        filePath: file,
        uploadedBy: null,
      });
      documentId = res.documentId;
      storagePath = res.storagePath;
      expect(res.reused).toBe(false);

      const { data: row, error: rowErr } = await supabase
        .from("documents")
        .select(
          "id, tenant_id, storage_bucket, storage_path, original_filename, file_size, file_hash, status"
        )
        .eq("id", documentId)
        .single();
      if (rowErr) throw rowErr;

      expect(row.id).toBe(documentId);
      expect(row.tenant_id).toBe(tenantId);
      expect(row.storage_bucket).toBe("documents");
      expect(row.storage_path).toBe(storagePath);
      expect(row.original_filename).toBe("test.txt");
      expect(row.status).toBe("uploaded");
      expect(Number(row.file_size)).toBe(contents.length);
      expect(row.file_hash).toBe(expectedHash);

      const { data: downloaded, error: dlErr } = await supabase.storage
        .from("documents")
        .download(storagePath);
      if (dlErr) throw dlErr;

      const downloadedText = await downloaded.text();
      expect(downloadedText).toBe(contents);

      const duplicate = await uploadDocument({
        supabase,
        tenantId,
        filePath: file,
        uploadedBy: null,
      });
      expect(duplicate.reused).toBe(true);
      expect(duplicate.documentId).toBe(documentId);
      expect(duplicate.storagePath).toBe(storagePath);

      const { count, error: countErr } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("file_hash", expectedHash);
      if (countErr) throw countErr;
      expect(count).toBe(1);
    } finally {
      if (storagePath) {
        await supabase.storage.from("documents").remove([storagePath]);
      }
      if (documentId) {
        await supabase.from("documents").delete().eq("id", documentId);
      }
      await supabase.from("tenants").delete().eq("id", tenantId);
    }
  }, 60_000);
});
