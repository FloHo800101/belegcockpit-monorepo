// Run from backend/:
// TENANT_ID=... deno run -A tests-backend/integration/diagnose-missing-invoice-no.ts
//
// Diagnose: Findet alle Invoices mit invoice_no IS NULL und prüft,
// ob parsed_data.invoiceNumber vorhanden ist (Backfill-Bug) oder fehlt (Mapper-Bug).

import {
  createSupabaseTestClient,
  loadEnvFiles,
} from "./_shared.ts";

await loadEnvFiles();

const TENANT_ID = Deno.env.get("TENANT_ID") ?? Deno.env.get("SUPABASE_LIVE_TENANT_ID") ?? null;
if (!TENANT_ID) {
  console.error("TENANT_ID env var is required.");
  Deno.exit(1);
}

const supabase = createSupabaseTestClient();

// 1. Alle Invoices ohne invoice_no für den Tenant laden
const { data: invoices, error: invErr } = await (supabase.from("invoices") as any)
  .select("id, document_id, invoice_no, vendor_name, amount, currency")
  .eq("tenant_id", TENANT_ID)
  .is("invoice_no", null);

if (invErr) {
  console.error("Failed to load invoices:", invErr.message);
  Deno.exit(1);
}

if (!invoices || invoices.length === 0) {
  console.log("Keine Invoices mit invoice_no = NULL gefunden. Alles gut!");
  Deno.exit(0);
}

console.log(`\n${invoices.length} Invoice(s) mit invoice_no = NULL gefunden.\n`);

// 2. document_extractions + documents dazu laden
const documentIds = invoices.map((inv: any) => inv.document_id).filter(Boolean) as string[];

const { data: extractions, error: extErr } = await (supabase.from("document_extractions") as any)
  .select("document_id, parsed_data, detected_document_type, documents(original_filename)")
  .in("document_id", documentIds);

if (extErr) {
  console.error("Failed to load extractions:", extErr.message);
  Deno.exit(1);
}

const extractionMap = new Map<string, any>();
for (const ext of (extractions ?? [])) {
  extractionMap.set(ext.document_id, ext);
}

// 3. Kategorisieren und ausgeben
type Finding = {
  filename: string;
  documentId: string;
  detectedType: string;
  parsedInvoiceNumber: string | null;
  vendorName: string | null;
  amount: number | null;
  category: "BACKFILL_BUG" | "MAPPER_BUG" | "NO_EXTRACTION";
};

const findings: Finding[] = [];

for (const inv of invoices) {
  const ext = extractionMap.get(inv.document_id);
  const filename = ext?.documents?.original_filename ?? "???";
  const detectedType = ext?.detected_document_type ?? "???";
  const parsed = ext?.parsed_data as any | null;
  const parsedInvoiceNumber = parsed?.invoiceNumber ?? null;

  let category: Finding["category"];
  if (!ext) {
    category = "NO_EXTRACTION";
  } else if (parsedInvoiceNumber) {
    category = "BACKFILL_BUG";
  } else {
    category = "MAPPER_BUG";
  }

  findings.push({
    filename,
    documentId: inv.document_id,
    detectedType,
    parsedInvoiceNumber,
    vendorName: inv.vendor_name,
    amount: inv.amount,
    category,
  });
}

// Sortieren: BACKFILL_BUG zuerst, dann MAPPER_BUG, dann NO_EXTRACTION
const order = { BACKFILL_BUG: 0, MAPPER_BUG: 1, NO_EXTRACTION: 2 };
findings.sort((a, b) => order[a.category] - order[b.category]);

// Ausgabe
const backfillBugs = findings.filter((f) => f.category === "BACKFILL_BUG");
const mapperBugs = findings.filter((f) => f.category === "MAPPER_BUG");
const noExtraction = findings.filter((f) => f.category === "NO_EXTRACTION");

console.log("=".repeat(120));
console.log(
  "DATEI".padEnd(50),
  "TYP".padEnd(12),
  "PARSED_INV_NO".padEnd(25),
  "VENDOR".padEnd(20),
  "KATEGORIE"
);
console.log("=".repeat(120));

for (const f of findings) {
  console.log(
    f.filename.padEnd(50).slice(0, 50),
    f.detectedType.padEnd(12).slice(0, 12),
    (f.parsedInvoiceNumber ?? "-").padEnd(25).slice(0, 25),
    (f.vendorName ?? "-").padEnd(20).slice(0, 20),
    f.category
  );
}

console.log("=".repeat(120));
console.log(`\nZusammenfassung:`);
console.log(`  BACKFILL_BUG  (parsed vorhanden, DB NULL): ${backfillBugs.length}`);
console.log(`  MAPPER_BUG   (parsed auch NULL):           ${mapperBugs.length}`);
console.log(`  NO_EXTRACTION (keine Extraktion):          ${noExtraction.length}`);
console.log(`  GESAMT:                                    ${findings.length}`);
