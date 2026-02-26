// How to run:
// SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... SUPABASE_LIVE_TENANT_ID=... FROM=... TO=... [INCLUDE_UNDATED_DOCS=1] pnpm matching:live-replay

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import {
  run_pipeline,
  type Doc,
  type MatchDecision,
  type MatchRepository,
  type PipelineInput,
  type Tx,
} from "../../src/matching-engine";
import {
  normalizeText,
  normalizeVendor,
  extractInvoiceNo,
} from "../../src/matching-engine/normalize";
import {
  toApplyOps,
  toAuditRecord,
  projectUniqueEdgeRefs,
} from "../../src/matching-engine/persistence";
import { writeHtmlReport } from "./render-html-report";
import { buildDocumentDateFilter } from "./live-replay-date-filter";

dotenv.config({ path: ".env.live.local" });
dotenv.config();

const SUPABASE_URL = requireEnv(process.env.SUPABASE_LIVE_URL, "SUPABASE_LIVE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv(
  process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  "SUPABASE_LIVE_SERVICE_ROLE_KEY"
);
const SUPABASE_TENANT_ID = requireEnv(
  process.env.SUPABASE_LIVE_TENANT_ID,
  "SUPABASE_LIVE_TENANT_ID"
);
const FROM = requireEnv(process.env.FROM, "FROM");
const TO = requireEnv(process.env.TO, "TO");
const LIMIT_DOCS = toOptionalInt(process.env.LIMIT_DOCS);
const LIMIT_TXS = toOptionalInt(process.env.LIMIT_TXS);
const INCLUDE_LINKED = process.env.INCLUDE_LINKED === "1";
const INCLUDE_UNDATED_DOCS = process.env.INCLUDE_UNDATED_DOCS === "1";

const fromDate = parseDate(FROM, "FROM");
const toDate = parseDate(TO, "TO");
const fromISO = fromDate.toISOString();
const toISO = toDate.toISOString();
const fromDateOnly = toDateOnly(fromDate);
const toDateOnlyValue = toDateOnly(toDate);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AppliedRow = {
  op_kind: string;
  entity_type: string;
  entity_id?: string | null;
  match_group_id?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

async function main() {
  const runId = crypto.randomUUID();
  const createdAtISO = new Date().toISOString();
  const tenantId = SUPABASE_TENANT_ID;

  await insertRun(tenantId, runId, createdAtISO);

  const docsRows = await loadDocuments(tenantId);
  const txRows = await loadTransactions(tenantId);
  const invoiceLineItemsByInvoiceId = await loadInvoiceLineItems(
    tenantId,
    docsRows.map((row) => row.id as string).filter(Boolean)
  );
  const undatedDocsRowsCount = docsRows.filter(
    (row) => !row.invoice_date && !row.due_date
  ).length;
  console.log(
    `Documents loaded: total=${docsRows.length}, dated=${
      docsRows.length - undatedDocsRowsCount
    }, undated=${undatedDocsRowsCount}, include_undated=${INCLUDE_UNDATED_DOCS}`
  );

  const { docs, docMap, skippedDocs } = mapDocs(docsRows, invoiceLineItemsByInvoiceId);
  const { txs, txMap, skippedTxs } = mapTxs(txRows);

  if (skippedDocs.length) {
    console.warn(`Skipped ${skippedDocs.length} documents without amount/currency`);
  }
  if (skippedTxs.length) {
    console.warn(`Skipped ${skippedTxs.length} transactions without amount/currency`);
  }

  const input: PipelineInput = {
    docs,
    txs,
    nowISO: createdAtISO,
  };

  const repo = buildRepo({
    tenantId,
    runId,
    nowISO: createdAtISO,
    docMap,
    txMap,
  });

  const result = await run_pipeline(input, repo, { debug: true });

  const reportPath = path.resolve(
    "tests",
    "output",
    "matching",
    `report-${tenantId}-${runId}.html`
  );

  writeHtmlReport({
    tenantId,
    runId,
    decisions: result.decisions,
    debug: result.debug,
    params: {
      from: fromISO,
      to: toISO,
      limit_docs: LIMIT_DOCS,
      limit_txs: LIMIT_TXS,
    },
    createdAtISO,
    outputPath: reportPath,
    docs,
    txs,
  });

  console.log(`Run complete. run_id=${runId}`);
  console.log(`Tenant: ${tenantId}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Decisions: ${result.decisions.length}`);
  if (result.debug) {
    console.log(`Debug: ${JSON.stringify(result.debug)}`);
  }
}

async function insertRun(tenantId: string, runId: string, createdAtISO: string) {
  const { error } = await supabase.from("matching_runs").insert({
    run_id: runId,
    tenant_id: tenantId,
    params: {
      from: fromISO,
      to: toISO,
      limit_docs: LIMIT_DOCS,
      limit_txs: LIMIT_TXS,
    },
    created_at: createdAtISO,
  });
  if (error) throw new Error(`Failed to insert matching_runs: ${error.message}`);
}

async function loadDocuments(tenantId: string) {
  const dateFilter = buildDocumentDateFilter(
    fromDateOnly,
    toDateOnlyValue,
    INCLUDE_UNDATED_DOCS
  );
  let query = supabase
    .from("invoices")
    .select(
      "id, tenant_id, document_id, amount, amount_candidates, currency, link_state, invoice_date, due_date, invoice_no, iban, e2e_id, vendor_name, buyer_name, open_amount, created_at"
    )
    .eq("tenant_id", tenantId)
    .or(dateFilter)
    .order("invoice_date", { ascending: true });

  if (!INCLUDE_LINKED) query = query.in("link_state", ["unlinked", "partial", "suggested"]);
  if (LIMIT_DOCS) query = query.limit(LIMIT_DOCS);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}

async function loadInvoiceLineItems(tenantId: string, invoiceIds: string[]) {
  const grouped = new Map<string, any[]>();
  if (!invoiceIds.length) return grouped;

  for (const chunk of chunkArray(invoiceIds, 250)) {
    const { data, error } = await supabase
      .from("invoice_line_items")
      .select(
        "id, tenant_id, invoice_id, line_index, description, amount_signed, amount_abs, currency, link_state, open_amount"
      )
      .eq("tenant_id", tenantId)
      .in("invoice_id", chunk)
      .in("link_state", ["unlinked", "partial", "suggested"])
      .order("line_index", { ascending: true });

    if (error) throw new Error(`Failed to load invoice_line_items: ${error.message}`);

    for (const row of data ?? []) {
      const key = row.invoice_id as string;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }
  }

  return grouped;
}
async function loadTransactions(tenantId: string) {
  let query = supabase
    .from("bank_transactions")
    .select(
      "id, tenant_id, amount, currency, foreign_amount, foreign_currency, exchange_rate, value_date, booking_date, iban, counterparty_name, end_to_end_id, reference, link_state, open_amount"
    )
    .eq("tenant_id", tenantId)
    .gte("value_date", fromDateOnly)
    .lte("value_date", toDateOnlyValue)
    .order("value_date", { ascending: true });

  if (!INCLUDE_LINKED) query = query.in("link_state", ["unlinked", "partial", "suggested"]);
  if (LIMIT_TXS) query = query.limit(LIMIT_TXS);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load bank_transactions: ${error.message}`);
  return data ?? [];
}

function mapDocs(rows: any[], lineItemsByInvoiceId?: Map<string, any[]>) {
  const docs: Doc[] = [];
  const docMap = new Map<string, Doc>();
  const skipped: any[] = [];

  for (const row of rows) {
    const amount = toNumber(row.amount);
    const currency = firstString(row.currency);

    if (!Number.isFinite(amount) || !currency) {
      skipped.push(row);
      continue;
    }

    const vendorRaw = firstString(row.vendor_name);
    const buyerRaw = firstString(row.buyer_name);
    const textRaw = buildText([vendorRaw, buyerRaw, row.invoice_no, row.e2e_id]);

    const invoiceDate = normalizeDateString(row.invoice_date);
    const dueDate = normalizeDateString(row.due_date);
    const invoiceNo = firstString(row.invoice_no, extractInvoiceNo(textRaw));
    const openAmount = toNumber(row.open_amount);
    const itemRows = lineItemsByInvoiceId?.get(row.id as string) ?? [];
    const items = itemRows
      .map((itemRow) => {
        const amountSigned = toNumber(itemRow.amount_signed);
        const amountAbs = toNumber(itemRow.amount_abs, itemRow.open_amount);
        const openAmount = toNumber(itemRow.open_amount, itemRow.amount_abs);
        if (!Number.isFinite(amountAbs) || amountAbs <= 0) return null;
        return {
          id: firstString(itemRow.id) ?? undefined,
          line_index:
            typeof itemRow.line_index === "number" && Number.isFinite(itemRow.line_index)
              ? itemRow.line_index
              : undefined,
          description: firstString(itemRow.description) ?? undefined,
          amount_signed: Number.isFinite(amountSigned) ? amountSigned : undefined,
          amount_abs: amountAbs,
          currency: firstString(itemRow.currency) ?? currency,
          link_state: toLinkState(itemRow.link_state),
          open_amount: Number.isFinite(openAmount) ? openAmount : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const doc: Doc = {
      id: row.id,
      tenant_id: row.tenant_id,
      amount: Math.abs(amount),
      amount_candidates: toNumberArray(row.amount_candidates),
      items: items.length ? items : undefined,
      currency,
      link_state: row.link_state,
      invoice_date: invoiceDate ?? undefined,
      due_date: dueDate ?? undefined,
      iban: firstString(row.iban),
      invoice_no: invoiceNo ?? undefined,
      e2e_id: firstString(row.e2e_id),
      vendor_raw: vendorRaw ?? undefined,
      vendor_norm: normalizeVendor(vendorRaw ?? "") || undefined,
      buyer_raw: buyerRaw ?? undefined,
      buyer_norm: normalizeVendor(buyerRaw ?? "") || undefined,
      text_raw: textRaw || undefined,
      text_norm: normalizeText(textRaw || "") || undefined,
      open_amount: Number.isFinite(openAmount) ? openAmount : null,
    };

    docs.push(doc);
    docMap.set(doc.id, doc);
  }

  return { docs, docMap, skippedDocs: skipped };
}

function mapTxs(rows: any[]) {
  const txs: Tx[] = [];
  const txMap = new Map<string, Tx>();
  const skipped: any[] = [];

  for (const row of rows) {
    const rawAmount = toNumber(row.amount);
    const currency = firstString(row.currency);

    if (!Number.isFinite(rawAmount) || !currency) {
      skipped.push(row);
      continue;
    }

    const direction = rawAmount < 0 ? "out" : "in";
    const amount = Math.abs(rawAmount);
    const foreignAmountRaw = toNumber(row.foreign_amount);
    const foreignAmount = Number.isFinite(foreignAmountRaw) ? Math.abs(foreignAmountRaw) : null;
    const exchangeRateRaw = toNumber(row.exchange_rate);
    const exchangeRate = Number.isFinite(exchangeRateRaw) ? exchangeRateRaw : null;
    const bookingDate = normalizeDateString(row.booking_date ?? row.value_date);
    const vendorRaw = firstString(row.counterparty_name);
    const ref = firstString(row.reference);
    const textRaw = buildText([vendorRaw, ref]);

    const tx: Tx = {
      id: row.id,
      tenant_id: row.tenant_id,
      amount,
      direction,
      currency,
      foreign_amount: foreignAmount,
      foreign_currency: firstString(row.foreign_currency),
      exchange_rate: exchangeRate,
      booking_date: bookingDate ?? new Date().toISOString(),
      link_state: row.link_state,
      iban: firstString(row.iban),
      ref: ref ?? undefined,
      e2e_id: firstString(row.end_to_end_id),
      vendor_raw: vendorRaw ?? undefined,
      vendor_norm: normalizeVendor(vendorRaw ?? "") || undefined,
      text_raw: textRaw || undefined,
      text_norm: normalizeText(textRaw || "") || undefined,
    };

    txs.push(tx);
    txMap.set(tx.id, tx);
  }

  return { txs, txMap, skippedTxs: skipped };
}

function buildRepo(params: {
  tenantId: string;
  runId: string;
  nowISO: string;
  docMap: Map<string, Doc>;
  txMap: Map<string, Tx>;
}): MatchRepository {
  const { tenantId, runId, nowISO, docMap, txMap } = params;
  const groupMap = new Map<string, string>();

  const ensureGroupId = (decision: MatchDecision): string => {
    const key =
      decision.match_group_id ??
      `${decision.relation_type}|tx:${[...decision.tx_ids]
        .sort()
        .join(",")}|doc:${[...decision.doc_ids].sort().join(",")}`;
    const existing = groupMap.get(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    groupMap.set(key, next);
    return next;
  };

  return {
    async applyMatches(decisions) {
      if (!decisions.length) return;

      const decisionByDocId = new Map<string, MatchDecision>();
      const decisionByTxId = new Map<string, MatchDecision>();

      const withGroup = decisions.map((decision) => {
        const groupId = ensureGroupId(decision);
        const updated = { ...decision, match_group_id: groupId };
        for (const docId of updated.doc_ids) decisionByDocId.set(docId, updated);
        for (const txId of updated.tx_ids) decisionByTxId.set(txId, updated);
        return updated;
      });

      const ops = withGroup.flatMap((decision) => {
        const baseOps = toApplyOps(decision, nowISO);
        const hasGroup = baseOps.some((op) => op.kind === "upsert_group");
        if (!hasGroup) {
          baseOps.push({
            kind: "upsert_group",
            tenant_id: tenantId,
            match_group_id: decision.match_group_id as string,
            relation_type: decision.relation_type,
            match_state: decision.state,
            confidence: decision.confidence,
            reason_codes: [...decision.reason_codes],
            inputs: decision.inputs ?? {},
            created_at: nowISO,
          });
        }
        return baseOps;
      });

      const groupOps = ops.filter((op) => op.kind === "upsert_group");
      const edgeOps = ops.filter((op) => op.kind === "upsert_edge");
      const docOps = ops.filter((op) => op.kind === "update_doc");
      const itemOps = ops.filter((op) => op.kind === "update_invoice_line_item");
      const txOps = ops.filter((op) => op.kind === "update_tx");

      if (groupOps.length) {
        const rows = groupOps.map((op) => ({
          id: op.match_group_id,
          tenant_id: tenantId,
          relation_type: op.relation_type,
          state: op.match_state,
          confidence: op.confidence,
          match_reason: op.reason_codes.join(","),
          matched_by: "system",
          matched_at: nowISO,
          run_id: runId,
          created_at: nowISO,
          updated_at: nowISO,
        }));
        await upsert("match_groups", rows, "id");
        const applied: AppliedRow[] = rows.map((row) => ({
          op_kind: "upsert_group",
          entity_type: "match_group",
          entity_id: row.id,
          match_group_id: row.id,
          payload: row,
        }));
        await insertApplied(tenantId, runId, applied);
      }

      if (edgeOps.length) {
        const { docRefs, txRefs } = projectUniqueEdgeRefs(edgeOps);
        const docEdges = docRefs.map((ref) => {
          const doc = docMap.get(ref.doc_id);
          const txOp = edgeOps.find(
            (op) =>
              op.kind === "upsert_edge" &&
              op.match_group_id === ref.match_group_id &&
              op.doc_id === ref.doc_id
          );
          const tx = txOp ? txMap.get(txOp.tx_id) : undefined;
          const direction = tx?.direction === "out" ? "debit" : "credit";
          return {
            tenant_id: tenantId,
            match_group_id: ref.match_group_id,
            document_id: ref.doc_id,
            amount: doc?.amount ?? null,
            direction,
            run_id: runId,
            created_at: nowISO,
          };
        });
        const txEdges = txRefs.map((ref) => {
          const tx = txMap.get(ref.tx_id);
          const direction = tx?.direction === "out" ? "debit" : "credit";
          return {
            tenant_id: tenantId,
            match_group_id: ref.match_group_id,
            bank_transaction_id: ref.tx_id,
            amount: tx?.amount ?? null,
            direction,
            run_id: runId,
            created_at: nowISO,
          };
        });

        await upsert("match_edges_docs", docEdges, "match_group_id,document_id");
        await upsert(
          "match_edges_txs",
          txEdges,
          "match_group_id,bank_transaction_id"
        );

        const applied: AppliedRow[] = [
          ...docEdges.map((row) => ({
            op_kind: "upsert_edge",
            entity_type: "match_edge_doc",
            entity_id: row.document_id,
            match_group_id: row.match_group_id,
            payload: row as Record<string, unknown>,
          })),
          ...txEdges.map((row) => ({
            op_kind: "upsert_edge",
            entity_type: "match_edge_tx",
            entity_id: row.bank_transaction_id,
            match_group_id: row.match_group_id,
            payload: row as Record<string, unknown>,
          })),
        ];
        await insertApplied(tenantId, runId, applied);
      }

      if (docOps.length) {
        const docIds = unique(docOps.map((op) => op.doc_id));
        const beforeDocs = await fetchDocs(tenantId, docIds);

        for (const op of docOps) {
          const decision = decisionByDocId.get(op.doc_id);
          if (!decision) continue;
          const matchGroupId = decision.match_group_id as string;
          const update: Record<string, unknown> = {
            link_state: op.link_state,
            match_group_id: matchGroupId,
            matched_at: nowISO,
            matched_by: "system",
            match_reason: decision.reason_codes.join(","),
            run_id: runId,
          };
          if (op.open_amount !== undefined) {
            update.open_amount = op.open_amount;
          }

          await updateById("invoices", op.doc_id, tenantId, update);

          const before = beforeDocs.get(op.doc_id) ?? null;
          const applied: AppliedRow = {
            op_kind: "update_doc",
            entity_type: "invoice",
            entity_id: op.doc_id,
            match_group_id: matchGroupId,
            before_state: before,
            after_state: update,
          };
          await insertApplied(tenantId, runId, [applied]);
        }
      }

      if (itemOps.length) {
        const applied: AppliedRow[] = [];

        for (const op of itemOps) {
          const decision = decisionByDocId.get(op.invoice_id);
          const matchGroupId = (op.match_group_id as string | null) ?? decision?.match_group_id ?? null;
          const update: Record<string, unknown> = {
            link_state: op.link_state,
            open_amount: op.open_amount,
            match_group_id: matchGroupId,
            matched_at: nowISO,
            updated_at: nowISO,
          };

          let query = supabase
            .from("invoice_line_items")
            .update(update)
            .eq("tenant_id", tenantId)
            .eq("invoice_id", op.invoice_id);

          if (typeof op.line_item_id === "string" && op.line_item_id) {
            query = query.eq("id", op.line_item_id);
          } else if (typeof op.line_index === "number") {
            query = query.eq("line_index", op.line_index);
          } else {
            continue;
          }

          const { error } = await query;
          if (error) {
            throw new Error(`Failed to update invoice_line_items: ${error.message}`);
          }

          applied.push({
            op_kind: "update_invoice_line_item",
            entity_type: "invoice_line_item",
            entity_id:
              typeof op.line_item_id === "string" && op.line_item_id
                ? op.line_item_id
                : null,
            match_group_id: matchGroupId,
            after_state: update,
            payload: {
              invoice_id: op.invoice_id,
              line_index: op.line_index ?? null,
            },
          });
        }

        if (applied.length) {
          await insertApplied(tenantId, runId, applied);
        }
      }

      if (txOps.length) {
        const txIds = unique(txOps.map((op) => op.tx_id));
        const beforeTxs = await fetchTxs(tenantId, txIds);

        for (const op of txOps) {
          const decision = decisionByTxId.get(op.tx_id);
          if (!decision) continue;
          const matchGroupId = decision.match_group_id as string;
          const update: Record<string, unknown> = {
            link_state: op.link_state,
            match_group_id: matchGroupId,
            matched_at: nowISO,
            matched_by: "system",
            match_reason: decision.reason_codes.join(","),
            run_id: runId,
          };

          await updateById("bank_transactions", op.tx_id, tenantId, update);

          const before = beforeTxs.get(op.tx_id) ?? null;
          const applied: AppliedRow = {
            op_kind: "update_tx",
            entity_type: "bank_transaction",
            entity_id: op.tx_id,
            match_group_id: matchGroupId,
            before_state: before,
            after_state: update,
          };
          await insertApplied(tenantId, runId, [applied]);
        }
      }
    },

    async saveSuggestions(decisions) {
      if (!decisions.length) return;
      const rows = decisions.map((decision) => ({
        tenant_id: tenantId,
        run_id: runId,
        decision,
        created_at: nowISO,
      }));
      await insert("matching_suggestions", rows);
    },

    async audit(decisions) {
      if (!decisions.length) return;
      const rows = decisions.map((decision) => {
        const groupId = ensureGroupId(decision);
        const record = toAuditRecord(
          { ...decision, match_group_id: groupId },
          nowISO
        );
        return { ...record, run_id: runId };
      });
      await insert("matching_audit", rows);
    },

    async loadTxHistory(tenantId, opts) {
      const cutoff = addDays(new Date(nowISO), -opts.lookbackDays);
      let query = supabase
        .from("bank_transactions")
        .select(
          "id, tenant_id, amount, currency, foreign_amount, foreign_currency, exchange_rate, value_date, booking_date, iban, counterparty_name, end_to_end_id, reference, link_state, open_amount"
        )
        .eq("tenant_id", tenantId)
        .gte("value_date", toDateOnly(cutoff))
        .order("value_date", { ascending: false })
        .limit(opts.limit);

      if (opts.vendorKey) {
        query = query.ilike("counterparty_name", `%${opts.vendorKey}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Failed to load tx history: ${error.message}`);
      const { txs } = mapTxs(data ?? []);
      return txs;
    },
  };
}

async function upsert(table: string, rows: any[], onConflict: string) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Upsert failed for ${table}: ${error.message}`);
}

async function insert(table: string, rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(`Insert failed for ${table}: ${error.message}`);
}

async function insertApplied(tenantId: string, runId: string, rows: AppliedRow[]) {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    tenant_id: tenantId,
    run_id: runId,
    op_kind: row.op_kind,
    entity_type: row.entity_type,
    entity_id: row.entity_id ?? null,
    match_group_id: row.match_group_id ?? null,
    before_state: row.before_state ?? null,
    after_state: row.after_state ?? null,
    payload: row.payload ?? null,
  }));
  await insert("matching_applied_matches", payload);
}

async function updateById(
  table: string,
  id: string,
  tenantId: string,
  update: Record<string, unknown>
) {
  const { error } = await supabase
    .from(table)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Update failed for ${table}:${id}: ${error.message}`);
}

async function fetchDocs(tenantId: string, ids: string[]): Promise<Map<string, any>> {
  if (!ids.length) return new Map();
  const rows = await fetchByIds(tenantId, "invoices", ids, [
    "id",
    "link_state",
    "match_group_id",
    "open_amount",
    "matched_at",
    "matched_by",
    "match_reason",
    "run_id",
  ]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchTxs(tenantId: string, ids: string[]): Promise<Map<string, any>> {
  if (!ids.length) return new Map();
  const rows = await fetchByIds(tenantId, "bank_transactions", ids, [
    "id",
    "link_state",
    "match_group_id",
    "open_amount",
    "matched_at",
    "matched_by",
    "match_reason",
    "run_id",
  ]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchByIds(
  tenantId: string,
  table: string,
  ids: string[],
  columns: string[]
) {
  const out: any[] = [];
  for (const chunk of chunkArray(ids, 250)) {
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(","))
      .in("id", chunk)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`Fetch failed for ${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

function buildText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").trim();
}

function normalizeDateString(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNumber(...values: any[]): number {
  for (const value of values) {
    if (value == null) continue;
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return Number.NaN;
}

function toNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: number[] = [];
  for (const item of value) {
    const num = toNumber(item);
    if (!Number.isFinite(num)) continue;
    out.push(Math.abs(Math.round(num * 100) / 100));
  }
  return out.length ? out : undefined;
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toLinkState(value: unknown): "unlinked" | "linked" | "partial" | "suggested" | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "unlinked" || value === "linked" || value === "partial" || value === "suggested") {
    return value;
  }
  return undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function toOptionalInt(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }
  return date;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name} in env`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

