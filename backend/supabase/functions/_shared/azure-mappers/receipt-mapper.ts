// Azure Receipt Mapper – mapAzureReceiptToParseResult
// Supports multi-receipt pages (e.g. travel expense scans with multiple tickets)

import { AzureParseResult, ParsedDocument, ParsedLineItem } from "../types.ts";
import { AzureAnalyzeResult, AzureDocument, AzureField, getValue, getNumber, resolvePreferredDate } from "./azure-field-helpers.ts";
import { extractCurrency, parseAmountFlexible, parseDateFlexible, normalizeOcrText, roundCurrency } from "./parse-utils.ts";
import { extractInvoiceNumber } from "./installment-plan.ts";
import { cleanPartyName } from "./party-extraction.ts";

/**
 * Extract receipt amounts and context from OCR text.
 * Scans for patterns like "€ 2,40" or "EUR 12,00" with surrounding context.
 * Also handles multi-line patterns where "€" is on one line and the amount on the next.
 */
function extractReceiptItemsFromOcr(
  content: string
): { items: ParsedLineItem[]; total: number } {
  const lines = content.split(/\r?\n/);
  const items: ParsedLineItem[] = [];
  const seenPositions = new Set<number>();

  // Match "€ X,XX" or "EUR X,XX" patterns – capture amount with context
  const amountPattern = /(?:€|EUR)\s?(\d+[.,]\d{2,3})/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    amountPattern.lastIndex = 0;

    while ((match = amountPattern.exec(line)) !== null) {
      const amount = parseReceiptOcrAmount(match[1]);
      if (amount == null || amount <= 0) continue;

      // Avoid counting the same line position twice when patterns overlap
      const posKey = i * 10000 + match.index;
      if (seenPositions.has(posKey)) continue;
      seenPositions.add(posKey);

      // Skip tax sub-amounts: only skip if a tax keyword appears BEFORE this match position
      const textBeforeMatch = line.slice(0, match.index).toLowerCase();
      if (/steuerbetrag|ust\.?\s|mwst|tax\s/i.test(textBeforeMatch)) {
        continue;
      }

      // Skip "inkl." annotations that repeat the main amount
      const lowerLine = line.toLowerCase();
      if (/inkl\.?\s/.test(lowerLine) && match.index > lowerLine.indexOf("inkl")) {
        continue;
      }

      // Skip total/summary lines (e.g. "Gesamt brutto €100,00", "Betrag 100,00 EUR")
      if (/gesamt|summe|betrag|total|endbetrag/i.test(textBeforeMatch)) {
        continue;
      }

      // Build description from surrounding context
      const contextLines: string[] = [];
      for (let j = Math.max(0, i - 3); j <= i; j++) {
        const cl = normalizeOcrText(lines[j]);
        if (cl.length > 2 && cl.length < 120) contextLines.push(cl);
      }
      const description = contextLines.join(" | ").slice(0, 200);

      // Try to find a date near this amount
      let itemDate: string | null = null;
      for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 1); j++) {
        const dateMatch = lines[j].match(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
        if (dateMatch) {
          itemDate = parseDateFlexible(dateMatch[1]) ?? null;
          if (itemDate) break;
        }
      }

      items.push({
        description: description || `Receipt item (€${amount.toFixed(2)})`,
        quantity: 1,
        unitPrice: amount,
        totalPrice: amount,
        vatRate: null,
      });
    }

    // Multi-line pattern: line ends with "€" (possibly with spaces) and the next line has the amount
    if (i < lines.length - 1 && /€\s*$/i.test(line.trim())) {
      const nextLine = lines[i + 1].trim();
      const multiLineMatch = nextLine.match(/^(\d+[.,]\d{2,3})\b/);
      if (multiLineMatch) {
        const posKey = (i + 1) * 10000;
        if (!seenPositions.has(posKey)) {
          seenPositions.add(posKey);
          const amount = parseReceiptOcrAmount(multiLineMatch[1]);
          if (amount != null && amount > 0) {
            const contextLines: string[] = [];
            for (let j = Math.max(0, i - 3); j <= i; j++) {
              const cl = normalizeOcrText(lines[j]);
              if (cl.length > 2 && cl.length < 120) contextLines.push(cl);
            }
            const description = contextLines.join(" | ").slice(0, 200);

            items.push({
              description: description || `Receipt item (€${amount.toFixed(2)})`,
              quantity: 1,
              unitPrice: amount,
              totalPrice: amount,
              vatRate: null,
            });
          }
        }
      }
    }
  }

  const total = roundCurrency(items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0));
  return { items, total };
}

/**
 * Parse an OCR amount string from a receipt, handling German thousands separators
 * that are actually misread decimal separators from handwriting.
 *
 * Pattern: "55.006" — Azure reads handwritten "55,06" as "55.006"
 * and interprets the dot as a German thousands separator → 55006.
 * We detect this pattern (dot + exactly 3 digits, no further decimals)
 * and try to interpret it as a decimal if the resulting amount is implausibly large.
 *
 * Heuristic: if the number has format X.XXX (dot + 3 digits) and interpreting
 * as thousands gives > 1000, but interpreting the dot as decimal gives a
 * reasonable receipt amount, prefer the decimal interpretation.
 */
function parseReceiptOcrAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s/g, "");

  // Check for the ambiguous "X.XXX" pattern (dot + exactly 3 digits, no comma)
  const germanThousandsPattern = /^(\d+)\.(\d{3})$/;
  const match = cleaned.match(germanThousandsPattern);
  if (match) {
    const asThousands = parseInt(match[1] + match[2], 10); // e.g. 55006
    const asFractional = parseFloat(`${match[1]}.${match[2]}`); // e.g. 55.006

    // If the thousands interpretation gives an implausibly large receipt amount
    // (> 1000 EUR) and the decimal interpretation is reasonable, prefer decimal.
    // This catches handwriting OCR errors like "55,06" → "55.006" → 55006.
    if (asThousands > 1000) {
      return roundCurrency(asFractional);
    }
    return asThousands;
  }

  // Standard case: delegate to parseAmountFlexible
  return parseAmountFlexible(cleaned);
}

/**
 * Extract all dates from OCR text and return the latest (most recent) one.
 * For travel expenses this is the end-of-trip date; for single receipts the purchase date.
 */
function extractLatestDateFromOcr(content: string): string | null {
  const datePattern = /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g;
  let match: RegExpExecArray | null;
  let latestDate: string | null = null;

  while ((match = datePattern.exec(content)) !== null) {
    const parsed = parseDateFlexible(match[1]);
    if (!parsed) continue;
    // Sanity: skip dates far in the future or very old
    const year = parseInt(parsed.slice(0, 4), 10);
    if (year < 2000 || year > new Date().getUTCFullYear() + 1) continue;
    if (!latestDate || parsed > latestDate) {
      latestDate = parsed;
    }
  }

  return latestDate;
}

/**
 * Find the most frequent vendor name from multiple Azure documents.
 */
function mostFrequentVendor(docs: AzureDocument[]): string | null {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const name = cleanPartyName(getValue(doc.fields?.MerchantName));
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Sanitize the Azure Total amount for receipts.
 * Detects handwriting OCR errors where Azure misinterprets a decimal separator
 * as a German thousands separator.
 *
 * Example: handwritten "55,06" → Azure OCR "55.006" → valueCurrency 55006 EUR.
 * The content field "€\n55.006" reveals the dot+3-digits pattern.
 * When the currency amount > 1000 and content shows this pattern,
 * re-interpret as a decimal number (55.006 ≈ 55.01 EUR).
 */
function sanitizeReceiptTotal(
  amount: number | null,
  totalField?: AzureField | null
): number | null {
  if (amount == null || amount <= 1000) return amount;
  if (!totalField?.content) return amount;

  // Extract the numeric part from content (strip currency symbols, whitespace, newlines)
  const numStr = totalField.content.replace(/[€$\s\n\r]/g, "");

  // Check for "X.XXX" pattern: dot + exactly 3 digits at end, no comma anywhere
  const match = numStr.match(/^(\d+)\.(\d{3})$/);
  if (match && !numStr.includes(",")) {
    // Azure interpreted this as a thousands separator → amount is X*1000+XXX.
    // But for receipts > 1000 EUR this is likely a decimal misread from handwriting.
    // Re-interpret the dot as a decimal separator.
    const corrected = parseFloat(`${match[1]}.${match[2]}`);
    if (Number.isFinite(corrected)) {
      return roundCurrency(corrected);
    }
  }

  return amount;
}

export function mapAzureReceiptToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.length) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const contentText = (result.content ?? "").toString();
  const docs = result.documents;

  // Currency: prefer OCR-based detection (€ symbol) over Azure field (which can be wrong)
  const ocrCurrency = extractCurrency(contentText);

  // --- Multi-Document path: Azure found multiple receipts ---
  if (docs.length > 1) {
    const lineItems: ParsedLineItem[] = [];
    let totalGross = 0;
    let totalVat = 0;
    let totalNet = 0;
    let earliestDate: string | undefined;
    let minConfidence: number | null = null;

    for (const doc of docs) {
      const fields = doc.fields || {};
      const docTotal = getNumber(fields.Total) ?? 0;
      const docVat = getNumber(fields.TotalTax) ?? 0;
      const docNet = getNumber(fields.Subtotal) ?? 0;
      const docDate = resolvePreferredDate(fields.TransactionDate);
      const docVendor = getValue(fields.MerchantName) ?? "Unknown";

      totalGross += docTotal;
      totalVat += docVat;
      totalNet += docNet;

      if (docDate && (!earliestDate || docDate < earliestDate)) {
        earliestDate = docDate;
      }
      if (doc.confidence != null) {
        minConfidence =
          minConfidence == null
            ? doc.confidence
            : Math.min(minConfidence, doc.confidence);
      }

      lineItems.push({
        description: `${docVendor}${docDate ? ` (${docDate})` : ""}`,
        quantity: 1,
        unitPrice: docTotal,
        totalPrice: docTotal,
        vatRate: null,
      });
    }

    const parsed: ParsedDocument = {
      sourceType: "receipt",
      documentType: "receipt",
      invoiceNumber: extractInvoiceNumber(contentText) ?? undefined,
      invoiceDate: earliestDate ?? extractLatestDateFromOcr(contentText) ?? undefined,
      vendorName: mostFrequentVendor(docs),
      totalNet: roundCurrency(totalNet) || null,
      totalVat: roundCurrency(totalVat) || null,
      totalGross: roundCurrency(totalGross),
      currency: ocrCurrency || docs[0].fields?.Total?.valueCurrency?.currencyCode || "EUR",
      lineItems,
      rawMeta: {
        extractionPipeline: "items" as const,
        itemsCount: docs.length,
      },
    };

    return { parsed, confidence: minConfidence, rawResponse: azureResult };
  }

  // --- Single-Document path: try OCR fallback for multi-receipt pages ---
  const doc = docs[0];
  const fields = doc.fields || {};
  const confidence = doc.confidence || null;
  const rawSingleTotal = getNumber(fields.Total);

  // Sanitize the Azure total: detect handwriting OCR decimal errors
  // e.g. Azure content "55.006" → valueCurrency 55006, but real amount is 55.01 or similar
  const singleTotal = sanitizeReceiptTotal(rawSingleTotal, fields.Total);

  // Check OCR for additional amounts
  const ocrExtraction = extractReceiptItemsFromOcr(contentText);
  const hasMultipleOcrAmounts = ocrExtraction.items.length > 1;
  const ocrTotalDiffersFromAzure =
    singleTotal != null &&
    ocrExtraction.total > 0 &&
    Math.abs(ocrExtraction.total - singleTotal) > 0.01;

  // Also check: if Azure total is implausibly large compared to OCR amounts,
  // prefer the OCR extraction even with a single OCR amount.
  const azureTotalImplausible =
    singleTotal != null &&
    ocrExtraction.total > 0 &&
    singleTotal > ocrExtraction.total * 10 &&
    singleTotal > 500;

  if (hasMultipleOcrAmounts && ocrTotalDiffersFromAzure) {
    // OCR found more receipts than Azure – use OCR extraction
    const ocrTotalVat = getNumber(fields.TotalTax);
    const ocrTotalNet = ocrTotalVat != null ? roundCurrency(ocrExtraction.total - ocrTotalVat) : null;
    const parsed: ParsedDocument = {
      sourceType: "receipt",
      documentType: "receipt",
      invoiceNumber: extractInvoiceNumber(contentText) ?? undefined,
      invoiceDate: resolvePreferredDate(fields.TransactionDate) ?? extractLatestDateFromOcr(contentText) ?? undefined,
      vendorName: cleanPartyName(getValue(fields.MerchantName)),
      totalNet: ocrTotalNet,
      totalVat: ocrTotalVat,
      totalGross: ocrExtraction.total,
      currency: ocrCurrency || fields.Total?.valueCurrency?.currencyCode || "EUR",
      lineItems: ocrExtraction.items,
      rawMeta: {
        extractionPipeline: "items" as const,
        itemsCount: ocrExtraction.items.length,
        ocrMultiReceipt: true,
        azureSingleTotal: rawSingleTotal,
        ocrTotal: ocrExtraction.total,
      },
    };

    return { parsed, confidence, rawResponse: azureResult };
  }

  if (azureTotalImplausible && ocrExtraction.items.length >= 1) {
    // Azure total is wildly off (e.g. handwriting "55,06" → 55006) but OCR found
    // plausible amounts. Use OCR extraction as fallback.
    const ocrTotalVat = getNumber(fields.TotalTax);
    const ocrTotalNet = ocrTotalVat != null ? roundCurrency(ocrExtraction.total - ocrTotalVat) : null;
    const parsed: ParsedDocument = {
      sourceType: "receipt",
      documentType: "receipt",
      invoiceNumber: extractInvoiceNumber(contentText) ?? undefined,
      invoiceDate: resolvePreferredDate(fields.TransactionDate) ?? extractLatestDateFromOcr(contentText) ?? undefined,
      vendorName: cleanPartyName(getValue(fields.MerchantName)),
      totalNet: ocrTotalNet,
      totalVat: ocrTotalVat,
      totalGross: ocrExtraction.total,
      currency: ocrCurrency || fields.Total?.valueCurrency?.currencyCode || "EUR",
      lineItems: ocrExtraction.items,
      rawMeta: {
        extractionPipeline: "items" as const,
        itemsCount: ocrExtraction.items.length,
        implausibleAzureTotal: true,
        azureSingleTotal: rawSingleTotal,
        ocrTotal: ocrExtraction.total,
      },
    };

    return { parsed, confidence, rawResponse: azureResult };
  }

  // --- Standard single-receipt path (original behavior, with currency fix) ---

  // Extract amounts from Azure fields
  let receiptTotalGross = singleTotal;
  let receiptTotalNet = getNumber(fields.Subtotal);
  const receiptTotalVat = getNumber(fields.TotalTax);

  // Sanity check: if Subtotal (net) > Total (gross), Azure likely reversed them.
  // Net should never exceed gross. Swap to fix (e.g. DB Online-Ticket: Azure puts
  // MwSt column value as Total and the real Summe as Subtotal).
  if (
    receiptTotalNet != null &&
    receiptTotalGross != null &&
    receiptTotalNet > receiptTotalGross
  ) {
    const temp = receiptTotalGross;
    receiptTotalGross = receiptTotalNet;
    receiptTotalNet = temp;
  }

  // Fallback: calculate totalNet from totalGross - totalVat when Azure doesn't provide Subtotal
  if (receiptTotalNet == null && receiptTotalGross != null && receiptTotalVat != null) {
    receiptTotalNet = roundCurrency(receiptTotalGross - receiptTotalVat);
  }

  const parsed: ParsedDocument = {
    sourceType: "receipt",
    documentType: "receipt",
    invoiceNumber: extractInvoiceNumber(contentText) ?? undefined,
    invoiceDate: resolvePreferredDate(fields.TransactionDate) ?? extractLatestDateFromOcr(contentText) ?? undefined,
    vendorName: cleanPartyName(getValue(fields.MerchantName)),
    totalNet: receiptTotalNet,
    totalVat: receiptTotalVat,
    totalGross: receiptTotalGross,
    currency: ocrCurrency || fields.Total?.valueCurrency?.currencyCode || "EUR",
    lineItems: [],
  };

  const items = fields.Items?.valueArray || [];
  parsed.lineItems = items.map((item) => {
    const itemFields = item.valueObject || {};
    return {
      description: getValue(itemFields.Description) || "",
      quantity: getNumber(itemFields.Quantity),
      unitPrice: getNumber(itemFields.Price),
      totalPrice: getNumber(itemFields.TotalPrice),
      vatRate: null,
    };
  });

  return { parsed, confidence, rawResponse: azureResult };
}
