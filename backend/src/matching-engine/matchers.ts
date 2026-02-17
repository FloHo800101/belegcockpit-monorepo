import {
  Relation,
  MatchDecision,
  Doc,
  Tx,
  DocCandidate,
  FeatureVector,
  MatchState,
  MatchRelationType,
} from "./types";
import { MatchingConfig, amountCompatible } from "./config";
import { matchInvoiceNoInText, normalizeText } from "./normalize";
import { canonCompact } from "./ids";

const HARD_IBAN = "HARD_IBAN_AMOUNT";
const HARD_INVOICE_NO = "HARD_INVOICE_NO";
const HARD_E2E = "HARD_E2E_AMOUNT";
const SOFT_AMOUNT_DATE = "SOFT_AMOUNT_DATE";

export function matchOneToOne(
  rel: Extract<Relation, { kind: "one_to_one" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const { tx, doc } = rel;
  const hard = hardKey(doc.doc, tx, doc, cfg);

  if (hard && !doc.features.partial_keywords) {
    const reason = hard === "IBAN" ? HARD_IBAN : hard === "INVOICE_NO" ? HARD_INVOICE_NO : HARD_E2E;
    return [
      buildDecision({
        state: "final",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: 1,
        reason_codes: [reason],
        inputs: buildInputs(doc.doc, tx, doc.features, hard),
      }),
    ];
  }

  const amountOk = amountCompatible(Math.abs(doc.doc.amount), Math.abs(tx.amount), cfg);
  const dateOk = dateMatches(doc.doc, tx, cfg);

  const score = scoreOneToOne(doc, tx, cfg);
  if (score >= cfg.scoring.minSuggestScore) {
    return [
      buildDecision({
        state: "suggested",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: score,
        reason_codes: [amountOk && dateOk ? SOFT_AMOUNT_DATE : "SCORE_ONLY"],
        inputs: buildInputs(doc.doc, tx, doc.features, hard ?? undefined),
      }),
    ];
  }

  return [];
}

export function matchManyToOne(
  rel: Extract<Relation, { kind: "many_to_one" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const { tx, docs } = rel;
  if (docs.length < 2) return [];

  if (docs.length > cfg.subsetSum.maxCandidates) {
    return [
      buildDecision({
        state: "ambiguous",
        relation_type: "many_to_one",
        tx_ids: [tx.id],
        doc_ids: [],
        confidence: 0.5,
        reason_codes: ["AMBIGUOUS_MULTIPLE_SOLUTIONS"],
        inputs: { reason: "too_many_candidates", count: docs.length },
      }),
    ];
  }

  const solutions = subsetSumDocsToAmount(docs, tx.amount, cfg);
  if (solutions.length === 0) return [];

  if (solutions.length > 1) {
    return [
      buildDecision({
        state: "ambiguous",
        relation_type: "many_to_one",
        tx_ids: [tx.id],
        doc_ids: [],
        confidence: 0.5,
        reason_codes: ["AMBIGUOUS_MULTIPLE_SOLUTIONS"],
        inputs: {
          solutions: solutions.map((subset) => subset.map((d) => d.doc.id)),
          candidate_count: docs.length,
        },
      }),
    ];
  }

  const subset = solutions[0];
  const hasPartialHint = subset.some((d) => d.features.partial_keywords);
  const finalAllowed = !hasPartialHint;
  const docIds = subset.map((d) => d.doc.id);
  const groupId = groupIdFor({ tx_ids: [tx.id], doc_ids: docIds });

  if (finalAllowed) {
    return [
      buildDecision({
        state: "final",
        relation_type: "many_to_one",
        tx_ids: [tx.id],
        doc_ids: docIds,
        confidence: 1,
        reason_codes: ["SUBSET_SUM_EXACT"],
        inputs: { count: subset.length, sum: sumDocs(subset) },
        match_group_id: groupId,
      }),
    ];
  }

  return [
    buildDecision({
      state: "suggested",
      relation_type: "many_to_one",
      tx_ids: [tx.id],
      doc_ids: docIds,
      confidence: 0.8,
      reason_codes: ["SUBSET_SUM_EXACT"],
      inputs: { count: subset.length, sum: sumDocs(subset) },
      match_group_id: groupId,
    }),
  ];
}

export function matchOneToMany(
  rel: Extract<Relation, { kind: "one_to_many" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const { doc } = rel;
  const txs = rel.txs.filter((tx) => tx.currency === doc.currency);
  if (txs.length === 0) return [];

  const sum = txs.reduce((acc, tx) => acc + tx.amount, 0);
  const docIds = [doc.id];
  const txIds = txs.map((tx) => tx.id);
  const groupId = groupIdFor({ tx_ids: txIds, doc_ids: docIds });
  const batchHint = txs.some((tx) => hasBatchKeyword(tx, cfg));

  if (amountCompatible(sum, doc.amount, cfg)) {
    const state: MatchState = batchHint ? "suggested" : "final";
    return [
      buildDecision({
        state,
        relation_type: "one_to_many",
        tx_ids: txIds,
        doc_ids: docIds,
        confidence: state === "final" ? 1 : 0.7,
        reason_codes: ["PARTIAL_PAYMENT_SUM"],
        inputs: { sum, tx_count: txs.length },
        match_group_id: groupId,
      }),
    ];
  }

  if (sum < doc.amount) {
    const open = doc.amount - sum;
    return [
      buildDecision({
        state: "partial",
        relation_type: "one_to_many",
        tx_ids: txIds,
        doc_ids: docIds,
        confidence: 0.9,
        reason_codes: ["PARTIAL_PAYMENT_SUM"],
        inputs: { sum, tx_count: txs.length },
        match_group_id: groupId,
        open_amount_after: open,
      }),
    ];
  }

  return [
    buildDecision({
      state: "ambiguous",
      relation_type: "one_to_many",
      tx_ids: txIds,
      doc_ids: docIds,
      confidence: 0.5,
      reason_codes: ["AMBIGUOUS_MULTIPLE_SOLUTIONS"],
      inputs: { sum, tx_count: txs.length },
      match_group_id: groupId,
    }),
  ];
}

export function matchManyToMany(
  rel: Extract<Relation, { kind: "many_to_many" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const txIds = rel.txs.map((tx) => tx.id);
  const docIds = rel.docs.map((doc) => doc.id);
  const groupId = groupIdFor({ tx_ids: txIds, doc_ids: docIds });
  const sumDocs = rel.docs.reduce((acc, doc) => acc + doc.amount, 0);
  const sumTxs = rel.txs.reduce((acc, tx) => acc + tx.amount, 0);
  const amountOk = amountCompatible(sumDocs, sumTxs, cfg);
  const vendorOk = sharedVendorNorm(rel.docs, rel.txs);
  const partialHints = hasPartialPaymentKeywords(rel.docs, rel.txs, cfg);

  if (amountOk && vendorOk && !partialHints) {
    return [
      buildDecision({
        state: "final",
        relation_type: "many_to_many",
        tx_ids: txIds,
        doc_ids: docIds,
        confidence: 0.9,
        reason_codes: ["MANY_TO_MANY_EXACT"],
        inputs: { sumDocs, sumTxs, countDocs: docIds.length, countTxs: txIds.length },
        match_group_id: groupId,
      }),
    ];
  }

  return [
    buildDecision({
      state: "ambiguous",
      relation_type: "many_to_many",
      tx_ids: txIds,
      doc_ids: docIds,
      confidence: 0.4,
      reason_codes: ["CLUSTER_NN_WIZARD"],
      inputs: { hypothesis: rel.hypothesis, sizeTxs: txIds.length, sizeDocs: docIds.length },
      match_group_id: groupId,
    }),
  ];
}

export function scoreOneToOne(docCand: DocCandidate, tx: Tx, cfg: MatchingConfig): number {
  let score = 0;
  if (amountCompatible(docCand.doc.amount, tx.amount, cfg)) score += 0.5;
  if (docCand.features.days_delta <= cfg.dateWindowDays) score += 0.2;
  if (docCand.doc.vendor_norm && tx.vendor_norm && docCand.doc.vendor_norm === tx.vendor_norm) {
    score += 0.2;
  }
  if (docCand.features.iban_equal || docCand.features.invoice_no_equal || docCand.features.e2e_equal) {
    score += 0.1;
  }
  if (docCand.features.partial_keywords) score *= 0.7;
  return clamp(score, 0, 1);
}

export function subsetSumDocsToAmount(
  docs: DocCandidate[],
  target: number,
  cfg: MatchingConfig
): DocCandidate[][] {
  const sorted = [...docs].sort((a, b) => {
    const amountDiff = b.doc.amount - a.doc.amount;
    if (amountDiff !== 0) return amountDiff;
    return a.doc.id.localeCompare(b.doc.id);
  });

  const solutions: DocCandidate[][] = [];
  backtrack(sorted, 0, [], 0);
  return solutions;

  function backtrack(
    remaining: DocCandidate[],
    index: number,
    current: DocCandidate[],
    sum: number
  ) {
    if (solutions.length > cfg.subsetSum.maxSolutions) return;
    if (current.length >= 2 && amountCompatible(sum, target, cfg)) {
      solutions.push([...current]);
      return;
    }
    if (index >= remaining.length) return;

    const next = remaining[index];
    backtrack(remaining, index + 1, current, sum);
    backtrack(remaining, index + 1, [...current, next], sum + next.doc.amount);
  }
}

export function groupIdFor(seed: { tx_ids: string[]; doc_ids: string[] }): string {
  const txs = [...seed.tx_ids].sort();
  const docs = [...seed.doc_ids].sort();
  const input = `${txs.join(",")}|${docs.join(",")}`;
  const hash = fnv1a(input);
  return `grp_${hash.toString(16)}`;
}

export { canonCompact } from "./ids";

function amountDirectionOk(doc: Doc, tx: Tx) {
  if (doc.amount >= 0 && tx.direction !== "out") return false;
  if (doc.amount < 0 && tx.direction !== "in") return false;
  return true;
}

function dateMatches(doc: Doc, tx: Tx, cfg: MatchingConfig) {
  const booking = parseIsoDate(tx.booking_date);
  if (!booking) return false;
  const due = parseIsoDate(doc.due_date);
  const invoice = parseIsoDate(doc.invoice_date);
  if (due && invoice) {
    const min = invoice.getTime();
    const max = due.getTime();
    const bookingTime = booking.getTime();
    if (bookingTime >= Math.min(min, max) && bookingTime <= Math.max(min, max)) {
      return true;
    }
    return withinDays(booking, due, cfg.graceDays);
  }
  if (due) {
    return withinDays(booking, due, cfg.graceDays);
  }
  if (invoice) {
    return withinDays(booking, invoice, cfg.dateWindowDays);
  }
  return false;
}

function withinDays(a: Date, b: Date, days: number) {
  const diff = Math.abs(a.getTime() - b.getTime());
  return diff <= days * 86400000;
}

function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function debugHardCheck(
  doc: Doc,
  tx: Tx,
  details: Record<string, unknown>
) {
  if (process.env.MATCH_DEBUG_HARD !== "1") return;
  console.log("[hard-check]", {
    doc_id: doc.id,
    tx_id: tx.id,
    invoice_no: doc.invoice_no ?? null,
    ref: tx.ref ?? null,
    ...details,
  });
}

function hardKey(
  doc: Doc,
  tx: Tx,
  docCand?: DocCandidate,
  cfg?: MatchingConfig
): "IBAN" | "INVOICE_NO" | "E2E" | null {
  if (cfg && !amountCompatible(Math.abs(doc.amount), Math.abs(tx.amount), cfg)) return null;
  if (doc.currency !== tx.currency) return null;
  if (!amountDirectionOk(doc, tx)) return null;

  if (docCand?.features.iban_equal) return "IBAN";
  if (docCand?.features.e2e_equal) return "E2E";

  const invoiceNoMatch = doc.invoice_no
    ? matchInvoiceNoInText(doc.invoice_no, tx.ref || tx.text_norm || "")
    : false;
  const dateOk = cfg ? dateMatches(doc, tx, cfg) : false;

  debugHardCheck(doc, tx, {
    amount_ok: cfg ? amountCompatible(Math.abs(doc.amount), Math.abs(tx.amount), cfg) : null,
    direction_ok: amountDirectionOk(doc, tx),
    date_ok: dateOk,
    invoice_no_ok: invoiceNoMatch,
  });

  if (invoiceNoMatch && dateOk) return "INVOICE_NO";

  if (doc.iban && tx.iban && canonCompact(doc.iban) === canonCompact(tx.iban)) return "IBAN";
  if (doc.e2e_id && tx.e2e_id && canonCompact(doc.e2e_id) === canonCompact(tx.e2e_id)) return "E2E";

  return null;
}

function buildDecision(input: {
  state: MatchState;
  relation_type: MatchRelationType;
  tx_ids: string[];
  doc_ids: string[];
  confidence: number;
  reason_codes: string[];
  inputs: Record<string, any>;
  match_group_id?: string;
  open_amount_after?: number | null;
}): MatchDecision {
  return {
    ...input,
    matched_by: "system",
  };
}

function buildInputs(
  doc: Doc,
  tx: Tx,
  features: FeatureVector,
  hardKeyName?: string
) {
  return {
    hard_key: hardKeyName,
    doc_amount: doc.amount,
    tx_amount: tx.amount,
    currency: doc.currency,
    amount_delta: features.amount_delta,
    days_delta: features.days_delta,
  };
}

function sumDocs(docs: DocCandidate[]) {
  return docs.reduce((acc, d) => acc + d.doc.amount, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasBatchKeyword(tx: Tx, cfg: MatchingConfig) {
  const keywords = cfg.keywords ?? DEFAULT_KEYWORDS;
  const haystack = [tx.text_norm, tx.ref, tx.vendor_norm].filter(Boolean).join(" ").toLowerCase();
  return containsAny(haystack, keywords.batchPayment);
}

function containsAny(haystack: string, needles: readonly string[]) {
  if (!haystack) return false;
  const normalized = normalizeText(haystack);
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  for (const needle of needles) {
    const normalizedNeedle = normalizeText(needle);
    if (!normalizedNeedle) continue;
    if (padded.includes(` ${normalizedNeedle} `)) return true;
  }
  return false;
}

function sharedVendorNorm(docs: Doc[], txs: Tx[]): boolean {
  const values = [
    ...docs.map((doc) => doc.vendor_norm).filter(Boolean),
    ...txs.map((tx) => tx.vendor_norm).filter(Boolean),
  ] as string[];
  if (values.length === 0) return false;
  const first = values[0];
  return values.every((value) => value === first);
}

function hasPartialPaymentKeywords(docs: Doc[], txs: Tx[], cfg: MatchingConfig): boolean {
  const keywords = cfg.keywords?.partialPayment ?? ["teilzahlung", "rate", "anzahlung", "partial"];
  const haystack = [
    ...docs.map((doc) => [doc.text_norm, doc.vendor_norm].filter(Boolean).join(" ")),
    ...txs.map((tx) => [tx.text_norm, tx.ref, tx.vendor_norm].filter(Boolean).join(" ")),
  ]
    .filter(Boolean)
    .join(" ");
  return containsAny(haystack, keywords);
}

function fnv1a(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

const DEFAULT_KEYWORDS = {
  partialPayment: ["teilzahlung", "rate", "anzahlung", "partial"],
  batchPayment: ["sammel", "collective", "mehrere rechnungen", "batch"],
};

/*
Testfälle
- 1:1 hard iban => final
- 1:1 no hard, score above threshold => suggested
- n:1 docs sum uniquely => final (wenn keine keywords)
- n:1 multiple solutions => ambiguous
- 1:n single tx smaller => partial with open_amount_after
- n:n => ambiguous only
*/
