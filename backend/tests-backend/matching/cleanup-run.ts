// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... RUN_ID=... pnpm matching:cleanup-run
// Optional: FULL_CLEANUP=1 deletes all matching data + invoices + bank_transactions for the tenant.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const TENANT_ID = requireEnv(process.env.TENANT_ID, "TENANT_ID");
const RUN_ID = requireEnv(process.env.RUN_ID, "RUN_ID");
const FULL_CLEANUP = process.env.FULL_CLEANUP === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  if (FULL_CLEANUP) {
    await deleteByTenant("match_edges_docs");
    await deleteByTenant("match_edges_txs");
    await deleteByTenant("match_groups");

    await deleteByTenant("matching_audit");
    await deleteByTenant("matching_suggestions");
    await deleteByTenant("matching_applied_matches");
    await deleteByTenant("matching_runs");

    await deleteByTenant("bank_transactions");
    await deleteByTenant("invoices");

    console.log(`Full cleanup complete for tenant_id=${TENANT_ID}`);
    return;
  }

  const applied = await fetchApplied();
  await restoreEntities(applied);

  await deleteByRun("match_edges_docs");
  await deleteByRun("match_edges_txs");
  await deleteByRun("match_groups");

  await deleteByRun("matching_audit");
  await deleteByRun("matching_suggestions");
  await deleteByRun("matching_applied_matches");
  await deleteByRun("matching_runs");

  console.log(`Cleanup complete for run_id=${RUN_ID}`);
}

async function fetchApplied() {
  const rows: any[] = [];
  let from = 0;
  const size = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("matching_applied_matches")
      .select("id, entity_type, entity_id, before_state")
      .eq("tenant_id", TENANT_ID)
      .eq("run_id", RUN_ID)
      .range(from, from + size - 1);
    if (error) throw new Error(`Fetch applied matches failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < size) break;
    from += size;
  }

  return rows;
}

async function restoreEntities(rows: any[]) {
  for (const row of rows) {
    if (!row.before_state || !row.entity_id) continue;
    if (row.entity_type === "document") {
      await restore("documents", row.entity_id, row.before_state);
    } else if (row.entity_type === "invoice") {
      await restore("invoices", row.entity_id, row.before_state);
    } else if (row.entity_type === "bank_transaction") {
      await restore("bank_transactions", row.entity_id, row.before_state);
    }
  }
}

async function restore(table: string, id: string, before: Record<string, unknown>) {
  const payload = pickColumns(before, [
    "link_state",
    "match_group_id",
    "open_amount",
    "matched_at",
    "matched_by",
    "match_reason",
    "run_id",
  ]);
  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);
  if (error) throw new Error(`Restore failed for ${table}:${id}: ${error.message}`);
}

async function deleteByRun(table: string) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("tenant_id", TENANT_ID)
    .eq("run_id", RUN_ID);
  if (error) throw new Error(`Delete failed for ${table}: ${error.message}`);
}

async function deleteByTenant(table: string) {
  const { error } = await supabase.from(table).delete().eq("tenant_id", TENANT_ID);
  if (error) throw new Error(`Delete failed for ${table}: ${error.message}`);
}

function pickColumns(input: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in input) out[key] = input[key];
  }
  return out;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
