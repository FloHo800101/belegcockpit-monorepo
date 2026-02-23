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
import { resolveDocAmountMatch } from "./amount-candidates";
import { vendorCompatible } from "./vendor";
import { docPartyNormForTx, docPartyNorms } from "./doc-party";
import { txAmountForCurrency, txSupportsCurrency } from "./tx-amounts";

const HARD_IBAN = "HARD_IBAN_AMOUNT";
const HARD_INVOICE_NO = "HARD_INVOICE_NO";
const HARD_E2E = "HARD_E2E_AMOUNT";
const SOFT_AMOUNT_DATE = "SOFT_AMOUNT_DATE";
const SOFT_AMOUNT_VENDOR_OUT_OF_WINDOW = "SOFT_AMOUNT_VENDOR_OUT_OF_WINDOW";
const SOFT_INVOICE_NO_AMOUNT_OUT_OF_WINDOW = "SOFT_INVOICE_NO_AMOUNT_OUT_OF_WINDOW";
const LINE_ITEM_NET_MATCH = "LINE_ITEM_NET_MATCH";

export function matchOneToOne(
  rel: Extract<Relation, { kind: "one_to_one" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const { tx, doc } = rel;
  const txAmount = txAmountForCurrency(tx, doc.doc.currency);
  if (txAmount == null) return [];
  const amountMatch = resolveDocAmountMatch(doc.doc, txAmount, cfg);
  const hard = hardKey(doc.doc, tx, doc, cfg, amountMatch, txAmount);

  if (hard && !doc.features.partial_keywords && amountMatch) {
    const reason = hard === "IBAN" ? HARD_IBAN : hard === "INVOICE_NO" ? HARD_INVOICE_NO : HARD_E2E;
    const reasons = amountMatch.viaAmountCandidate ? [reason, LINE_ITEM_NET_MATCH] : [reason];
    return [
      buildDecision({
        state: "final",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: 1,
        reason_codes: reasons,
        inputs: buildInputs(
          doc.doc,
          tx,
          doc.features,
          hard,
          amountMatch.matchedAmount,
          amountMatch.viaAmountCandidate,
          txAmount
        ),
      }),
    ];
  }

  const amountOk = Boolean(amountMatch);
  const dateOk = dateMatches(doc.doc, tx, cfg);
  const vendorOk = vendorCompatible(docPartyNormForTx(doc.doc, tx), tx.vendor_norm);
  const invoiceNoOk = Boolean(doc.features.invoice_no_equal);
  const recurringLinkedDoc =
    doc.doc.link_state === "linked" &&
    isRecurringTx(tx) &&
    amountOk &&
    vendorOk;

  if (recurringLinkedDoc) {
    const reasons = ["SUBSCRIPTION_REUSE_LINKED_DOC"];
    if (amountMatch?.viaAmountCandidate) reasons.push(LINE_ITEM_NET_MATCH);
    return [
      buildDecision({
        state: "final",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: 0.96,
        reason_codes: reasons,
        inputs: buildInputs(
          doc.doc,
          tx,
          doc.features,
          hard ?? undefined,
          amountMatch?.matchedAmount,
          amountMatch?.viaAmountCandidate ?? false,
          txAmount
        ),
      }),
    ];
  }

  if (amountMatch?.viaAmountCandidate && dateOk && vendorOk && !doc.features.partial_keywords) {
    return [
      buildDecision({
        state: "final",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: 0.98,
        reason_codes: [LINE_ITEM_NET_MATCH],
        inputs: buildInputs(
          doc.doc,
          tx,
          doc.features,
          hard ?? undefined,
          amountMatch.matchedAmount,
          true,
          txAmount
        ),
      }),
    ];
  }

  if (amountOk && invoiceNoOk && !dateOk && !doc.features.partial_keywords) {
    const reasons = [SOFT_INVOICE_NO_AMOUNT_OUT_OF_WINDOW];
    if (amountMatch?.viaAmountCandidate) reasons.push(LINE_ITEM_NET_MATCH);
    return [
      buildDecision({
        state: "suggested",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: 0.8,
        reason_codes: reasons,
        inputs: buildInputs(
          doc.doc,
          tx,
          doc.features,
          hard ?? undefined,
          amountMatch?.matchedAmount,
          amountMatch?.viaAmountCandidate ?? false,
          txAmount
        ),
      }),
    ];
  }

  const score = scoreOneToOne(doc, tx, cfg);
  if (score >= cfg.scoring.minSuggestScore) {
    const reasons =
      amountOk && dateOk
        ? [SOFT_AMOUNT_DATE]
        : amountOk && vendorOk
          ? [SOFT_AMOUNT_VENDOR_OUT_OF_WINDOW]
          : ["SCORE_ONLY"];
    if (amountMatch?.viaAmountCandidate) reasons.push(LINE_ITEM_NET_MATCH);
    return [
      buildDecision({
        state: "suggested",
        relation_type: "one_to_one",
        tx_ids: [tx.id],
        doc_ids: [doc.doc.id],
        confidence: score,
        reason_codes: reasons,
        inputs: buildInputs(
          doc.doc,
          tx,
          doc.features,
          hard ?? undefined,
          amountMatch?.matchedAmount,
          amountMatch?.viaAmountCandidate ?? false,
          txAmount
        ),
      }),
    ];
  }

  return [];
}

export function matchManyToOne(
  rel: Extract<Relation, { kind: "many_to_one" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const { tx } = rel;
  const targetCurrency = rel.docs[0]?.doc.currency;
  if (!targetCurrency) return [];
  const txAmount = txAmountForCurrency(tx, targetCurrency);
  if (txAmount == null) return [];
  const docs = rel.docs.filter((cand) => cand.doc.currency === targetCurrency);
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

  const solutions = subsetSumDocsToAmount(docs, txAmount, cfg);
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
  const txs = rel.txs.filter((tx) => txSupportsCurrency(tx, doc.currency));
  if (txs.length === 0) return [];

  const targetAmount = resolveDocTargetAmount(doc);
  const txAmounts = txs
    .map((tx) => txAmountForCurrency(tx, doc.currency))
    .filter((amount): amount is number => amount != null);
  if (txAmounts.length !== txs.length) return [];
  const sum = txAmounts.reduce((acc, amount) => acc + amount, 0);
  const amountMatch = amountCompatible(sum, targetAmount, cfg)
    ? { matchedAmount: targetAmount, viaAmountCandidate: false }
    : resolveDocAmountMatch(doc, sum, cfg);
  const docIds = [doc.id];
  const txIds = txs.map((tx) => tx.id);
  const groupId = groupIdFor({ tx_ids: txIds, doc_ids: docIds });
  const batchHint = txs.some((tx) => hasBatchKeyword(tx, cfg));

  if (amountMatch && amountCompatible(amountMatch.matchedAmount, targetAmount, cfg)) {
    const state: MatchState = batchHint ? "suggested" : "final";
    const reasons = amountMatch.viaAmountCandidate
      ? ["PARTIAL_PAYMENT_SUM", LINE_ITEM_NET_MATCH]
      : ["PARTIAL_PAYMENT_SUM"];
    return [
      buildDecision({
        state,
        relation_type: "one_to_many",
        tx_ids: txIds,
        doc_ids: docIds,
        confidence: state === "final" ? 1 : 0.7,
        reason_codes: reasons,
        inputs: {
          sum,
          tx_count: txs.length,
          target_amount: targetAmount,
          matched_amount: amountMatch.matchedAmount,
          matched_via_amount_candidate: amountMatch.viaAmountCandidate,
        },
        match_group_id: groupId,
      }),
    ];
  }

  if (sum < targetAmount) {
    const open = targetAmount - sum;
    return [
      buildDecision({
        state: "partial",
        relation_type: "one_to_many",
        tx_ids: txIds,
        doc_ids: docIds,
        confidence: 0.9,
        reason_codes: ["PARTIAL_PAYMENT_SUM"],
        inputs: { sum, tx_count: txs.length, target_amount: targetAmount },
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
      inputs: { sum, tx_count: txs.length, target_amount: targetAmount },
      match_group_id: groupId,
    }),
  ];
}

function resolveDocTargetAmount(doc: Doc): number {
  if (typeof doc.open_amount === "number" && Number.isFinite(doc.open_amount) && doc.open_amount > 0) {
    return Math.abs(doc.open_amount);
  }
  return Math.abs(doc.amount);
}

export function matchManyToMany(
  rel: Extract<Relation, { kind: "many_to_many" }>,
  cfg: MatchingConfig
): MatchDecision[] {
  const txIds = rel.txs.map((tx) => tx.id);
  const docIds = rel.docs.map((doc) => doc.id);
  const groupId = groupIdFor({ tx_ids: txIds, doc_ids: docIds });
  const sumDocs = rel.docs.reduce((acc, doc) => acc + doc.amount, 0);
  const targetCurrency = rel.docs[0]?.currency ?? null;
  const singleCurrencyDocs =
    targetCurrency != null && rel.docs.every((doc) => doc.currency === targetCurrency);
  const txAmounts =
    singleCurrencyDocs && targetCurrency
      ? rel.txs
          .map((tx) => txAmountForCurrency(tx, targetCurrency))
          .filter((amount): amount is number => amount != null)
      : [];
  const sumTxs = txAmounts.reduce((acc, amount) => acc + amount, 0);
  const amountOk =
    singleCurrencyDocs && txAmounts.length === rel.txs.length
      ? amountCompatible(sumDocs, sumTxs, cfg)
      : false;
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
  const txAmount = txAmountForCurrency(tx, docCand.doc.currency);
  if (txAmount == null) return 0;
  let score = 0;
  if (resolveDocAmountMatch(docCand.doc, txAmount, cfg)) score += 0.5;
  if (docCand.features.days_delta <= cfg.dateWindowDays) score += 0.2;
  if (vendorCompatible(docPartyNormForTx(docCand.doc, tx), tx.vendor_norm)) {
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
  cfg?: MatchingConfig,
  amountMatch?: ReturnType<typeof resolveDocAmountMatch>,
  txAmount?: number
): "IBAN" | "INVOICE_NO" | "E2E" | null {
  const resolvedTxAmount =
    txAmount ?? txAmountForCurrency(tx, doc.currency) ?? null;
  const resolvedAmountMatch =
    cfg && resolvedTxAmount != null
      ? amountMatch ?? resolveDocAmountMatch(doc, resolvedTxAmount, cfg)
      : null;
  if (cfg && !resolvedAmountMatch) return null;
  if (!txSupportsCurrency(tx, doc.currency)) return null;

  if (docCand?.features.iban_equal) return "IBAN";
  if (docCand?.features.e2e_equal) return "E2E";

  const invoiceNoMatch = doc.invoice_no
    ? matchInvoiceNoInText(doc.invoice_no, tx.ref || tx.text_norm || "")
    : false;
  const dateOk = cfg ? dateMatches(doc, tx, cfg) : false;

  debugHardCheck(doc, tx, {
    amount_ok: cfg ? Boolean(resolvedAmountMatch) : null,
    matched_amount: resolvedAmountMatch?.matchedAmount ?? null,
    matched_via_amount_candidate: resolvedAmountMatch?.viaAmountCandidate ?? false,
    direction_ok: amountDirectionOk(doc, tx),
    date_ok: dateOk,
    invoice_no_ok: invoiceNoMatch,
  });

  if (invoiceNoMatch && dateOk) return "INVOICE_NO";

  if (!amountDirectionOk(doc, tx)) return null;

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
  hardKeyName?: string,
  matchedAmount?: number,
  matchedViaAmountCandidate?: boolean,
  txAmount?: number
) {
  return {
    hard_key: hardKeyName,
    doc_amount: doc.amount,
    matched_amount: matchedAmount ?? doc.amount,
    matched_via_amount_candidate: matchedViaAmountCandidate ?? false,
    tx_amount: txAmount ?? tx.amount,
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

function isRecurringTx(tx: Tx): boolean {
  if (tx.is_recurring_hint === true || tx.isRecurringHint === true) return true;
  const haystack = normalizeText(
    [tx.text_norm, tx.ref, tx.vendor_norm].filter(Boolean).join(" ")
  );
  return containsAny(haystack, [
    "abo",
    "subscription",
    "monthly",
    "monat",
    "membership",
    "jahrlich",
    "annual",
  ]);
}

function sharedVendorNorm(docs: Doc[], txs: Tx[]): boolean {
  if (docs.length === 0 || txs.length === 0) return false;
  for (const tx of txs) {
    if (!tx.vendor_norm) return false;
    const matchesAnyDoc = docs.some((doc) =>
      vendorCompatible(docPartyNormForTx(doc, tx), tx.vendor_norm)
    );
    if (!matchesAnyDoc) return false;
  }
  return true;
}

function hasPartialPaymentKeywords(docs: Doc[], txs: Tx[], cfg: MatchingConfig): boolean {
  const keywords = cfg.keywords?.partialPayment ?? ["teilzahlung", "rate", "anzahlung", "partial"];
  const haystack = [
    ...docs.map((doc) =>
      [doc.text_norm, ...docPartyNorms(doc)].filter(Boolean).join(" ")
    ),
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
