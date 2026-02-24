import {
  Doc,
  Tx,
  MatchDecision,
  MatchRelationType,
  MatchState,
  LinkState,
} from "./types.ts";
import { MatchingConfig, amountCompatible } from "./config.ts";
import { matchInvoiceNoInText, normalizeText } from "./normalize.ts";
import { canonId } from "./ids.ts";
import { docPartyNormForTx } from "./doc-party.ts";
import { txAmountForCurrency } from "./tx-amounts.ts";

export type PrepassResult = {
  final: MatchDecision[];
  remainingDocs: Doc[];
  remainingTx: Tx[];
};

const HARD_IBAN = "HARD_IBAN_AMOUNT";
const HARD_INVOICE_NO = "HARD_INVOICE_NO";
const HARD_E2E = "HARD_E2E_AMOUNT";
const HARD_AMOUNT_DATE_VENDOR = "HARD_AMOUNT_DATE_VENDOR";

export function prepassHardMatches(
  docs: Doc[],
  txs: Tx[],
  cfg: MatchingConfig
): PrepassResult {
  const matchableDocs = docs.filter((doc) => isMatchable(doc.link_state));
  const matchableTxs = txs.filter((tx) => isMatchable(tx.link_state));

  const candidates: Array<{ tx: Tx; doc: Doc; key: HardKeyType }> = [];

  for (const tx of matchableTxs) {
    const txCandidates = findHardCandidates(tx, matchableDocs, cfg);
    if (txCandidates.length === 1) {
      candidates.push({ tx, doc: txCandidates[0].doc, key: txCandidates[0].key });
    }
  }

  const finalPairs = filterUniquePairs(candidates);
  const final = finalPairs.map(({ tx, doc, key }) =>
    buildDecision(tx, doc, key, cfg)
  );

  const matchedDocIds = new Set(final.map((d) => d.doc_ids[0]));
  const matchedTxIds = new Set(final.map((d) => d.tx_ids[0]));

  return {
    final,
    remainingDocs: docs.filter((doc) => !matchedDocIds.has(doc.id)),
    remainingTx: txs.filter((tx) => !matchedTxIds.has(tx.id)),
  };
}

export function hardKeyType(
  doc: Doc,
  tx: Tx,
  cfg: MatchingConfig
): HardKeyType | null {
  const txAmount = txAmountForCurrency(tx, doc.currency);
  if (txAmount == null) return null;
  if (!amountCompatible(Math.abs(doc.amount), Math.abs(txAmount), cfg)) return null;

  const dateOk = dateMatches(doc, tx, cfg);
  const invoiceNoMatch = hasInvoiceMatch(doc, tx);
  const vendorOk = vendorMatchStrong(doc, tx);

  debugHardCheck(doc, tx, {
    currency_ok: currencyCompatible(doc.currency, tx),
    amount_ok: amountCompatible(Math.abs(doc.amount), Math.abs(txAmount), cfg),
    direction_ok: amountDirectionOk(doc, tx),
    date_ok: dateOk,
    invoice_no_ok: invoiceNoMatch,
    vendor_ok: vendorOk,
  });

  if (invoiceNoMatch && dateOk) return "INVOICE_NO";

  if (!amountDirectionOk(doc, tx)) return null;

  if (dateOk && vendorOk && !doc.invoice_no) {
    return "AMOUNT_DATE_VENDOR";
  }

  if (hasIbanMatch(doc, tx)) return "IBAN_AMOUNT";
  if (hasE2eMatch(doc, tx)) return "E2E_AMOUNT";

  return null;
}

export function hasPartialOrBatchPaymentHints(
  tx: Tx,
  doc?: Doc,
  cfg?: MatchingConfig
): boolean {
  if (cfg && cfg.prepass.blockOnPartialKeywords !== true) return false;

  const keywords = cfg?.keywords ?? DEFAULT_KEYWORDS;
  const haystack = [
    safeLower(tx.text_norm),
    safeLower(tx.ref),
    safeLower(tx.vendor_norm),
    safeLower(doc?.text_norm),
    safeLower(doc?.vendor_norm),
    safeLower(doc?.buyer_norm),
  ]
    .filter(Boolean)
    .join(" ");

  if (!haystack) return false;
  return (
    containsAny(haystack, keywords.partialPayment) ||
    containsAny(haystack, keywords.batchPayment)
  );
}

type HardKeyType = "IBAN_AMOUNT" | "INVOICE_NO" | "E2E_AMOUNT" | "AMOUNT_DATE_VENDOR";

function findHardCandidates(tx: Tx, docs: Doc[], cfg: MatchingConfig) {
  const matches: Array<{ doc: Doc; key: HardKeyType }> = [];
  for (const doc of docs) {
    const key = hardKeyType(doc, tx, cfg);
    if (!key) {
      // Special case: E2E equal but amount incompatible -> keep out of prepass.
      if (e2eEqual(doc, tx)) continue;
      continue;
    }
    if (hasPartialOrBatchPaymentHints(tx, doc, cfg)) continue;
    matches.push({ doc, key });
  }

  const uniqueDocs = new Map<string, { doc: Doc; key: HardKeyType }>();
  for (const match of matches) {
    if (!uniqueDocs.has(match.doc.id)) {
      uniqueDocs.set(match.doc.id, match);
    } else {
      // Multiple hard-keys for the same doc/tx -> ambiguous.
      uniqueDocs.delete(match.doc.id);
    }
  }

  return [...uniqueDocs.values()];
}

function filterUniquePairs(
  candidates: Array<{ tx: Tx; doc: Doc; key: HardKeyType }>
) {
  const byTx = new Map<string, { tx: Tx; doc: Doc; key: HardKeyType }>();
  const txCollisions = new Set<string>();

  for (const c of candidates) {
    if (byTx.has(c.tx.id)) {
      txCollisions.add(c.tx.id);
    } else {
      byTx.set(c.tx.id, c);
    }
  }

  for (const txId of txCollisions) {
    byTx.delete(txId);
  }

  const byDoc = new Map<string, { tx: Tx; doc: Doc; key: HardKeyType }>();
  const docCollisions = new Set<string>();
  for (const c of byTx.values()) {
    if (byDoc.has(c.doc.id)) {
      docCollisions.add(c.doc.id);
    } else {
      byDoc.set(c.doc.id, c);
    }
  }

  for (const docId of docCollisions) {
    byDoc.delete(docId);
  }

  return [...byDoc.values()];
}

function buildDecision(tx: Tx, doc: Doc, key: HardKeyType, cfg: MatchingConfig): MatchDecision {
  const txAmount = txAmountForCurrency(tx, doc.currency) ?? tx.amount;
  const reasonCodes = buildReasonCodes(doc, tx, cfg, key);
  const inputs: Record<string, any> = {
    key,
    doc_id: doc.id,
    tx_id: tx.id,
    doc_amount: doc.amount,
    tx_amount: txAmount,
    currency: doc.currency,
  };

  if (doc.iban && tx.iban) inputs.iban = doc.iban;
  if (doc.invoice_no) inputs.invoice_no = doc.invoice_no;
  if (doc.e2e_id && tx.e2e_id) inputs.e2e_id = doc.e2e_id;

  return {
    state: "final" as MatchState,
    relation_type: "one_to_one" as MatchRelationType,
    tx_ids: [tx.id],
    doc_ids: [doc.id],
    confidence: 1,
    reason_codes: reasonCodes,
    inputs,
    matched_by: "system",
  };
}

function buildReasonCodes(
  doc: Doc,
  tx: Tx,
  cfg: MatchingConfig,
  key: HardKeyType
): string[] {
  const dateOk = dateMatches(doc, tx, cfg);
  const invoiceNoMatch = hasInvoiceMatch(doc, tx);
  const vendorOk = vendorMatchStrong(doc, tx);
  const ibanOk = hasIbanMatch(doc, tx);
  const e2eOk = hasE2eMatch(doc, tx);

  const reasons: string[] = [];
  if (ibanOk) reasons.push(HARD_IBAN);
  if (invoiceNoMatch && dateOk) reasons.push(HARD_INVOICE_NO);
  if (dateOk && vendorOk && !doc.invoice_no) reasons.push(HARD_AMOUNT_DATE_VENDOR);
  if (e2eOk) reasons.push(HARD_E2E);

  if (reasons.length === 0) {
    if (key === "IBAN_AMOUNT") reasons.push(HARD_IBAN);
    else if (key === "INVOICE_NO") reasons.push(HARD_INVOICE_NO);
    else if (key === "AMOUNT_DATE_VENDOR") reasons.push(HARD_AMOUNT_DATE_VENDOR);
    else reasons.push(HARD_E2E);
  }

  return reasons;
}

function hasIbanMatch(doc: Doc, tx: Tx) {
  if (!doc.iban || !tx.iban) return false;
  return canonIban(doc.iban) === canonIban(tx.iban);
}

function hasInvoiceMatch(doc: Doc, tx: Tx) {
  if (!doc.invoice_no) return false;
  return matchInvoiceNoInText(doc.invoice_no, tx.ref || tx.text_norm || "");
}

function hasE2eMatch(doc: Doc, tx: Tx) {
  return e2eEqual(doc, tx);
}

function e2eEqual(doc: Doc, tx: Tx) {
  if (!doc.e2e_id || !tx.e2e_id) return false;
  return canonId(doc.e2e_id) === canonId(tx.e2e_id);
}

function isMatchable(state: LinkState): boolean {
  return state === "unlinked" || state === "suggested";
}

function currencyCompatible(docCurrency: string, tx: Tx): boolean {
  return txAmountForCurrency(tx, docCurrency) != null;
}

function canonIban(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function safeLower(value?: string | null) {
  return (value ?? "").toLowerCase();
}

function debugHardCheck(doc: Doc, tx: Tx, details: Record<string, unknown>) {
  if (process.env.MATCH_DEBUG_HARD !== "1") return;
  console.log("[prepass-hard-check]", {
    doc_id: doc.id,
    tx_id: tx.id,
    invoice_no: doc.invoice_no ?? null,
    ref: tx.ref ?? null,
    ...details,
  });
}

function amountDirectionOk(doc: Doc, tx: Tx) {
  if (doc.amount >= 0 && tx.direction !== "out") return false;
  if (doc.amount < 0 && tx.direction !== "in") return false;
  return true;
}

function dateMatches(doc: Doc, tx: Tx, cfg: MatchingConfig) {
  const booking = parseIsoDate(tx.booking_date);
  if (!booking) return false;
  const due = parseIsoDate(doc.due_date);
  if (due) {
    return withinDays(booking, due, cfg.graceDays);
  }
  const invoice = parseIsoDate(doc.invoice_date);
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

function vendorMatchStrong(doc: Doc, tx: Tx) {
  const docVendor = docPartyNormForTx(doc, tx);
  const docTokens = tokenize(docVendor);
  const txTokens = tokenize(tx.vendor_norm);
  if (!docTokens.length || !txTokens.length) return false;

  const overlap = countOverlap(docTokens, txTokens);
  if (overlap >= 2) return true;

  const docText = docVendor ?? "";
  const txText = tx.vendor_norm ?? "";
  if (!docText || !txText) return false;
  if (overlap >= 1 && (docTokens.length <= 2 || txTokens.length <= 2)) {
    return docText.includes(txText) || txText.includes(docText);
  }

  return false;
}

function tokenize(value?: string | null) {
  return (value ?? "").split(" ").filter(Boolean);
}

function countOverlap(a: string[], b: string[]) {
  const set = new Set(a);
  let count = 0;
  for (const token of b) {
    if (set.has(token)) count += 1;
  }
  return count;
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
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

const DEFAULT_KEYWORDS = {
  partialPayment: ["teilzahlung", "rate", "anzahlung", "partial"],
  batchPayment: ["sammel", "collective", "mehrere rechnungen", "batch"],
};

/*
Mini-Demo
- 1 tx + 1 doc IBAN+Amount => final
- 1 tx + 2 docs gleiche invoice_no => no final
- e2e equal aber amount nicht compatible => no final
*/
