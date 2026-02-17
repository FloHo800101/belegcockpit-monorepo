// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... pnpm cleanup:invoices
// Optional: GLOBAL=1 deletes invoices for all tenants.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnvValue(
  process.env.SUPABASE_LIVE_URL,
  "SUPABASE_LIVE_URL"
);
const SUPABASE_SERVICE_ROLE_KEY = requireEnvValue(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const TENANT_ID = process.env.TENANT_ID ?? null;
const GLOBAL = process.env.GLOBAL === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  let query = supabase.from("invoices").delete();
  if (!GLOBAL) {
    if (!TENANT_ID) throw new Error("Missing TENANT_ID in env");
    query = query.eq("tenant_id", TENANT_ID);
  }
  const { error } = await query;
  if (error) {
    throw new Error(`Failed to delete invoices: ${error.message}`);
  }
  console.log(
    GLOBAL ? "Deleted invoices for all tenants." : `Deleted invoices for tenant_id=${TENANT_ID}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function requireEnvValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}
