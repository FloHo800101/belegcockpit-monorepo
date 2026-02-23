import type { Tx } from "./types";

export type TxAmountCurrency = {
  currency: string;
  amount: number;
};

export function txAmountForCurrency(tx: Tx, currency: string): number | null {
  const key = normalizeCurrency(currency);
  if (!key) return null;

  for (const candidate of txAmountCurrencies(tx)) {
    if (candidate.currency === key) return candidate.amount;
  }

  return null;
}

export function txSupportsCurrency(tx: Tx, currency: string): boolean {
  return txAmountForCurrency(tx, currency) != null;
}

export function txAmountCurrencies(tx: Tx): TxAmountCurrency[] {
  const out: TxAmountCurrency[] = [];
  const seen = new Set<string>();

  const push = (currency: unknown, amount: unknown) => {
    const normalizedCurrency = normalizeCurrency(currency);
    const normalizedAmount = normalizeAmount(amount);
    if (!normalizedCurrency || normalizedAmount == null) return;
    const key = `${normalizedCurrency}:${normalizedAmount.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ currency: normalizedCurrency, amount: normalizedAmount });
  };

  push(tx.currency, tx.amount);
  push(tx.foreign_currency, tx.foreign_amount);

  return out;
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length ? trimmed : null;
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  return rounded > 0 ? rounded : null;
}
