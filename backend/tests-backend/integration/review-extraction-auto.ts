/**
 * review-extraction-auto.ts
 *
 * Automated plausibility check on parsed_data from document_extractions.
 * Flags known error patterns WITHOUT reading PDFs or raw_result.
 * Use as pre-filter before visual review with subagents.
 *
 * ENV:
 *   SUPABASE_LIVE_URL, SUPABASE_LIVE_SERVICE_ROLE_KEY (required)
 *   TENANT_ID  — filter by tenant
 *   DOC_ID     — single document
 *   LIMIT_DOCS — batch size (default: all)
 *
 * Run:
 *   cd backend && deno run -A tests-backend/integration/review-extraction-auto.ts
 */

import { createSupabaseTestClient, loadEnvFiles } from "./_shared.ts";

await loadEnvFiles();

// ── Types ──

interface ParsedData {
  sourceType?: string;
  documentType?: string;
  vendorName?: string | null;
  buyerName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  totalGross?: number | null;
  totalNet?: number | null;
  totalVat?: number | null;
  currency?: string | null;
  lineItems?: Array<{ totalPrice?: number | null }>;
  vatItems?: Array<{ rate?: number | null; amount?: number | null; netAmount?: number | null }>;
  [key: string]: unknown;
}

interface Finding {
  rule: string;
  severity: "ERROR" | "WARN";
  detail: string;
}

// ── Plausibility Rules ──

const SALUTATIONS = /^(Herrn|Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)$/i;

function checkDocument(parsed: ParsedData): Finding[] {
  const findings: Finding[] = [];

  // 1. buyerName is just a salutation
  if (parsed.buyerName && SALUTATIONS.test(parsed.buyerName.trim())) {
    findings.push({
      rule: "buyer_is_salutation",
      severity: "ERROR",
      detail: `buyerName="${parsed.buyerName}" (should be full name)`,
    });
  }

  // 2. vendorName ends with punctuation
  if (parsed.vendorName && /[,;:]$/.test(parsed.vendorName.trim())) {
    findings.push({
      rule: "vendor_trailing_punctuation",
      severity: "WARN",
      detail: `vendorName="${parsed.vendorName}"`,
    });
  }

  // 3. vendorName is very short (likely logo text)
  if (parsed.vendorName && parsed.vendorName.trim().length <= 2) {
    findings.push({
      rule: "vendor_too_short",
      severity: "WARN",
      detail: `vendorName="${parsed.vendorName}"`,
    });
  }

  // 4. totalGross suspiciously high (>50k for non-bank-statements)
  if (
    parsed.totalGross != null &&
    parsed.totalGross > 50000 &&
    parsed.documentType !== "bank_statement"
  ) {
    findings.push({
      rule: "gross_suspiciously_high",
      severity: "WARN",
      detail: `totalGross=${parsed.totalGross}`,
    });
  }

  // 5. totalNet > totalGross (impossible)
  if (
    parsed.totalNet != null &&
    parsed.totalGross != null &&
    parsed.totalNet > parsed.totalGross
  ) {
    findings.push({
      rule: "net_exceeds_gross",
      severity: "ERROR",
      detail: `totalNet=${parsed.totalNet} > totalGross=${parsed.totalGross}`,
    });
  }

  // 6. vatItems.rate > 1 (not normalized to decimal)
  for (const vat of parsed.vatItems ?? []) {
    if (vat.rate != null && vat.rate > 1) {
      findings.push({
        rule: "vat_rate_not_decimal",
        severity: "ERROR",
        detail: `vatItems.rate=${vat.rate} (should be <1, e.g. 0.19)`,
      });
    }
  }

  // 7. invoiceDate in the future
  if (parsed.invoiceDate) {
    const docDate = new Date(parsed.invoiceDate);
    const now = new Date();
    if (docDate > now) {
      findings.push({
        rule: "date_in_future",
        severity: "WARN",
        detail: `invoiceDate=${parsed.invoiceDate}`,
      });
    }
  }

  // 8. totalGross is null or 0 for invoices/receipts
  if (
    (parsed.documentType === "invoice" || parsed.documentType === "receipt") &&
    (parsed.totalGross == null || parsed.totalGross === 0)
  ) {
    findings.push({
      rule: "missing_total_gross",
      severity: "WARN",
      detail: `totalGross=${parsed.totalGross}`,
    });
  }

  // 9. vendorName is null
  if (!parsed.vendorName) {
    findings.push({
      rule: "missing_vendor",
      severity: "WARN",
      detail: "vendorName is null",
    });
  }

  // 10. invoiceDate is null
  if (!parsed.invoiceDate) {
    findings.push({
      rule: "missing_date",
      severity: "WARN",
      detail: "invoiceDate is null",
    });
  }

  // 11. buyerName equals vendorName
  if (
    parsed.buyerName &&
    parsed.vendorName &&
    parsed.buyerName.toLowerCase() === parsed.vendorName.toLowerCase()
  ) {
    findings.push({
      rule: "buyer_equals_vendor",
      severity: "ERROR",
      detail: `buyerName="${parsed.buyerName}" == vendorName`,
    });
  }

  return findings;
}

// ── Main ──

const supabase = createSupabaseTestClient();
const tenantId = Deno.env.get("TENANT_ID");
const docId = Deno.env.get("DOC_ID");
const limitDocs = Number(Deno.env.get("LIMIT_DOCS") || "0") || undefined;

let query = supabase
  .from("document_extractions")
  .select("id, document_id, parsed_data, documents!inner(original_filename, tenant_id)")
  .eq("status", "succeeded")
  .not("parsed_data", "is", null);

if (docId) {
  query = query.eq("document_id", docId);
} else if (tenantId) {
  query = query.eq("documents.tenant_id", tenantId);
}
if (limitDocs) {
  query = query.limit(limitDocs);
}

interface ExtractionRow {
  id: string;
  document_id: string;
  parsed_data: ParsedData | null;
  documents: { original_filename: string; tenant_id: string };
}

const { data, error } = await query;
if (error) {
  console.error("[auto-check] Query error:", error.message);
  Deno.exit(1);
}
const extractions = (data ?? []) as unknown as ExtractionRow[];
if (!extractions.length) {
  console.log("[auto-check] No extractions found.");
  Deno.exit(0);
}

console.log(`[auto-check] Checking ${extractions.length} extraction(s)...\n`);

let totalFindings = 0;
let errorCount = 0;
let warnCount = 0;
const flaggedDocs: string[] = [];

for (const ext of extractions) {
  const doc = ext.documents;
  const parsed = ext.parsed_data;
  if (!parsed) continue;

  const findings = checkDocument(parsed);
  if (findings.length === 0) continue;

  totalFindings += findings.length;
  flaggedDocs.push(doc.original_filename);

  const errors = findings.filter((f) => f.severity === "ERROR");
  const warns = findings.filter((f) => f.severity === "WARN");
  errorCount += errors.length;
  warnCount += warns.length;

  const type = parsed.documentType ?? "unknown";
  console.log(`--- ${doc.original_filename} (${type}) ---`);
  for (const f of findings) {
    const icon = f.severity === "ERROR" ? "X" : "!";
    console.log(`  [${icon}] ${f.rule}: ${f.detail}`);
  }
  console.log();
}

// ── Summary ──
const okCount = extractions.length - flaggedDocs.length;
console.log("=== SUMMARY ===");
console.log(`Checked:  ${extractions.length} document(s)`);
console.log(`OK:       ${okCount}`);
console.log(`Flagged:  ${flaggedDocs.length} (${errorCount} errors, ${warnCount} warnings)`);

if (flaggedDocs.length > 0) {
  console.log(`\nFlagged files (need visual review):`);
  for (const f of flaggedDocs) {
    console.log(`  - ${f}`);
  }
}

console.log(
  `\nNext: Run visual review for flagged docs with review-extraction.ts + subagents.`
);
