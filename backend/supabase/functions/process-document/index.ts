/// <reference path="../deno.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processDocument } from "../_shared/processor.ts";
import { buildInvoiceAmountCandidates } from "../_shared/invoice-amount-candidates.ts";
import { buildInvoiceLineItemRows } from "../_shared/invoice-line-items.ts";
import { normalizeString, coerceDate, toNumber, buildTransactionReference } from "../_shared/upsert-helpers.ts";

const RUNS_TABLE = "document_analyze_runs";
const LIVE_RUN_SOURCE = "live_process";
const AZURE_MODELS = new Set(["prebuilt-invoice", "prebuilt-receipt", "prebuilt-layout"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-process-token, content-type",
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
    await persistLiveAnalyzeRun({
      supabase,
      documentId,
      storagePath: (document.storage_path ?? "").toString(),
      result,
    });

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

async function persistLiveAnalyzeRun(params: {
  supabase: any;
  documentId: string;
  storagePath: string;
  result: {
    model_used?: string | null;
    raw_result?: unknown;
    parsed_data?: unknown;
    confidence?: number | null;
  };
}) {
  const { supabase, documentId, storagePath, result } = params;
  const modelId = result.model_used ?? null;
  if (!modelId || !AZURE_MODELS.has(modelId)) return;
  if (result.raw_result == null) return;

  const payload = {
    document_id: documentId,
    storage_path: storagePath,
    model_id: modelId,
    source: LIVE_RUN_SOURCE,
    analyze_result: result.raw_result,
    parsed_data: result.parsed_data ?? null,
    parse_confidence: result.confidence ?? null,
  };

  const { data: existing, error: existingError } = await supabase
    .from(RUNS_TABLE)
    .select("id")
    .eq("document_id", documentId)
    .eq("model_id", modelId)
    .eq("source", LIVE_RUN_SOURCE)
    .limit(1);
  if (existingError) {
    throw new Error(`Failed to load analyze run: ${existingError.message}`);
  }

  if (Array.isArray(existing) && existing.length > 0) {
    const { error: updateError } = await supabase
      .from(RUNS_TABLE)
      .update(payload)
      .eq("id", existing[0].id);
    if (updateError) {
      throw new Error(`Failed to update analyze run: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from(RUNS_TABLE).insert(payload);
  if (insertError) {
    throw new Error(`Failed to insert analyze run: ${insertError.message}`);
  }
}

async function upsertInvoice(params: {
  supabase: any;
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
    buyerName?: string | null;
    iban?: string | null;
    endToEndId?: string | null;
    lineItems?: Array<{
      description?: string | null;
      totalPrice?: number | null;
    }> | null;
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
  const buyerName = normalizeString(parsed.buyerName);
  const iban = normalizeString(parsed.iban);
  const e2eId = normalizeString(parsed.endToEndId);
  const amountCandidates = buildInvoiceAmountCandidates(parsed);

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
    buyer_name: buyerName,
    amount_candidates: amountCandidates.length ? amountCandidates : null,
    open_amount: amount,
    created_at: nowISO,
    updated_at: nowISO,
  };

  const { error } = await supabase
    .from("invoices")
    .upsert(row, { onConflict: "id" });
  if (error) {
    throw new Error(`Failed to upsert invoices: ${error.message}`);
  }

  const lineItemRows = buildInvoiceLineItemRows({
    tenantId,
    invoiceId: documentId,
    documentId,
    currency,
    lineItems: parsed.lineItems,
    nowISO,
  });

  const { error: deleteLineItemsError } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("invoice_id", documentId);
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
}

async function upsertBankTransactions(params: {
  supabase: any;
  tenantId: string;
  documentId: string;
  parsed: {
    documentType?: string;
    transactions?: Array<{
      bookingDate?: string | null;
      valueDate?: string | null;
      amount?: number | string | null;
      currency?: string | null;
      foreignAmount?: number | string | null;
      foreignCurrency?: string | null;
      exchangeRate?: number | string | null;
      description?: string | null;
      counterpartyName?: string | null;
      counterpartyIban?: string | null;
      endToEndId?: string | null;
      reference?: string | null;
    }>;
    iban?: string | null;
    currency?: string | null;
  };
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
      const foreignAmountRaw = toNumber(tx.foreignAmount);
      const foreignAmount = Number.isFinite(foreignAmountRaw) ? foreignAmountRaw : null;
      const foreignCurrency = normalizeString(tx.foreignCurrency);
      const exchangeRateRaw = toNumber(tx.exchangeRate);
      const exchangeRate = Number.isFinite(exchangeRateRaw) ? exchangeRateRaw : null;
      const reference = buildTransactionReference(tx);
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
        foreign_amount: foreignAmount,
        foreign_currency: foreignCurrency,
        exchange_rate: exchangeRate,
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
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!rows.length) return;

  const { error: deleteError } = await supabase
    .from("bank_transactions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source_document_id", documentId);
  if (deleteError) {
    throw new Error(`Failed to replace bank_transactions: ${deleteError.message}`);
  }

  const { error } = await supabase
    .from("bank_transactions")
    .upsert(rows, {
      onConflict: "tenant_id,source_document_id,source_index",
    });
  if (error) {
    throw new Error(`Failed to upsert bank_transactions: ${error.message}`);
  }
}



