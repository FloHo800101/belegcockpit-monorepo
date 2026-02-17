import {
  AzureParseResult,
  ParsedAddress,
  ParsedDocument,
  ParsedTransaction,
} from "./types.ts";
import { detectStatementDate, detectStatementPeriod } from "./document-type-detection.ts";

type AzureAddress = {
  streetAddress?: string;
  road?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  countryRegion?: string;
  country?: string;
};

type AzureValueCurrency = {
  amount?: number;
  currencyCode?: string;
};

type AzureField = {
  valueString?: string;
  content?: string;
  valueNumber?: number;
  valueCurrency?: AzureValueCurrency;
  valueDate?: string;
  valueArray?: Array<{ valueObject?: Record<string, AzureField> }>;
  valueObject?: Record<string, AzureField>;
  valueAddress?: AzureAddress;
};

type AzureDocument = {
  fields?: Record<string, AzureField>;
  confidence?: number;
};

type AzureAnalyzeResult = {
  documents?: AzureDocument[];
  content?: string;
  keyValuePairs?: unknown[];
  tables?: unknown[];
};

function toParsedAddress(address?: AzureAddress | null): ParsedAddress | null {
  if (!address) return null;
  const street =
    address.streetAddress ||
    [address.road, address.houseNumber].filter(Boolean).join(" ") ||
    null;
  return {
    street: street || null,
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    country: address.countryRegion ?? address.country ?? "DE",
  };
}

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const percent = Number(normalized);
  if (Number.isNaN(percent)) return null;
  return percent / 100;
}

function parseGermanDateText(value: string | null | undefined): string | null {
  return parseDateFlexible(value);
}

function normalizeOcrText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function parseDateFlexible(
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

function parseAmount(value: string | null | undefined): number | null {
  return parseAmountFlexible(value);
}

function parseAmountFlexible(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = normalizeOcrText(value).replace(/\s/g, "");
  const match = text.match(/[-+]?\d[\d.,]*\d(?:[.,]\d{2})/);
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

function extractFirstLineValue(content: string, label: string): string | null {
  const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\r\\n]+)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractIban(content: string): string | null {
  const match = content.match(
    /\b([A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{3,5}){2,8})\b/i
  );
  if (!match) return null;
  return match[1].replace(/[\s-]/g, "").toUpperCase();
}

function extractBic(content: string): string | null {
  const match = content.match(/(?:BIC|SWIFT)\s*[:\-]?\s*([A-Z0-9]{8,11})/i);
  if (match) return match[1];
  const fallback = content.match(/\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/);
  return fallback ? fallback[0] : null;
}

function extractCurrency(content: string): string | null {
  const normalized = normalizeOcrText(content).toUpperCase();
  if (/\bEUR\b/.test(normalized)) return "EUR";
  if (/\bCHF\b/.test(normalized)) return "CHF";
  if (/\bUSD\b/.test(normalized)) return "USD";
  return null;
}

function extractBalance(content: string, label: string): number | null {
  const lineValue = extractFirstLineValue(content, label);
  return parseAmount(lineValue);
}

function resolveReferenceYear(
  statementPeriod: { from: string; to: string } | null,
  statementDate: string | null
): number {
  if (statementPeriod?.to) {
    const year = Number(statementPeriod.to.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  if (statementDate) {
    const year = Number(statementDate.slice(0, 4));
    if (Number.isFinite(year)) return year;
  }
  return new Date().getUTCFullYear();
}

function extractTransactions(content: string, currencyFallback: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const match = line.match(
      /(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?).*?([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?:\s*([A-Z]{3}))?/
    );
    if (!match) continue;
    const bookingDate = parseDateFlexible(match[1]);
    if (!bookingDate) continue;
    const amount = parseAmount(match[2]);
    if (amount == null) continue;
    const description = line
      .replace(match[1], "")
      .replace(match[2], "")
      .trim();
    const counterpartyName = extractCounterpartyName(description);
    transactions.push({
      bookingDate,
      valueDate: null,
      amount,
      currency: match[3] || currencyFallback,
      description,
      counterpartyName,
      bookingType: "unknown" as const,
    });
  }

  return transactions;
}

function formatGermanDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function amountsEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function isDateOnlyLine(line: string): boolean {
  return /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(line.trim());
}

function extractCounterpartyName(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(
    /^(lastschrift|gutschrift|ueberweisung|uberweisung|entgelt|zahlung|zahlg\.?|girosammel|girocard)\s+/i,
    ""
  );
  const normalized = cleaned.trim();
  return normalized ? normalized : null;
}

function findTransactionBlock(
  lines: string[],
  startIndex: number,
  dateText: string,
  amount: number
): { dateIndex: number; amountIndex: number } | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (!lines[i].includes(dateText)) continue;

    const maxLookahead = Math.min(lines.length, i + 7);
    for (let j = i; j < maxLookahead; j += 1) {
      const lineAmount = parseAmount(lines[j]);
      if (lineAmount == null) continue;
      if (amountsEqual(lineAmount, amount)) {
        return { dateIndex: i, amountIndex: j };
      }
    }
  }

  return null;
}

function extractTransactionsFromItems(
  content: string,
  items: Array<{ valueObject?: Record<string, AzureField> }>,
  currencyFallback: string,
  referenceYear: number
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);
  const transactions: ParsedTransaction[] = [];
  let cursor = 0;

  const blocks = items.map((item) => {
    const fields = item.valueObject || {};
    const dateIso =
      fields.Date?.valueDate ||
      parseDateFlexible(fields.Date?.valueString || fields.Date?.content, referenceYear);
    const amount =
      fields.Amount?.valueCurrency?.amount ??
      fields.Amount?.valueNumber ??
      parseAmount(fields.Amount?.valueString || fields.Amount?.content);

    if (!dateIso || amount == null) return null;
    const dateText = formatGermanDate(dateIso);
    if (!dateText) return null;

    const block = findTransactionBlock(lines, cursor, dateText, amount);
    if (block) {
      cursor = block.amountIndex + 1;
    }
    return { block, dateIso, amount, fields };
  });

  blocks.forEach((entry, index) => {
    if (!entry) return;
    const { block, dateIso, amount, fields } = entry;
    const currency = fields.Amount?.valueCurrency?.currencyCode || currencyFallback;
    const fallbackDescription =
      fields.Description?.valueString || fields.Description?.content || "";

    let description = fallbackDescription;
    let reference: string | null = null;
    let counterpartyName = extractCounterpartyName(description);

    if (block) {
      const { dateIndex, amountIndex } = block;
      const descriptionLines = lines
        .slice(dateIndex + 1, amountIndex)
        .filter((line) => line && !isDateOnlyLine(line));
      if (descriptionLines.length) {
        description = descriptionLines.join(" ");
        counterpartyName = extractCounterpartyName(description);
      }

      const nextBlock = blocks.slice(index + 1).find((candidate) => candidate?.block);
      const nextStart = nextBlock?.block?.dateIndex ?? lines.length;
      const referenceLines = lines
        .slice(amountIndex + 1, nextStart)
        .filter((line) => line && !isDateOnlyLine(line));
      if (referenceLines.length) {
        reference = referenceLines.join("\n");
      }
    }

    transactions.push({
      bookingDate: dateIso,
      valueDate: null,
      amount,
      currency,
      description,
      counterpartyName,
      reference,
      bookingType: "unknown" as const,
    });
  });

  return transactions;
}

function isSectionHeader(line: string): boolean {
  return /^(belastung|gutschrift|abrechnungstag|transaktionen|eing[aä]nge|ausg[aä]nge)$/i.test(
    normalizeOcrText(line).toLowerCase()
  );
}

function extractTransactionsFromStatementLines(
  content: string,
  currencyFallback: string,
  referenceYear: number
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => normalizeOcrText(line))
    .filter(Boolean);

  const dateStartPattern = /^(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/;
  const amountTailPattern =
    /([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?:\s*([A-Z]{3}))?\s*$/;
  const out: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const dateMatch = line.match(dateStartPattern);
    if (!dateMatch) continue;

    const amountMatch = line.match(amountTailPattern);
    if (!amountMatch) continue;

    const bookingDate = parseDateFlexible(dateMatch[1], referenceYear);
    const amount = parseAmountFlexible(amountMatch[1]);
    if (!bookingDate || amount == null) continue;

    const headless = line.slice(dateMatch[0].length);
    const amountToken = amountMatch[0];
    const amountPos = headless.lastIndexOf(amountToken);
    const firstDescription =
      amountPos >= 0 ? headless.slice(0, amountPos).trim() : headless.trim();
    const descLines = [firstDescription].filter(Boolean);

    for (let j = i + 1; j < lines.length; j += 1) {
      const nextLine = lines[j];
      if (dateStartPattern.test(nextLine)) break;
      if (isSectionHeader(nextLine)) continue;
      descLines.push(nextLine);
    }

    const description = descLines.join(" ").replace(/\s+/g, " ").trim();
    const counterpartyName = extractCounterpartyName(description);
    out.push({
      bookingDate,
      valueDate: null,
      amount,
      currency: amountMatch[2] || currencyFallback,
      description,
      counterpartyName,
      bookingType: "unknown" as const,
    });
  }

  return out;
}

function extractBalanceByPatterns(content: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match) continue;
    const amount = parseAmountFlexible(match[1] ?? match[0]);
    if (amount != null) return amount;
  }
  return null;
}

function extractServiceDateText(content: string | null | undefined): string | null {
  if (!content) return null;
  const match = content.match(/Leistungsdatum:\s*([^\r\n]+)/i);
  return match ? match[1].trim() : null;
}

export function mapAzureInvoiceToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.[0]) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const doc = result.documents[0];
  const fields = doc.fields || {};
  const confidence = doc.confidence || null;

  const getValue = (field?: AzureField | null) => field?.valueString || field?.content || null;
  const getNumber = (field?: AzureField | null) =>
    field?.valueNumber ?? field?.valueCurrency?.amount ?? null;
  const getDate = (field?: AzureField | null) => field?.valueDate || null;

  const vendorAddress = toParsedAddress(fields.VendorAddress?.valueAddress ?? null);
  const buyerAddress = toParsedAddress(fields.CustomerAddress?.valueAddress ?? null);
  const serviceDateField =
    fields.ServiceDate || fields.ServicePeriodStart || fields.ServicePeriodEnd || null;
  const serviceDateText = extractServiceDateText(result?.content);
  const serviceDate =
    getDate(serviceDateField) ||
    parseGermanDateText(getValue(serviceDateField)) ||
    parseGermanDateText(serviceDateText) ||
    undefined;

  const parsed: ParsedDocument = {
    sourceType: "invoice",
    documentType: "invoice",
    invoiceNumber: getValue(fields.InvoiceId) ?? undefined,
    invoiceDate: getDate(fields.InvoiceDate) ?? undefined,
    dueDate: getDate(fields.DueDate),
    vendorName: getValue(fields.VendorName),
    vendorAddress,
    buyerName: getValue(fields.CustomerName),
    buyerAddress,
    customerId: getValue(fields.CustomerId),
    vendorTaxId: getValue(fields.VendorTaxId),
    totalNet: getNumber(fields.SubTotal),
    totalVat: getNumber(fields.TotalTax),
    totalGross: getNumber(fields.InvoiceTotal),
    currency:
      fields.InvoiceTotal?.valueCurrency?.currencyCode ||
      fields.SubTotal?.valueCurrency?.currencyCode ||
      "EUR",
    serviceDate,
    lineItems: [],
    vatItems: [],
    rawMeta: {
      paymentDetails: fields.PaymentDetails?.valueArray ?? null,
      vendorAddressRecipient: getValue(fields.VendorAddressRecipient),
      customerAddressRecipient: getValue(fields.CustomerAddressRecipient),
      serviceDateText,
    },
  };

  const items = fields.Items?.valueArray || [];
  parsed.lineItems = items.map((item) => {
    const itemFields = item.valueObject || {};
    const quantity = getNumber(itemFields.Quantity);
    const totalPrice = getNumber(itemFields.Amount);
    let unitPrice = getNumber(itemFields.UnitPrice);
    if (!unitPrice && quantity && totalPrice) {
      unitPrice = totalPrice / quantity;
    }
    const itemTaxRate =
      getNumber(itemFields.TaxRate) ??
      parsePercent(getValue(itemFields.TaxRate)) ??
      null;
    const itemTaxAmount = getNumber(itemFields.Tax);
    const vatRate =
      itemTaxRate ??
      (itemTaxAmount != null && totalPrice ? itemTaxAmount / totalPrice : null);

    return {
      description: getValue(itemFields.Description) || "",
      quantity,
      unitPrice,
      totalPrice,
      vatRate,
    };
  });

  const taxDetails = fields.TaxDetails?.valueArray ?? [];
  parsed.vatItems = taxDetails
    .map((detail) => {
      const detailFields = detail.valueObject || {};
      const rate = parsePercent(getValue(detailFields.Rate));
      const amount = getNumber(detailFields.Amount);
      if (rate == null || amount == null) return null;
      const netAmount =
        getNumber(detailFields.NetAmount) ?? (rate > 0 ? amount / rate : amount);
      return { rate, amount, netAmount };
    })
    .filter(Boolean) as ParsedDocument["vatItems"];

  if ((parsed.vatItems?.length ?? 0) === 1) {
    const fallbackRate = parsed.vatItems?.[0]?.rate ?? null;
    if (fallbackRate != null) {
      parsed.lineItems = (parsed.lineItems ?? []).map((item) => ({
        ...item,
        vatRate: item.vatRate ?? fallbackRate,
      }));
    }
  }

  return { parsed, confidence, rawResponse: azureResult };
}

export function mapAzureReceiptToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.[0]) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const doc = result.documents[0];
  const fields = doc.fields || {};
  const confidence = doc.confidence || null;

  const getValue = (field?: AzureField | null) => field?.valueString || field?.content || null;
  const getNumber = (field?: AzureField | null) =>
    field?.valueNumber ?? field?.valueCurrency?.amount ?? null;
  const getDate = (field?: AzureField | null) => field?.valueDate || null;

  const parsed: ParsedDocument = {
    sourceType: "receipt",
    documentType: "receipt",
    invoiceDate: getDate(fields.TransactionDate) ?? undefined,
    vendorName: getValue(fields.MerchantName),
    totalNet: getNumber(fields.Subtotal),
    totalVat: getNumber(fields.TotalTax),
    totalGross: getNumber(fields.Total),
    currency: fields.Total?.valueCurrency?.currencyCode || "EUR",
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

export function mapAzureLayoutToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const keyValuePairs = result.keyValuePairs || [];
  const tables = result.tables || [];

  const parsed: ParsedDocument = {
    sourceType: "layout",
    documentType: "unknown",
    rawMeta: { keyValuePairs, tables },
  };

  return { parsed, confidence: 0.5, rawResponse: azureResult };
}

export function mapAzureBankStatementToParseResult(
  azureResult: unknown,
  fileName?: string | null
): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const content = (result?.content ?? "").toString();
  const statementDate = detectStatementDate(content);
  const statementPeriod = detectStatementPeriod(content);
  const referenceYear = resolveReferenceYear(statementPeriod, statementDate);
  const currency = extractCurrency(content) ?? "EUR";
  const items = result.documents?.[0]?.fields?.Items?.valueArray ?? [];
  const parsedFromItems = extractTransactionsFromItems(
    content,
    items,
    currency,
    referenceYear
  );
  const parsedFromLines = extractTransactionsFromStatementLines(
    content,
    currency,
    referenceYear
  );
  const transactions =
    parsedFromItems.length > 0
      ? parsedFromItems
      : parsedFromLines.length > 0
      ? parsedFromLines
      : extractTransactions(content, currency);

  const openingBalance =
    extractBalance(content, "Alter Saldo") ??
    extractBalance(content, "Anfangssaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))/i,
    ]);
  const closingBalance =
    extractBalance(content, "Neuer Saldo") ??
    extractBalance(content, "Endsaldo") ??
    extractBalanceByPatterns(content, [
      /kontostand am [\d./]+\s*([+-]?\s?\d[\d., ]*\d(?:[.,]\d{2}))(?![\s\S]*kontostand am)/i,
    ]);

  const iban = extractIban(content);
  const bic = extractBic(content);
  const hasStrongMetadata =
    Boolean(iban || bic) &&
    Boolean(statementPeriod || statementDate || openingBalance != null || closingBalance != null);
  const isLikelyBankStatement = transactions.length > 0 || hasStrongMetadata;
  const confidence = Math.min(
    0.95,
    0.4 +
      Math.min(0.35, transactions.length * 0.02) +
      (hasStrongMetadata ? 0.15 : 0) +
      (statementPeriod ? 0.05 : 0)
  );

  const parsed: ParsedDocument = {
    sourceType: isLikelyBankStatement ? "bank_statement" : "unknown",
    documentType: isLikelyBankStatement ? "bank_statement" : "unknown",
    bankName: extractFirstLineValue(content, "Bank") ?? null,
    iban,
    bic,
    accountHolder:
      extractFirstLineValue(content, "Kontoinhaber") ??
      extractFirstLineValue(content, "Account Holder") ??
      null,
    currency,
    statementDate,
    statementPeriod,
    openingBalance,
    closingBalance,
    transactions,
    source: {
      fileName: fileName ?? undefined,
      extractedBy: "azure",
    },
    rawMeta: {
      contentLength: content.length,
      extractionPipeline:
        parsedFromItems.length > 0
          ? "items"
          : parsedFromLines.length > 0
          ? "statement_lines"
          : "legacy_lines",
      qualityGatePassed: isLikelyBankStatement,
    },
  };

  return { parsed, confidence, rawResponse: azureResult };
}
