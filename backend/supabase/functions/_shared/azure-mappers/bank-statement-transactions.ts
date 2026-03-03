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

// --- Booking type classification ---
// Single source of truth for German transaction type keywords.
// Used by both classifyBookingType() and extractCounterpartyName().

const BOOKING_TYPE_MAP: Array<[RegExp, ParsedTransaction["bookingType"]]> = [
  [/FOLGELASTSCHRIFT|ERSTLASTSCHRIFT|LASTSCHRIFT/i, "direct_debit"],
  [/ONLINE-UEBERWEISUNG|UEBERWEISUNG|DAUERAUFTRAG/i, "transfer"],
  [/GUTSCHRIFT|EINZAHLUNG/i, "transfer"],
  [/ENTGELTABSCHLUSS|ENTGELT|ABSCHLUSS/i, "fee"],
  [/ZINSEN|ZINSABSCHLUSS/i, "interest"],
  [/KARTENZAHLUNG|GIROCARD|GIROSAMMEL/i, "card_payment"],
];

// Derived prefix pattern for stripping booking type keywords from counterparty descriptions
const BOOKING_TYPE_PREFIX = new RegExp(
  "^(" +
    BOOKING_TYPE_MAP.flatMap(([re]) =>
      re.source.split("|")
    ).join("|") +
    ")\\s+",
  "i"
);

export function classifyBookingType(description: string): ParsedTransaction["bookingType"] {
  const upper = normalizeOcrText(description).toUpperCase();
  for (const [pattern, type] of BOOKING_TYPE_MAP) {
    if (pattern.test(upper)) return type;
  }
  return "unknown";
}

export function extractCounterpartyName(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return null;

  // Try stripping a booking-type keyword at the very beginning
  const cleaned = trimmed.replace(BOOKING_TYPE_PREFIX, "").trim();
  if (cleaned !== trimmed) return cleaned || null;

  // Keyword not at start – look for a booking-type keyword later in the text.
  // This handles cases where Azure merges reference noise from a previous
  // transaction into the current description, e.g.:
  //   "/ K 396572 /2022-24/ ... Gutschrift EWE VERTRIEB GmbH"
  const allKeywords = BOOKING_TYPE_MAP.flatMap(([re]) => re.source.split("|"));
  const midPattern = new RegExp(`(?:^|\\s)(${allKeywords.join("|")})\\s+`, "i");
  const midMatch = trimmed.match(midPattern);
  if (midMatch && midMatch.index != null) {
    const keywordStart = midMatch.index + midMatch[0].indexOf(midMatch[1]);
    const afterKeyword = trimmed.slice(keywordStart).replace(BOOKING_TYPE_PREFIX, "").trim();
    if (afterKeyword) return afterKeyword;
  }

  return cleaned || null;
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
  // Standalone short dates like "05/05" or "01.05"
  if (/^\d{1,2}[./]\d{1,2}$/.test(n)) return true;
  // Standalone amounts
  if (/^[+-]?\s?\d[\d., ]*\d(?:[.,]\d{2})?$/.test(n)) return true;
  // Value date in parens only
  if (/^\(\d{1,2}[./]\d{1,2}[./]?\d{0,4}\)$/.test(n)) return true;
  return false;
}

// Detects bank statement boilerplate that should never appear in reference blocks:
// page headers/footers, legal text, balance summaries, barcode IDs.
// Returns true for lines that signal the end of meaningful transaction data.
export function isStatementBoilerplateLine(line: string): boolean {
  const n = normalizeOcrText(line);
  if (!n) return true;

  // Page table headers (re-appearing on page 2+)
  if (/^Buchung\s*\/?\s*Verwendungszweck/i.test(n)) return true;
  if (/^Betrag\s*\(/i.test(n)) return true;
  if (/^Valuta$/i.test(n)) return true;
  if (/^Seite\b/i.test(n)) return true;

  // Statement metadata headers
  if (/^(Girokonto\s+Nummer|Kontoauszug\s+\w+\s+\d{4})/i.test(n)) return true;
  if (/^\d+\s+von\s+\d+$/.test(n)) return true; // "2 von 2"

  // Balance summary / customer info
  if (/^(Neuer Saldo|Alter Saldo|Endsaldo|Anfangssaldo|Kontostand)\b/i.test(n)) return true;
  if (/^Kunden-Information/i.test(n)) return true;
  if (/^(Vorliegender\s+Freistellungsauftrag|Verbrauchter\s+Sparer)/i.test(n)) return true;

  // Bank footer / legal text markers
  if (/\bSitz:.*\bAG\s/i.test(n) && /\bHRB\s+\d/i.test(n)) return true;
  if (/\bUSt-?IdNr/i.test(n) && /\bSteuernummer/i.test(n)) return true;
  if (/^Bitte beachten Sie/i.test(n)) return true;
  if (/\bAllgemeinen?\s+Gesch[aä]ftsbedingungen/i.test(n)) return true;
  if (/\bEinlagensicherung/i.test(n)) return true;
  if (/\bSollzins(s[aä]tze?)?\s+(und|f[uü]r)/i.test(n)) return true;

  // Barcode-style IDs (e.g. "34GKKA5430878061_T")
  if (/^\d{2}[A-Z]{3,}[A-Z0-9]+_[A-Z]$/i.test(n)) return true;

  // Bank name + address footer lines
  if (/^[A-Z][\w-]+\s+AG\s*[·.]/i.test(n)) return true; // "ING-DiBa AG · ..."
  if (/Theodor-Heuss-Allee|Frankfurt am Main/i.test(n) && /Vorstand/i.test(n)) return true;

  // Standalone "Herrn" or address block of account holder (header area)
  if (/^Herrn$/i.test(n)) return true;

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
  return /^\d{1,2}[./]\d{1,2}([./]\d{2,4})?$/.test(line.trim());
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
  let firstDateFallback: { dateIndex: number; amountIndex: number; amountMatched: false } | null = null;

  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lineStartsWithDate(lines[i], dateIso, referenceYear)) continue;

    const maxLookahead = Math.min(lines.length, i + 7);
    for (let j = i; j < maxLookahead; j += 1) {
      const lineAmount = parseAmount(lines[j]);
      if (lineAmount == null) continue;
      if (amountsEqual(lineAmount, amount) || amountsEqualIgnoringSign(lineAmount, amount)) {
        // Look for a closer date line between i+1 and j that also matches the
        // target date.  This handles bank statements (e.g. ING) where a valuta
        // date line from the previous transaction appears before the booking
        // date of the current transaction — both share the same calendar date.
        // Picking the closest date to the amount avoids consuming the previous
        // transaction's reference block as the current transaction's description.
        let bestDateIndex = i;
        for (let k = i + 1; k < j; k += 1) {
          if (lineStartsWithDate(lines[k], dateIso, referenceYear)) {
            bestDateIndex = k;
          }
        }
        return { dateIndex: bestDateIndex, amountIndex: j, amountMatched: true };
      }
    }

    // Remember the first date match as fallback, but keep searching for
    // a date line with an actual amount match (avoids locking onto value
    // dates like "05.05.2025" in reference blocks)
    if (!firstDateFallback) {
      firstDateFallback = { dateIndex: i, amountIndex: i, amountMatched: false };
    }
  }

  return firstDateFallback;
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
      // Advance cursor past the amount (or date fallback) to avoid re-matching
      // the same lines for the next item.
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
      const rawRefSlice = lines.slice((amountMatched ? amountIndex : dateIndex) + 1, nextStart);
      const referenceLines: string[] = [];
      for (const refLine of rawRefSlice) {
        if (!refLine || isDateOnlyLine(refLine) || isSectionHeader(refLine)) continue;
        // Stop collecting once we hit page footer/header boilerplate
        if (isStatementBoilerplateLine(refLine)) break;
        referenceLines.push(refLine);
      }
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
  // No spaces in the amount character class — prevents reference lines like
  // "15.02.2023 STEUERNR ... VZ202 3 1.955,66EUR" from matching "202 3 1.955,66"
  // as a single amount (which produces phantom transactions with garbage values).
  const amountTailPattern =
    /([+-]?\d[\d.,]*\d(?:[.,]\d{2}))(?:\s*([A-Z]{3}))?\s*$/;
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
        if (isSectionHeader(between) || isDateOnlyLine(between) || isNoiseLine(between)) continue;
        descLines.push(between);
      }
    }

    const postAmountLines: string[] = [];
    for (let j = amountLineIndex + 1; j < lines.length; j += 1) {
      const nextLine = lines[j];
      if (dateStartPattern.test(nextLine)) break;
      if (isSectionHeader(nextLine)) continue;
      // Stop collecting once we hit page footer/header boilerplate
      if (isStatementBoilerplateLine(nextLine)) break;
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

  // Collect items-based date+absAmount pairs for duplicate/phantom detection.
  // Uses absolute amounts so that opposite-sign duplicates from separate
  // "Eingänge"/"Ausgänge" sections (e.g. Qonto) are also caught.
  const itemsDateAbsAmounts = new Set(
    items.map((item) => {
      const d = normalizeDateOnly(item.tx.bookingDate) ?? "";
      const a = Math.abs(amountValue(item.tx.amount) ?? 0);
      return `${d}|${a}`;
    })
  );

  for (const line of lines) {
    if (usedLineIndexes.has(line.index)) continue;

    // Filter duplicate/phantom lines: unmatched lines whose date + absolute
    // amount matches an items-sourced transaction. This covers:
    // - Phantom lines (no counterparty, ING value-date echo lines)
    // - Same-sign duplicates (text similarity too low for merge)
    // - Opposite-sign duplicates (Qonto Eingänge/Ausgänge sections)
    const ld = normalizeDateOnly(line.tx.bookingDate) ?? "";
    const la = Math.abs(amountValue(line.tx.amount) ?? 0);
    if (itemsDateAbsAmounts.has(`${ld}|${la}`)) continue;

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
