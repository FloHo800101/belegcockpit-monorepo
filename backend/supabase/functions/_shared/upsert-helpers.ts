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

  let y: string, m: string, d: string;

  // DD.MM.YYYY
  const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (dotMatch) {
    [, d, m, y] = dotMatch;
  } else {
    // YYYYMMDD (compact)
    const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (compactMatch) {
      [, y, m, d] = compactMatch;
    } else {
      // ISO YYYY-MM-DD
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
      if (isoMatch) {
        [, y, m, d] = isoMatch;
      } else {
        // Fallback: try Date constructor
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return null;
        return validateDateRange(date.toISOString().slice(0, 10));
      }
    }
  }

  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return validateDateRange(iso);
}

function validateDateRange(iso: string): string | null {
  // Verify the date is actually valid (e.g. no Feb 30)
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== iso) return null;

  // Reject dates more than 1 year in the future (likely parsing artifacts)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  if (date > maxDate) return null;

  return iso;
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
