import { MatchingConfig } from "../config.ts";
import { normalizeText } from "../normalize.ts";
import { NormalizedTx, normalizeTx } from "../normalization.ts";
import {
  NextAction,
  RematchHint,
  Severity,
  Tx,
  TxLifecycleKind,
  TxLifecycleResult,
} from "../types.ts";

type SubscriptionResult = {
  isSub: boolean;
  cadence?: "monthly" | "yearly" | "weekly";
  explanationCodes: string[];
};

export function evaluateTxLifecycle(
  tx: Tx,
  now: Date,
  cfg: MatchingConfig,
  history?: Tx[]
): TxLifecycleResult {
  const normalized = normalizeTx(tx);

  const technical = isTechnicalTx(normalized, cfg);
  if (technical.match) {
    return buildResult(normalized.id, "technical_tx", "info", "none", technical.codes);
  }

  if (isPrivateTx(normalized)) {
    return buildResult(normalized.id, "private_tx", "info", "ask_user", ["PRIVATE_HINT"]);
  }

  const fee = isFeeTx(normalized, cfg);
  if (fee.match) {
    return buildResult(normalized.id, "fee_tx", "info", "none", fee.codes);
  }

  const sub = isSubscriptionTx(normalized, cfg, history);
  if (sub.isSub) {
    return buildResult(
      normalized.id,
      "subscription_tx",
      "info",
      "none",
      sub.explanationCodes,
      undefined,
      buildSubscriptionRule(normalized, sub.cadence)
    );
  }

  const prepayment = isPrepaymentTx(normalized, cfg);
  if (prepayment.match) {
    return buildResult(
      normalized.id,
      "prepayment_tx",
      "info",
      "none",
      prepayment.codes,
      buildTxRematchHint(normalized, cfg)
    );
  }

  const eigenbeleg = needsEigenbeleg(normalized, cfg);
  if (eigenbeleg.match) {
    return buildResult(
      normalized.id,
      "needs_eigenbeleg",
      "action",
      "start_eigenbeleg_flow",
      eigenbeleg.codes,
      buildTxRematchHint(normalized, cfg)
    );
  }

  return buildResult(
    normalized.id,
    "missing_doc",
    "action",
    "inbox_task",
    ["FALLBACK_MISSING_DOC"],
    buildTxRematchHint(normalized, cfg)
  );
}

export function isTechnicalTx(
  tx: NormalizedTx,
  cfg: MatchingConfig
): { match: boolean; codes: string[] } {
  const haystack = buildHaystack(tx);
  const keywordMatch = containsAny(haystack, cfg.technicalKeywords);
  return {
    match: keywordMatch,
    codes: keywordMatch ? ["TECHNICAL_KEYWORD_MATCH"] : [],
  };
}

export function isPrivateTx(tx: NormalizedTx): boolean {
  return Boolean(tx.privateHint);
}

export function isFeeTx(
  tx: NormalizedTx,
  cfg: MatchingConfig
): { match: boolean; codes: string[] } {
  const haystack = buildHaystack(tx);
  const vendorKey = getVendorKey(tx);
  const vendorMatch =
    Boolean(vendorKey) && (cfg.feeVendorKeys ?? []).includes(vendorKey as string);
  const keywordMatch = containsAny(haystack, cfg.feeKeywords);
  const amountSmall =
    typeof cfg.feeAmountThreshold === "number"
      ? tx.amount <= cfg.feeAmountThreshold
      : false;

  const match = vendorMatch || (keywordMatch && amountSmall);
  if (!match) return { match: false, codes: [] };

  const codes: string[] = [];
  if (vendorMatch) codes.push("FEE_VENDOR_MATCH");
  if (keywordMatch) codes.push("FEE_KEYWORD_MATCH");
  if (amountSmall) codes.push("FEE_AMOUNT_SMALL");
  return { match: true, codes };
}

export function isPrepaymentTx(
  tx: NormalizedTx,
  cfg: MatchingConfig
): { match: boolean; codes: string[] } {
  const haystack = buildHaystack(tx);
  const keywordMatch = containsAny(haystack, cfg.prepaymentKeywords);
  return {
    match: keywordMatch,
    codes: keywordMatch ? ["PREPAYMENT_KEYWORD_MATCH"] : [],
  };
}

export function isSubscriptionTx(
  tx: NormalizedTx,
  cfg: MatchingConfig,
  history?: Tx[]
): SubscriptionResult {
  const haystack = buildHaystack(tx);
  const recurringHint = tx.isRecurringHint;
  const keywordMatch = containsAny(haystack, SUBSCRIPTION_KEYWORDS);

  if (!cfg.enableSubscriptionHistory || !history || history.length === 0) {
    if (recurringHint || keywordMatch) {
      return {
        isSub: true,
        cadence: keywordMatch ? cadenceFromKeywords(haystack) : undefined,
        explanationCodes: [
          recurringHint ? "SUBSCRIPTION_RECURRING_HINT" : "SUBSCRIPTION_KEYWORD_MATCH",
        ],
      };
    }
    return { isSub: false, explanationCodes: [] };
  }

  const currentDate = parseIsoDate(getTxDate(tx));
  if (!currentDate) {
    return { isSub: false, explanationCodes: [] };
  }

  const vendorKey = getVendorKey(tx);
  const lookbackDays = cfg.subscriptionDetection.lookbackDays;
  const cutoff = addDays(currentDate, -lookbackDays);
  const normalizedHistory = history.map(normalizeTx);
  const relevant = normalizedHistory.filter((item) => {
    const itemDate = parseIsoDate(getTxDate(item));
    if (!itemDate || itemDate < cutoff) return false;
    if (vendorKey) {
      return getVendorKey(item) === vendorKey;
    }
    return true;
  });

  const occurrences: NormalizedTx[] = [];
  const seen = new Set<string>();
  for (const item of [normalizeTx(tx), ...relevant]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    occurrences.push(item);
  }
  if (occurrences.length < cfg.subscriptionDetection.minOccurrences) {
    return { isSub: false, explanationCodes: [] };
  }

  const amounts = occurrences.map((item) => item.amount);
  const mean = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
  const maxDeltaPct =
    mean > 0
      ? Math.max(...amounts.map((value) => (Math.abs(value - mean) / mean) * 100))
      : 0;

  if (maxDeltaPct > cfg.subscriptionDetection.maxAmountVariancePct) {
    return { isSub: false, explanationCodes: [] };
  }

  const cadence = detectCadence(occurrences, cfg.subscriptionDetection.maxDayVariance);
  if (!cadence) {
    return { isSub: false, explanationCodes: [] };
  }

  return {
    isSub: true,
    cadence,
    explanationCodes: [
      "SUBSCRIPTION_MIN_OCCURRENCES",
      "SUBSCRIPTION_AMOUNT_VARIANCE",
      `SUBSCRIPTION_CADENCE_${cadence.toUpperCase()}`,
    ],
  };
}

export function needsEigenbeleg(
  tx: NormalizedTx,
  cfg: MatchingConfig
): { match: boolean; codes: string[] } {
  const haystack = buildHaystack(tx);
  const hasCardKeyword = containsAny(haystack, EIGENBELEG_KEYWORDS);
  const amountSmall =
    typeof cfg.eigenbelegAmountThreshold === "number"
      ? tx.amount <= cfg.eigenbelegAmountThreshold
      : false;
  const missingCounterparty = !getCounterpartyName(tx) && !tx.iban;

  const match =
    hasCardKeyword || (amountSmall && missingCounterparty) || (amountSmall && !tx.iban);
  if (!match) return { match: false, codes: [] };

  const codes: string[] = ["EIGENBELEG_HEURISTIC"];
  if (hasCardKeyword) codes.push("EIGENBELEG_KEYWORD_MATCH");
  if (amountSmall) codes.push("EIGENBELEG_AMOUNT_SMALL");
  if (missingCounterparty) codes.push("EIGENBELEG_UNKNOWN_COUNTERPARTY");
  return { match: true, codes };
}

export function buildTxRematchHint(tx: Tx, cfg: MatchingConfig): RematchHint | undefined {
  const anchor = getTxDate(normalizeTx(tx));
  if (!anchor) return undefined;
  const parsed = parseIsoDate(anchor);
  if (!parsed) return undefined;
  return {
    anchorDate: parsed.toISOString(),
    windowBeforeDays: cfg.txWindowBeforeDays,
    windowAfterDays: cfg.txWindowAfterDays,
  };
}

function buildResult(
  txId: string,
  kind: TxLifecycleKind,
  severity: Severity,
  nextAction: NextAction,
  explanationCodes: string[],
  rematchHint?: RematchHint,
  ruleSuggestion?: TxLifecycleResult["ruleSuggestion"]
): TxLifecycleResult {
  return { txId, kind, severity, nextAction, rematchHint, explanationCodes, ruleSuggestion };
}

function buildSubscriptionRule(
  tx: NormalizedTx,
  cadence: "monthly" | "yearly" | "weekly" | undefined
): TxLifecycleResult["ruleSuggestion"] {
  const key = getVendorKey(tx) || getCounterpartyName(tx) || "unknown";
  return { type: "subscription_rule", key, cadence };
}

function buildHaystack(tx: NormalizedTx): string {
  const parts = [
    getCounterpartyName(tx),
    getReference(tx),
    tx.text_raw,
    tx.vendor_raw,
    tx.vendor_norm,
  ].filter(Boolean);
  return normalizeText(parts.join(" "));
}

function getTxDate(tx: NormalizedTx): string | undefined {
  return tx.bookingDate ?? tx.valueDate;
}

function getReference(tx: NormalizedTx): string | undefined {
  return tx.reference ?? undefined;
}

function getCounterpartyName(tx: NormalizedTx): string | undefined {
  return tx.counterpartyName ?? tx.vendor_raw ?? undefined;
}

function getVendorKey(tx: NormalizedTx): string | undefined {
  return tx.vendorKey ?? tx.vendor_norm ?? undefined;
}

function containsAny(haystack: string, needles: readonly string[] | undefined): boolean {
  if (!haystack || !needles || needles.length === 0) return false;
  for (const needle of needles) {
    const normalized = normalizeText(needle);
    if (normalized && haystack.includes(normalized)) return true;
  }
  return false;
}

function parseIsoDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function detectCadence(
  items: NormalizedTx[],
  maxDayVariance: number
): "monthly" | "yearly" | "weekly" | undefined {
  const dates = items
    .map((item) => parseIsoDate(getTxDate(item)))
    .filter(Boolean)
    .map((date) => date as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 3) return undefined;

  const diffs = [];
  for (let i = 1; i < dates.length; i += 1) {
    const diff = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86400000);
    diffs.push(diff);
  }

  const avg = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  if (Math.abs(avg - 30) <= maxDayVariance) return "monthly";
  if (Math.abs(avg - 365) <= maxDayVariance) return "yearly";
  if (Math.abs(avg - 7) <= maxDayVariance) return "weekly";
  return undefined;
}

function cadenceFromKeywords(haystack: string): "monthly" | "yearly" | undefined {
  if (haystack.includes("annual") || haystack.includes("jahrlich") || haystack.includes("yearly")) {
    return "yearly";
  }
  if (haystack.includes("monthly") || haystack.includes("monat")) {
    return "monthly";
  }
  return undefined;
}

const SUBSCRIPTION_KEYWORDS = [
  "abo",
  "subscription",
  "mitglied",
  "membership",
  "monthly",
  "jahrlich",
  "annual",
  "renew",
];

const EIGENBELEG_KEYWORDS = [
  "pos",
  "karte",
  "kartenzahlung",
  "kreditkarte",
  "credit card",
  "debit card",
  "ec",
  "girocard",
  "barabhebung",
  "cash withdrawal",
  "atm",
];
