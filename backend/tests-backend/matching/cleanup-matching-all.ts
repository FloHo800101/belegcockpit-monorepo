// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... pnpm cleanup:matching-all

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  await resetEntities("bank_transactions");
  await resetEntities("invoices");
  await resetDocuments();

  await deleteAll("match_edges_docs");
  await deleteAll("match_edges_txs");
  await deleteAll("match_groups");

  await deleteAll("matching_audit");
  await deleteAll("matching_suggestions");
  await deleteAll("matching_applied_matches");
  await deleteAll("matching_runs");

  console.log("Matching cleanup complete for all tenants.");
}

async function resetEntities(table: "bank_transactions" | "invoices") {
  const { error } = await supabase
    .from(table)
    .update({
      link_state: "unlinked",
      match_group_id: null,
      matched_at: null,
      matched_by: null,
      match_reason: null,
      run_id: null,
      open_amount: null,
    })
    .not("id", "is", null);
  if (error) {
    throw new Error(`Failed to reset ${table}: ${error.message}`);
  }
}

async function resetDocuments() {
  const { error } = await supabase
    .from("documents")
    .update({
      link_state: "unlinked",
      match_group_id: null,
      matched_at: null,
      matched_by: null,
      match_reason: null,
      open_amount: null,
    })
    .not("id", "is", null);
  if (error) {
    throw new Error(`Failed to reset documents: ${error.message}`);
  }
}

async function deleteAll(table: string) {
  const whereColumn = table === "matching_runs" ? "run_id" : "id";
  const { error } = await supabase.from(table).delete().not(whereColumn, "is", null);
  if (error) throw new Error(`Delete failed for ${table}: ${error.message}`);
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
