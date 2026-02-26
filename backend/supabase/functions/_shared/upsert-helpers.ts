// Shared helper functions for upserting bank_transactions and invoices.
// Used by both the Deno Edge Function (process-document) and Node.js backfill scripts.

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function coerceDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  // DD.MM.YYYY
  const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYYMMDD (compact)
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    return `${y}-${m}-${d}`;
  }

  // ISO or other Date-parseable format
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isNaN(num) ? Number.NaN : num;
  }
  return Number.NaN;
}

export function buildTransactionReference(tx: {
  description?: string | null;
  reference?: string | null;
}): string | null {
  // Prefer the dedicated reference field; fall back to description only when
  // no reference is available (the description typically duplicates booking-type
  // + counterparty which are already stored in separate columns).
  const ref = normalizeString(tx.reference);
  if (ref) return ref;
  return normalizeString(tx.description);
}
