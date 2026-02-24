// How to run (from backend/):
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... pnpm test:backfill-invoices
// Optional filters: FROM=YYYY-MM-DD TO=YYYY-MM-DD LIMIT_DOCS=...
//
// Backfill-Skript: Liest alle erfolgreich extrahierten Rechnungen/Belege aus document_extractions
// und erzeugt daraus Zeilen in der invoices-Tabelle (Betrag, Datum, Rechnungsnummer, Vendor,
// IBAN, Einzelpositionen usw.). Bestehende Einträge werden per Upsert aktualisiert.
// Zusätzlich werden invoice_line_items pro Rechnung neu geschrieben.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { buildInvoiceAmountCandidates } from "../../supabase/functions/_shared/invoice-amount-candidates";
import { buildInvoiceLineItemRows } from "../../supabase/functions/_shared/invoice-line-items";

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
const DEBUG = process.env.DEBUG === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ParsedDocument = {
  documentType?: string | null;
  sourceType?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  invoiceNumber?: string | null;
  totalGross?: number | null;
  totalNet?: number | null;
  currency?: string | null;
  vendorName?: string | null;
  buyerName?: string | null;
  iban?: string | null;
  endToEndId?: string | null;
  lineItems?: Array<{
    description?: string | null;
    totalPrice?: number | null;
  }> | null;
};

async function main() {
  const nowISO = new Date().toISOString();
  const rows = await loadInvoiceExtractions();
  console.log(`Found ${rows.length} invoice extraction(s).`);
  if (!rows.length) {
    console.log("No invoice extractions found for the given filters.");
    return;
  }

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const parsed = row.parsed_data as ParsedDocument | null;
    if (!parsed) {
      if (DEBUG) {
        console.log("[backfill-invoices] skip: no parsed_data", {
          document_id: row.document_id,
        });
      }
      skipped += 1;
      continue;
    }

    const sourceType = parsed.sourceType ?? "";
    if (
      parsed.documentType !== "invoice" &&
      sourceType !== "invoice" &&
      sourceType !== "receipt" &&
      sourceType !== "xml" &&
      sourceType !== "embedded_xml"
    ) {
      if (DEBUG) {
        console.log("[backfill-invoices] skip: unsupported type", {
          document_id: row.document_id,
          documentType: parsed.documentType ?? null,
          sourceType,
        });
      }
      skipped += 1;
      continue;
    }

    const docId = row.document_id as string;
    const docRef = (row as any).documents;
    let tenantId = Array.isArray(docRef)
      ? (docRef[0]?.tenant_id as string | null)
      : (docRef?.tenant_id as string | null);
    if (!tenantId) {
      tenantId = await loadTenantId(docId);
    }
    if (!tenantId) {
      if (DEBUG) {
        console.log("[backfill-invoices] skip: missing tenant_id", {
          document_id: row.document_id,
        });
      }
      skipped += 1;
      continue;
    }

    const amount = resolveInvoiceAmount(parsed);
    const currency = normalizeString(parsed.currency) ?? "EUR";
    const invoiceDate = coerceDate(parsed.invoiceDate);
    const dueDate = coerceDate(parsed.dueDate);
    const invoiceNo = normalizeString(parsed.invoiceNumber);
    const vendorName = normalizeString(parsed.vendorName);
    const buyerName = normalizeString(parsed.buyerName);
    const iban = normalizeString(parsed.iban);
    const e2eId = normalizeString(parsed.endToEndId);
    const amountCandidates = buildInvoiceAmountCandidates(parsed);

    const payload = {
      id: docId,
      tenant_id: tenantId,
      document_id: docId,
      amount,
      currency,
      invoice_date: invoiceDate,
      due_date: dueDate,
      invoice_no: invoiceNo,
      iban,
      e2e_id: e2eId,
      vendor_name: vendorName,
      buyer_name: buyerName,
      amount_candidates: amountCandidates.length ? amountCandidates : null,
      open_amount: amount,
      created_at: nowISO,
      updated_at: nowISO,
    };

    const { error } = await supabase
      .from("invoices")
      .upsert(payload, { onConflict: "tenant_id,document_id" });
    if (error) {
      throw new Error(`Failed to upsert invoices: ${error.message}`);
    }

    const lineItemRows = buildInvoiceLineItemRows({
      tenantId,
      invoiceId: docId,
      documentId: docId,
      currency,
      lineItems: parsed.lineItems,
      nowISO,
    });

    const { error: deleteLineItemsError } = await supabase
      .from("invoice_line_items")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("invoice_id", docId);
    if (deleteLineItemsError) {
      throw new Error(`Failed to replace invoice_line_items: ${deleteLineItemsError.message}`);
    }

    if (lineItemRows.length > 0) {
      const { error: lineItemsError } = await supabase
        .from("invoice_line_items")
        .upsert(lineItemRows, { onConflict: "invoice_id,line_index" });
      if (lineItemsError) {
        throw new Error(`Failed to upsert invoice_line_items: ${lineItemsError.message}`);
      }
    }

    inserted += 1;
    if (DEBUG) {
      console.log("[backfill-invoices] upserted", {
        document_id: docId,
        tenant_id: tenantId,
      });
    }
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

function resolveInvoiceAmount(parsed: ParsedDocument): number | null {
  const fromTotals = toFiniteNumber(parsed.totalGross) ?? toFiniteNumber(parsed.totalNet);
  if (fromTotals != null) return fromTotals;

  const lineItems = parsed.lineItems ?? [];
  let sum = 0;
  let hasValue = false;
  for (const item of lineItems) {
    const value = toFiniteNumber(item?.totalPrice);
    if (value == null) continue;
    sum += Math.abs(value);
    hasValue = true;
  }
  if (!hasValue) return null;
  return Math.round(sum * 100) / 100;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

async function loadTenantId(documentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("documents")
    .select("tenant_id")
    .eq("id", documentId)
    .single();
  if (error) return null;
  return (data?.tenant_id as string | null) ?? null;
}

async function loadInvoiceExtractions() {
  let query = supabase
    .from("document_extractions")
    .select(
      "document_id, parsed_data, detected_document_type, documents(tenant_id, created_at)"
    )
    .eq("status", "succeeded")
    .in("detected_document_type", ["invoice", "receipt"]);

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


