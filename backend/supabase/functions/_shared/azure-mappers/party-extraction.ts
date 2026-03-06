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
  "Gastname",
  "Gast",
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
  // Compound street names (e.g. "LINDEMANNSTR.", "Hauptstr.")
  if (/str\.\s/i.test(normalized) || /str\.$/i.test(normalized)) return true;
  if (/\b(iban|bic|ust|steuernummer|vat|seite|page|kundennr|rechnungsnr)\b/.test(normalized)) {
    return true;
  }
  return false;
}

export function isLikelyMetadataLine(value: string): boolean {
  const normalized = normalizeOcrText(value).toLowerCase();
  if (!normalized) return true;
  return /\b(rechnungsnr|rechnungs-nr|rechnungnr|kundennr|kundenr|beleg-?nr|bon-?nr|ust-?id|datum|leistungszeitraum|pos\.?|bezeichnung|menge|einheit|gesamtbetrag|zwischensumme|umsatzsteuer|zahlbar|vielen dank|seite)\b/.test(
    normalized
  );
}

export function looksLikeCompanyLine(value: string): boolean {
  const normalized = normalizeOcrText(value);
  if (!normalized) return false;
  if (!/[A-Za-zÄÖÜäöü]/.test(normalized)) return false;
  if (isLikelyMetadataLine(normalized)) return false;
  // Reject strings that are mostly digits (e.g. invoice/customer numbers like "M22076230495")
  const digits = (normalized.match(/\d/g) || []).length;
  const letters = (normalized.match(/[A-Za-zÄÖÜäöü]/g) || []).length;
  if (digits > letters * 2) return false;
  if (
    /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|llc|inc|ltd|sarl|sa|b\.v\.|bv)\b/i.test(
      normalized
    )
  ) {
    return true;
  }
  return /^[A-Z0-9&.,'"\- ]{6,}$/.test(normalized);
}

/**
 * Detects OCR garbage that should never be accepted as a party name.
 * Covers receipt keywords, masked card numbers, amounts, date codes,
 * product-line patterns, and short alphanumeric reference codes.
 */
export function isLikelyGarbageName(value: string): boolean {
  const normalized = normalizeOcrText(value).trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase();

  // Receipt / POS keywords
  if (
    /^(barbeleg|bar-?beleg|zw[- ]?summe|zwischensumme|passend|r[uü]ckgeld|wechselgeld|trinkgeld|gesamt|summe|rabatt|netto|brutto|mwst|ust|steuer|gegeben|kartenzahlung|ec[- ]?karte|kreditkarte|visa|mastercard|maestro|girocard|kontaktlos|quittung|kassenbon|beleg|bon|buchung|storno|annulliert|restaurant\s*&?\s*bar)$/i.test(
      lower
    )
  ) {
    return true;
  }

  // Generic hotel/accommodation words (not a buyer name)
  if (/^(hotels?|suites?\s*hotel)$/i.test(lower)) return true;

  // Train station names (e.g. "HANNOVER HBF")
  if (/\b(hbf|hauptbahnhof|bahnhof|flughafen|airport)\b/i.test(lower)) return true;

  // Legal/regulatory text fragments
  if (/\b(verordnung|gesetz|richtlinie|paragraph|regelung)\b/i.test(lower)) return true;

  // Strings containing "Postfach" (mailing address, not a name)
  if (/\bpostfach\b/i.test(lower)) return true;

  // Masked card numbers (e.g. "XXXXX1212", "****1234")
  if (/^[X*]{3,}\d{2,}$/i.test(normalized)) return true;

  // Amount strings used as name (e.g. "16,73 EUR", "€ 42.50")
  if (/^\s*[€$]?\s*\d+[.,]\d{2}\s*(EUR|€|USD|\$)?\s*$/i.test(normalized)) return true;

  // Flight/ticket date codes (e.g. "18JUN23", "29MAY23")
  if (/^\d{2}[A-Z]{3}\d{2}$/i.test(normalized)) return true;

  // Insurance/period references (e.g. "DV 01.23", "DV 11.22")
  if (/^DV\s+\d{2}\.\d{2}$/i.test(normalized)) return true;

  // Short alphanumeric reference codes without spaces (e.g. "CI4Z9A", "DA3CD00400")
  // but not company names — require mix of letters+digits, no spaces, no business suffix
  if (
    /^[A-Z0-9]{4,12}$/i.test(normalized) &&
    /\d/.test(normalized) &&
    /[A-Za-z]/.test(normalized) &&
    !/\b(gmbh|ag|kg|ug|ohg|gbr|ltd|llc|inc)\b/i.test(normalized)
  ) {
    return true;
  }

  // Product-line patterns: starts with number + product name (e.g. "455 BLUETOOTH HEADPHONES")
  if (/^\d{1,4}\s+[A-ZÄÖÜ][A-ZÄÖÜa-zäöü\s]{4,}$/.test(normalized)) return true;

  // Instruction text patterns (e.g. "MIT APP BESTELLEN UND BEZAHLEN")
  if (/\b(bestellen|bezahlen|scannen|herunterladen|download)\b/i.test(lower) && lower.length > 15) {
    return true;
  }

  // Reference numbers with hyphens that look like booking codes (e.g. "LHA-P-KIB34-2023-00003389")
  if (/^[A-Z]{2,4}-[A-Z0-9-]{8,}$/i.test(normalized)) return true;

  // "FREE NOW ID", "DE-MAIL" and similar service identifiers
  if (/^(free\s+now\s+id|de[- ]mail)$/i.test(lower)) return true;

  return false;
}

/**
 * Normalizes airline-style reversed names back to "Firstname Lastname" format.
 * E.g. "HOFFMANN / FLORIAN MR" → "Florian Hoffmann"
 */
export function normalizeAirlineName(value: string): string {
  const match = value.match(
    /^([A-ZÄÖÜ][A-ZÄÖÜa-zäöü]+)\s*\/\s*([A-ZÄÖÜ][A-ZÄÖÜa-zäöü]+)\s*(?:MR|MRS|MS|MISS|DR)?\.?\s*$/i
  );
  if (!match) return value;
  const lastName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const firstName = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
  return `${firstName} ${lastName}`;
}

export function cleanPartyName(value: string | null | undefined): string | null {
  if (!value) return null;
  const lines = value.split(/\r?\n/).map((line) => normalizeOcrText(line)).filter(Boolean);
  if (!lines.length) return null;

  for (const line of lines) {
    if (isLikelyMetadataLine(line)) continue;
    if (isLikelyAddressOrContactLine(line)) continue;
    let candidate = line
      .replace(/^[\s:;,\-]+/, "")
      .replace(
        /^(rechnungsempf[aä]nger|rechnungsempfaenger|rechnungssteller|kunde|customer|bill\s*to|invoice\s*to|vendor|seller|supplier|empf[aä]nger|gastname|gast)\s*[:\-]?\s*/i,
        ""
      )
      .replace(/^(Herrn|Herr|Frau|Mr\.?|Mrs\.?|Ms\.?)(?:\s+|$)/i, "")
      .replace(/\b(?:RE|RG|INV)[-_ ]?\d{2,}[A-Z0-9/_-]*\b.*$/i, "")
      .trim();
    candidate = candidate.replace(/\s+/g, " ").replace(/[,;:]+$/, "");
    if (!candidate) continue;
    if (/^(?:nr|nnr|kundennr|rechnungsnr)\b/i.test(candidate)) continue;
    if (!/[A-Za-zÄÖÜäöü]/.test(candidate)) continue;
    // Single characters are never valid party names (e.g. logo letters like "N")
    if (candidate.length < 2) continue;
    // Reject OCR garbage (receipt keywords, amounts, codes, product names)
    if (isLikelyGarbageName(candidate)) continue;
    // Fix C: Reject country names used as party names (e.g. buyerName "DEUTSCHLAND")
    if (/^(deutschland|germany|österreich|austria|schweiz|switzerland)$/i.test(candidate)) continue;
    // Fix C: Reject if candidate is ONLY a legal form (e.g. "GmbH & Co. KG")
    const withoutLegalForm = candidate
      .replace(/\b(gmbh|mbh|ag|kg|ug|ohg|gbr|ek|e\.k\.|ltd|llc|inc|sarl|sa|b\.v\.|bv|co\.?)\b/gi, "")
      .replace(/[&.,\-\s]+/g, "")
      .trim();
    if (!withoutLegalForm) continue;
    // Normalize airline-style reversed names (e.g. "HOFFMANN / FLORIAN MR" → "Florian Hoffmann")
    candidate = normalizeAirlineName(candidate);
    return candidate;
  }
  return null;
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

  // Fallback: when a buyer label is found inline but value is just a number/ID (e.g. "KUNDE: 33 109407"),
  // check the line immediately before the label for a person/party name
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const labelWithValueRegex = new RegExp(
        `^${escapeRegex(label).replace(/\s+/g, "\\s+")}\\s*[:\\-]`,
        "i"
      );
      if (!labelWithValueRegex.test(line)) continue;
      // Label found but inline value was rejected → check preceding line
      if (i > 0) {
        const preceding = cleanPartyName(lines[i - 1]);
        if (preceding && !isLikelyAddressOrContactLine(preceding)) return preceding;
      }
    }
  }

  return null;
}

function hasBusinessSuffix(value: string): boolean {
  return /\b(gmbh|mbh|ag|kg|ug|ohg|gbr|se|ek|e\.k\.|ltd|llc|inc|sarl|sa|b\.v\.|bv|co\.?)\b/i.test(
    value
  );
}

export function pickPrimaryParty(
  candidates: Array<string | null | undefined>,
  distinctFrom?: string | null
): string | null {
  const cleaned = candidates
    .map((candidate) => cleanPartyName(candidate ?? null))
    .filter(Boolean) as string[];
  if (!cleaned.length) return null;

  const eligible = distinctFrom
    ? cleaned.filter((c) => !samePartyName(c, distinctFrom))
    : cleaned;
  const pool = eligible.length ? eligible : cleaned;

  // Prefer candidates with a business suffix (GmbH, SE, AG, …) over short brand/logo names
  const first = pool[0];
  if (first && !hasBusinessSuffix(first) && first.length <= 8) {
    const withSuffix = pool.find((c) => hasBusinessSuffix(c));
    if (withSuffix) return withSuffix;
  }

  return first ?? cleaned[0];
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
