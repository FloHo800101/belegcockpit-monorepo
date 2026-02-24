// Azure Invoice Mapper – mapAzureInvoiceToParseResult

import { AzureParseResult, ParsedDocument } from "../types.ts";
import {
  normalizeOcrText,
  parsePercent,
  parseGermanDateText,
  extractCurrency,
} from "./parse-utils.ts";
import {
  AzureAnalyzeResult,
  AzureField,
  getValue,
  getNumber,
  toParsedAddress,
  extractDateFromField,
  resolvePreferredDate,
} from "./azure-field-helpers.ts";
import {
  BUYER_LABELS,
  VENDOR_LABELS,
  extractBuyerFromHeaderBlock,
  extractNameFromRecipientField,
  extractLabeledParty,
  extractLabeledDate,
  pickPrimaryParty,
  samePartyName,
} from "./party-extraction.ts";
import {
  extractRecurringContractAmount,
  extractInvoiceNumber,
  extractTaxInstallmentPlan,
  buildInstallmentLineItems,
  extractLatestInstallmentDueDate,
} from "./installment-plan.ts";

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
  const aliasFields = fields as Record<string, AzureField>;
  const confidence = doc.confidence || null;

  const contentText = (result?.content ?? "").toString();

  const vendorAddressRecipient =
    getValue(fields.VendorAddressRecipient) ??
    getValue(aliasFields.SellerAddressRecipient) ??
    getValue(aliasFields.SupplierAddressRecipient);
  const customerAddressRecipient =
    getValue(fields.CustomerAddressRecipient) ??
    getValue(aliasFields.BuyerAddressRecipient) ??
    getValue(aliasFields.BillTo);
  const buyerFromHeader = extractBuyerFromHeaderBlock(
    contentText,
    getValue(fields.VendorName) ?? getValue(aliasFields.MerchantName)
  );

  const buyerCandidates = [
    getValue(fields.CustomerName),
    getValue(aliasFields.BuyerName),
    buyerFromHeader,
    customerAddressRecipient,
    extractNameFromRecipientField(fields.CustomerAddressRecipient),
    extractNameFromRecipientField(aliasFields.BuyerAddressRecipient),
    extractNameFromRecipientField(aliasFields.BillTo),
    extractLabeledParty(contentText, BUYER_LABELS),
  ];
  const vendorCandidates = [
    getValue(fields.VendorName),
    getValue(aliasFields.SellerName),
    getValue(aliasFields.SupplierName),
    getValue(aliasFields.MerchantName),
    vendorAddressRecipient,
    extractNameFromRecipientField(fields.VendorAddressRecipient),
    extractNameFromRecipientField(aliasFields.SellerAddressRecipient),
    extractNameFromRecipientField(aliasFields.SupplierAddressRecipient),
    extractLabeledParty(contentText, VENDOR_LABELS),
    getValue(fields.CustomerName),
  ];

  let buyerName = pickPrimaryParty(buyerCandidates);
  const vendorName = pickPrimaryParty(vendorCandidates, buyerName);
  if (buyerName && vendorName && samePartyName(buyerName, vendorName)) {
    const distinctBuyer = pickPrimaryParty(buyerCandidates, vendorName);
    if (distinctBuyer && !samePartyName(distinctBuyer, vendorName)) {
      buyerName = distinctBuyer;
    }
  }
  if (!buyerName) {
    buyerName = pickPrimaryParty(buyerCandidates, vendorName);
  }

  const vendorAddress = toParsedAddress(fields.VendorAddress?.valueAddress ?? null);
  const buyerAddress = toParsedAddress(fields.CustomerAddress?.valueAddress ?? null);
  const serviceDateField =
    fields.ServiceDate || fields.ServicePeriodStart || fields.ServicePeriodEnd || null;
  const serviceDateText = extractServiceDateText(contentText);
  const invoiceDate =
    resolvePreferredDate(fields.InvoiceDate) ||
    resolvePreferredDate(fields.TransactionDate) ||
    extractLabeledDate(contentText, [
      "Rechnungsdatum",
      "Ausgestellt am",
      "Invoice date",
      "Issued on",
      "Datum",
      "Date",
    ]) ||
    undefined;
  const dueDate =
    resolvePreferredDate(fields.DueDate) ||
    extractLabeledDate(contentText, ["Fällig am", "Faellig am", "Due date", "Payment due"]) ||
    null;
  const serviceDate =
    extractDateFromField(serviceDateField) ||
    parseGermanDateText(getValue(serviceDateField)) ||
    parseGermanDateText(serviceDateText) ||
    undefined;
  const totalNetFromFields =
    getNumber(fields.SubTotal) ?? getNumber((fields as Record<string, AzureField>).Subtotal);
  const totalGrossFromFields =
    getNumber(fields.InvoiceTotal) ?? getNumber((fields as Record<string, AzureField>).Total);
  const recurringContractAmountFallback =
    totalNetFromFields == null && totalGrossFromFields == null
      ? extractRecurringContractAmount(contentText)
      : null;

  const parsed: ParsedDocument = {
    sourceType: "invoice",
    documentType: "invoice",
    invoiceNumber:
      getValue(fields.InvoiceId) ??
      getValue((fields as Record<string, AzureField>).ReceiptId) ??
      extractInvoiceNumber(contentText) ??
      undefined,
    invoiceDate,
    dueDate,
    vendorName,
    vendorAddress,
    buyerName,
    buyerAddress,
    customerId: getValue(fields.CustomerId),
    vendorTaxId: getValue(fields.VendorTaxId),
    totalNet: totalNetFromFields ?? recurringContractAmountFallback,
    totalVat: getNumber(fields.TotalTax),
    totalGross: totalGrossFromFields ?? recurringContractAmountFallback,
    currency:
      extractCurrency(contentText) ||
      fields.InvoiceTotal?.valueCurrency?.currencyCode ||
      (fields as Record<string, AzureField>).Total?.valueCurrency?.currencyCode ||
      fields.SubTotal?.valueCurrency?.currencyCode ||
      (fields as Record<string, AzureField>).Subtotal?.valueCurrency?.currencyCode ||
      "EUR",
    serviceDate,
    lineItems: [],
    vatItems: [],
    rawMeta: {
      paymentDetails: fields.PaymentDetails?.valueArray ?? null,
      vendorAddressRecipient,
      customerAddressRecipient,
      serviceDateText,
    },
  };

  const items = fields.Items?.valueArray || [];
  parsed.lineItems = items.map((item) => {
    const itemFields = item.valueObject || {};
    const quantity = getNumber(itemFields.Quantity);
    const totalPrice =
      getNumber(itemFields.Amount) ??
      getNumber(itemFields.TotalPrice) ??
      getNumber(itemFields.LineTotal);
    let unitPrice = getNumber(itemFields.UnitPrice) ?? getNumber(itemFields.Price);
    if (!unitPrice && quantity && totalPrice) {
      unitPrice = totalPrice / quantity;
    }
    const itemTaxRate =
      getNumber(itemFields.TaxRate) ??
      parsePercent(getValue(itemFields.TaxRate)) ??
      null;
    const itemTaxAmount = getNumber(itemFields.Tax) ?? getNumber(itemFields.TaxAmount);
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

  const installmentPlan = extractTaxInstallmentPlan(
    contentText,
    parsed.totalGross ?? parsed.totalNet ?? null
  );
  if (installmentPlan) {
    parsed.rawMeta = {
      ...(parsed.rawMeta ?? {}),
      paymentPlan: {
        type: "tax_installments",
        totalAmount: installmentPlan.totalAmount,
        installmentAmount: installmentPlan.installmentAmount,
        installmentsCount: installmentPlan.installmentsCount,
      },
    };

    if ((parsed.lineItems?.length ?? 0) === 0) {
      parsed.lineItems = buildInstallmentLineItems(installmentPlan);
    }

    if (!parsed.dueDate) {
      const latestDue = extractLatestInstallmentDueDate(contentText);
      if (latestDue) {
        parsed.dueDate = latestDue;
      }
    }
  }

  return { parsed, confidence, rawResponse: azureResult };
}
