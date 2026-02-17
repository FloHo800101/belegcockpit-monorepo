import { LinkState, MatchDecision, MatchRelationType, MatchState } from "./types";

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
      if (decision.state === "partial" && typeof decision.open_amount_after === "number") {
        update.open_amount = decision.open_amount_after;
      }
      if (decision.state === "final" && decision.relation_type === "one_to_many") {
        update.open_amount = 0;
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
