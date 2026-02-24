// Fremdwährungs-Erkennung und -Zuordnung für Kontoauszüge

import { ParsedTransaction } from "../types.ts";
import { normalizeOcrText, parseLocalizedNumber, roundCurrency } from "./parse-utils.ts";

export type ParsedFxInfo = {
  foreignAmount: number;
  foreignCurrency: string;
  exchangeRate: number;
};

export type StatementFxHint = {
  foreignCurrency: string;
  exchangeRate: number;
};

export function extractForeignCurrencyInfo(
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

export function inferStatementFxHint(content: string | null | undefined, baseCurrency: string): StatementFxHint | null {
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

export function extractForeignCurrencyInfoFromHint(
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

export function withForeignCurrencyInfo(
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
