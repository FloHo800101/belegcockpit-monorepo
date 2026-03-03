/// <reference path="../../supabase/functions/deno.d.ts" />
// Debug/repair script: Re-map bank statement extractions using updated mapper code.
// Reads raw_result from document_extractions, re-runs the mapper, and updates parsed_data.
//
// Usage: deno run -A tests-backend/integration/_debug-mapper-output.ts
// Add DRY_RUN=1 to only print results without writing.

import { createSupabaseTestClient, loadEnvFiles } from "./_shared.ts";
import { mapAzureBankStatementToParseResult } from "../../supabase/functions/_shared/azure-mappers.ts";

await loadEnvFiles();
const supabase = createSupabaseTestClient();
const DRY_RUN = Deno.env.get("DRY_RUN") === "1";

// Load all bank_statement extractions that have raw_result
const { data: extractions, error } = await (supabase
  .from("document_extractions") as any)
  .select("id, document_id, parsed_data, raw_result, detected_document_type, documents(original_filename)")
  .eq("detected_document_type", "bank_statement");

if (error) {
  console.error("Failed to load extractions:", error.message);
  Deno.exit(1);
}

console.log(`Found ${extractions?.length ?? 0} bank_statement extraction(s)`);

let updated = 0;
let skipped = 0;

for (const ext of extractions ?? []) {
  const fileName = ext.documents?.original_filename ?? "unknown";
  console.log(`\n=== ${fileName} (doc: ${ext.document_id}) ===`);

  if (!ext.raw_result) {
    console.log("  SKIP: no raw_result");
    skipped++;
    continue;
  }

  // Re-run mapper with current code
  const result = mapAzureBankStatementToParseResult(ext.raw_result, fileName);
  const txs = result.parsed?.transactions ?? [];
  console.log(`  Pipeline: ${result.parsed?.rawMeta?.extractionPipeline}`);
  console.log(`  Items: ${result.parsed?.rawMeta?.itemsCount} | Lines: ${result.parsed?.rawMeta?.lineCount} | Merged: ${result.parsed?.rawMeta?.mergedCount}`);
  console.log(`  Transactions: ${txs.length}`);

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const refShort = (tx.reference ?? "").replace(/\n/g, " | ").slice(0, 100);
    console.log(`  [${i}] ${tx.amount} | "${tx.counterpartyName}" | ref: "${refShort}"`);
  }

  if (DRY_RUN) {
    console.log("  DRY_RUN: not writing");
    continue;
  }

  // Write updated parsed_data back
  if (result.parsed) {
    const { error: updateError } = await (supabase
      .from("document_extractions") as any)
      .update({
        parsed_data: result.parsed,
        parse_confidence: result.confidence,
      })
      .eq("document_id", ext.document_id);

    if (updateError) {
      console.error(`  FAIL: ${updateError.message}`);
    } else {
      console.log("  UPDATED parsed_data");
      updated++;
    }
  }
}

console.log(`\nDone. updated=${updated} skipped=${skipped}`);
