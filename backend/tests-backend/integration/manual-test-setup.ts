// How to run (from backend/):
// pnpm test:manual:setup
//
// Setup-Skript für manuelle Tests: Erstellt einen neuen Auth-User und Tenant in der
// Live-Supabase-Instanz, lädt alle Testdokumente aus tests-backend/documents/ hoch
// und speichert den erstellten State (tenantId, userId, documentIds) in einer JSON-Datei,
// damit der Cleanup diese Ressourcen später wieder entfernen kann.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listFiles, uploadDocument } from "../../src/documents/uploader";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_LIVE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY;

const DOCUMENTS_DIR = path.resolve("tests-backend", "documents");
const STATE_PATH = path.resolve(
  "tests-backend",
  "manual",
  "test-upload-state.json"
);

function requireEnv(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in .env.live.local`);
  return value;
}

function ensureDocuments() {
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    throw new Error(`Missing documents folder: ${DOCUMENTS_DIR}`);
  }
  const files = listFiles(DOCUMENTS_DIR, false);
  if (!files.length) {
    throw new Error(`No files found in ${DOCUMENTS_DIR}`);
  }
  return files;
}

async function main() {
  if (fs.existsSync(STATE_PATH)) {
    throw new Error(
      `State file already exists. Run cleanup first: ${STATE_PATH}`
    );
  }

  const supabaseUrl = requireEnv(SUPABASE_URL, "SUPABASE_LIVE_URL");
  const serviceRoleKey = requireEnv(
    SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_LIVE_SERVICE_ROLE_KEY"
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const timestamp = new Date().toISOString();
  const email = `manual-test-${Date.now()}-${crypto.randomUUID()}@example.com`;
  const password = `Test!${crypto.randomUUID().slice(0, 12)}a`;

  const { data: userData, error: userErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Failed to create auth user.");

  const { data: membership, error: membershipErr } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .single();
  if (membershipErr) throw membershipErr;
  const tenantId = membership.tenant_id as string;

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();
  if (tenantErr) throw tenantErr;
  const tenantName = tenant.name as string;

  const files = ensureDocuments();
  const documents: { documentId: string; storagePath: string; filePath: string }[] =
    [];

  for (const filePath of files) {
    const res = await uploadDocument({
      supabase,
      tenantId,
      filePath,
      uploadedBy: userId,
    });
    documents.push({ ...res, filePath });
  }

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        createdAt: timestamp,
        tenantId,
        tenantName,
        userId,
        email,
        documents,
      },
      null,
      2
    )
  );

  console.log("Manual test data created:");
  console.log(`tenantId: ${tenantId}`);
  console.log(`tenantName: ${tenantName}`);
  console.log(`userId: ${userId}`);
  console.log(`email: ${email}`);
  console.log(`password: ${password}`);
  console.log(`uploaded files: ${documents.length}`);
  console.log(`state: ${STATE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
