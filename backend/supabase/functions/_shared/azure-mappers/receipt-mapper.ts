// Azure Receipt Mapper – mapAzureReceiptToParseResult

import { AzureParseResult, ParsedDocument } from "../types.ts";
import { AzureAnalyzeResult, getValue, getNumber, getDate } from "./azure-field-helpers.ts";

export function mapAzureReceiptToParseResult(azureResult: unknown): AzureParseResult {
  const result = azureResult as AzureAnalyzeResult | null | undefined;
  if (!result?.documents?.[0]) {
    return { parsed: null, confidence: null, rawResponse: azureResult };
  }

  const doc = result.documents[0];
  const fields = doc.fields || {};
  const confidence = doc.confidence || null;

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
