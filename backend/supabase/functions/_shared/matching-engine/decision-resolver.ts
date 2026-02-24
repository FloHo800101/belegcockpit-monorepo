import { MatchDecision, MatchRelationType, MatchState } from "./types.ts";

export type Resolved = {
  final: MatchDecision[];
  suggestions: MatchDecision[];
  all: MatchDecision[];
};

export function resolveConflicts(decisions: MatchDecision[]): Resolved {
  const normalized = decisions.map((d) => normalizeDecision(d));
  const deduped = dedupe(normalized);

  const finals = deduped.filter((d) => d.state === "final" || d.state === "partial");
  const suggestions = deduped.filter((d) => d.state === "suggested" || d.state === "ambiguous");

  const sortedFinals = [...finals].sort(compareByPriority);
  const accepted: MatchDecision[] = [];
  const demoted: MatchDecision[] = [];
  const usedTx = new Set<string>();
  const usedDoc = new Set<string>();

  for (const decision of sortedFinals) {
    if (hasConflictWithUsed(decision, usedTx, usedDoc)) {
      demoted.push(demoteDecision(decision, "CONFLICT_DEMOTED"));
      continue;
    }
    accepted.push(decision);
    for (const txId of decision.tx_ids) usedTx.add(txId);
    for (const docId of decision.doc_ids) usedDoc.add(docId);
  }

  const suggestionPool = [...suggestions, ...demoted].filter(
    (d) => !hasSameIdsAsAny(d, accepted)
  );
  const sortedSuggestions = suggestionPool.sort(compareByPriority);

  return {
    final: accepted,
    suggestions: sortedSuggestions,
    all: [...accepted, ...sortedSuggestions],
  };
}

export function normalizeDecision(d: MatchDecision): MatchDecision {
  let state: MatchState = d.state;

  const txIds = uniqueSorted(d.tx_ids);
  const docIds = uniqueSorted(d.doc_ids);
  const confidence = clamp01(Number.isFinite(d.confidence) ? d.confidence : 0);
  const reasonCodes = uniqueStable(d.reason_codes);
  const inputs = d.inputs ?? {};

  if ((state === "final" || state === "partial") && (txIds.length === 0 || docIds.length === 0)) {
    state = "ambiguous";
    reasonCodes.push("INVALID_FINAL_MISSING_IDS");
  }

  return {
    ...d,
    state,
    tx_ids: txIds,
    doc_ids: docIds,
    confidence,
    reason_codes: reasonCodes,
    inputs,
  };
}

export function decisionKey(d: MatchDecision): string {
  const txKey = d.tx_ids.join(",");
  const docKey = d.doc_ids.join(",");
  return `${d.state}|${d.relation_type}|tx:${txKey}|doc:${docKey}`;
}

export function hasOverlap(a: MatchDecision, b: MatchDecision): boolean {
  return shareAny(a.tx_ids, b.tx_ids) || shareAny(a.doc_ids, b.doc_ids);
}

export function compareByPriority(a: MatchDecision, b: MatchDecision): number {
  const stateRank = rankState(a.state) - rankState(b.state);
  if (stateRank !== 0) return stateRank;

  const hardRank = rankHardness(a) - rankHardness(b);
  if (hardRank !== 0) return hardRank;

  const relationRank = rankRelation(a.relation_type) - rankRelation(b.relation_type);
  if (relationRank !== 0) return relationRank;

  const confidenceRank = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (confidenceRank !== 0) return confidenceRank;

  const sizeRank = (a.tx_ids.length + a.doc_ids.length) - (b.tx_ids.length + b.doc_ids.length);
  if (sizeRank !== 0) return sizeRank;

  const keyA = decisionKey(a);
  const keyB = decisionKey(b);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

function dedupe(decisions: MatchDecision[]): MatchDecision[] {
  const map = new Map<string, MatchDecision>();
  for (const d of decisions) {
    const key = decisionKey(d);
    if (!map.has(key)) {
      map.set(key, d);
    }
  }
  return [...map.values()];
}

function demoteDecision(decision: MatchDecision, reason: string): MatchDecision {
  const reasonCodes = uniqueStable([...decision.reason_codes, reason]);
  return {
    ...decision,
    state: "ambiguous",
    confidence: Math.min(decision.confidence, 0.6),
    reason_codes: reasonCodes,
  };
}

function hasConflictWithUsed(
  decision: MatchDecision,
  usedTx: Set<string>,
  usedDoc: Set<string>
) {
  return (
    decision.tx_ids.some((id) => usedTx.has(id)) ||
    decision.doc_ids.some((id) => usedDoc.has(id))
  );
}

function hasSameIdsAsAny(decision: MatchDecision, finals: MatchDecision[]) {
  for (const fin of finals) {
    if (fin.tx_ids.join(",") === decision.tx_ids.join(",") &&
        fin.doc_ids.join(",") === decision.doc_ids.join(",")) {
      return true;
    }
  }
  return false;
}

function rankState(state: MatchState) {
  switch (state) {
    case "final":
      return 0;
    case "partial":
      return 1;
    case "suggested":
      return 2;
    case "ambiguous":
      return 3;
    default:
      return 4;
  }
}

function rankHardness(d: MatchDecision) {
  return d.reason_codes.some((code) => code.startsWith("HARD_")) ? 0 : 1;
}

function rankRelation(relation: MatchRelationType) {
  switch (relation) {
    case "one_to_one":
      return 0;
    case "one_to_many":
      return 1;
    case "many_to_one":
      return 2;
    case "many_to_many":
      return 3;
    default:
      return 4;
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of values) {
    if (seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

function shareAny(a: readonly string[], b: readonly string[]) {
  const set = new Set(a);
  for (const id of b) {
    if (set.has(id)) return true;
  }
  return false;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/*
Testfälle
- Zwei finals teilen tx_id -> nur best bleibt final, other demoted
- Prepass HARD wins vs subset-sum final
- Suggested never removes final
- many_to_many cannot be final (forced demote)
- Duplicate decisions removed
*/
