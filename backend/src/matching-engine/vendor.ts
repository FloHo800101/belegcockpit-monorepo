import { normalizeText, tokenize } from "./normalize";

const VENDOR_TOKEN_ALIASES: Record<string, string> = {
  tankstelle: "fuelstation",
  station: "fuelstation",
};

const GENERIC_SHARED_TOKENS = new Set([
  "fuelstation",
  "karte",
  "card",
  "shop",
  "store",
  "online",
  "payment",
  "zahlung",
  "invoice",
  "rechnung",
  "service",
  "services",
]);

export function vendorCompatible(
  leftRaw?: string | null,
  rightRaw?: string | null
): boolean {
  const left = normalizeText(leftRaw);
  const right = normalizeText(rightRaw);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftTokens = canonicalizeTokens(tokenize(left));
  const rightTokens = canonicalizeTokens(tokenize(right));
  if (!leftTokens.length || !rightTokens.length) return false;

  const overlap = tokenOverlap(leftTokens, rightTokens);
  if (overlap >= 2) return true;

  if (overlap >= 1 && (leftTokens.length <= 2 || rightTokens.length <= 2)) {
    if (hasDistinctSharedToken(leftTokens, rightTokens)) return true;
    return left.includes(right) || right.includes(left);
  }

  return false;
}

function canonicalizeTokens(tokens: string[]) {
  return tokens.map((token) => VENDOR_TOKEN_ALIASES[token] ?? token);
}

function hasDistinctSharedToken(left: string[], right: string[]) {
  const rightSet = new Set(right);
  for (const token of left) {
    if (!rightSet.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    if (token.length < 3) continue;
    if (GENERIC_SHARED_TOKENS.has(token)) continue;
    return true;
  }
  return false;
}

function tokenOverlap(left: string[], right: string[]) {
  const set = new Set(left);
  let overlap = 0;
  for (const token of right) {
    if (set.has(token)) overlap += 1;
  }
  return overlap;
}
