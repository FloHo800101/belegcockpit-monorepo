export type MatchingConfig = {
  amountToleranceAbs: number;
  amountTolerancePct: number;
  dateWindowDays: number;
  dueDateExtendDays: number;
  graceDays: number;
  windowBeforeDueDays: number;
  windowAfterDueDays: number;
  windowBeforeInvoiceDays: number;
  windowAfterInvoiceDays: number;
  txWindowBeforeDays: number;
  txWindowAfterDays: number;
  feeKeywords: string[];
  technicalKeywords: string[];
  prepaymentKeywords: string[];
  partialKeywords?: string[];
  feeVendorKeys?: string[];
  feeAmountThreshold?: number;
  eigenbelegAmountThreshold?: number;
  enableSubscriptionHistory: boolean;
  subscriptionDetection: {
    minOccurrences: number;
    maxAmountVariancePct: number;
    maxDayVariance: number;
    lookbackDays: number;
  };
  minRequiredFields?: {
    requireAmount?: boolean;
    requireCurrency?: boolean;
    requireInvoiceDate?: boolean;
  };
  prepass: {
    requireUniqueness: true;
    blockOnPartialKeywords: true;
  };
  scoring: {
    minSuggestScore: number;
  };
  subsetSum: {
    maxCandidates: number;
    maxSolutions: number;
  };
  keywords?: {
    partialPayment: string[];
    batchPayment: string[];
  };
};

const DEFAULT_CONFIG: MatchingConfig = {
  amountToleranceAbs: 0.02,
  amountTolerancePct: 0.001,
  dateWindowDays: 30,
  dueDateExtendDays: 14,
  graceDays: 7,
  windowBeforeDueDays: 30,
  windowAfterDueDays: 90,
  windowBeforeInvoiceDays: 7,
  windowAfterInvoiceDays: 45,
  txWindowBeforeDays: 60,
  txWindowAfterDays: 120,
  feeKeywords: ["gebuehr", "entgelt", "fee", "commission", "charge", "kontofuehrung"],
  technicalKeywords: [
    "verification",
    "verifizierung",
    "preauth",
    "auth",
    "test",
    "penny",
    "microdeposit",
  ],
  prepaymentKeywords: ["vorkasse", "anzahlung", "deposit", "advance", "abschlag"],
  partialKeywords: ["teilzahlung", "rate", "partial"],
  feeVendorKeys: [],
  feeAmountThreshold: 10,
  eigenbelegAmountThreshold: 50,
  enableSubscriptionHistory: true,
  subscriptionDetection: {
    minOccurrences: 3,
    maxAmountVariancePct: 3,
    maxDayVariance: 5,
    lookbackDays: 365,
  },
  prepass: {
    requireUniqueness: true,
    blockOnPartialKeywords: true,
  },
  scoring: {
    minSuggestScore: 0.65,
  },
  subsetSum: {
    maxCandidates: 12,
    maxSolutions: 1,
  },
  keywords: {
    partialPayment: ["teilzahlung", "rate", "anzahlung", "partial"],
    batchPayment: ["sammel", "collective", "mehrere rechnungen", "batch"],
  },
};

export function resolveConfig(override?: Partial<MatchingConfig>): MatchingConfig {
  if (!override) return { ...DEFAULT_CONFIG };

  return {
    ...DEFAULT_CONFIG,
    ...override,
    prepass: { ...DEFAULT_CONFIG.prepass, ...(override.prepass ?? {}) },
    scoring: { ...DEFAULT_CONFIG.scoring, ...(override.scoring ?? {}) },
    subsetSum: { ...DEFAULT_CONFIG.subsetSum, ...(override.subsetSum ?? {}) },
    subscriptionDetection: {
      ...DEFAULT_CONFIG.subscriptionDetection,
      ...(override.subscriptionDetection ?? {}),
    },
    keywords: override.keywords
      ? { ...DEFAULT_CONFIG.keywords, ...override.keywords }
      : DEFAULT_CONFIG.keywords,
  };
}

// Compatible if |a-b| <= max(absTol, pctTol * max(|a|,|b|)).
export function amountCompatible(a: number, b: number, cfg: MatchingConfig): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const tol = Math.max(cfg.amountToleranceAbs, cfg.amountTolerancePct * Math.max(absA, absB));
  return Math.abs(a - b) <= tol;
}

export function calcWindow(
  doc: { invoice_date?: string; due_date?: string },
  cfg: MatchingConfig
): { from: string; to: string } {
  const invoiceDate = parseIsoDate(doc.invoice_date);
  const dueDate = parseIsoDate(doc.due_date);
  const anchor = invoiceDate ?? dueDate;

  if (!anchor) {
    return {
      from: "1970-01-01T00:00:00.000Z",
      to: "2999-12-31T00:00:00.000Z",
    };
  }

  const baseFrom = addDays(anchor, -cfg.dateWindowDays);
  const baseTo = addDays(anchor, cfg.dateWindowDays);
  const extendedTo = dueDate ? addDays(dueDate, cfg.dueDateExtendDays) : null;
  const to = extendedTo && extendedTo > baseTo ? extendedTo : baseTo;

  return { from: baseFrom.toISOString(), to: to.toISOString() };
}

export function isOverdue(
  doc: { due_date?: string },
  nowISO: string,
  cfg: MatchingConfig
): boolean {
  const dueDate = parseIsoDate(doc.due_date);
  const now = parseIsoDate(nowISO);
  if (!dueDate || !now) return false;

  const threshold = addDays(dueDate, cfg.graceDays);
  return now.getTime() > threshold.getTime();
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = parseIsoDate(aISO);
  const b = parseIsoDate(bISO);
  if (!a || !b) return Number.NaN;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
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

/*
Testfälle
- amountCompatible: 100 vs 100.01 -> true/false je nach amountToleranceAbs/amountTolerancePct
- calcWindow: invoice_date-only; due_date extends to; none -> wide window
- isOverdue: due_date + grace boundary
*/
