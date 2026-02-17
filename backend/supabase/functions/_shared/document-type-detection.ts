import { DocumentType } from "./types.ts";

type DetectionInput = {
  text: string;
  fileName?: string | null;
  azureResult?: any;
};

type DetectionResult = {
  documentType: DocumentType;
  confidence: number;
  reasons: string[];
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function replaceUmlauts(text: string) {
  return text
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function splitLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim());
}

function parseGermanDateToIso(value: string): string | null {
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function countTransactionLines(lines: string[]) {
  const lineRegex =
    /(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?).*?([+-]?\s?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s?[A-Z]{3})?/;
  return lines.filter((line) => lineRegex.test(line)).length;
}

function hasIban(text: string) {
  return /iban/.test(text) || /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(text);
}

function hasBic(text: string) {
  return /(bic|swift)/.test(text) || /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/.test(text);
}

function hasBankIdentifiersFromAzure(azureResult: any) {
  const fields = azureResult?.documents?.[0]?.fields ?? {};
  const paymentDetails = fields.PaymentDetails?.valueArray ?? [];
  for (const detail of paymentDetails) {
    const detailFields = detail?.valueObject ?? {};
    const iban =
      detailFields.IBAN?.valueString ||
      detailFields.IBAN?.content ||
      detailFields.Iban?.valueString ||
      detailFields.Iban?.content ||
      null;
    const swift =
      detailFields.SWIFT?.valueString ||
      detailFields.SWIFT?.content ||
      detailFields.BIC?.valueString ||
      detailFields.BIC?.content ||
      null;
    if (iban || swift) {
      return true;
    }
  }
  return false;
}

export function detectDocumentType(input: DetectionInput): DetectionResult {
  const text = input.text ?? "";
  const normalizedOriginal = normalizeText(text);
  const normalized = replaceUmlauts(normalizedOriginal);
  const lines = splitLines(replaceUmlauts(text));

  const reasons: string[] = [];
  const bankReasons: string[] = [];
  const invoiceReasons: string[] = [];

  const bankKeywords = [
    "kontoauszug",
    "kontoauszuege",
    "kontoauszuge",
    "kontoauszug ohne rechnungsabschluss",
    "kontostand",
    "eingaenge",
    "ausgaenge",
    "alter saldo",
    "neuer saldo",
    "valuta",
    "buchung",
  ];
  const invoiceKeywords = ["rechnung", "invoice", "rechnungsnummer", "invoice no"];

  const bankKeywordHit = bankKeywords.some((kw) => normalized.includes(kw));
  const bankTransactionLineCount = countTransactionLines(lines);
  const bankHasIdentifiers =
    (hasIban(normalized) && hasBic(normalized)) || hasBankIdentifiersFromAzure(input.azureResult);

  const bankCriteria = [
    bankKeywordHit,
    bankTransactionLineCount >= 8,
    bankHasIdentifiers,
  ];
  const bankCriteriaCount = bankCriteria.filter(Boolean).length;

  let bankTextScore = bankCriteriaCount * 0.2;
  if (bankKeywordHit) bankReasons.push("keyword:bank");
  if (bankTransactionLineCount >= 8) {
    bankReasons.push("pattern:transactions");
  }
  if (bankHasIdentifiers) bankReasons.push("identifier:iban_bic");

  const invoiceKeywordHit = invoiceKeywords.some((kw) => normalized.includes(kw));
  const invoiceTaxHit = /(netto|mwst|ust|vat|brutto|gesamtbetrag)/.test(normalized);
  const invoiceDateHit = /(rechnungsdatum|faelligkeitsdatum|falligkeitsdatum|leistungsdatum|lieferdatum)/.test(
    normalized
  );
  const invoiceCriteria = [invoiceKeywordHit, invoiceTaxHit, invoiceDateHit];
  const invoiceCriteriaCount = invoiceCriteria.filter(Boolean).length;
  let invoiceTextScore = invoiceCriteriaCount * 0.2;
  if (invoiceKeywordHit) invoiceReasons.push("keyword:invoice");
  if (invoiceTaxHit) invoiceReasons.push("keyword:tax");
  if (invoiceDateHit) invoiceReasons.push("keyword:date");

  let bankStructureScore = 0;
  const hasBalances =
    /(alter saldo|anfangssaldo)/.test(normalized) &&
    /(neuer saldo|endsaldo)/.test(normalized);
  if (hasBalances) {
    bankStructureScore += 0.15;
    bankReasons.push("structure:balances");
  }
  if (bankTransactionLineCount >= 8) {
    bankStructureScore += 0.15;
  }

  let invoiceStructureScore = 0;
  const invoiceNumberHit =
    /(rechnungsnummer|invoice no|invoice number)\s*[:#]?\s*[a-z0-9\-\/]+/i.test(
      text
    );
  if (invoiceNumberHit) {
    invoiceStructureScore += 0.15;
    invoiceReasons.push("structure:invoice_number");
  }
  const lineItemHit = /(\d+[,.]?\d*)\s*(x|\*)\s*\d+[,.]\d{2}/i.test(text);
  if (lineItemHit) {
    invoiceStructureScore += 0.15;
    invoiceReasons.push("structure:line_items");
  }

  let invoiceAzureScore = 0;
  let bankAzureScore = 0;
  const fields = input.azureResult?.documents?.[0]?.fields ?? {};
  const hasInvoiceFields =
    fields.InvoiceId || fields.TaxDetails || fields.InvoiceTotal || fields.TotalTax;
  if (hasInvoiceFields) {
    invoiceAzureScore += 0.1;
    invoiceReasons.push("azure:invoice_fields");
  } else if (bankTransactionLineCount >= 8) {
    bankAzureScore += 0.1;
    bankReasons.push("azure:missing_invoice_fields");
  }

  const hasKontoauszugKeyword =
    normalized.includes("kontoauszug") ||
    normalized.includes("kontoauszuege") ||
    normalizedOriginal.includes("kontoauszüge");
  if (hasKontoauszugKeyword) {
    bankTextScore = Math.max(bankTextScore, 0.4);
    bankReasons.push("keyword:kontoauszug");
  }

  const bankScore = Math.min(
    1,
    bankTextScore + bankStructureScore + bankAzureScore
  );
  const invoiceScore = Math.min(
    1,
    invoiceTextScore + invoiceStructureScore + invoiceAzureScore
  );

  const strongBankSignals = [
    hasKontoauszugKeyword,
    bankHasIdentifiers,
    hasBalances,
    bankTransactionLineCount >= 8,
  ].filter(Boolean).length;

  const bankEligible =
    bankCriteriaCount >= 2 ||
    (bankCriteriaCount >= 1 && bankStructureScore >= 0.15) ||
    hasKontoauszugKeyword;
  const invoiceEligible =
    invoiceCriteriaCount >= 2 || (invoiceCriteriaCount >= 1 && invoiceStructureScore >= 0.15);

  if (strongBankSignals >= 3) {
    return {
      documentType: "bank_statement",
      confidence: Math.max(bankScore, 0.75),
      reasons: [...new Set([...bankReasons, "priority:strong_bank_signals"])],
    };
  }

  if (hasKontoauszugKeyword) {
    return {
      documentType: "bank_statement",
      confidence: Math.max(bankScore, 0.8),
      reasons: bankReasons,
    };
  }

  if (bankEligible && bankScore >= invoiceScore) {
    return {
      documentType: "bank_statement",
      confidence: bankScore,
      reasons: bankReasons,
    };
  }

  if (invoiceEligible && invoiceScore >= bankScore) {
    return {
      documentType: "invoice",
      confidence: invoiceScore,
      reasons: invoiceReasons,
    };
  }

  if (normalized.includes("kontoauszug") || normalized.includes("kontoauszuege")) {
    reasons.push("keyword:bank");
  }
  if (normalized.includes("rechnung") || normalized.includes("invoice")) {
    reasons.push("keyword:invoice");
  }

  return { documentType: "unknown", confidence: 0, reasons };
}

export function detectStatementPeriod(text: string) {
  const match = text.match(
    /(von|vom)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\s+(bis|-\s*)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i
  );
  if (!match) return null;
  const from = parseGermanDateToIso(match[2].replace(/\//g, "."));
  const to = parseGermanDateToIso(match[4].replace(/\//g, "."));
  if (!from || !to) return null;
  return { from, to };
}

export function detectStatementDate(text: string) {
  const normalized = replaceUmlauts(text);
  const match = normalized.match(
    /(auszugsdatum|kontoauszug|kontoauszuege|kontostand am)\s*[:\-]?\s*([^\r\n]+)/i
  );
  if (!match) return null;
  return parseGermanDateToIso(match[2].replace(/\//g, ".")) ?? null;
}
