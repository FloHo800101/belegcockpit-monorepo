// Gemeinsame Parser-Hilfsfunktionen für Datum, Betrag, OCR-Text, IBAN, BIC etc.

export function normalizeOcrText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

export function parseDateFlexible(
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

export function parseGermanDateText(value: string | null | undefined): string | null {
  return parseDateFlexible(value);
}

export function parseAmount(value: string | null | undefined): number | null {
  return parseAmountFlexible(value);
}

export function parseAmountFlexible(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = normalizeOcrText(value).replace(/\s/g, "");
  const match = text.match(/[-+]?\d[\d.,]*(?:[.,]\d{2})/);
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

export function parseLocalizedNumber(value: string | null | undefined): number | null {
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

export function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const percent = Number(normalized);
  if (Number.isNaN(percent)) return null;
  return percent / 100;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function extractFirstLineValue(content: string, label: string): string | null {
  const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

export function extractIban(content: string): string | null {
  // Match IBAN: 2 letters + 2 digits + 11-30 alphanumeric (no spaces/dashes absorbed)
  const match = content.match(
    /\b([A-Z]{2}\d{2}\s?(?:\d{4}\s?){2,7}\d{1,4})\b/i
  );
  if (match) {
    const cleaned = match[1].replace(/\s/g, "").toUpperCase();
    if (cleaned.length >= 15 && cleaned.length <= 34) return cleaned;
  }
  // Fallback: contiguous alphanumeric IBAN (no spaces)
  const fallback = content.match(
    /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/i
  );
  if (!fallback) return null;
  const cleaned = fallback[1].toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return null;
  // Reject if trailing alphabetic chars were absorbed (e.g. "...DATUM")
  if (/[A-Z]{3,}$/.test(cleaned.slice(4))) return null;
  return cleaned;
}

export function extractIbanFromLine(line: string): string | null {
  const match = line.match(
    /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/i
  );
  if (!match) return null;
  const cleaned = match[1].replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return null;
  return cleaned;
}

export function extractBic(content: string): string | null {
  const match = content.match(/(?:BIC|SWIFT)\s*[:\-]?\s*([A-Z0-9]{8,11})/i);
  if (match) return match[1];
  const fallback = content.match(/\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/);
  return fallback ? fallback[0] : null;
}

export function extractCurrency(content: string): string | null {
  const normalized = normalizeOcrText(content).toUpperCase();
  if (/€/.test(content)) return "EUR";
  if (/\bEUR\b/.test(normalized)) return "EUR";
  if (/\bCHF\b/.test(normalized)) return "CHF";
  if (/\$/.test(content)) return "USD";
  if (/\bUSD\b/.test(normalized)) return "USD";
  return null;
}

export function extractBalance(content: string, label: string): number | null {
  const lineValue = extractFirstLineValue(content, label);
  return parseAmount(lineValue);
}

export function extractBalanceByPatterns(content: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;
    const amount = parseAmountFlexible(match[1] ?? match[0]);
    if (amount != null) return amount;
  }
  return null;
}

export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeComparableText(value: string | null | undefined): string {
  const normalized = normalizeOcrText(value).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenizeComparableText(value: string): string[] {
  return value.split(" ").filter((token) => token.length >= 3);
}

export function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function formatGermanDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function amountsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

export function amountsEqualIgnoringSign(left: number, right: number): boolean {
  return amountsEqual(Math.abs(left), Math.abs(right));
}

export function amountValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
