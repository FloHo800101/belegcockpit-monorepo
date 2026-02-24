/// <reference path="../deno.d.ts" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { run_pipeline } from "../_shared/matching-engine/pipeline.ts";
import {
  toApplyOps,
  toAuditRecord,
} from "../_shared/matching-engine/persistence.ts";
import type {
  Doc,
  MatchDecision,
  MatchRepository,
  Tx,
  TxHistoryOptions,
} from "../_shared/matching-engine/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = (body.tenantId ?? body.tenant_id ?? "").toString().trim();
    const monthId = (body.monthId ?? body.month_id ?? "").toString().trim();

    if (!tenantId) return json({ error: "tenantId is required" }, 400);
    if (!monthId || !/^\d{4}-\d{2}$/.test(monthId)) {
      return json({ error: "monthId must be YYYY-MM format" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowISO = new Date().toISOString();
    const runId = crypto.randomUUID();

    // Datumsbereich für den Monat
    const [year, month] = monthId.split("-").map(Number);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // ── 1. Transaktionen für den Monat laden ──────────────────────────
    const { data: txRows, error: txErr } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("link_state", ["unlinked", "suggested"])
      .or(
        `booking_date.gte.${monthStart},value_date.gte.${monthStart}`
      )
      .or(
        `booking_date.lt.${nextMonth},value_date.lt.${nextMonth}`
      )
      .order("booking_date", { ascending: false })
      .limit(500);

    if (txErr) throw new Error(`Loading transactions: ${txErr.message}`);

    // ── 2. Belege (invoices + documents) laden – ALLE ungematchten ────
    // Cross-period matching: nicht nach Monat filtern
    const { data: invoiceRows, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id, tenant_id, amount, currency, invoice_date, due_date,
        invoice_no, iban, e2e_id, vendor_name, open_amount, link_state,
        documents!inner(link_state, document_type)
      `)
      .eq("tenant_id", tenantId)
      .in("link_state", ["unlinked", "suggested"])
      .limit(1000);

    if (invErr) throw new Error(`Loading invoices: ${invErr.message}`);

    const txs: Tx[] = (txRows ?? []).map(rowToTx);
    const docs: Doc[] = (invoiceRows ?? []).map(rowToDoc);

    // ── 3. Matching-Pipeline ausführen ───────────────────────────────
    const repo = new SupabaseMatchRepository(supabase, runId, nowISO);

    const result = await run_pipeline({ docs, txs, nowISO }, repo);

    // ── 4. Run in matching_runs persistieren ─────────────────────────
    await supabase.from("matching_runs").insert({
      run_id: runId,
      tenant_id: tenantId,
      params: { monthId, txCount: txs.length, docCount: docs.length },
      created_at: nowISO,
    }).select();

    // ── 5. MatchingRunResult zurückgeben ─────────────────────────────
    const finalCount = result.decisions.filter((d) => d.state === "final").length;
    const suggestedCount = result.decisions.filter((d) => d.state === "suggested").length;

    return json({
      tenantId,
      monthId,
      ranAt: nowISO,
      txCount: txs.length,
      docCount: docs.length,
      finalMatches: finalCount,
      suggestedMatches: suggestedCount,
      docLifecycle: result.docLifecycle ?? [],
      txLifecycle: result.txLifecycle ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[run-matching]", message);
    return json({ error: message }, 500);
  }
});

// ── SupabaseMatchRepository ───────────────────────────────────────────────

class SupabaseMatchRepository implements MatchRepository {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private runId: string,
    private nowISO: string
  ) {}

  async applyMatches(decisions: MatchDecision[]): Promise<void> {
    for (const decision of decisions) {
      const ops = toApplyOps(decision, this.nowISO);
      for (const op of ops) {
        await this.executeOp(op);
      }
    }
  }

  async saveSuggestions(suggestions: MatchDecision[]): Promise<void> {
    if (!suggestions.length) return;
    const rows = suggestions.map((d) => ({
      tenant_id: (d.inputs?.tenant_id as string) ?? "__unknown__",
      run_id: this.runId,
      decision: d,
      created_at: this.nowISO,
    }));
    await this.supabase.from("matching_suggestions").insert(rows);
  }

  async audit(allDecisions: MatchDecision[]): Promise<void> {
    if (!allDecisions.length) return;
    const rows = allDecisions.map((d) => ({
      ...toAuditRecord(d, this.nowISO),
      run_id: this.runId,
    }));
    // Batch-Insert in Blöcken von 100
    for (let i = 0; i < rows.length; i += 100) {
      await this.supabase.from("matching_audit").insert(rows.slice(i, i + 100));
    }
  }

  async loadTxHistory(tenantId: string, opts: TxHistoryOptions): Promise<Tx[]> {
    const since = new Date();
    since.setDate(since.getDate() - opts.lookbackDays);
    const sinceDate = since.toISOString().slice(0, 10);

    let q = this.supabase
      .from("bank_transactions")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("booking_date", sinceDate)
      .order("booking_date", { ascending: false })
      .limit(opts.limit);

    if (opts.vendorKey) {
      q = q.eq("vendor_key", opts.vendorKey);
    }

    const { data } = await q;
    return (data ?? []).map(rowToTx);
  }

  // ── Einzelne ApplyOp gegen Supabase ausführen ──────────────────────
  private async executeOp(op: ReturnType<typeof toApplyOps>[number]): Promise<void> {
    if (op.kind === "upsert_group") {
      await this.supabase.from("match_groups").upsert(
        {
          id: op.match_group_id,
          tenant_id: op.tenant_id,
          relation_type: op.relation_type,
          state: op.match_state,
          confidence: op.confidence,
          match_reason: op.reason_codes.join(","),
          matched_by: "system",
          matched_at: this.nowISO,
          run_id: this.runId,
          created_at: op.created_at,
          updated_at: this.nowISO,
        },
        { onConflict: "id" }
      );
      return;
    }

    if (op.kind === "upsert_edge") {
      // Nur mit match_group_id; sonst keine Edge-Records (1:1 ohne Gruppe)
      if (!op.match_group_id) return;

      await this.supabase.from("match_edges_docs").upsert(
        {
          tenant_id: op.tenant_id,
          match_group_id: op.match_group_id,
          document_id: op.doc_id,
          run_id: this.runId,
          created_at: op.created_at,
        },
        { onConflict: "match_group_id,document_id" }
      );

      await this.supabase.from("match_edges_txs").upsert(
        {
          tenant_id: op.tenant_id,
          match_group_id: op.match_group_id,
          bank_transaction_id: op.tx_id,
          run_id: this.runId,
          created_at: op.created_at,
        },
        { onConflict: "match_group_id,bank_transaction_id" }
      );
      return;
    }

    if (op.kind === "update_doc") {
      const update: Record<string, unknown> = {
        link_state: op.link_state,
        matched_at: this.nowISO,
        matched_by: "system",
        updated_at: this.nowISO,
      };
      if (typeof op.open_amount === "number") {
        update.open_amount = op.open_amount;
      }
      await this.supabase
        .from("documents")
        .update(update)
        .eq("id", op.doc_id)
        .eq("tenant_id", op.tenant_id);

      // Auch invoices.open_amount aktualisieren
      if (typeof op.open_amount === "number") {
        await this.supabase
          .from("invoices")
          .update({ link_state: op.link_state, open_amount: op.open_amount, updated_at: this.nowISO })
          .eq("document_id", op.doc_id)
          .eq("tenant_id", op.tenant_id);
      }
      return;
    }

    if (op.kind === "update_tx") {
      await this.supabase
        .from("bank_transactions")
        .update({
          link_state: op.link_state,
          matched_at: this.nowISO,
          matched_by: "system",
          updated_at: this.nowISO,
        })
        .eq("id", op.tx_id)
        .eq("tenant_id", op.tenant_id);
      return;
    }

    if (op.kind === "update_invoice_line_item") {
      const q = this.supabase
        .from("invoice_line_items")
        .update({
          link_state: op.link_state,
          open_amount: op.open_amount,
          match_group_id: op.match_group_id ?? null,
          updated_at: this.nowISO,
        })
        .eq("tenant_id", op.tenant_id)
        .eq("invoice_id", op.invoice_id);

      if (op.line_item_id) {
        await q.eq("id", op.line_item_id);
      } else if (op.line_index != null) {
        await q.eq("line_index", op.line_index);
      }
      return;
    }
  }
}

// ── DB-Zeilen → Engine-Typen ─────────────────────────────────────────────

function rowToTx(row: Record<string, unknown>): Tx {
  const raw = Number(row.amount ?? 0);
  const amount = Math.abs(raw);
  const direction = raw >= 0 ? "in" : "out";

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    amount,
    direction: direction as "in" | "out",
    currency: String(row.currency ?? "EUR"),
    booking_date: String(row.booking_date ?? row.value_date ?? ""),
    value_date: row.value_date ? String(row.value_date) : undefined,
    link_state: String(row.link_state ?? "unlinked") as "unlinked" | "linked" | "partial" | "suggested",
    iban: row.iban ? String(row.iban) : null,
    ref: row.reference ? String(row.reference) : null,
    e2e_id: row.end_to_end_id ? String(row.end_to_end_id) : null,
    counterparty_name: row.counterparty_name ? String(row.counterparty_name) : null,
    vendor_key: row.vendor_key ? String(row.vendor_key) : null,
    private_hint: row.private_hint != null ? Boolean(row.private_hint) : null,
    is_recurring_hint: row.is_recurring_hint != null ? Boolean(row.is_recurring_hint) : null,
  };
}

function rowToDoc(row: Record<string, unknown>): Doc {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "EUR"),
    link_state: String(row.link_state ?? "unlinked") as "unlinked" | "linked" | "partial" | "suggested",
    invoice_date: row.invoice_date ? String(row.invoice_date) : undefined,
    due_date: row.due_date ? String(row.due_date) : undefined,
    iban: row.iban ? String(row.iban) : null,
    invoice_no: row.invoice_no ? String(row.invoice_no) : null,
    e2e_id: row.e2e_id ? String(row.e2e_id) : null,
    vendor_raw: row.vendor_name ? String(row.vendor_name) : null,
    open_amount: row.open_amount != null ? Number(row.open_amount) : null,
  };
}

// ── Hilfsfunktion ─────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
