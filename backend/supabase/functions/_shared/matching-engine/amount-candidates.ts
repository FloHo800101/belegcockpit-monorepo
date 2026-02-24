import { MatchingConfig, amountCompatible } from "./config.ts";
import type { Doc } from "./types.ts";

type AmountMatch = {
  matchedAmount: number;
  viaAmountCandidate: boolean;
};

const EPSILON = 0.000001;

export function getDocAmountCandidates(
  doc: Pick<Doc, "amount" | "amount_candidates" | "open_amount">
): number[] {
  const out: number[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const normalized = roundCurrency(Math.abs(value));
    if (!(normalized > 0)) return;
    const key = normalized.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  push(doc.open_amount);
  push(doc.amount);
  for (const candidate of doc.amount_candidates ?? []) {
    push(candidate);
  }

  return out;
}

export function resolveDocAmountMatch(
  doc: Pick<Doc, "amount" | "amount_candidates" | "open_amount">,
  targetAmount: number,
  cfg: MatchingConfig
): AmountMatch | null {
  if (!Number.isFinite(targetAmount)) return null;
  const normalizedTarget = roundCurrency(Math.abs(targetAmount));
  const base = roundCurrency(Math.abs(doc.amount));

  for (const candidate of getDocAmountCandidates(doc)) {
    if (!amountCompatible(candidate, normalizedTarget, cfg)) continue;
    return {
      matchedAmount: candidate,
      viaAmountCandidate: Math.abs(candidate - base) > EPSILON,
    };
  }

  return null;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
