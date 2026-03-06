// Run from backend/:
// TENANT_ID=a6a3fd7d-b12d-4887-b28f-7d816766c237 deno run -A tests-backend/integration/analyze-buyer-names.ts
//
// Diagnoses buyer_name quality: loads all invoices for a tenant,
// re-runs cleanPartyName on the original parsed_data.buyerName,
// and compares old vs new values to show what the new garbage filters would fix.

import {
  createSupabaseTestClient,
  loadEnvFiles,
} from "./_shared.ts";
import { cleanPartyName, isLikelyGarbageName, normalizeAirlineName, isLikelyAddressOrContactLine } from "../../supabase/functions/_shared/azure-mappers/party-extraction.ts";

await loadEnvFiles();

const TENANT_ID = Deno.env.get("TENANT_ID") ?? Deno.env.get("SUPABASE_LIVE_TENANT_ID") ?? null;
if (!TENANT_ID) {
  console.error("TENANT_ID env var is required.");
  Deno.exit(1);
}

const supabase = createSupabaseTestClient();

// Load all invoices for the tenant
const { data: invoices, error: invErr } = await (supabase.from("invoices") as any)
  .select("id, document_id, buyer_name, vendor_name, invoice_no, amount")
  .eq("tenant_id", TENANT_ID);

if (invErr) {
  console.error("Failed to load invoices:", invErr.message);
  Deno.exit(1);
}

if (!invoices || invoices.length === 0) {
  console.log("Keine Invoices gefunden.");
  Deno.exit(0);
}

console.log(`\n${invoices.length} Invoice(s) geladen.\n`);

// Load parsed_data for re-analysis
const documentIds = invoices.map((inv: any) => inv.document_id).filter(Boolean) as string[];

// Chunk to avoid URL length limit
const CHUNK_SIZE = 30;
const extractions: any[] = [];
for (let i = 0; i < documentIds.length; i += CHUNK_SIZE) {
  const chunk = documentIds.slice(i, i + CHUNK_SIZE);
  const { data, error } = await (supabase.from("document_extractions") as any)
    .select("document_id, parsed_data, documents(original_filename)")
    .in("document_id", chunk);
  if (error) {
    console.error("Failed to load extractions chunk:", error.message);
    continue;
  }
  if (data) extractions.push(...data);
}

const extMap = new Map(extractions.map((e: any) => [e.document_id, e]));

// Categorize
const results = {
  correct_hoffmann: [] as any[],
  garbage_filtered: [] as any[],
  airline_normalized: [] as any[],
  legitimate_other: [] as any[],
  null_buyer: [] as any[],
  unchanged_other: [] as any[],
};

const HOFFMANN_PATTERN = /^florian\s+hoffmann$/i;

for (const inv of invoices) {
  const ext = extMap.get(inv.document_id);
  const filename = ext?.documents?.original_filename ?? "?";
  const currentBuyer = inv.buyer_name;
  const parsedBuyer = ext?.parsed_data?.buyerName ?? null;

  // Re-run cleanPartyName on the raw parsed buyer
  const newBuyer = cleanPartyName(parsedBuyer);

  const entry = {
    invoice_no: inv.invoice_no,
    vendor: inv.vendor_name,
    amount: inv.amount,
    filename,
    old_buyer: currentBuyer,
    parsed_buyer: parsedBuyer,
    new_buyer: newBuyer,
  };

  // Check if cleanPartyName would reject the current buyer
  const wouldBeClean = currentBuyer ? cleanPartyName(currentBuyer) : null;

  if (currentBuyer && HOFFMANN_PATTERN.test(currentBuyer)) {
    results.correct_hoffmann.push(entry);
  } else if (currentBuyer && (isLikelyGarbageName(currentBuyer) || isLikelyAddressOrContactLine(currentBuyer) || wouldBeClean === null)) {
    results.garbage_filtered.push(entry);
  } else if (currentBuyer && /\//.test(currentBuyer)) {
    const normalized = normalizeAirlineName(currentBuyer);
    if (normalized !== currentBuyer) {
      entry.new_buyer = normalized;
      results.airline_normalized.push(entry);
    } else {
      results.unchanged_other.push(entry);
    }
  } else if (!currentBuyer) {
    results.null_buyer.push(entry);
  } else {
    results.unchanged_other.push(entry);
  }
}

console.log("=== ZUSAMMENFASSUNG ===\n");
console.log(`Korrekt "Florian Hoffmann": ${results.correct_hoffmann.length}`);
console.log(`Garbage (wird gefiltert):   ${results.garbage_filtered.length}`);
console.log(`Airline (wird normalisiert): ${results.airline_normalized.length}`);
console.log(`NULL buyer_name:            ${results.null_buyer.length}`);
console.log(`Sonstige (unveraendert):    ${results.unchanged_other.length}`);
console.log();

if (results.garbage_filtered.length > 0) {
  console.log("=== GARBAGE → wird NULL ===\n");
  for (const e of results.garbage_filtered) {
    console.log(`  "${e.old_buyer}" → NULL | vendor: ${e.vendor} | file: ${e.filename}`);
  }
  console.log();
}

if (results.airline_normalized.length > 0) {
  console.log("=== AIRLINE → normalisiert ===\n");
  for (const e of results.airline_normalized) {
    console.log(`  "${e.old_buyer}" → "${e.new_buyer}" | vendor: ${e.vendor} | file: ${e.filename}`);
  }
  console.log();
}

if (results.unchanged_other.length > 0) {
  console.log("=== SONSTIGE (nicht geaendert) ===\n");
  for (const e of results.unchanged_other) {
    console.log(`  buyer: "${e.old_buyer}" | vendor: ${e.vendor} | file: ${e.filename}`);
  }
  console.log();
}

if (results.null_buyer.length > 0) {
  console.log("=== NULL buyer_name ===\n");
  for (const e of results.null_buyer) {
    const reparse = e.new_buyer ? `→ RE-PARSE: "${e.new_buyer}"` : "(bleibt NULL)";
    console.log(`  vendor: ${e.vendor} | file: ${e.filename} ${reparse}`);
  }
  console.log();
}
