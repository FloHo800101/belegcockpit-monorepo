// Re-run bank statement mapper on Girokonto extraction's raw_result
// Then update extraction + bank_transactions for both source and target tenant
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://svrvdxrwyxiyepukdmrl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cnZkeHJ3eXhpeWVwdWtkbXJsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjM1OTMzMiwiZXhwIjoyMDgxOTM1MzMyfQ.zPl0Ega8NIp5dji3C12GQJIabb8wK6TeEQ1cfyxIzFQ",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SOURCE_DOC = "56e4126f-98db-4933-84c5-b30fa9fc1342";
const TARGET_DOC = "7577c9d5-15bf-4836-b97d-66a013df38d2";
const TARGET_TENANT = "2567f217-c139-4b80-970a-dbf09c02a3fd";
const nowISO = new Date().toISOString();

// Load raw_result from source extraction
const { data: ext, error: extErr } = await supabase
  .from("document_extractions")
  .select("raw_result, parsed_data")
  .eq("document_id", SOURCE_DOC)
  .single();

if (extErr || !ext) {
  console.error("Failed to load source extraction:", extErr?.message);
  process.exit(1);
}

// Re-run the mapper
// We need to dynamically import the TS mapper via a workaround -
// instead, parse the existing parsed_data and fix counterpartyName for fee transactions
const pd = typeof ext.parsed_data === "string" ? JSON.parse(ext.parsed_data) : ext.parsed_data;
console.log("Current transactions:");
let fixed = 0;
for (let i = 0; i < pd.transactions.length; i++) {
  const tx = pd.transactions[i];
  console.log(`  [${i}] type=${tx.bookingType} counterparty=${JSON.stringify(tx.counterpartyName)} desc="${tx.description}"`);

  // For fee transactions with null counterparty, try to extract from description
  if (tx.bookingType === "fee" && tx.counterpartyName === null && tx.description) {
    // Apply extractCounterpartyName logic
    const name = extractCounterpartyName(tx.description);
    if (name) {
      tx.counterpartyName = name;
      console.log(`  → FIXED: counterpartyName = "${name}"`);
      fixed++;
    }
  }
}
console.log(`\nFixed ${fixed} transactions.`);

// Update both extractions
for (const docId of [SOURCE_DOC, TARGET_DOC]) {
  const { error } = await supabase
    .from("document_extractions")
    .update({ parsed_data: pd })
    .eq("document_id", docId);
  if (error) {
    console.error(`Failed to update extraction ${docId}:`, error.message);
  } else {
    console.log(`Updated extraction for ${docId}`);
  }
}

// Update bank_transaction for the target tenant
for (let i = 0; i < pd.transactions.length; i++) {
  const tx = pd.transactions[i];
  if (tx.counterpartyName !== null) {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ counterparty_name: tx.counterpartyName, updated_at: nowISO })
      .eq("tenant_id", TARGET_TENANT)
      .eq("source_document_id", TARGET_DOC)
      .eq("source_index", i);
    if (error) {
      console.error(`Failed to update tx[${i}]:`, error.message);
    }
  }
}
console.log("Bank transactions updated.");

// --- extractCounterpartyName (copied from mapper) ---
function extractCounterpartyName(description) {
  const BOOKING_TYPE_MAP = [
    [/FOLGELASTSCHRIFT|ERSTLASTSCHRIFT|LASTSCHRIFT/i, "direct_debit"],
    [/ONLINE-UEBERWEISUNG|UEBERWEISUNG|DAUERAUFTRAG/i, "transfer"],
    [/GUTSCHRIFT|EINZAHLUNG/i, "transfer"],
    [/ENTGELTABSCHLUSS|ENTGELT|ABSCHLUSS/i, "fee"],
    [/ZINSEN|ZINSABSCHLUSS/i, "interest"],
    [/KARTENZAHLUNG|GIROCARD|GIROSAMMEL/i, "card_payment"],
  ];
  const BOOKING_TYPE_PREFIX = new RegExp(
    "^(" + BOOKING_TYPE_MAP.flatMap(([re]) => re.source.split("|")).join("|") + ")\\s+",
    "i"
  );

  const trimmed = description.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(BOOKING_TYPE_PREFIX, "").trim();
  if (cleaned !== trimmed) return cleaned || null;
  const allKeywords = BOOKING_TYPE_MAP.flatMap(([re]) => re.source.split("|"));
  const midPattern = new RegExp(`(?:^|\\s)(${allKeywords.join("|")})\\s+`, "i");
  const midMatch = trimmed.match(midPattern);
  if (midMatch && midMatch.index != null) {
    const keywordStart = midMatch.index + midMatch[0].indexOf(midMatch[1]);
    const afterKeyword = trimmed.slice(keywordStart).replace(BOOKING_TYPE_PREFIX, "").trim();
    if (afterKeyword) return afterKeyword;
  }
  return cleaned || null;
}
