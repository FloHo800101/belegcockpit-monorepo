// Transaktions-Extraktion und Merge-Logik für Kontoauszüge

import { ParsedTransaction } from "../types.ts";
import {
  normalizeOcrText,
  parseDateFlexible,
  parseAmount,
  parseAmountFlexible,
  normalizeDateOnly,
  normalizeComparableText,
  tokenizeComparableText,
  cleanText,
  amountsEqual,
  amountsEqualIgnoringSign,
  amountValue,
  extractIbanFromLine,
} from "./parse-utils.ts";
import type { AzureField } from "./azure-field-helpers.ts";
import { StatementFxHint, withForeignCurrencyInfo } from "./bank-statement-fx.ts";

export function extractCounterpartyName(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(
    /^(lastschrift|gutschrift|ueberweisung|uberweisung|entgelt|zahlung|zahlg\.?|girosammel|girocard)\s+/i,
    ""
  );
  const normalized = cleaned.trim();
  return normalized ? normalized : null;
}

// --- Booking type classification ---

const BOOKING_TYPE_MAP: Array<[RegExp, ParsedTransaction["bookingType"]]> = [
  [/FOLGELASTSCHRIFT|ERSTLASTSCHRIFT|LASTSCHRIFT/i, "direct_debit"],
  [/ONLINE-UEBERWEISUNG|UEBERWEISUNG|DAUERAUFTRAG/i, "transfer"],
  [/GUTSCHRIFT|EINZAHLUNG/i, "transfer"],
  [/ENTGELTABSCHLUSS|ABSCHLUSS/i, "fee"],
  [/ZINSEN|ZINSABSCHLUSS/i, "interest"],
  [/KARTENZAHLUNG|GIROCARD/i, "card_payment"],
];

const FEE_TYPES = /^(ENTGELTABSCHLUSS|ABSCHLUSS)$/i;

export function classifyBookingType(description: string): ParsedTransaction["bookingType"] {
  const upper = normalizeOcrText(description).toUpperCase();
  for (const [pattern, type] of BOOKING_TYPE_MAP) {
    if (pattern.test(upper)) return type;
  }
  return "unknown";
}

// --- Reference block parsing ---

export interface ParsedReferenceBlock {
  counterpartyName: string | null;
  counterpartyIban: string | null;
  counterpartyBic: string | null;
  valueDate: string | null;
  endToEndId: string | null;
  creditorId: string | null;
  mandateRef: string | null;
  cleanReference: string | null;
}

const BIC_IBAN_LINE = /^([A-Z]{6}[A-Z0-9]{2,5})\s*\/\s*([A-Z]{2}\d{2}[A-Z0-9]{11,30})$/i;
const STRUCTURED_FIELD = /^(EREF|MREF|CRED|KREF|SVWZ|IBAN|BIC)\s*:\s*/i;
const VALUE_DATE_PAREN = /\((\d{1,2}[./]\d{1,2}[./]?\d{0,4})\)/;

function isNoiseLine(line: string): boolean {
  const n = normalizeOcrText(line);
  if (!n) return true;
  // Table headers
  if (/^(Datum|Verwendungszweck|Betrag|Wert|Buchungstag|Buchungstext)\b/i.test(n)) return true;
  // Balance lines
  if (/^(Endsaldo|Anfangssaldo|Alter Saldo|Neuer Saldo|Kontostand)\b/i.test(n)) return true;
  // Page numbers (standalone digit)
  if (/^\d{1,2}$/.test(n)) return true;
  // Standalone amounts
  if (/^[+-]?\s?\d[\d., ]*\d(?:[.,]\d{2})?$/.test(n)) return true;
  // Value date in parens only
  if (/^\(\d{1,2}[./]\d{1,2}[./]?\d{0,4}\)$/.test(n)) return true;
  return false;
}

export function parseReferenceBlock(
  rawLines: string[],
  referenceYear: number
): ParsedReferenceBlock {
  const result: ParsedReferenceBlock = {
    counterpartyName: null,
    counterpartyIban: null,
    counterpartyBic: null,
    valueDate: null,
    endToEndId: null,
    creditorId: null,
    mandateRef: null,
    cleanReference: null,
  };

  const cleanLines: string[] = [];
  let foundBicIban = false;
  let counterpartyNameCandidatePending = false;

  for (const raw of rawLines) {
    const line = normalizeOcrText(raw);
    if (!line) continue;

    // Extract value date from parentheses
    if (!result.valueDate) {
      const vdMatch = line.match(VALUE_DATE_PAREN);
      if (vdMatch) {
        result.valueDate = parseDateFlexible(vdMatch[1], referenceYear);
        // If line is ONLY the value date, skip it
        if (/^\(\d{1,2}[./]\d{1,2}[./]?\d{0,4}\)$/.test(line)) continue;
      }
    }

    // BIC / IBAN line
    const bicIbanMatch = line.match(BIC_IBAN_LINE);
    if (bicIbanMatch) {
      result.counterpartyBic = bicIbanMatch[1].toUpperCase();
      const iban = extractIbanFromLine(bicIbanMatch[2]);
      result.counterpartyIban = iban ?? bicIbanMatch[2].toUpperCase();
      foundBicIban = true;
      counterpartyNameCandidatePending = true;
      continue;
    }

    // Structured fields (EREF, MREF, CRED, etc.)
    const structMatch = line.match(STRUCTURED_FIELD);
    if (structMatch) {
      const key = structMatch[1].toUpperCase();
      const val = line.slice(structMatch[0].length).trim();
      if (key === "EREF" && val) result.endToEndId = val;
      else if (key === "CRED" && val) result.creditorId = val;
      else if (key === "MREF" && val) result.mandateRef = val;
      counterpartyNameCandidatePending = false;
      cleanLines.push(val || line);
      continue;
    }

    // Noise filter
    if (isNoiseLine(line)) continue;

    // Counterparty name: first unstructured line after BIC/IBAN
    if (counterpartyNameCandidatePending && !result.counterpartyName) {
      result.counterpartyName = line;
      counterpartyNameCandidatePending = false;
      cleanLines.push(line);
      continue;
    }

    // If no BIC/IBAN seen yet but we have an account-number-like line (digits / digits),
    // try to pick counterparty from next meaningful line
    if (!foundBicIban && !result.counterpartyName && /^\d+\s*\/\s*\d+$/.test(line)) {
      counterpartyNameCandidatePending = true;
      cleanLines.push(line);
      continue;
    }

    cleanLines.push(line);
  }

  // Build clean reference from remaining lines
  const refText = cleanLines.filter(Boolean).join("\n").trim();
  result.cleanReference = refText || null;

  return result;
}

export function isSectionHeader(line: string): boolean {
  return /^(belastung|gutschrift|abrechnungstag|transaktionen|eing[aä]nge|ausg[aä]nge)$/i.test(
    normalizeOcrText(line).toLowerCase()
  );
}

export function isDateOnlyLine(line: string): boolean {
  return /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(line.trim());
}

export function extractDateTokens(line: string): string[] {
  return line.match(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g) ?? [];
}

export function lineContainsDate(
  line: string,
  targetIsoDate: string,
  referenceYear: number
): boolean {
  const normalizedTarget = normalizeDateOnly(targetIsoDate);
  if (!normalizedTarget) return false;

  const tokens = extractDateTokens(line);
  for (const token of tokens) {
    const parsed = parseDateFlexible(token, referenceYear);
    const normalized = normalizeDateOnly(parsed);
    if (normalized && normalized === normalizedTarget) return true;
  }

  return false;
}

export function lineStartsWithDate(
  line: string,
  targetIsoDate: string,
  referenceYear: number
): boolean {
  const dateStartMatch = line.match(/^(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/);
  if (!dateStartMatch) return false;
  const parsed = parseDateFlexible(dateStartMatch[1], referenceYear);
  const normalizedParsed = normalizeDateOnly(parsed);
  const normalizedTarget = normalizeDateOnly(targetIsoDate);
  return Boolean(normalizedParsed && normalizedTarget && normalizedParsed === normalizedTarget);
}

export function extractTransactions(
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

export function findTransactionBlock(
  lines: string[],
  startIndex: number,
  dateIso: string,
  amount: number,
  referenceYear: number
): { dateIndex: number; amountIndex: number; amountMatched: boolean } | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lineStartsWithDate(lines[i], dateIso, referenceYear)) continue;

    const maxLookahead = Math.min(lines.length, i + 7);
    for (let j = i; j < maxLookahead; j += 1) {
      const lineAmount = parseAmount(lines[j]);
      if (lineAmount == null) continue;
      if (amountsEqual(lineAmount, amount) || amountsEqualIgnoringSign(lineAmount, amount)) {
        return { dateIndex: i, amountIndex: j, amountMatched: true };
      }
    }

    return { dateIndex: i, amountIndex: i, amountMatched: false };
  }

  return null;
}

export function buildTransactionContextWindow(
  lines: string[],
  startIndex: number,
  dateIso: string,
  referenceYear: number
): string | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lineStartsWithDate(lines[i], dateIso, referenceYear)) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 6)).filter(Boolean);
    return window.length ? window.join("\n") : null;
  }

  return null;
}

export function extractTransactionsFromItems(
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
    const block = findTransactionBlock(lines, cursor, dateIso, amount, referenceYear);
    const contextWindow = buildTransactionContextWindow(lines, cursor, dateIso, referenceYear);
    if (block) {
      cursor = (block.amountMatched ? block.amountIndex : block.dateIndex) + 1;
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
      const { dateIndex, amountIndex, amountMatched } = block;
      const descriptionEnd = amountMatched ? amountIndex : dateIndex + 2;
      const descriptionLines = lines
        .slice(dateIndex + 1, descriptionEnd)
        .filter((line) => line && !isDateOnlyLine(line) && !isSectionHeader(line));
      if (descriptionLines.length) {
        description = descriptionLines.join(" ");
        counterpartyName = extractCounterpartyName(description);
      }

      const nextBlock = blocks.slice(index + 1).find((candidate) => candidate?.block);
      const nextStart = nextBlock?.block?.dateIndex ?? lines.length;
      const referenceLines = lines
        .slice((amountMatched ? amountIndex : dateIndex) + 1, nextStart)
        .filter((line) => line && !isDateOnlyLine(line) && !isSectionHeader(line));
      if (referenceLines.length) {
        reference = referenceLines.join("\n");
      }
    }

    const bookingType = classifyBookingType(description);

    // Parse structured fields from reference block
    let valueDate: string | null = null;
    let counterpartyIban: string | null = null;
    let counterpartyBic: string | null = null;
    let endToEndId: string | null = null;

    if (reference) {
      const refLines = reference.split("\n");
      const parsed = parseReferenceBlock(refLines, referenceYear);
      valueDate = parsed.valueDate;
      counterpartyIban = parsed.counterpartyIban;
      counterpartyBic = parsed.counterpartyBic;
      endToEndId = parsed.endToEndId;
      reference = parsed.cleanReference;

      // Use counterparty from reference block if available
      if (parsed.counterpartyName) {
        counterpartyName = parsed.counterpartyName;
      }
    }

    // Fee types have no counterparty
    if (bookingType === "fee") {
      counterpartyName = null;
    }

    const tx: ParsedTransaction = {
      bookingDate: dateIso,
      valueDate,
      amount,
      currency,
      description,
      counterpartyName,
      counterpartyIban,
      counterpartyBic,
      endToEndId,
      reference,
      bookingType,
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

export function extractTransactionsFromStatementLines(
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

    let amountLineIndex = i;
    let amountMatch = line.match(amountTailPattern);
    if (!amountMatch) {
      const maxLookahead = Math.min(lines.length, i + 3);
      for (let j = i + 1; j < maxLookahead; j += 1) {
        const candidate = lines[j];
        if (dateStartPattern.test(candidate)) break;
        const candidateAmountMatch = candidate.match(amountTailPattern);
        if (!candidateAmountMatch) continue;
        amountLineIndex = j;
        amountMatch = candidateAmountMatch;
        break;
      }
    }
    if (!amountMatch) continue;

    const bookingDate = parseDateFlexible(dateMatch[1], referenceYear);
    const amount = parseAmountFlexible(amountMatch[1]);
    if (!bookingDate || amount == null) continue;

    const headless = line.slice(dateMatch[0].length);
    const descLines: string[] = [];
    if (amountLineIndex === i) {
      const amountToken = amountMatch[0];
      const amountPos = headless.lastIndexOf(amountToken);
      const firstDescription =
        amountPos >= 0 ? headless.slice(0, amountPos).trim() : headless.trim();
      if (firstDescription) descLines.push(firstDescription);
    } else {
      const firstDescription = headless.trim();
      if (firstDescription) descLines.push(firstDescription);
      for (let j = i + 1; j < amountLineIndex; j += 1) {
        const between = lines[j];
        if (isSectionHeader(between) || isDateOnlyLine(between)) continue;
        descLines.push(between);
      }
    }

    const postAmountLines: string[] = [];
    for (let j = amountLineIndex + 1; j < lines.length; j += 1) {
      const nextLine = lines[j];
      if (dateStartPattern.test(nextLine)) break;
      if (isSectionHeader(nextLine)) continue;
      postAmountLines.push(nextLine);
    }

    const description = descLines.join(" ").replace(/\s+/g, " ").trim();
    let counterpartyName = extractCounterpartyName(description);
    const bookingType = classifyBookingType(description);

    let valueDate: string | null = null;
    let counterpartyIban: string | null = null;
    let counterpartyBic: string | null = null;
    let endToEndId: string | null = null;
    let reference: string | null = null;

    if (postAmountLines.length) {
      const parsed = parseReferenceBlock(postAmountLines, referenceYear);
      valueDate = parsed.valueDate;
      counterpartyIban = parsed.counterpartyIban;
      counterpartyBic = parsed.counterpartyBic;
      endToEndId = parsed.endToEndId;
      reference = parsed.cleanReference;
      if (parsed.counterpartyName) {
        counterpartyName = parsed.counterpartyName;
      }
    }

    if (bookingType === "fee") {
      counterpartyName = null;
    }

    const tx: ParsedTransaction = {
      bookingDate,
      valueDate,
      amount,
      currency: amountMatch[2] || currencyFallback,
      description,
      counterpartyName,
      counterpartyIban,
      counterpartyBic,
      endToEndId,
      reference,
      bookingType,
    };
    out.push(withForeignCurrencyInfo(tx, statementFxHint, description));
    i = Math.max(i, amountLineIndex);
  }

  return out;
}

type BankTxSource = "items" | "lines";

type SourcedBankTx = {
  tx: ParsedTransaction;
  source: BankTxSource;
  index: number;
};

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

export function mergeBankStatementTransactions(
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
