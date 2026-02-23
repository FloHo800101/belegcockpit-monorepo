import {
  AzureParseResult,
  ParsedAddress,
  ParsedDocument,
  ParsedTransaction,
} from "./types.ts";
import { detectStatementDate, detectStatementPeriod } from "./document-type-detection.ts";

type AzureAddress = {
  streetAddress?: string;
  road?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  countryRegion?: string;
  country?: string;
};

type AzureValueCurrency = {
  amount?: number;
  currencyCode?: string;
};

type AzureField = {
  valueString?: string;
  content?: string;
  valueNumber?: number;
  valueCurrency?: AzureValueCurrency;
  valueDate?: string;
  valueArray?: Array<{ valueObject?: Record<string, AzureField> }>;
  valueObject?: Record<string, AzureField>;
  valueAddress?: AzureAddress;
};

type AzureDocument = {
  fields?: Record<string, AzureField>;
  confidence?: number;
};

type AzureAnalyzeResult = {
  documents?: AzureDocument[];
  content?: string;
  keyValuePairs?: unknown[];
  tables?: unknown[];
};

function toParsedAddress(address?: AzureAddress | null): ParsedAddress | null {
  if (!address) return null;
  const street =
    address.streetAddress ||
    [address.road, address.houseNumber].filter(Boolean).join(" ") ||
    null;
  return {
    street: street || null,
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    country: address.countryRegion ?? address.country ?? "DE",
  };
}

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const percent = Number(normalized);
  if (Number.isNaN(percent)) return null;
  return percent / 100;
}

function parseGermanDateText(value: string | null | undefined): string | null {
  return parseDateFlexible(value);
}

function normalizeOcrText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function parseDateFlexible(
  value: string | null | undefined,
  referenceYear?: number | null
): string | null {
  if (!value) return null;
  const text = normalizeOcrText(value);
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const numericMatch = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, "0");
    const month = numericMatch[2].padStart(2, "0");
    const year = numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3];
    return `${year}-${month}-${day}`;
  }

  const shortDateMatch = text.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (shortDateMatch) {
    const year = String(referenceYear ?? new Date().getUTCFullYear());
    const day = shortDateMatch[1].padStart(2, "0");
    const month = shortDateMatch[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const monthMap: Record<string, string> = {
    januar: "01",
    februar: "02",
    maerz: "03",
    märz: "03",
    april: "04",
    mai: "05",
    juni: "06",
    juli: "07",
    august: "08",
    september: "09",
    oktober: "10",
    november: "11",
    dezember: "12",
  };
  const monthMatch = text.match(/(\d{1,2})\.\s*([a-zäöü]+)\s*(\d{4})/i);
  if (!monthMatch) return null;
  const day = monthMatch[1].padStart(2, "0");
  const monthName = monthMatch[2].toLowerCase();
  const month = monthMap[monthName];
  if (!month) return null;
  return `${monthMatch[3]}-${month}-${day}`;
}

function parseAmount(value: string | null | undefined): number | null {
  return parseAmountFlexible(value);
}

function parseAmountFlexible(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = normalizeOcrText(value).replace(/\s/g, "");
  const match = text.match(/[-+]?\d[\d.,]*\d(?:[.,]\d{2})/);
  if (!match) return null;
  let numeric = match[0];
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot ? "," : lastDot > -1 ? "." : null;

  if (decimalSeparator === ",") {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (decimalSeparator === ".") {
    numeric = numeric.replace(/,/g, "");
  } else {
    numeric = numeric.replace(/[.,]/g, "");
  }

  const amount = Number(numeric);
  return Number.isNaN(amount) ? null : amount;
}

function parseLocalizedNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  let normalized = normalizeOcrText(value).replace(/\s/g, "");
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    const commaCount = (normalized.match(/,/g) ?? []).length;
    if (commaCount > 1) {
      const parts = normalized.split(",");
      const decimal = parts.pop() ?? "";
      normalized = `${parts.join("")}${decimal ? `.${decimal}` : ""}`;
    } else {
      normalized = normalized.replace(",", ".");
    }
  } else if (lastDot > -1) {
    const dotCount = (normalized.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      const parts = normalized.split(".");
      const decimal = parts.pop() ?? "";
      normalized = `${parts.join("")}${decimal ? `.${decimal}` : ""}`;
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

type ParsedFxInfo = {
  foreignAmount: number;
  foreignCurrency: string;
  exchangeRate: number;
};

type StatementFxHint = {
  foreignCurrency: string;
  exchangeRate: number;
};

function extractForeignCurrencyInfo(
  text: string | null | undefined,
  txAmount: number,
  txCurrency: string
): ParsedFxInfo | null {
  const normalizedText = normalizeOcrText(text).toUpperCase();
  const baseCurrency = normalizeOcrText(txCurrency).toUpperCase();
  if (!normalizedText || !baseCurrency) return null;

  const fxPattern = /([-+]?\d[\d., ]*)\s*([A-Z]{3})\s*=\s*([-+]?\d[\d., ]*)\s*([A-Z]{3})/g;
  let match: RegExpExecArray | null = null;

  while ((match = fxPattern.exec(normalizedText)) !== null) {
    const leftAmount = parseLocalizedNumber(match[1]);
    const rightAmount = parseLocalizedNumber(match[3]);
    const leftCurrency = match[2];
    const rightCurrency = match[4];
    if (leftAmount == null || rightAmount == null) continue;
    if (!Number.isFinite(leftAmount) || !Number.isFinite(rightAmount)) continue;
    if (leftAmount === 0 || rightAmount === 0) continue;
    if (leftCurrency === rightCurrency) continue;

    let foreignCurrency: string | null = null;
    let rate = Number.NaN;

    if (leftCurrency === baseCurrency && rightCurrency !== baseCurrency) {
      foreignCurrency = rightCurrency;
      rate = rightAmount / leftAmount;
    } else if (rightCurrency === baseCurrency && leftCurrency !== baseCurrency) {
      foreignCurrency = leftCurrency;
      rate = leftAmount / rightAmount;
    } else {
      continue;
    }

    if (!Number.isFinite(rate) || rate <= 0) continue;
    return {
      foreignAmount: roundCurrency(txAmount * rate),
      foreignCurrency,
      exchangeRate: rate,
    };
  }

  return null;
}

function inferStatementFxHint(content: string | null | undefined, baseCurrency: string): StatementFxHint | null {
  const normalizedText = normalizeOcrText(content).toUpperCase();
  const normalizedBaseCurrency = normalizeOcrText(baseCurrency).toUpperCase();
  if (!normalizedText || !normalizedBaseCurrency) return null;

  const fxPattern = /([-+]?\d[\d., ]*)\s*([A-Z]{3})\s*=\s*([-+]?\d[\d., ]*)\s*([A-Z]{3})/g;
  const counts = new Map<string, { count: number; hint: StatementFxHint }>();
  let match: RegExpExecArray | null = null;

  while ((match = fxPattern.exec(normalizedText)) !== null) {
    const leftAmount = parseLocalizedNumber(match[1]);
    const rightAmount = parseLocalizedNumber(match[3]);
    const leftCurrency = match[2];
    const rightCurrency = match[4];
    if (leftAmount == null || rightAmount == null) continue;
    if (!Number.isFinite(leftAmount) || !Number.isFinite(rightAmount)) continue;
    if (leftAmount === 0 || rightAmount === 0) continue;
    if (leftCurrency === rightCurrency) continue;

    let foreignCurrency: string | null = null;
    let exchangeRate = Number.NaN;
    if (leftCurrency === normalizedBaseCurrency && rightCurrency !== normalizedBaseCurrency) {
      foreignCurrency = rightCurrency;
      exchangeRate = rightAmount / leftAmount;
    } else if (rightCurrency === normalizedBaseCurrency && leftCurrency !== normalizedBaseCurrency) {
      foreignCurrency = leftCurrency;
      exchangeRate = leftAmount / rightAmount;
    } else {
      continue;
    }

    if (!foreignCurrency || !Number.isFinite(exchangeRate) || exchangeRate <= 0) continue;
    const key = `${foreignCurrency}|${exchangeRate.toFixed(12)}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        count: 1,
        hint: {
          foreignCurrency,
          exchangeRate,
        },
      });
    }
  }

  if (!counts.size) return null;

  let best: { count: number; hint: StatementFxHint } | null = null;
  for (const candidate of counts.values()) {
    if (!best || candidate.count > best.count) best = candidate;
  }
  return best?.hint ?? null;
}

function extractForeignCurrencyInfoFromHint(
  text: string | null | undefined,
  txAmount: number,
  txCurrency: string,
  hint: StatementFxHint | null | undefined
): ParsedFxInfo | null {
  if (!hint) return null;
  const normalizedText = normalizeOcrText(text).toUpperCase();
  const baseCurrency = normalizeOcrText(txCurrency).toUpperCase();
  if (!normalizedText || !baseCurrency) return null;
  if (!normalizedText.includes("=")) return null;

  const partialPattern = /=\s*([-+]?\d[\d., ]*)\s*([A-Z]{3})\b/;
  const match = normalizedText.match(partialPattern);
  if (!match) return null;

  const baseAmountInRate = parseLocalizedNumber(match[1]);
  const rateBaseCurrency = match[2];
  if (baseAmountInRate == null || !Number.isFinite(baseAmountInRate) || baseAmountInRate <= 0) return null;
  if (rateBaseCurrency !== baseCurrency) return null;
  if (Math.abs(baseAmountInRate - 1) > 0.05) return null;
  if (!Number.isFinite(hint.exchangeRate) || hint.exchangeRate <= 0) return null;
  if (!hint.foreignCurrency || hint.foreignCurrency === baseCurrency) return null;

  const inferredForeignAmount = txAmount * hint.exchangeRate;
  return {
    // Partial OCR lines like "= 1.00 EUR" are low-confidence; coarse rounding avoids pseudo precision.
    foreignAmount: Math.round(inferredForeignAmount * 10) / 10,
    foreignCurrency: hint.foreignCurrency,
    exchangeRate: hint.exchangeRate,
  };
}

function withForeignCurrencyInfo(
  tx: ParsedTransaction,
  statementFxHint: StatementFxHint | null | undefined,
  ...sources: Array<string | null | undefined>
): ParsedTransaction {
  const haystack = sources
    .map((value) => normalizeOcrText(value))
    .filter(Boolean)
    .join("\n");
  if (!haystack) return tx;

  const fx = extractForeignCurrencyInfo(haystack, tx.amount, tx.currency);
  const fallbackFx = fx ?? extractForeignCurrencyInfoFromHint(haystack, tx.amount, tx.currency, statementFxHint);
  if (!fallbackFx) return tx;

  return {
    ...tx,
    foreignAmount: fallbackFx.foreignAmount,
    foreignCurrency: fallbackFx.foreignCurrency,
    exchangeRate: fallbackFx.exchangeRate,
  };
}

function extractFirstLineValue(content: string, label: string): string | null {
  const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractIban(content: string): string | null {
  const match = content.match(
    /\b([A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{3,5}){2,8})\b/i
  );
  if (!match) return null;
  return match[1].replace(/[\s-]/g, "").toUpperCase();
}

function extractBic(content: string): string | null {
  const match = content.match(/(?:BIC|SWIFT)\s*[:\-]?\s*([A-Z0-9]{8,11})/i);
  if (match) return match[1];
  const fallback = content.match(/\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/);
  return fallback ? fallback[0] : null;
}

function extractCurrency(content: string): string | null {
  const normalized = normalizeOcrText(content).toUpperCase();
  if (/€/.test(content)) return "EUR";
  if (/\bEUR\b/.test(normalized)) return "EUR";
  if (/\bCHF\b/.test(normalized)) return "CHF";
  if (/\$/.test(content)) return "USD";
  if (/\bUSD\b/.test(normalized)) return "USD";
  return null;
}

function extractBalance(content: string, label: string): number | null {
  const lineValue = extractFirstLineValue(content, label);
  return parseAmount(lineValue);
}

function resolveReferenceYear(
  statementPeriod: { from: string; to: string } | null,
  statementDate: string | null
): number {
  if (statementPeriod?.to) {
    const year = Number(statementPeriod.to.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  if (statementDate) {
    const year = Number(statementDate.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  return new Date().getUTCFullYear();
}

function extractTransactions(
  content: string,
  currencyFallback: string,
  referenceYear: number,
  statementFxHint: StatementFxHint | null
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const match = line.match(
      /(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?).*?([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?:\s*([A-Z]{3}))?/
    );
    if (!match) continue;
    const bookingDate = parseDateFlexible(match[1], referenceYear);
    if (!bookingDate) continue;
    const amount = parseAmount(match[2]);
    if (amount == null) continue;
    const description = line
      .replace(match[1], "")
      .replace(match[2], "")
      .trim();
    const counterpartyName = extractCounterpartyName(description);
    const tx: ParsedTransaction = {
      bookingDate,
      valueDate: null,
      amount,
      currency: match[3] || currencyFallback,
      description,
      counterpartyName,
      bookingType: "unknown" as const,
    };
    transactions.push(withForeignCurrencyInfo(tx, statementFxHint, line, description));
  }

  return transactions;
}

function formatGermanDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function amountsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function isDateOnlyLine(line: string): boolean {
  return /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(line.trim());
}

function extractCounterpartyName(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(
    /^(lastschrift|gutschrift|ueberweisung|uberweisung|entgelt|zahlung|zahlg\.?|girosammel|girocard)\s+/i,
    ""
  );
  const normalized = cleaned.trim();
  return normalized ? normalized : null;
}

function findTransactionBlock(
  lines: string[],
  startIndex: number,
  dateText: string,
  amount: number
): { dateIndex: number; amountIndex: number } | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lines[i].includes(dateText)) continue;

    const maxLookahead = Math.min(lines.length, i + 7);
    for (let j = i; j < maxLookahead; j += 1) {
      const lineAmount = parseAmount(lines[j]);
      if (lineAmount == null) continue;
      if (amountsEqual(lineAmount, amount)) {
        return { dateIndex: i, amountIndex: j };
      }
    }
  }

  return null;
}

function buildTransactionContextWindow(
  lines: string[],
  startIndex: number,
  dateText: string
): string | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lines[i].includes(dateText)) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 6)).filter(Boolean);
    return window.length ? window.join("\n") : null;
  }

  return null;
}

function extractTransactionsFromItems(
  content: string,
  items: Array<{ valueObject?: Record<string, AzureField> }>,
  currencyFallback: string,
  referenceYear: number,
  statementFxHint: StatementFxHint | null
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  let cursor = 0;

  const blocks = items.map((item) => {
    const fields = item.valueObject || {};
    const dateIso =
      fields.Date?.valueDate ||
      parseDateFlexible(fields.Date?.valueString || fields.Date?.content, referenceYear);
    const amount =
      fields.Amount?.valueCurrency?.amount ??
      fields.Amount?.valueNumber ??
      parseAmount(fields.Amount?.valueString || fields.Amount?.content);

    if (!dateIso || amount == null) return null;
    const dateText = formatGermanDate(dateIso);
    if (!dateText) return null;

    const block = findTransactionBlock(lines, cursor, dateText, amount);
    const contextWindow = buildTransactionContextWindow(lines, cursor, dateText);
    if (block) {
      cursor = block.amountIndex + 1;
    }
    return { block, contextWindow, dateIso, amount, fields };
  });

  blocks.forEach((entry, index) => {
    if (!entry) return;
    const { block, contextWindow, dateIso, amount, fields } = entry;
    const currency = fields.Amount?.valueCurrency?.currencyCode || currencyFallback;
    const fallbackDescription =
      fields.Description?.valueString || fields.Description?.content || "";

    let description = fallbackDescription;
    let reference: string | null = null;
    let counterpartyName = extractCounterpartyName(description);

    if (block) {
      const { dateIndex, amountIndex } = block;
      const descriptionLines = lines
        .slice(dateIndex + 1, amountIndex)
        .filter((line) => line && !isDateOnlyLine(line));
      if (descriptionLines.length) {
        description = descriptionLines.join(" ");
        counterpartyName = extractCounterpartyName(description);
      }

      const nextBlock = blocks.slice(index + 1).find((candidate) => candidate?.block);
      const nextStart = nextBlock?.block?.dateIndex ?? lines.length;
      const referenceLines = lines
        .slice(amountIndex + 1, nextStart)
        .filter((line) => line && !isDateOnlyLine(line));
      if (referenceLines.length) {
        reference = referenceLines.join("\n");
      }
    }

    const tx: ParsedTransaction = {
      bookingDate: dateIso,
      valueDate: null,
      amount,
      currency,
      description,
      counterpartyName,
      reference,
      bookingType: "unknown" as const,
    };
    transactions.push(
      withForeignCurrencyInfo(
        tx,
        statementFxHint,
        description,
        reference,
        fallbackDescription,
        contextWindow
      )
    );
  });

  return transactions;
}

function isSectionHeader(line: string): boolean {
  return /^(belastung|gutschrift|abrechnungstag|transaktionen|eing[aä]nge|ausg[aä]nge)$/i.test(
    normalizeOcrText(line).toLowerCase()
  );
}

function extractTransactionsFromStatementLines(
  content: string,
  currencyFallback: string,
  referenceYear: number,
  statementFxHint: StatementFxHint | null
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);

  const dateStartPattern = /^(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/;
  const amountTailPattern =
    /([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?:\s*([A-Z]{3}))?\s*$/;
  const out: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const dateMatch = line.match(dateStartPattern);
    if (!dateMatch) continue;

    const amountMatch = line.match(amountTailPattern);
    if (!amountMatch) continue;

    const bookingDate = parseDateFlexible(dateMatch[1], referenceYear);
    const amount = parseAmountFlexible(amountMatch[1]);
    if (!bookingDate || amount == null) continue;

    const headless = line.slice(dateMatch[0].length);
    const amountToken = amountMatch[0];
    const amountPos = headless.lastIndexOf(amountToken);
    const firstDescription =
      amountPos >= 0 ? headless.slice(0, amountPos).trim() : headless.trim();
    const descLines = [firstDescription].filter(Boolean);

    for (let j = i + 1; j < lines.length; j += 1) {
      const nextLine = lines[j];
      if (dateStartPattern.test(nextLine)) break;
      if (isSectionHeader(nextLine)) continue;
      descLines.push(nextLine);
    }

    const description = descLines.join(" ").replace(/\s+/g, " ").trim();
    const counterpartyName = extractCounterpartyName(description);
    const tx: ParsedTransaction = {
      bookingDate,
      valueDate: null,
      amount,
      currency: amountMatch[2] || currencyFallback,
      description,
      counterpartyName,
      bookingType: "unknown" as const,
    };
    out.push(withForeignCurrencyInfo(tx, statementFxHint, description));
  }

  return out;
}

type BankTxSource = "items" | "lines";

type SourcedBankTx = {
  tx: ParsedTransaction;
  source: BankTxSource;
  index: number;
};

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeComparableText(value: string | null | undefined): string {
  const normalized = normalizeOcrText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeComparableText(value: string): string[] {
  return value.split(" ").filter((token) => token.length >= 3);
}

function amountValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sameDateAndAmount(left: ParsedTransaction, right: ParsedTransaction): boolean {
  const leftDate = normalizeDateOnly(left.bookingDate);
  const rightDate = normalizeDateOnly(right.bookingDate);
  if (!leftDate || !rightDate || leftDate !== rightDate) return false;

  const leftAmount = amountValue(left.amount);
  const rightAmount = amountValue(right.amount);
  if (leftAmount == null || rightAmount == null) return false;

  return amountsEqual(leftAmount, rightAmount);
}

function textSimilarityScore(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 4;
  if (left.includes(right) || right.includes(left)) return 3;

  const leftTokens = tokenizeComparableText(left);
  const rightTokens = tokenizeComparableText(right);
  if (!leftTokens.length || !rightTokens.length) return 0;

  const leftSet = new Set(leftTokens);
  let overlap = 0;
  for (const token of rightTokens) {
    if (leftSet.has(token)) overlap += 1;
  }

  if (overlap >= 3) return 2;
  if (overlap >= 1) return 1;
  return 0;
}

function chooseRicherText(
  preferred: string | null | undefined,
  alternative: string | null | undefined
): string | null {
  const first = cleanText(preferred);
  const second = cleanText(alternative);
  if (first && second) {
    const firstScore = normalizeComparableText(first).length;
    const secondScore = normalizeComparableText(second).length;
    return secondScore > firstScore ? second : first;
  }
  return first ?? second ?? null;
}

function mergeTransactionPair(primary: ParsedTransaction, secondary: ParsedTransaction): ParsedTransaction {
  const description = chooseRicherText(primary.description, secondary.description);
  const counterpartyName =
    chooseRicherText(primary.counterpartyName, secondary.counterpartyName) ??
    (description ? extractCounterpartyName(description) : null);
  const reference = chooseRicherText(primary.reference, secondary.reference);
  const amount = amountValue(primary.amount) ?? amountValue(secondary.amount) ?? 0;
  const foreignAmount = amountValue(primary.foreignAmount) ?? amountValue(secondary.foreignAmount);
  const foreignCurrency = cleanText(primary.foreignCurrency) ?? cleanText(secondary.foreignCurrency);
  const exchangeRate = amountValue(primary.exchangeRate) ?? amountValue(secondary.exchangeRate);

  return {
    bookingDate: primary.bookingDate ?? secondary.bookingDate ?? "",
    valueDate: primary.valueDate ?? secondary.valueDate ?? null,
    amount,
    currency: chooseRicherText(primary.currency, secondary.currency) ?? "EUR",
    foreignAmount,
    foreignCurrency,
    exchangeRate,
    description: description ?? "",
    counterpartyName,
    counterpartyIban: chooseRicherText(primary.counterpartyIban, secondary.counterpartyIban),
    counterpartyBic: chooseRicherText(primary.counterpartyBic, secondary.counterpartyBic),
    reference,
    endToEndId: chooseRicherText(primary.endToEndId, secondary.endToEndId),
    bookingType: primary.bookingType ?? secondary.bookingType ?? "unknown",
  };
}

function transactionSortDate(tx: ParsedTransaction): string {
  return normalizeDateOnly(tx.bookingDate) ?? "9999-12-31";
}

function mergeBankStatementTransactions(
  parsedFromItems: ParsedTransaction[],
  parsedFromLines: ParsedTransaction[]
): { transactions: ParsedTransaction[]; dedupMatchedCount: number } {
  const items: SourcedBankTx[] = parsedFromItems.map((tx, index) => ({
    tx,
    source: "items",
    index,
  }));
  const lines: SourcedBankTx[] = parsedFromLines.map((tx, index) => ({
    tx,
    source: "lines",
    index,
  }));

  const usedLineIndexes = new Set<number>();
  const merged: Array<{
    tx: ParsedTransaction;
    sourceRank: number;
    sourceIndex: number;
    sortDate: string;
  }> = [];
  let dedupMatchedCount = 0;

  for (const item of items) {
    const candidates = lines
      .filter((line) => !usedLineIndexes.has(line.index))
      .filter((line) => sameDateAndAmount(item.tx, line.tx))
      .map((line) => {
        const itemText = normalizeComparableText(item.tx.description ?? item.tx.counterpartyName ?? "");
        const lineText = normalizeComparableText(line.tx.description ?? line.tx.counterpartyName ?? "");
        const score = textSimilarityScore(itemText, lineText);
        return { line, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.line.index - b.line.index;
      });

    if (!candidates.length) {
      merged.push({
        tx: item.tx,
        sourceRank: 0,
        sourceIndex: item.index,
        sortDate: transactionSortDate(item.tx),
      });
      continue;
    }

    let selected: SourcedBankTx | null = null;
    if (candidates.length === 1) {
      selected = candidates[0].line;
    } else {
      const [best, second] = candidates;
      if (best.score > second.score) {
        selected = best.line;
      } else if (best.score >= 3) {
        selected = best.line;
      }
    }

    if (!selected) {
      merged.push({
        tx: item.tx,
        sourceRank: 0,
        sourceIndex: item.index,
        sortDate: transactionSortDate(item.tx),
      });
      continue;
    }

    usedLineIndexes.add(selected.index);
    dedupMatchedCount += 1;
    const combined = mergeTransactionPair(item.tx, selected.tx);
    merged.push({
      tx: combined,
      sourceRank: 0,
      sourceIndex: item.index,
      sortDate: transactionSortDate(combined),
    });
  }

  for (const line of lines) {
    if (usedLineIndexes.has(line.index)) continue;
    merged.push({
      tx: line.tx,
      sourceRank: 1,
      sourceIndex: line.index,
      sortDate: transactionSortDate(line.tx),
    });
  }

  merged.sort((a, b) => {
    if (a.sortDate !== b.sortDate) return a.sortDate.localeCompare(b.sortDate);
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    return a.sourceIndex - b.sourceIndex;
  });

  return { transactions: merged.map((entry) => entry.tx), dedupMatchedCount };
}

function extractBalanceByPatterns(content: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;
    const amount = parseAmountFlexible(match[1] ?? match[0]);
    if (amount != null) return amount;
  }
  return null;
}

function extractServiceDateText(content: string | null | undefined): string | null {
  if (!content) return null;
  const match = content.match(/Leistungsdatum:\s*([^\r\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractDateFromField(field?: AzureField | null): string | null {
  if (field?.valueDate) return field.valueDate;
  return parseDateFlexible(field?.valueString || field?.content || null);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabeledDate(
  content: string | null | undefined,
  labels: string[]
): string | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const labelRegex = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(labelRegex);
    if (!match?.[1]) continue;
    const parsed = parseDateFlexible(match[1]);
    if (parsed) return parsed;
  }
  return null;
}

function extractLabeledAmount(
  content: string | null | undefined,
  labels: string[]
): number | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const labelRegex = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(labelRegex);
    if (!match?.[1]) continue;
    const parsed = parseAmountFlexible(match[1]);
    if (parsed != null && Number.isFinite(parsed)) return Math.abs(parsed);
  }

  const lines = content.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const labelRegex = new RegExp(
        `^${escapeRegex(label).replace(/\s+/g, "\\s+")}(?:\\s*\\([^)]*\\))?\\s*[:\\-]?$`,
        "i"
      );
      if (!labelRegex.test(line)) continue;
      const direct = parseAmountFlexible(line);
      if (direct != null) return Math.abs(direct);
      for (let offset = 1; offset <= 3; offset += 1) {
        const next = lines[i + offset];
        if (!next) break;
        const parsed = parseAmountFlexible(next);
        if (parsed != null && Number.isFinite(parsed)) return Math.abs(parsed);
      }
    }
  }

  return null;
}

function extractRecurringContractAmount(content: string | null | undefined): number | null {
  if (!content) return null;
  const labels = [
    "Monatliche Gesamtrate",
    "Monatliche Leasingrate",
    "Leasingrate",
    "Monatsrate",
    "Monatliche Rate",
    "Ratenbetrag",
    "Einzugsbetrag",
    "Zu zahlender Betrag",
    "Rechnungsbetrag",
    "Gesamtbetrag",
  ];
  const labeled = extractLabeledAmount(content, labels);
  if (labeled != null) return labeled;

  const lines = content.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (/sonderzahlung|gesamtkilometer|leasingzeit/.test(lower)) continue;
    if (!/monatliche gesamtrate|monatliche leasingrate|monatsrate|ratenbetrag|monatliche rate/.test(lower)) {
      continue;
    }

    const direct = parseAmountFlexible(line);
    if (direct != null) return Math.abs(direct);

    for (let offset = 1; offset <= 3; offset += 1) {
      const next = lines[i + offset];
      if (!next) break;
      const parsed = parseAmountFlexible(next);
      if (parsed != null) return Math.abs(parsed);
      if (/^[a-z]/i.test(next) && !/\b(eur|usd|chf|€|\$)\b/i.test(next)) {
        break;
      }
    }
  }

  return null;
}

function extractInvoiceNumber(content: string | null | undefined): string | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  const labels = [
    "Rechnungsnummer",
    "Rechnung Nr",
    "Rechnungsnr",
    "Re-Nr",
    "Invoice number",
    "Invoice no",
    "Invoice #",
    "Invoice",
  ];

  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const regex = new RegExp(`${escapedLabel}\\s*[:#\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(regex);
    const candidate = normalizeInvoiceNumberCandidate(match?.[1] ?? null);
    if (candidate) return candidate;
  }

  const fallback = normalizedContent.match(/\b(?:RE|RG|INV)[-_ ]?\d{2,}[A-Z0-9/_-]*\b/i);
  return normalizeInvoiceNumberCandidate(fallback?.[0] ?? null);
}

function normalizeInvoiceNumberCandidate(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeOcrText(value);
  if (!cleaned) return null;
  const tokenMatch = cleaned.match(/[A-Z0-9][A-Z0-9/_-]{2,}/i);
  if (!tokenMatch) return null;
  const token = tokenMatch[0].replace(/^[-/_]+|[-/_]+$/g, "").toUpperCase();
  if (!token) return null;
  if (/^UST/i.test(token)) return null;
  if (/^(UID|VAT|TAX)$/i.test(token)) return null;
  if (/^[A-Z]{1,4}$/.test(token)) return null;
  if (/^(DE)?\d{9,}$/.test(token)) return null;
  return token;
}

function normalizePartyForCompare(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeOcrText(value)
    .toLowerCase()
    .replace(
      /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|ek|e\.k\.|ltd|llc|inc|sarl|sa)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function samePartyName(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePartyForCompare(left);
  const b = normalizePartyForCompare(right);
  return Boolean(a && b && a === b);
}

function cleanPartyName(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value.split(/\r?\n/).map((line) => normalizeOcrText(line))[0] ?? "";
  if (isLikelyMetadataLine(firstLine)) return null;
  let candidate = firstLine
    .replace(/^[\s:;,\-]+/, "")
    .replace(
      /^(rechnungsempf[aä]nger|rechnungsempfaenger|rechnungssteller|kunde|customer|bill\s*to|invoice\s*to|vendor|seller|supplier|empf[aä]nger)\s*[:\-]?\s*/i,
      ""
    )
    .replace(/\b(?:RE|RG|INV)[-_ ]?\d{2,}[A-Z0-9/_-]*\b.*$/i, "")
    .trim();
  candidate = candidate.replace(/\s+/g, " ");
  if (!candidate) return null;
  if (/^(?:nr|nnr|kundennr|rechnungsnr)\b/i.test(candidate)) return null;
  if (!/[A-Za-zÄÖÜäöü]/.test(candidate)) return null;
  return candidate;
}

function extractNameFromRecipientField(field?: AzureField | null): string | null {
  const raw = field?.valueString || field?.content || null;
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (const line of lines) {
    const candidate = cleanPartyName(line);
    if (candidate) return candidate;
  }
  return null;
}

function isLikelyAddressOrContactLine(value: string): boolean {
  const normalized = normalizeOcrText(value).toLowerCase();
  if (!normalized) return true;
  if (/@/.test(normalized)) return true;
  if (/https?:\/\//.test(normalized)) return true;
  if (/\b(?:www\.)?[a-z0-9.-]+\.(?:de|com|net|org|io)\b/.test(normalized)) return true;
  if (/\b\d{5}\b/.test(normalized)) return true;
  if (
    /\b(stra(?:ss|ß)e|str\.?|street|road|avenue|platz|pl\.?|weg|allee|house|haus)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  if (/\b(iban|bic|ust|steuernummer|vat|seite|page|kundennr|rechnungsnr)\b/.test(normalized)) {
    return true;
  }
  return false;
}

function isLikelyMetadataLine(value: string): boolean {
  const normalized = normalizeOcrText(value).toLowerCase();
  if (!normalized) return true;
  return /\b(rechnungsnr|rechnungnr|kundennr|kundenr|ust-?id|datum|leistungszeitraum|pos\.?|bezeichnung|menge|einheit|gesamtbetrag|zwischensumme|umsatzsteuer|zahlbar|vielen dank|seite)\b/.test(
    normalized
  );
}

function looksLikeCompanyLine(value: string): boolean {
  const normalized = normalizeOcrText(value);
  if (!normalized) return false;
  if (!/[A-Za-zÄÖÜäöü]/.test(normalized)) return false;
  if (isLikelyMetadataLine(normalized)) return false;
  if (
    /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|llc|inc|ltd|sarl|sa|b\.v\.|bv)\b/i.test(
      normalized
    )
  ) {
    return true;
  }
  return /^[A-Z0-9&.,'"\- ]{6,}$/.test(normalized);
}

function extractBuyerFromHeaderBlock(
  content: string | null | undefined,
  vendorName?: string | null
): string | null {
  if (!content) return null;
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  if (!lines.length) return null;

  const headingIndex = lines.findIndex((line) =>
    /^(rechnung|invoice|facture|factura)\b/i.test(line)
  );
  const stopIndex = headingIndex > 0 ? headingIndex : Math.min(lines.length, 24);
  const startIndex = Math.max(0, stopIndex - 16);
  const block = lines.slice(startIndex, stopIndex);

  for (let i = block.length - 1; i >= 0; i -= 1) {
    const line = block[i];
    if (isLikelyAddressOrContactLine(line)) continue;
    if (isLikelyMetadataLine(line)) continue;
    if (!looksLikeCompanyLine(line)) continue;
    const candidate = cleanPartyName(line);
    if (!candidate) continue;
    if (vendorName && samePartyName(candidate, vendorName)) continue;
    return candidate;
  }
  return null;
}

function extractLabeledParty(
  content: string | null | undefined,
  labels: string[]
): string | null {
  if (!content) return null;
  const normalized = normalizeOcrText(content);

  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const inlineRegex = new RegExp(
      `${escapedLabel}\\s*[:\\-]?\\s*(?:\\r?\\n\\s*)?([^\\r\\n]+)`,
      "i"
    );
    const inline = normalized.match(inlineRegex);
    const inlineCandidate = cleanPartyName(inline?.[1] ?? null);
    if (inlineCandidate) return inlineCandidate;
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const exactLabelRegex = new RegExp(
        `^${escapeRegex(label).replace(/\s+/g, "\\s+")}\\s*[:\\-]?$`,
        "i"
      );
      if (!exactLabelRegex.test(line)) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
        const candidate = cleanPartyName(lines[j]);
        if (candidate) return candidate;
      }
    }
  }

  return null;
}

function pickPrimaryParty(
  candidates: Array<string | null | undefined>,
  distinctFrom?: string | null
): string | null {
  const cleaned = candidates
    .map((candidate) => cleanPartyName(candidate ?? null))
    .filter(Boolean) as string[];
  if (!cleaned.length) return null;
  if (!distinctFrom) return cleaned[0];
  const distinct = cleaned.find((candidate) => !samePartyName(candidate, distinctFrom));
  return distinct ?? cleaned[0];
}

const BUYER_LABELS = [
  "Rechnungsempfänger",
  "Rechnungsempfaenger",
  "Leistungsempfänger",
  "Leistungsempfaenger",
  "Kunde",
  "Customer",
  "Bill To",
  "Invoice To",
  "Empfänger",
  "Empfaenger",
];

const VENDOR_LABELS = [
  "Rechnungssteller",
  "Leistungserbringer",
  "Lieferant",
  "Verkäufer",
  "Verkaeufer",
  "Vendor",
  "Seller",
  "Supplier",
];

function resolvePreferredDate(field?: AzureField | null): string | null {
  const textDate = parseDateFlexible(field?.valueString || field?.content || null);
  if (!field?.valueDate) return textDate;

  if (!textDate) return field.valueDate;

  const valueDate = parseDateFlexible(field.valueDate) ?? field.valueDate;
  const valueMs = Date.parse(valueDate);
  const textMs = Date.parse(textDate);
  const bothValid = Number.isFinite(valueMs) && Number.isFinite(textMs);
  const differsStrongly = bothValid ? Math.abs(valueMs - textMs) > 31 * 86400000 : false;

  if (differsStrongly) return textDate;
  return field.valueDate;
}

export function mapAzureInvoiceToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.[0]) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const doc = result.documents[0];
  const fields = doc.fields || {};
  const aliasFields = fields as Record<string, AzureField>;
  const confidence = doc.confidence || null;

  const getValue = (field?: AzureField | null) => field?.valueString || field?.content || null;
  const getNumber = (field?: AzureField | null) =>
    field?.valueNumber ?? field?.valueCurrency?.amount ?? null;
  const contentText = (result?.content ?? "").toString();

  const vendorAddressRecipient =
    getValue(fields.VendorAddressRecipient) ??
    getValue(aliasFields.SellerAddressRecipient) ??
    getValue(aliasFields.SupplierAddressRecipient);
  const customerAddressRecipient =
    getValue(fields.CustomerAddressRecipient) ??
    getValue(aliasFields.BuyerAddressRecipient) ??
    getValue(aliasFields.BillTo);
  const buyerFromHeader = extractBuyerFromHeaderBlock(
    contentText,
    getValue(fields.VendorName) ?? getValue(aliasFields.MerchantName)
  );

  const buyerCandidates = [
    getValue(fields.CustomerName),
    getValue(aliasFields.BuyerName),
    buyerFromHeader,
    customerAddressRecipient,
    extractNameFromRecipientField(fields.CustomerAddressRecipient),
    extractNameFromRecipientField(aliasFields.BuyerAddressRecipient),
    extractNameFromRecipientField(aliasFields.BillTo),
    extractLabeledParty(contentText, BUYER_LABELS),
  ];
  const vendorCandidates = [
    getValue(fields.VendorName),
    getValue(aliasFields.SellerName),
    getValue(aliasFields.SupplierName),
    getValue(aliasFields.MerchantName),
    vendorAddressRecipient,
    extractNameFromRecipientField(fields.VendorAddressRecipient),
    extractNameFromRecipientField(aliasFields.SellerAddressRecipient),
    extractNameFromRecipientField(aliasFields.SupplierAddressRecipient),
    extractLabeledParty(contentText, VENDOR_LABELS),
    getValue(fields.CustomerName),
  ];

  let buyerName = pickPrimaryParty(buyerCandidates);
  const vendorName = pickPrimaryParty(vendorCandidates, buyerName);
  if (buyerName && vendorName && samePartyName(buyerName, vendorName)) {
    const distinctBuyer = pickPrimaryParty(buyerCandidates, vendorName);
    if (distinctBuyer && !samePartyName(distinctBuyer, vendorName)) {
      buyerName = distinctBuyer;
    }
  }
  if (!buyerName) {
    buyerName = pickPrimaryParty(buyerCandidates, vendorName);
  }

  const vendorAddress = toParsedAddress(fields.VendorAddress?.valueAddress ?? null);
  const buyerAddress = toParsedAddress(fields.CustomerAddress?.valueAddress ?? null);
  const serviceDateField =
    fields.ServiceDate || fields.ServicePeriodStart || fields.ServicePeriodEnd || null;
  const serviceDateText = extractServiceDateText(contentText);
  const invoiceDate =
    resolvePreferredDate(fields.InvoiceDate) ||
    resolvePreferredDate(fields.TransactionDate) ||
    extractLabeledDate(contentText, [
      "Rechnungsdatum",
      "Ausgestellt am",
      "Invoice date",
      "Issued on",
      "Datum",
      "Date",
    ]) ||
    undefined;
  const dueDate =
    resolvePreferredDate(fields.DueDate) ||
    extractLabeledDate(contentText, ["Fällig am", "Faellig am", "Due date", "Payment due"]) ||
    null;
  const serviceDate =
    extractDateFromField(serviceDateField) ||
    parseGermanDateText(getValue(serviceDateField)) ||
    parseGermanDateText(serviceDateText) ||
    undefined;
  const totalNetFromFields =
    getNumber(fields.SubTotal) ?? getNumber((fields as Record<string, AzureField>).Subtotal);
  const totalGrossFromFields =
    getNumber(fields.InvoiceTotal) ?? getNumber((fields as Record<string, AzureField>).Total);
  const recurringContractAmountFallback =
    totalNetFromFields == null && totalGrossFromFields == null
      ? extractRecurringContractAmount(contentText)
      : null;

  const parsed: ParsedDocument = {
    sourceType: "invoice",
    documentType: "invoice",
    invoiceNumber:
      getValue(fields.InvoiceId) ??
      getValue((fields as Record<string, AzureField>).ReceiptId) ??
      extractInvoiceNumber(contentText) ??
      undefined,
    invoiceDate,
    dueDate,
    vendorName,
    vendorAddress,
    buyerName,
    buyerAddress,
    customerId: getValue(fields.CustomerId),
    vendorTaxId: getValue(fields.VendorTaxId),
    totalNet: totalNetFromFields ?? recurringContractAmountFallback,
    totalVat: getNumber(fields.TotalTax),
    totalGross: totalGrossFromFields ?? recurringContractAmountFallback,
    currency:
      extractCurrency(contentText) ||
      fields.InvoiceTotal?.valueCurrency?.currencyCode ||
      (fields as Record<string, AzureField>).Total?.valueCurrency?.currencyCode ||
      fields.SubTotal?.valueCurrency?.currencyCode ||
      (fields as Record<string, AzureField>).Subtotal?.valueCurrency?.currencyCode ||
      "EUR",
    serviceDate,
    lineItems: [],
    vatItems: [],
    rawMeta: {
      paymentDetails: fields.PaymentDetails?.valueArray ?? null,
      vendorAddressRecipient,
      customerAddressRecipient,
      serviceDateText,
    },
  };

  const items = fields.Items?.valueArray || [];
  parsed.lineItems = items.map((item) => {
    const itemFields = item.valueObject || {};
    const quantity = getNumber(itemFields.Quantity);
    const totalPrice =
      getNumber(itemFields.Amount) ??
      getNumber(itemFields.TotalPrice) ??
      getNumber(itemFields.LineTotal);
    let unitPrice = getNumber(itemFields.UnitPrice) ?? getNumber(itemFields.Price);
    if (!unitPrice && quantity && totalPrice) {
      unitPrice = totalPrice / quantity;
    }
    const itemTaxRate =
      getNumber(itemFields.TaxRate) ??
      parsePercent(getValue(itemFields.TaxRate)) ??
      null;
    const itemTaxAmount = getNumber(itemFields.Tax) ?? getNumber(itemFields.TaxAmount);
    const vatRate =
      itemTaxRate ??
      (itemTaxAmount != null && totalPrice ? itemTaxAmount / totalPrice : null);

    return {
      description: getValue(itemFields.Description) || "",
      quantity,
      unitPrice,
      totalPrice,
      vatRate,
    };
  });

  const taxDetails = fields.TaxDetails?.valueArray ?? [];
  parsed.vatItems = taxDetails
    .map((detail) => {
      const detailFields = detail.valueObject || {};
      const rate = parsePercent(getValue(detailFields.Rate));
      const amount = getNumber(detailFields.Amount);
      if (rate == null || amount == null) return null;
      const netAmount =
        getNumber(detailFields.NetAmount) ?? (rate > 0 ? amount / rate : amount);
      return { rate, amount, netAmount };
    })
    .filter(Boolean) as ParsedDocument["vatItems"];

  if ((parsed.vatItems?.length ?? 0) === 1) {
    const fallbackRate = parsed.vatItems?.[0]?.rate ?? null;
    if (fallbackRate != null) {
      parsed.lineItems = (parsed.lineItems ?? []).map((item) => ({
        ...item,
        vatRate: item.vatRate ?? fallbackRate,
      }));
    }
  }

  const installmentPlan = extractTaxInstallmentPlan(
    contentText,
    parsed.totalGross ?? parsed.totalNet ?? null
  );
  if (installmentPlan) {
    parsed.rawMeta = {
      ...(parsed.rawMeta ?? {}),
      paymentPlan: {
        type: "tax_installments",
        totalAmount: installmentPlan.totalAmount,
        installmentAmount: installmentPlan.installmentAmount,
        installmentsCount: installmentPlan.installmentsCount,
      },
    };

    if ((parsed.lineItems?.length ?? 0) === 0) {
      parsed.lineItems = buildInstallmentLineItems(installmentPlan);
    }

    if (!parsed.dueDate) {
      const latestDue = extractLatestInstallmentDueDate(contentText);
      if (latestDue) {
        parsed.dueDate = latestDue;
      }
    }
  }

  return { parsed, confidence, rawResponse: azureResult };
}

type InstallmentPlan = {
  totalAmount: number;
  installmentAmount: number;
  installmentsCount: number;
};

function extractTaxInstallmentPlan(
  content: string | null | undefined,
  invoiceTotal: number | null
): InstallmentPlan | null {
  const normalized = normalizeOcrText(content);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const hasTaxHint =
    lower.includes("gewerbesteuer") ||
    lower.includes("umsatzsteuer") ||
    lower.includes("finanzamt") ||
    lower.includes("steuervorauszahlung") ||
    lower.includes("vorauszahlung");
  if (!hasTaxHint) return null;

  const totalAmount = resolveTotalAmount(normalized, invoiceTotal) ?? null;
  if (totalAmount == null) return null;

  const installmentAmount =
    extractInstallmentAmount(normalized, totalAmount) ??
    extractRepeatedInstallmentAmount(normalized, totalAmount);
  if (installmentAmount == null) return null;
  if (totalAmount <= installmentAmount) return null;

  const derivedCount = Math.round(totalAmount / installmentAmount);
  if (!Number.isFinite(derivedCount) || derivedCount < 2 || derivedCount > 8) return null;
  if (Math.abs(totalAmount - installmentAmount * derivedCount) > 0.05) return null;

  return {
    totalAmount: roundCurrency(totalAmount),
    installmentAmount: roundCurrency(installmentAmount),
    installmentsCount: derivedCount,
  };
}

function extractInstallmentAmount(content: string, totalAmount: number): number | null {
  const regex =
    /(?:jeweils|vierteljaehrlich|vierteljährlich|vorauszahlung(?:en)?|teilbetrag|rate(?:n)?)(?:[^0-9]{0,30})(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  const candidates: number[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value == null || value <= 0) continue;
    const rounded = roundCurrency(value);
    if (rounded >= totalAmount) continue;
    candidates.push(rounded);
  }

  for (const candidate of candidates) {
    const derivedCount = Math.round(totalAmount / candidate);
    if (derivedCount < 2 || derivedCount > 8) continue;
    if (Math.abs(totalAmount - candidate * derivedCount) <= 0.05) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const hasAmountShape = Math.abs(candidate) >= 100 || Number.isInteger(candidate) === false;
    if (hasAmountShape) return candidate;
  }
  return null;
}

function extractRepeatedInstallmentAmount(content: string, totalAmount: number): number | null {
  const amountRegex = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/g;
  const counts = new Map<string, { amount: number; count: number }>();
  let match: RegExpExecArray | null = null;

  while ((match = amountRegex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const rounded = roundCurrency(value);
    if (rounded >= totalAmount) continue;
    const key = rounded.toFixed(2);
    const current = counts.get(key);
    if (!current) {
      counts.set(key, { amount: rounded, count: 1 });
    } else {
      current.count += 1;
    }
  }

  const sorted = [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.amount - a.amount;
  });

  for (const entry of sorted) {
    if (entry.count < 2) continue;
    const derivedCount = Math.round(totalAmount / entry.amount);
    if (derivedCount < 2 || derivedCount > 8) continue;
    if (Math.abs(totalAmount - entry.amount * derivedCount) > 0.05) continue;
    return entry.amount;
  }

  return null;
}

function resolveTotalAmount(content: string, invoiceTotal: number | null): number | null {
  if (invoiceTotal != null && Number.isFinite(invoiceTotal) && invoiceTotal > 0) {
    return roundCurrency(invoiceTotal);
  }
  const regex =
    /(?:gesamtbetrag|gesamt\s*festsetzung|festgesetzte\s*steuer|zu\s*zahlender\s*betrag)(?:[^0-9]{0,30})(\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
    const value = parseLocalizedNumber(match[1]);
    if (value != null && value > 0) return roundCurrency(value);
  }
  return null;
}

function buildInstallmentLineItems(plan: InstallmentPlan): ParsedDocument["lineItems"] {
  const rows: NonNullable<ParsedDocument["lineItems"]> = [];
  for (let i = 0; i < plan.installmentsCount; i += 1) {
    rows.push({
      description: `Steuervorauszahlung Rate ${i + 1}/${plan.installmentsCount}`,
      quantity: 1,
      unitPrice: plan.installmentAmount,
      totalPrice: plan.installmentAmount,
      vatRate: null,
    });
  }
  return rows;
}

function extractLatestInstallmentDueDate(content: string | null | undefined): string | null {
  const normalized = normalizeOcrText(content);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const anchorIdx = Math.max(
    lower.indexOf("fälligkeiten"),
    lower.indexOf("faelligkeiten"),
    lower.indexOf("terminen"),
    lower.indexOf("zahlung")
  );
  const scope =
    anchorIdx >= 0
      ? normalized.slice(anchorIdx, Math.min(normalized.length, anchorIdx + 600))
      : normalized;

  const dateRegex = /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g;
  const values: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = dateRegex.exec(scope)) !== null) {
    const iso = parseDateFlexible(match[1]);
    if (iso) values.push(iso);
  }
  if (!values.length) return null;

  values.sort();
  return values[values.length - 1] ?? null;
}

export function mapAzureReceiptToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.[0]) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const doc = result.documents[0];
  const fields = doc.fields || {};
  const confidence = doc.confidence || null;

  const getValue = (field?: AzureField | null) => field?.valueString || field?.content || null;
  const getNumber = (field?: AzureField | null) =>
    field?.valueNumber ?? field?.valueCurrency?.amount ?? null;
  const getDate = (field?: AzureField | null) => field?.valueDate || null;

  const parsed: ParsedDocument = {
    sourceType: "receipt",
    documentType: "receipt",
    invoiceDate: getDate(fields.TransactionDate) ?? undefined,
    vendorName: getValue(fields.MerchantName),
    totalNet: getNumber(fields.Subtotal),
    totalVat: getNumber(fields.TotalTax),
    totalGross: getNumber(fields.Total),
    currency: fields.Total?.valueCurrency?.currencyCode || "EUR",
    lineItems: [],
  };

  const items = fields.Items?.valueArray || [];
  parsed.lineItems = items.map((item) => {
    const itemFields = item.valueObject || {};
    return {
      description: getValue(itemFields.Description) || "",
      quantity: getNumber(itemFields.Quantity),
      unitPrice: getNumber(itemFields.Price),
      totalPrice: getNumber(itemFields.TotalPrice),
      vatRate: null,
    };
  });

  return { parsed, confidence, rawResponse: azureResult };
}

export function mapAzureLayoutToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const keyValuePairs = result.keyValuePairs || [];
  const tables = result.tables || [];

  const parsed: ParsedDocument = {
    sourceType: "layout",
    documentType: "unknown",
    rawMeta: { keyValuePairs, tables },
  };

  return { parsed, confidence: 0.5, rawResponse: azureResult };
}

export function mapAzureBankStatementToParseResult(
  azureResult: unknown,
  fileName?: string | null
): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const content = (result?.content ?? "").toString();
  const statementDate = detectStatementDate(content);
  const statementPeriod = detectStatementPeriod(content);
  const referenceYear = resolveReferenceYear(statementPeriod, statementDate);
  const currency = extractCurrency(content) ?? "EUR";
  const statementFxHint = inferStatementFxHint(content, currency);
  const items = result.documents?.[0]?.fields?.Items?.valueArray ?? [];
  const parsedFromItems = extractTransactionsFromItems(
    content,
    items,
    currency,
    referenceYear,
    statementFxHint
  );
  const parsedFromLines = extractTransactionsFromStatementLines(
    content,
    currency,
    referenceYear,
    statementFxHint
  );
  const parsedFromLegacy = extractTransactions(content, currency, referenceYear, statementFxHint);
  const merged = mergeBankStatementTransactions(parsedFromItems, parsedFromLines);
  const transactions =
    merged.transactions.length > 0
      ? merged.transactions
      : parsedFromLegacy;
  const extractionPipeline =
    parsedFromItems.length > 0 && parsedFromLines.length > 0
      ? "hybrid_merge"
      : parsedFromItems.length > 0
      ? "items"
      : parsedFromLines.length > 0
      ? "statement_lines"
      : parsedFromLegacy.length > 0
      ? "legacy_lines"
      : "none";

  const openingBalance =
    extractBalance(content, "Alter Saldo") ??
    extractBalance(content, "Anfangssaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))/i,
    ]);
  const closingBalance =
    extractBalance(content, "Neuer Saldo") ??
    extractBalance(content, "Endsaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?![\s\S]*kontostand am)/i,
    ]);

  const iban = extractIban(content);
  const bic = extractBic(content);
  const hasStrongMetadata =
    Boolean(iban || bic) &&
    Boolean(statementPeriod || statementDate || openingBalance != null || closingBalance != null);
  const isLikelyBankStatement = transactions.length > 0 || hasStrongMetadata;
  const confidence = Math.min(
    0.95,
    0.4 +
      Math.min(0.35, transactions.length * 0.02) +
      (hasStrongMetadata ? 0.15 : 0) +
      (statementPeriod ? 0.05 : 0)
  );

  const parsed: ParsedDocument = {
    sourceType: isLikelyBankStatement ? "bank_statement" : "unknown",
    documentType: isLikelyBankStatement ? "bank_statement" : "unknown",
    bankName: extractFirstLineValue(content, "Bank") ?? null,
    iban,
    bic,
    accountHolder:
      extractFirstLineValue(content, "Kontoinhaber") ??
      extractFirstLineValue(content, "Account Holder") ??
      null,
    currency,
    statementDate,
    statementPeriod,
    openingBalance,
    closingBalance,
    transactions,
    source: {
      fileName: fileName ?? undefined,
      extractedBy: "azure",
    },
    rawMeta: {
      contentLength: content.length,
      extractionPipeline,
      itemsCount: parsedFromItems.length,
      lineCount: parsedFromLines.length,
      mergedCount: transactions.length,
      dedupMatchedCount: merged.dedupMatchedCount,
      qualityGatePassed: isLikelyBankStatement,
    },
  };

  return { parsed, confidence, rawResponse: azureResult };
}
