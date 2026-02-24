// Vendor/Buyer-Namenserkennung aus OCR-Text und Azure-Feldern

import type { AzureField } from "./azure-field-helpers.ts";
import {
  normalizeOcrText,
  parseDateFlexible,
  parseAmountFlexible,
  escapeRegex,
} from "./parse-utils.ts";

export const BUYER_LABELS = [
  "Rechnungsempfänger",
  "Rechnungsempfaenger",
  "Leistungsempfänger",
  "Leistungsempfaenger",
  "Kunde",
  "Customer",
  "Bill To",
  "Invoice To",
  "Empfänger",
  "Empfaenger",
];

export const VENDOR_LABELS = [
  "Rechnungssteller",
  "Leistungserbringer",
  "Lieferant",
  "Verkäufer",
  "Verkaeufer",
  "Vendor",
  "Seller",
  "Supplier",
];

export function normalizePartyForCompare(value: string | null | undefined): string {
  if (!value) return "";
  return normalizeOcrText(value)
    .toLowerCase()
    .replace(
      /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|ek|e\.k\.|ltd|llc|inc|sarl|sa)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function samePartyName(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = normalizePartyForCompare(left);
  const b = normalizePartyForCompare(right);
  return Boolean(a && b && a === b);
}

export function isLikelyAddressOrContactLine(value: string): boolean {
  const normalized = normalizeOcrText(value).toLowerCase();
  if (!normalized) return true;
  if (/@/.test(normalized)) return true;
  if (/https?:\/\//.test(normalized)) return true;
  if (/\b(?:www\.)?[a-z0-9.-]+\.(?:de|com|net|org|io)\b/.test(normalized)) return true;
  if (/\b\d{5}\b/.test(normalized)) return true;
  if (
    /\b(stra(?:ss|ß)e|str\.?|street|road|avenue|platz|pl\.?|weg|allee|house|haus)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  if (/\b(iban|bic|ust|steuernummer|vat|seite|page|kundennr|rechnungsnr)\b/.test(normalized)) {
    return true;
  }
  return false;
}

export function isLikelyMetadataLine(value: string): boolean {
  const normalized = normalizeOcrText(value).toLowerCase();
  if (!normalized) return true;
  return /\b(rechnungsnr|rechnungnr|kundennr|kundenr|ust-?id|datum|leistungszeitraum|pos\.?|bezeichnung|menge|einheit|gesamtbetrag|zwischensumme|umsatzsteuer|zahlbar|vielen dank|seite)\b/.test(
    normalized
  );
}

export function looksLikeCompanyLine(value: string): boolean {
  const normalized = normalizeOcrText(value);
  if (!normalized) return false;
  if (!/[A-Za-zÄÖÜäöü]/.test(normalized)) return false;
  if (isLikelyMetadataLine(normalized)) return false;
  if (
    /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|llc|inc|ltd|sarl|sa|b\.v\.|bv)\b/i.test(
      normalized
    )
  ) {
    return true;
  }
  return /^[A-Z0-9&.,'"\- ]{6,}$/.test(normalized);
}

export function cleanPartyName(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value.split(/\r?\n/).map((line) => normalizeOcrText(line))[0] ?? "";
  if (isLikelyMetadataLine(firstLine)) return null;
  let candidate = firstLine
    .replace(/^[\s:;,\-]+/, "")
    .replace(
      /^(rechnungsempf[aä]nger|rechnungsempfaenger|rechnungssteller|kunde|customer|bill\s*to|invoice\s*to|vendor|seller|supplier|empf[aä]nger)\s*[:\-]?\s*/i,
      ""
    )
    .replace(/\b(?:RE|RG|INV)[-_ ]?\d{2,}[A-Z0-9/_-]*\b.*$/i, "")
    .trim();
  candidate = candidate.replace(/\s+/g, " ");
  if (!candidate) return null;
  if (/^(?:nr|nnr|kundennr|rechnungsnr)\b/i.test(candidate)) return null;
  if (!/[A-Za-zÄÖÜäöü]/.test(candidate)) return null;
  return candidate;
}

export function extractNameFromRecipientField(field?: AzureField | null): string | null {
  const raw = field?.valueString || field?.content || null;
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (const line of lines) {
    const candidate = cleanPartyName(line);
    if (candidate) return candidate;
  }
  return null;
}

export function extractBuyerFromHeaderBlock(
  content: string | null | undefined,
  vendorName?: string | null
): string | null {
  if (!content) return null;
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  if (!lines.length) return null;

  const headingIndex = lines.findIndex((line) =>
    /^(rechnung|invoice|facture|factura)\b/i.test(line)
  );
  const stopIndex = headingIndex > 0 ? headingIndex : Math.min(lines.length, 24);
  const startIndex = Math.max(0, stopIndex - 16);
  const block = lines.slice(startIndex, stopIndex);

  for (let i = block.length - 1; i >= 0; i -= 1) {
    const line = block[i];
    if (isLikelyAddressOrContactLine(line)) continue;
    if (isLikelyMetadataLine(line)) continue;
    if (!looksLikeCompanyLine(line)) continue;
    const candidate = cleanPartyName(line);
    if (!candidate) continue;
    if (vendorName && samePartyName(candidate, vendorName)) continue;
    return candidate;
  }
  return null;
}

export function extractLabeledParty(
  content: string | null | undefined,
  labels: string[]
): string | null {
  if (!content) return null;
  const normalized = normalizeOcrText(content);

  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const inlineRegex = new RegExp(
      `${escapedLabel}\\s*[:\\-]?\\s*(?:\\r?\\n\\s*)?([^\\r\\n]+)`,
      "i"
    );
    const inline = normalized.match(inlineRegex);
    const inlineCandidate = cleanPartyName(inline?.[1] ?? null);
    if (inlineCandidate) return inlineCandidate;
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const exactLabelRegex = new RegExp(
        `^${escapeRegex(label).replace(/\s+/g, "\\s+")}\\s*[:\\-]?$`,
        "i"
      );
      if (!exactLabelRegex.test(line)) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
        const candidate = cleanPartyName(lines[j]);
        if (candidate) return candidate;
      }
    }
  }

  return null;
}

export function pickPrimaryParty(
  candidates: Array<string | null | undefined>,
  distinctFrom?: string | null
): string | null {
  const cleaned = candidates
    .map((candidate) => cleanPartyName(candidate ?? null))
    .filter(Boolean) as string[];
  if (!cleaned.length) return null;
  if (!distinctFrom) return cleaned[0];
  const distinct = cleaned.find((candidate) => !samePartyName(candidate, distinctFrom));
  return distinct ?? cleaned[0];
}

export function extractLabeledDate(
  content: string | null | undefined,
  labels: string[]
): string | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const labelRegex = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(labelRegex);
    if (!match?.[1]) continue;
    const parsed = parseDateFlexible(match[1]);
    if (parsed) return parsed;
  }
  return null;
}

export function extractLabeledAmount(
  content: string | null | undefined,
  labels: string[]
): number | null {
  if (!content) return null;
  const normalizedContent = normalizeOcrText(content);
  for (const label of labels) {
    const escapedLabel = escapeRegex(label).replace(/\s+/g, "\\s+");
    const labelRegex = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
    const match = normalizedContent.match(labelRegex);
    if (!match?.[1]) continue;
    const parsed = parseAmountFlexible(match[1]);
    if (parsed != null && Number.isFinite(parsed)) return Math.abs(parsed);
  }

  const lines = content.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const labelRegex = new RegExp(
        `^${escapeRegex(label).replace(/\s+/g, "\\s+")}(?:\\s*\\([^)]*\\))?\\s*[:\\-]?$`,
        "i"
      );
      if (!labelRegex.test(line)) continue;
      const direct = parseAmountFlexible(line);
      if (direct != null) return Math.abs(direct);
      for (let offset = 1; offset <= 3; offset += 1) {
        const next = lines[i + offset];
        if (!next) break;
        const parsed = parseAmountFlexible(next);
        if (parsed != null && Number.isFinite(parsed)) return Math.abs(parsed);
      }
    }
  }

  return null;
}
