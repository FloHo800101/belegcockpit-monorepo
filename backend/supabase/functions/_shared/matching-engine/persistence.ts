import { LinkState, MatchDecision, MatchRelationType, MatchState } from "./types.ts";

export type ApplyOp =
  | {
      kind: "upsert_edge";
      tenant_id: string;
      doc_id: string;
      tx_id: string;
      link_state: LinkState;
      relation_type: MatchRelationType;
      match_group_id?: string | null;
      match_state: MatchState;
      confidence: number;
      reason_codes: string[];
      inputs: Record<string, any>;
      matched_by: "system" | "user";
      created_at: string;
    }
  | {
      kind: "update_doc";
      doc_id: string;
      tenant_id: string;
      link_state: LinkState;
      open_amount?: number | null;
    }
  | {
      kind: "update_tx";
      tx_id: string;
      tenant_id: string;
      link_state: LinkState;
    }
  | {
      kind: "update_invoice_line_item";
      tenant_id: string;
      invoice_id: string;
      line_item_id?: string | null;
      line_index?: number | null;
      link_state: LinkState;
      open_amount: number;
      match_group_id?: string | null;
    }
  | {
      kind: "upsert_group";
      tenant_id: string;
      match_group_id: string;
      relation_type: MatchRelationType;
      match_state: MatchState;
      confidence: number;
      reason_codes: string[];
      inputs: Record<string, any>;
      created_at: string;
    };

export type AuditRecord = {
  tenant_id: string;
  event_time: string;
  decision_key: string;
  state: MatchState;
  relation_type: MatchRelationType;
  tx_ids: string[];
  doc_ids: string[];
  match_group_id?: string | null;
  confidence: number;
  reason_codes: string[];
  inputs: Record<string, any>;
  matched_by: "system" | "user";
};

export type EdgeDocRef = {
  tenant_id: string;
  match_group_id: string;
  doc_id: string;
};

export type EdgeTxRef = {
  tenant_id: string;
  match_group_id: string;
  tx_id: string;
};

export function toApplyOps(decision: MatchDecision, nowISO?: string): ApplyOp[] {
  const validation = assertDecisionPersistable(decision);
  if (!validation.ok) return [];

  const created_at = nowISO ?? new Date().toISOString();
  const tx_ids = stableSorted(unique(decision.tx_ids));
  const doc_ids = stableSorted(unique(decision.doc_ids));
  const reason_codes = [...decision.reason_codes];
  const match_group_id = decision.match_group_id ?? null;
  const tenant_id = (decision.inputs?.tenant_id as string) ?? "__unknown__";
  const link_state = inferredLinkState(decision);

  const ops: ApplyOp[] = [];

  if (decision.relation_type === "many_to_many") {
    if (match_group_id) {
      ops.push({
        kind: "upsert_group",
        tenant_id,
        match_group_id,
        relation_type: decision.relation_type,
        match_state: decision.state,
        confidence: decision.confidence,
        reason_codes,
        inputs: safeObj(decision.inputs),
        created_at,
      });
    }
    return ops;
  }

  if (decision.relation_type === "one_to_one") {
    ops.push({
      kind: "upsert_edge",
      tenant_id,
      doc_id: doc_ids[0],
      tx_id: tx_ids[0],
      link_state,
      relation_type: decision.relation_type,
      match_group_id,
      match_state: decision.state,
      confidence: decision.confidence,
      reason_codes,
      inputs: safeObj(decision.inputs),
      matched_by: decision.matched_by,
      created_at,
    });
  }

  if (decision.relation_type === "many_to_one") {
    for (const doc_id of doc_ids) {
      ops.push({
        kind: "upsert_edge",
        tenant_id,
        doc_id,
        tx_id: tx_ids[0],
        link_state,
        relation_type: decision.relation_type,
        match_group_id,
        match_state: decision.state,
        confidence: decision.confidence,
        reason_codes,
        inputs: safeObj(decision.inputs),
        matched_by: decision.matched_by,
        created_at,
      });
    }
    if (match_group_id) {
      ops.push({
        kind: "upsert_group",
        tenant_id,
        match_group_id,
        relation_type: decision.relation_type,
        match_state: decision.state,
        confidence: decision.confidence,
        reason_codes,
        inputs: safeObj(decision.inputs),
        created_at,
      });
    }
  }

  if (decision.relation_type === "one_to_many") {
    for (const tx_id of tx_ids) {
      ops.push({
        kind: "upsert_edge",
        tenant_id,
        doc_id: doc_ids[0],
        tx_id,
        link_state,
        relation_type: decision.relation_type,
        match_group_id,
        match_state: decision.state,
        confidence: decision.confidence,
        reason_codes,
        inputs: safeObj(decision.inputs),
        matched_by: decision.matched_by,
        created_at,
      });
    }
    if (match_group_id) {
      ops.push({
        kind: "upsert_group",
        tenant_id,
        match_group_id,
        relation_type: decision.relation_type,
        match_state: decision.state,
        confidence: decision.confidence,
        reason_codes,
        inputs: safeObj(decision.inputs),
        created_at,
      });
    }
  }

  if (decision.state === "final" || decision.state === "partial") {
    for (const doc_id of doc_ids) {
      const update: ApplyOp = {
        kind: "update_doc",
        tenant_id,
        doc_id,
        link_state,
      };
      if (decision.state === "final") {
        update.open_amount = 0;
      } else if (decision.state === "partial" && typeof decision.open_amount_after === "number") {
        update.open_amount = decision.open_amount_after;
      }
      ops.push(update);
    }
    for (const tx_id of tx_ids) {
      ops.push({
        kind: "update_tx",
        tenant_id,
        tx_id,
        link_state,
      });
    }

    const matchedItemRefs = extractMatchedItemRefs(
      decision.inputs?.matched_item_refs,
      decision.inputs?.matched_item_ids
    );
    if (doc_ids.length === 1 && matchedItemRefs.length > 0) {
      for (const ref of matchedItemRefs) {
        ops.push({
          kind: "update_invoice_line_item",
          tenant_id,
          invoice_id: doc_ids[0],
          line_item_id: ref.id ?? null,
          line_index: ref.line_index,
          link_state: "linked",
          open_amount: 0,
          match_group_id,
        });
      }
    }
  }

  return ops;
}

export function toAuditRecord(decision: MatchDecision, nowISO?: string): AuditRecord {
  const tx_ids = stableSorted(unique(decision.tx_ids));
  const doc_ids = stableSorted(unique(decision.doc_ids));
  const reason_codes = [...decision.reason_codes];

  return {
    tenant_id: (decision.inputs?.tenant_id as string) ?? "__unknown__",
    event_time: nowISO ?? new Date().toISOString(),
    decision_key: decisionKey(decision),
    state: decision.state,
    relation_type: decision.relation_type,
    tx_ids,
    doc_ids,
    match_group_id: decision.match_group_id ?? null,
    confidence: decision.confidence,
    reason_codes,
    inputs: safeObj(decision.inputs),
    matched_by: decision.matched_by,
  };
}

export function projectUniqueEdgeRefs(ops: ApplyOp[]): {
  docRefs: EdgeDocRef[];
  txRefs: EdgeTxRef[];
} {
  const docSeen = new Set<string>();
  const txSeen = new Set<string>();
  const docRefs: EdgeDocRef[] = [];
  const txRefs: EdgeTxRef[] = [];

  for (const op of ops) {
    if (op.kind !== "upsert_edge") continue;
    if (!op.match_group_id) continue;

    const docKey = `${op.match_group_id}|${op.doc_id}`;
    if (!docSeen.has(docKey)) {
      docSeen.add(docKey);
      docRefs.push({
        tenant_id: op.tenant_id,
        match_group_id: op.match_group_id,
        doc_id: op.doc_id,
      });
    }

    const txKey = `${op.match_group_id}|${op.tx_id}`;
    if (!txSeen.has(txKey)) {
      txSeen.add(txKey);
      txRefs.push({
        tenant_id: op.tenant_id,
        match_group_id: op.match_group_id,
        tx_id: op.tx_id,
      });
    }
  }

  return { docRefs, txRefs };
}

export function decisionKey(decision: MatchDecision): string {
  const tx_ids = stableSorted(unique(decision.tx_ids));
  const doc_ids = stableSorted(unique(decision.doc_ids));
  const group = decision.match_group_id ?? "";
  return `${decision.state}|${decision.relation_type}|tx:${tx_ids.join(",")}|doc:${doc_ids.join(",")}|grp:${group}`;
}

export function inferredLinkState(decision: MatchDecision): LinkState {
  if (decision.state === "final") return "linked";
  if (decision.state === "partial") return "partial";
  return "suggested";
}

export function assertDecisionPersistable(
  decision: MatchDecision
): { ok: true } | { ok: false; reason: string } {
  if ((decision.state === "final" || decision.state === "partial") &&
      (decision.tx_ids.length === 0 || decision.doc_ids.length === 0)) {
    return { ok: false, reason: "missing_ids_for_final" };
  }
  if ((decision.state === "final" || decision.state === "partial") &&
      decision.relation_type === "many_to_many") {
    return { ok: false, reason: "invalid_final_many_to_many" };
  }
  return { ok: true };
}

function stableSorted(ids: string[]): string[] {
  return [...ids].sort();
}

function unique(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function safeObj(value: any): Record<string, any> {
  return value && typeof value === "object" ? value : {};
}

/*
Testfälle
- one_to_one final => 1 edge + update_doc + update_tx + audit (audit separate)
- many_to_one final => n edges + group + updates
- one_to_many partial => n edges + group + update_doc(open_amount_after) + updates txs
- many_to_many ambiguous => group only, no edges
- suggested => edges/group suggested only, no doc/tx updates
*/


type ParsedMatchedItemRef = {
  id?: string;
  line_index: number | null;
};

function extractMatchedItemRefs(refsValue: unknown, idsValue: unknown): ParsedMatchedItemRef[] {
  const out: ParsedMatchedItemRef[] = [];
  const seen = new Set<string>();

  const push = (item: ParsedMatchedItemRef) => {
    const key = item.id ? `id:${item.id}` : `line:${item.line_index ?? -1}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  if (Array.isArray(refsValue)) {
    for (const value of refsValue) {
      if (!value || typeof value !== "object") continue;
      const entry = value as { id?: unknown; line_index?: unknown };
      const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : undefined;
      const lineIndex =
        typeof entry.line_index === "number" && Number.isFinite(entry.line_index)
          ? entry.line_index
          : null;
      if (!id && lineIndex == null) continue;
      push({ id, line_index: lineIndex });
    }
    return out;
  }

  if (Array.isArray(idsValue)) {
    for (const value of idsValue) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("line:")) {
        const parsed = Number.parseInt(trimmed.slice(5), 10);
        push({ line_index: Number.isFinite(parsed) ? parsed : null });
      } else {
        push({ id: trimmed, line_index: null });
      }
    }
  }

  return out;
}
