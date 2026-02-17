// How to run (from repo root):
// pnpm test:manual:cleanup

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_LIVE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY;

const STATE_PATH = path.resolve(
  "tests-backend",
  "manual",
  "test-upload-state.json"
);

function requireEnv(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in .env.live.local`);
  return value;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function main() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(`State file not found: ${STATE_PATH}`);
  }

  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as {
    tenantId: string;
    userId: string;
    documents: { documentId: string; storagePath: string }[];
  };

  const supabaseUrl = requireEnv(SUPABASE_URL, "SUPABASE_LIVE_URL");
  const serviceRoleKey = requireEnv(
    SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_LIVE_SERVICE_ROLE_KEY"
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const documentIds = state.documents.map((r) => r.documentId);
  const storagePaths = state.documents.map((r) => r.storagePath);

  for (const group of chunk(storagePaths, 100)) {
    const { error } = await supabase.storage.from("documents").remove(group);
    if (error) throw error;
  }

  if (documentIds.length) {
    const { error } = await supabase
      .from("documents")
      .delete()
      .in("id", documentIds);
    if (error) throw error;
  }

  const { error: membershipErr } = await supabase
    .from("memberships")
    .delete()
    .match({ tenant_id: state.tenantId, user_id: state.userId });
  if (membershipErr) throw membershipErr;

  const { error: tenantErr } = await supabase
    .from("tenants")
    .delete()
    .eq("id", state.tenantId);
  if (tenantErr) throw tenantErr;

  const { error: userErr } = await supabase.auth.admin.deleteUser(state.userId);
  if (userErr) throw userErr;

  fs.unlinkSync(STATE_PATH);

  console.log("Manual test data removed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
