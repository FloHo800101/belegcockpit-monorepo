/// <reference path="../deno.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processDocument } from "../_shared/processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-process-token, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requiredToken = Deno.env.get("PROCESS_DOCUMENT_TOKEN") ?? "";
    if (requiredToken) {
      const provided = req.headers.get("x-process-token") ?? "";
      if (provided !== requiredToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const payload = await req.json().catch(() => ({}));
    const documentId = (payload.documentId ?? payload.document_id ?? "").toString();
    if (!documentId) {
      throw new Error("documentId is required");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message ?? "unknown"}`);
    }

    const now = new Date().toISOString();

    await supabase
      .from("documents")
      .update({ status: "processing", updated_at: now })
      .eq("id", documentId);

    await supabase.from("document_extractions").upsert(
      {
        document_id: documentId,
        status: "running",
        updated_at: now,
      },
      { onConflict: "document_id" }
    );

    const result = await processDocument(supabase, document);

    const extractionStatus =
      result.status === "parsed"
        ? "succeeded"
        : result.status === "needs_review"
          ? "needs_review"
          : "failed";

    await supabase
      .from("document_extractions")
      .upsert(
        {
          document_id: documentId,
          status: extractionStatus,
          parsing_path: result.parsing_path,
          model_used: result.model_used ?? null,
          decision_reason: result.decision_reason ?? null,
          parse_confidence: result.confidence,
          detected_document_type: result.detected_document_type ?? null,
          detection_confidence: result.detection_confidence ?? null,
          detection_reasons: result.detection_reasons ?? null,
          parsed_data: result.parsed_data,
          raw_result: result.raw_result ?? null,
          raw_xml: result.raw_xml ?? null,
          error: result.error ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "document_id" }
      );

    await upsertBankTransactions({
      supabase,
      tenantId: document.tenant_id as string,
      documentId,
      parsed: result.parsed_data,
      nowISO: new Date().toISOString(),
    });

    await upsertInvoice({
      supabase,
      tenantId: document.tenant_id as string,
      documentId,
      parsed: result.parsed_data,
      nowISO: new Date().toISOString(),
    });

    const documentType = deriveDocumentType(document, result.parsed_data);
    await supabase
      .from("documents")
      .update({
        status: result.status === "failed" ? "failed" : "processed",
        updated_at: new Date().toISOString(),
        document_type: documentType ?? document.document_type ?? null,
      })
      .eq("id", documentId);

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function deriveDocumentType(
  document: { document_type?: string | null },
  parsed: { sourceType?: string | null; documentType?: string | null }
) {
  if (document.document_type) return document.document_type;
  const sourceType = parsed.sourceType ?? "";
  if (sourceType === "receipt") return "RECEIPT";
  if (sourceType === "invoice" || sourceType === "xml" || sourceType === "embedded_xml") {
    return "INCOMING_INVOICE";
  }
  if (parsed.documentType === "bank_statement") return "BANK_STATEMENT";
  return null;
}

async function upsertInvoice(params: {
  supabase: ReturnType<typeof createClient>;
  tenantId: string;
  documentId: string;
  parsed: {
    documentType?: string | null;
    sourceType?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    invoiceNumber?: string | null;
    totalGross?: number | null;
    totalNet?: number | null;
    currency?: string | null;
    vendorName?: string | null;
    iban?: string | null;
    endToEndId?: string | null;
  };
  nowISO: string;
}) {
  const { supabase, tenantId, documentId, parsed, nowISO } = params;
  const sourceType = parsed.sourceType ?? "";
  if (parsed.documentType !== "invoice" && sourceType !== "invoice" && sourceType !== "receipt" &&
      sourceType !== "xml" && sourceType !== "embedded_xml") {
    return;
  }

  const amount = parsed.totalGross ?? parsed.totalNet ?? null;
  const currency = normalizeString(parsed.currency) ?? "EUR";
  const invoiceDate = coerceDate(parsed.invoiceDate);
  const dueDate = coerceDate(parsed.dueDate);
  const invoiceNo = normalizeString(parsed.invoiceNumber);
  const vendorName = normalizeString(parsed.vendorName);
  const iban = normalizeString(parsed.iban);
  const e2eId = normalizeString(parsed.endToEndId);

  const row = {
    id: documentId,
    tenant_id: tenantId,
    document_id: documentId,
    amount,
    currency,
    invoice_date: invoiceDate,
    due_date: dueDate,
    invoice_no: invoiceNo,
    iban,
    e2e_id: e2eId,
    vendor_name: vendorName,
    open_amount: amount,
    created_at: nowISO,
    updated_at: nowISO,
  };

  const { error } = await supabase
    .from("invoices")
    .upsert(row, { onConflict: "document_id" });
  if (error) {
    throw new Error(`Failed to upsert invoices: ${error.message}`);
  }
}

async function upsertBankTransactions(params: {
  supabase: ReturnType<typeof createClient>;
  tenantId: string;
  documentId: string;
  parsed: { documentType?: string; transactions?: Array<Record<string, unknown>>; iban?: string | null; currency?: string | null };
  nowISO: string;
}) {
  const { supabase, tenantId, documentId, parsed, nowISO } = params;
  if (parsed.documentType !== "bank_statement") return;
  const transactions = parsed.transactions ?? [];
  if (!transactions.length) return;

  const rows = transactions
    .map((tx, index) => {
      const bookingDate = coerceDate(tx.bookingDate);
      const valueDate = coerceDate(tx.valueDate) ?? bookingDate;
      if (!valueDate) return null;

      const amount = toNumber(tx.amount);
      if (!Number.isFinite(amount)) return null;

      const currency = normalizeString(tx.currency) || normalizeString(parsed.currency) || "EUR";
      const reference =
        normalizeString(tx.reference) || normalizeString(tx.description) || null;
      const counterpartyName = normalizeString(tx.counterpartyName);
      const counterpartyIban =
        normalizeString(tx.counterpartyIban) || normalizeString(parsed.iban) || null;
      const endToEndId = normalizeString(tx.endToEndId);

      return {
        tenant_id: tenantId,
        source_document_id: documentId,
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

  if (!rows.length) return;

  const { error } = await supabase
    .from("bank_transactions")
    .upsert(rows, {
      onConflict: "tenant_id,source_document_id,source_index",
    });
  if (error) {
    throw new Error(`Failed to upsert bank_transactions: ${error.message}`);
  }
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

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isNaN(num) ? Number.NaN : num;
  }
  return Number.NaN;
}
