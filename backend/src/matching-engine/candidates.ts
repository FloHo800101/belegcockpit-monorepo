import { Doc, Tx, DocCandidate, FeatureVector } from "./types";
import { MatchingConfig, calcWindow, daysBetween } from "./config";
import { matchInvoiceNoInText, normalizeText } from "./normalize";
import { canonCompact, canonId } from "./ids";

const DEFAULT_KEYWORDS = {
  partialPayment: ["teilzahlung", "rate", "anzahlung", "partial"],
  batchPayment: ["sammel", "collective", "mehrere rechnungen", "batch"],
};

export function candidatesForTx(tx: Tx, docs: Doc[], cfg: MatchingConfig): DocCandidate[] {
  if (!tx.currency) return [];

  const tenantKey = normalizeTenantId(tx.tenant_id);
  const bookingDateValid = isValidISODate(tx.booking_date);

  return docs
    .filter((doc) => normalizeTenantId(doc.tenant_id) === tenantKey)
    .filter((doc) => isMatchableLinkState(doc.link_state))
    .filter((doc) => Boolean(doc.currency) && doc.currency === tx.currency)
    .filter((doc) => {
      if (!bookingDateValid) return true;
      const window = calcWindow(doc, cfg);
      return inDateWindow(tx.booking_date, window);
    })
    .map((doc) => ({
      doc,
      features: buildFeatureVector(doc, tx, cfg),
    }));
}

export function candidatesForDoc(doc: Doc, txs: Tx[], cfg: MatchingConfig): Tx[] {
  if (!doc.currency) return [];

  const tenantKey = normalizeTenantId(doc.tenant_id);
  const window = calcWindow(doc, cfg);

  return txs
    .filter((tx) => normalizeTenantId(tx.tenant_id) === tenantKey)
    .filter((tx) => isMatchableLinkState(tx.link_state))
    .filter((tx) => Boolean(tx.currency) && tx.currency === doc.currency)
    .filter((tx) => {
      if (!isValidISODate(tx.booking_date)) return true;
      return inDateWindow(tx.booking_date, window);
    });
}

export function buildFeatureVector(doc: Doc, tx: Tx, cfg: MatchingConfig): FeatureVector {
  const amountDelta = Math.abs(doc.amount - tx.amount);
  const anchor = doc.invoice_date ?? doc.due_date ?? null;
  const daysDelta = anchor && isValidISODate(anchor) && isValidISODate(tx.booking_date)
    ? Math.abs(daysBetween(tx.booking_date, anchor))
    : Number.POSITIVE_INFINITY;

  return {
    amount_delta: amountDelta,
    days_delta: daysDelta,
    iban_equal: ibanEqual(doc, tx),
    invoice_no_equal: invoiceNoEqual(doc, tx),
    e2e_equal: e2eEqual(doc, tx),
    partial_keywords: hasPartialKeywords(tx, doc, cfg),
  };
}

export function isMatchableLinkState(state: string): boolean {
  return state === "unlinked" || state === "suggested";
}

export function inDateWindow(
  bookingDateISO: string,
  window: { from: string; to: string }
): boolean {
  const date = new Date(bookingDateISO).getTime();
  const from = new Date(window.from).getTime();
  const to = new Date(window.to).getTime();
  return Number.isFinite(date) && date >= from && date <= to;
}

function hasPartialKeywords(tx: Tx, doc: Doc, cfg: MatchingConfig): boolean {
  const keywords = cfg.keywords ?? DEFAULT_KEYWORDS;
  const haystack = [
    safeLower(tx.text_norm),
    safeLower(tx.ref),
    safeLower(doc.text_norm),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    containsAny(haystack, keywords.partialPayment) ||
    containsAny(haystack, keywords.batchPayment)
  );
}

function ibanEqual(doc: Doc, tx: Tx): boolean {
  if (!doc.iban || !tx.iban) return false;
  return canonCompact(doc.iban) === canonCompact(tx.iban);
}

function invoiceNoEqual(doc: Doc, tx: Tx): boolean {
  if (!doc.invoice_no) return false;
  const haystack = safeStr(tx.ref) || safeStr(tx.text_norm);
  return matchInvoiceNoInText(doc.invoice_no, haystack);
}

function e2eEqual(doc: Doc, tx: Tx): boolean {
  if (!doc.e2e_id || !tx.e2e_id) return false;
  return canonId(doc.e2e_id) === canonId(tx.e2e_id);
}

function safeStr(s?: string | null): string {
  return s ?? "";
}

function safeLower(s?: string | null): string {
  return (s ?? "").toLowerCase();
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

function isValidISODate(s: string): boolean {
  return Number.isFinite(Date.parse(s));
}

function normalizeTenantId(value: string | null | undefined): string {
  if (!value) return "__unknown__";
  const trimmed = value.trim();
  return trimmed ? trimmed : "__unknown__";
}

/*
Testfälle
- due_date erweitert window: tx nach due_date aber innerhalb extend => bleibt Kandidat
- doc ohne dates => bleibt Kandidat (wide window)
- partial keyword in tx.ref => features.partial_keywords true
- linked/partial werden ausgeschlossen
*/
