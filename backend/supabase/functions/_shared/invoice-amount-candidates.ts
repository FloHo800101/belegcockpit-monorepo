const MAX_AMOUNT_CANDIDATES = 25;

export function buildInvoiceAmountCandidates(
  parsed:
    | {
        totalGross?: number | null;
        totalNet?: number | null;
        lineItems?: Array<{ totalPrice?: number | null } | null> | null;
      }
    | null
    | undefined
): number[] {
  if (!parsed) return [];

  const candidates: number[] = [];
  const seen = new Set<string>();
  const signedLineTotals = (parsed.lineItems ?? [])
    .map((line) => line?.totalPrice)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .filter((value) => Math.abs(value) > 0);

  const push = (value: unknown) => {
    if (candidates.length >= MAX_AMOUNT_CANDIDATES) return;
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const rounded = roundCurrency(Math.abs(value));
    if (!(rounded > 0)) return;
    const key = rounded.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(rounded);
  };

  push(parsed.totalGross);
  if (!candidates.length) {
    push(parsed.totalNet);
  }

  for (const total of signedLineTotals) {
    push(total);
    if (candidates.length >= MAX_AMOUNT_CANDIDATES) return candidates;
  }

  const comboSource = signedLineTotals.slice(0, 20);
  for (let i = 0; i < comboSource.length; i += 1) {
    for (let j = i + 1; j < comboSource.length; j += 1) {
      const pair = [comboSource[i], comboSource[j]];
      if (!pair.some((value) => value < 0)) continue;
      push(pair[0] + pair[1]);
      if (candidates.length >= MAX_AMOUNT_CANDIDATES) return candidates;
    }
  }

  for (let i = 0; i < comboSource.length; i += 1) {
    for (let j = i + 1; j < comboSource.length; j += 1) {
      for (let k = j + 1; k < comboSource.length; k += 1) {
        const triple = [comboSource[i], comboSource[j], comboSource[k]];
        if (!triple.some((value) => value < 0)) continue;
        push(triple[0] + triple[1] + triple[2]);
        if (candidates.length >= MAX_AMOUNT_CANDIDATES) return candidates;
      }
    }
  }

  return candidates;
}

export type ResolveAmountInput = {
  totalGross?: number | null;
  totalNet?: number | null;
  lineItems?: Array<{ totalPrice?: number | null } | null> | null;
};

/**
 * Resolves the primary invoice amount.
 * 1. Prefers totalGross / totalNet from Azure fields.
 * 2. Falls back to the signed sum of line items (respects discounts / credits).
 * 3. When the signed sum is zero or negative (e.g. hotel invoice where a
 *    payment line cancels out the charges), uses the sum of positive items
 *    only (= total charges before payments).
 */
export function resolveInvoiceAmount(parsed: ResolveAmountInput | null | undefined): number | null {
  if (!parsed) return null;

  const fromTotals = toFinitePositive(parsed.totalGross) ?? toFinitePositive(parsed.totalNet);
  if (fromTotals != null) return fromTotals;

  const lineItems = parsed.lineItems ?? [];
  let signedSum = 0;
  let positiveSum = 0;
  let hasValue = false;
  for (const item of lineItems) {
    const value = toFiniteNumber(item?.totalPrice);
    if (value == null) continue;
    signedSum += value;
    if (value > 0) positiveSum += value;
    hasValue = true;
  }
  if (!hasValue) return null;

  const roundedSigned = roundCurrency(signedSum);
  const amount = roundedSigned > 0 ? roundedSigned : roundCurrency(positiveSum);
  if (amount <= 0) return null;
  return amount;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toFinitePositive(value: unknown): number | null {
  const num = toFiniteNumber(value);
  return num != null && num > 0 ? roundCurrency(num) : null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
