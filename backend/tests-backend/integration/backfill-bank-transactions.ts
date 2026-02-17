// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... pnpm test:backfill-bank-transactions
// Optional filters: FROM=YYYY-MM-DD TO=YYYY-MM-DD LIMIT_DOCS=...

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const TENANT_ID = process.env.TENANT_ID ?? null;
const FROM = process.env.FROM ?? null;
const TO = process.env.TO ?? null;
const LIMIT_DOCS = toOptionalInt(process.env.LIMIT_DOCS);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ParsedTransaction = {
  bookingDate?: string | null;
  valueDate?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  endToEndId?: string | null;
  reference?: string | null;
};

type ParsedDocument = {
  documentType?: string | null;
  currency?: string | null;
  iban?: string | null;
  transactions?: ParsedTransaction[] | null;
};

async function main() {
  const nowISO = new Date().toISOString();
  const rows = await loadStatementExtractions();
  console.log(`Found ${rows.length} bank_statement extraction(s).`);
  if (!rows.length) {
    console.log("No bank statement extractions found for the given filters.");
    return;
  }

  let inserted = 0;
  let processedDocs = 0;
  const skipReasons = {
    no_parsed_bank_statement: 0,
    no_transactions: 0,
    no_tenant: 0,
    invalid_date: 0,
    invalid_amount: 0,
  };

  for (const row of rows) {
    const parsed = row.parsed_data as ParsedDocument | null;
    if (!parsed || parsed.documentType !== "bank_statement") {
      skipReasons.no_parsed_bank_statement += 1;
      continue;
    }
    const transactions = parsed.transactions ?? [];
    if (!transactions.length) {
      skipReasons.no_transactions += 1;
      continue;
    }

    const docId = row.document_id as string;
    const docRef = (row as any).documents;
    const tenantId = Array.isArray(docRef)
      ? (docRef[0]?.tenant_id as string | null)
      : (docRef?.tenant_id as string | null);
    if (!tenantId) {
      skipReasons.no_tenant += 1;
      continue;
    }

    let localInvalidDate = 0;
    let localInvalidAmount = 0;
    const payload = transactions
      .map((tx, index) => {
        const bookingDate = coerceDate(tx.bookingDate);
        const valueDate = coerceDate(tx.valueDate) ?? bookingDate;
        if (!valueDate) {
          localInvalidDate += 1;
          return null;
        }

        const amount = toNumber(tx.amount);
        if (!Number.isFinite(amount)) {
          localInvalidAmount += 1;
          return null;
        }

        const currency =
          normalizeString(tx.currency) || normalizeString(parsed.currency) || "EUR";
        const reference = buildReference(tx);
        const counterpartyName = normalizeString(tx.counterpartyName);
        const counterpartyIban =
          normalizeString(tx.counterpartyIban) || normalizeString(parsed.iban) || null;
        const endToEndId = normalizeString(tx.endToEndId);

        return {
          tenant_id: tenantId,
          source_document_id: docId,
          source_index: index,
          amount,
          currency,
          value_date: valueDate,
          booking_date: bookingDate,
          iban: counterpartyIban,
          counterparty_name: counterpartyName,
          end_to_end_id: endToEndId,
          reference,
          created_at: nowISO,
          updated_at: nowISO,
        };
      })
      .filter(Boolean);

    skipReasons.invalid_date += localInvalidDate;
    skipReasons.invalid_amount += localInvalidAmount;

    if (!payload.length) {
      skipReasons.no_transactions += 1;
      continue;
    }

    const { error } = await supabase
      .from("bank_transactions")
      .upsert(payload, { onConflict: "tenant_id,source_document_id,source_index" });
    if (error) {
      throw new Error(`Failed to upsert bank_transactions: ${error.message}`);
    }

    inserted += payload.length;
    processedDocs += 1;
  }

  const skipped =
    skipReasons.no_parsed_bank_statement +
    skipReasons.no_transactions +
    skipReasons.no_tenant +
    skipReasons.invalid_date +
    skipReasons.invalid_amount;
  console.log(
    `Done. documents=${processedDocs} inserted=${inserted} skipped=${skipped}`
  );
  console.log("[backfill-bank-transactions] skip_reasons", skipReasons);
}

async function loadStatementExtractions() {
  let query = supabase
    .from("document_extractions")
    .select(
      "document_id, parsed_data, detected_document_type, documents(tenant_id, created_at)"
    )
    .eq("status", "succeeded")
    .eq("detected_document_type", "bank_statement");

  if (TENANT_ID) query = query.eq("documents.tenant_id", TENANT_ID);
  if (FROM) query = query.gte("documents.created_at", toDateTime(FROM));
  if (TO) query = query.lte("documents.created_at", toDateTime(TO));
  if (LIMIT_DOCS) query = query.limit(LIMIT_DOCS);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load document_extractions: ${error.message}`);
  return data ?? [];
}

function toDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.toISOString();
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function buildReference(tx: ParsedTransaction): string | null {
  const parts = [tx.description, tx.reference]
    .map(normalizeString)
    .filter((value): value is string => Boolean(value));
  if (!parts.length) return null;
  return parts.join("\n");
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isNaN(num) ? Number.NaN : num;
  }
  return Number.NaN;
}

function toOptionalInt(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
