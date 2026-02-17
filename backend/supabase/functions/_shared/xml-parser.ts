import { XMLParser } from "https://esm.sh/fast-xml-parser@4.3.2";
import { ParsedDocument } from "./types.ts";

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as XmlRecord;
  }
  return {};
}

function textFromNode(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return textFromNode(node[0]);
  }
  const value = asRecord(node)["#text"] ?? node;
  return value == null ? null : String(value);
}

function numberFromNode(node: unknown): number | null {
  const text = textFromNode(node);
  if (text == null || text === "") return null;
  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function firstNumber(...nodes: unknown[]): number | null {
  for (const node of nodes) {
    const value = numberFromNode(node);
    if (value != null) return value;
  }
  return null;
}

function firstText(...nodes: unknown[]): string | null {
  for (const node of nodes) {
    const value = textFromNode(node);
    if (value) return value;
  }
  return null;
}

function normalizeLineTotals(item: {
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}) {
  if (item.unitPrice == null && item.totalPrice != null && item.quantity) {
    item.unitPrice = item.totalPrice / item.quantity;
  }
  if (item.totalPrice == null && item.unitPrice != null && item.quantity) {
    item.totalPrice = item.unitPrice * item.quantity;
  }
}

export function parseXmlString(
  xmlString: string,
  sourceType: "xml" | "embedded_xml" = "xml"
): ParsedDocument {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });

    const xmlObj = parser.parse(xmlString) as XmlRecord;
    let invoice: ParsedDocument = { sourceType, documentType: "invoice" };

    if (xmlObj["rsm:CrossIndustryDocument"] || xmlObj["CrossIndustryDocument"]) {
      invoice = parseZUGFeRDv1(xmlObj);
    } else if (xmlObj["rsm:CrossIndustryInvoice"] || xmlObj["CrossIndustryInvoice"]) {
      invoice = parseCII(xmlObj);
    } else if (xmlObj["Invoice"] || xmlObj["ubl:Invoice"]) {
      const invoiceRoot = xmlObj["Invoice"] || xmlObj["ubl:Invoice"];
      const xmlns = asRecord(invoiceRoot)["@_xmlns"] || "";
      if (
        typeof xmlns === "string" &&
        xmlns.includes("urn:oasis:names:specification:ubl:schema:xsd:Invoice")
      ) {
        invoice = parseUBL(xmlObj);
      } else {
        invoice = parseGenericXML(xmlObj);
      }
    } else {
      invoice = parseGenericXML(xmlObj);
    }

    return invoice;
  } catch {
    return { sourceType: "unknown", documentType: "unknown" };
  }
}

function parseZUGFeRDv1(xmlObj: XmlRecord): ParsedDocument {
  const root = asRecord(
    xmlObj["rsm:CrossIndustryDocument"] || xmlObj["CrossIndustryDocument"]
  );
  const header = asRecord(root["rsm:HeaderExchangedDocument"]);
  const trade = asRecord(root["rsm:SpecifiedSupplyChainTradeTransaction"]);
  const settlement = asRecord(trade["ram:ApplicableSupplyChainTradeSettlement"]);
  const agreement = asRecord(trade["ram:ApplicableSupplyChainTradeAgreement"]);

  const invoice: ParsedDocument = { sourceType: "embedded_xml", documentType: "invoice" };

  invoice.invoiceNumber = textFromNode(header["ram:ID"]) ?? undefined;

  const issueDate = asRecord(header["ram:IssueDateTime"])["udt:DateTimeString"];
  if (issueDate) {
    const dateText = textFromNode(issueDate) ?? "";
    invoice.invoiceDate = formatDate(dateText);
  }

  const seller = asRecord(agreement["ram:SellerTradeParty"]);
  invoice.vendorName = textFromNode(seller["ram:Name"]) ?? undefined;
  invoice.vendorAddress = {
    street: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:LineOne"]),
    postalCode: textFromNode(
      asRecord(seller["ram:PostalTradeAddress"])["ram:PostcodeCode"]
    ),
    city: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:CityName"]),
    country: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:CountryID"]),
  };
  const sellerTax = asRecord(seller["ram:SpecifiedTaxRegistration"])["ram:ID"];
  if (sellerTax) {
    const taxId = textFromNode(sellerTax);
    if (taxId?.startsWith("DE") || taxId?.includes("VAT")) {
      invoice.vendorTaxId = taxId;
    } else {
      invoice.vendorTaxNumber = taxId;
    }
  }

  const buyer = asRecord(agreement["ram:BuyerTradeParty"]);
  invoice.buyerName = textFromNode(buyer["ram:Name"]) ?? undefined;
  invoice.buyerAddress = {
    street: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:LineOne"]),
    postalCode: textFromNode(
      asRecord(buyer["ram:PostalTradeAddress"])["ram:PostcodeCode"]
    ),
    city: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:CityName"]),
    country: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:CountryID"]),
  };

  const summation = asRecord(settlement["ram:SpecifiedTradeSettlementMonetarySummation"]);
  const taxBasis = summation["ram:TaxBasisTotalAmount"];
  const taxTotal = summation["ram:TaxTotalAmount"];
  const grandTotal = summation["ram:GrandTotalAmount"];

  invoice.totalNet = numberFromNode(taxBasis);
  invoice.totalVat = numberFromNode(taxTotal);
  invoice.totalGross = numberFromNode(grandTotal);
  invoice.currency = textFromNode(settlement["ram:InvoiceCurrencyCode"]) || "EUR";

  const paymentInfo = asRecord(settlement["ram:SpecifiedTradeSettlementPaymentMeans"]);
  invoice.paymentTerms = textFromNode(paymentInfo["ram:Information"]) ?? undefined;

  const deliveryEvent = asRecord(
    asRecord(trade["ram:ApplicableSupplyChainTradeDelivery"])["ram:ActualDeliverySupplyChainEvent"]
  );
  const serviceDate =
    asRecord(deliveryEvent["ram:OccurrenceDateTime"])["udt:DateTimeString"] ??
    asRecord(deliveryEvent["ram:OccurrenceDateTime"])["#text"];
  if (serviceDate) {
    invoice.serviceDate = formatDate(textFromNode(serviceDate) ?? "");
  }

  const lineItems = trade["ram:IncludedSupplyChainTradeLineItem"];
  if (lineItems) {
    invoice.lineItems = (Array.isArray(lineItems) ? lineItems : [lineItems]).map((item) => {
      const itemRecord = asRecord(item);
      const product = asRecord(itemRecord["ram:SpecifiedTradeProduct"]);
      const delivery = asRecord(itemRecord["ram:SpecifiedSupplyChainTradeDelivery"]);
      const lineAgreement = asRecord(itemRecord["ram:SpecifiedSupplyChainTradeAgreement"]);
      const lineSettlement = asRecord(itemRecord["ram:SpecifiedSupplyChainTradeSettlement"]);

      const quantity = delivery["ram:BilledQuantity"];
      const netPrice = asRecord(lineAgreement["ram:NetPriceProductTradePrice"]);
      const grossPrice = asRecord(lineAgreement["ram:GrossPriceProductTradePrice"]);
      const lineSummation =
        lineSettlement["ram:SpecifiedTradeSettlementMonetarySummation"] ||
        lineSettlement["SpecifiedTradeSettlementMonetarySummation"];
      const lineTax = asRecord(lineSettlement["ram:ApplicableTradeTax"]);

      const lineItem = {
        description: textFromNode(product["ram:Name"]) || "",
        quantity: numberFromNode(quantity),
        unitPrice: firstNumber(
          netPrice["ram:ChargeAmount"],
          grossPrice["ram:ChargeAmount"]
        ),
        totalPrice: firstNumber(
          asRecord(lineSummation)["ram:LineTotalAmount"],
          asRecord(asRecord(lineSummation)["ram:LineTotalAmount"])["#text"]
        ),
        vatRate:
          (firstNumber(
            lineTax["ram:ApplicablePercent"],
            lineTax["ram:RateApplicablePercent"]
          ) || 0) / 100 || null,
      };
      normalizeLineTotals(lineItem);
      return lineItem;
    });
  }

  const tradeTax = settlement["ram:ApplicableTradeTax"];
  if (tradeTax) {
    invoice.vatItems = (Array.isArray(tradeTax) ? tradeTax : [tradeTax]).map((tax) => ({
      rate:
        (numberFromNode(asRecord(tax)["ram:ApplicablePercent"]) || 0) / 100,
      amount: numberFromNode(asRecord(tax)["ram:CalculatedAmount"]) || 0,
      netAmount: numberFromNode(asRecord(tax)["ram:BasisAmount"]) || 0,
    }));
  }

  return invoice;
}

function parseCII(xmlObj: XmlRecord): ParsedDocument {
  const root = asRecord(
    xmlObj["rsm:CrossIndustryInvoice"] || xmlObj["CrossIndustryInvoice"]
  );
  const header = asRecord(root["rsm:ExchangedDocument"] || root["ExchangedDocument"]);
  const trade = asRecord(
    root["rsm:SupplyChainTradeTransaction"] || root["SupplyChainTradeTransaction"]
  );
  const settlement =
    trade["ram:ApplicableHeaderTradeSettlement"] || trade["ApplicableHeaderTradeSettlement"];
  const agreement =
    trade["ram:ApplicableHeaderTradeAgreement"] || trade["ApplicableHeaderTradeAgreement"];

  const invoice: ParsedDocument = { sourceType: "xml", documentType: "invoice" };

  invoice.invoiceNumber = textFromNode(header["ram:ID"] || header["ID"]) || undefined;

  const issueDate =
    asRecord(header["ram:IssueDateTime"])["udt:DateTimeString"] ||
    asRecord(header["IssueDateTime"])["DateTimeString"];
  if (issueDate) {
    const dateText = textFromNode(issueDate) ?? "";
    invoice.invoiceDate = formatDate(dateText);
  }

  const dueDate =
    asRecord(
      asRecord(asRecord(settlement)["ram:SpecifiedTradePaymentTerms"])["ram:DueDateDateTime"]
    )["udt:DateTimeString"];
  if (dueDate) {
    const dateText = textFromNode(dueDate) ?? "";
    invoice.dueDate = formatDate(dateText);
  }

  const seller = asRecord(
    asRecord(agreement)["ram:SellerTradeParty"] || asRecord(agreement)["SellerTradeParty"]
  );
  invoice.vendorName = textFromNode(seller["ram:Name"] || seller["Name"]) || undefined;
  invoice.vendorAddress = {
    street: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:LineOne"]),
    postalCode: textFromNode(
      asRecord(seller["ram:PostalTradeAddress"])["ram:PostcodeCode"]
    ),
    city: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:CityName"]),
    country: textFromNode(asRecord(seller["ram:PostalTradeAddress"])["ram:CountryID"]),
  };
  const sellerTax = asRecord(seller["ram:SpecifiedTaxRegistration"])["ram:ID"];
  if (sellerTax) {
    const taxId = textFromNode(sellerTax);
    if (taxId?.startsWith("DE") || taxId?.includes("VAT")) {
      invoice.vendorTaxId = taxId;
    } else {
      invoice.vendorTaxNumber = taxId;
    }
  }

  const buyer = asRecord(
    asRecord(agreement)["ram:BuyerTradeParty"] || asRecord(agreement)["BuyerTradeParty"]
  );
  invoice.buyerName = textFromNode(buyer["ram:Name"] || buyer["Name"]) || undefined;
  invoice.buyerAddress = {
    street: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:LineOne"]),
    postalCode: textFromNode(
      asRecord(buyer["ram:PostalTradeAddress"])["ram:PostcodeCode"]
    ),
    city: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:CityName"]),
    country: textFromNode(asRecord(buyer["ram:PostalTradeAddress"])["ram:CountryID"]),
  };

  const summation =
    asRecord(settlement)["ram:SpecifiedTradeSettlementHeaderMonetarySummation"] ||
    asRecord(settlement)["SpecifiedTradeSettlementHeaderMonetarySummation"];

  invoice.totalNet = numberFromNode(
    asRecord(summation)["ram:TaxBasisTotalAmount"] || asRecord(summation)["TaxBasisTotalAmount"]
  );
  invoice.totalVat = numberFromNode(
    asRecord(summation)["ram:TaxTotalAmount"] || asRecord(summation)["TaxTotalAmount"]
  );
  invoice.totalGross = numberFromNode(
    asRecord(summation)["ram:GrandTotalAmount"] || asRecord(summation)["GrandTotalAmount"]
  );
  invoice.currency =
    textFromNode(
      asRecord(summation)["ram:InvoiceCurrencyCode"] ||
        asRecord(summation)["InvoiceCurrencyCode"]
    ) || "EUR";

  const paymentTerms =
    asRecord(asRecord(settlement)["ram:SpecifiedTradePaymentTerms"])["ram:Description"] ||
    asRecord(asRecord(settlement)["SpecifiedTradePaymentTerms"])["Description"] ||
    asRecord(asRecord(settlement)["ram:SpecifiedTradeSettlementPaymentMeans"])["ram:Information"];
  invoice.paymentTerms = textFromNode(paymentTerms) ?? undefined;

  const deliveryEvent =
    asRecord(asRecord(trade)["ram:ApplicableHeaderTradeDelivery"])[
      "ram:ActualDeliverySupplyChainEvent"
    ];
  const serviceDate =
    asRecord(asRecord(deliveryEvent)["ram:OccurrenceDateTime"])["udt:DateTimeString"] ??
    asRecord(asRecord(deliveryEvent)["ram:OccurrenceDateTime"])["#text"];
  if (serviceDate) {
    invoice.serviceDate = formatDate(textFromNode(serviceDate) ?? "");
  }

  const tradeTax =
    asRecord(settlement)["ram:ApplicableTradeTax"] || asRecord(settlement)["ApplicableTradeTax"];
  if (tradeTax) {
    invoice.vatItems = (Array.isArray(tradeTax) ? tradeTax : [tradeTax]).map((tax) => ({
      rate:
        (numberFromNode(
          asRecord(tax)["ram:RateApplicablePercent"] || asRecord(tax)["RateApplicablePercent"]
        ) || 0) / 100,
      amount:
        numberFromNode(asRecord(tax)["ram:CalculatedAmount"] || asRecord(tax)["CalculatedAmount"]) ||
        0,
      netAmount:
        numberFromNode(asRecord(tax)["ram:BasisAmount"] || asRecord(tax)["BasisAmount"]) || 0,
    }));
  }

  const lineItems =
    asRecord(trade)["ram:IncludedSupplyChainTradeLineItem"] ||
    asRecord(trade)["IncludedSupplyChainTradeLineItem"];
  if (lineItems) {
    invoice.lineItems = (Array.isArray(lineItems) ? lineItems : [lineItems]).map((item) => {
      const itemRecord = asRecord(item);
      const product =
        itemRecord["ram:SpecifiedTradeProduct"] || itemRecord["SpecifiedTradeProduct"];
      const lineAgreement =
        itemRecord["ram:SpecifiedLineTradeAgreement"] || itemRecord["SpecifiedLineTradeAgreement"];
      const lineSettlement =
        itemRecord["ram:SpecifiedLineTradeSettlement"] || itemRecord["SpecifiedLineTradeSettlement"];
      const delivery =
        itemRecord["ram:SpecifiedLineTradeDelivery"] || itemRecord["SpecifiedLineTradeDelivery"];
      const price =
        asRecord(lineAgreement)["ram:GrossPriceProductTradePrice"] ||
        asRecord(lineAgreement)["ram:NetPriceProductTradePrice"];
      const lineSummation =
        asRecord(lineSettlement)["ram:SpecifiedTradeSettlementLineMonetarySummation"] ||
        asRecord(lineSettlement)["SpecifiedTradeSettlementLineMonetarySummation"];

      const lineItem = {
        description: textFromNode(asRecord(product)["ram:Name"] || asRecord(product)["Name"]) || "",
        quantity:
          numberFromNode(
            asRecord(delivery)["ram:BilledQuantity"] || asRecord(delivery)["BilledQuantity"]
          ) || null,
        unitPrice: firstNumber(
          asRecord(price)["ram:ChargeAmount"],
          asRecord(price)["ChargeAmount"]
        ),
        totalPrice: firstNumber(
          asRecord(lineSummation)["ram:LineTotalAmount"],
          asRecord(lineSummation)["LineTotalAmount"]
        ),
        vatRate:
          (numberFromNode(
            asRecord(asRecord(lineSettlement)["ram:ApplicableTradeTax"])[
              "ram:RateApplicablePercent"
            ]
          ) || 0) / 100,
      };
      normalizeLineTotals(lineItem);
      return lineItem;
    });
  }

  return invoice;
}

function parseUBL(xmlObj: XmlRecord): ParsedDocument {
  const root = xmlObj["Invoice"] || xmlObj["ubl:Invoice"];
  const invoice: ParsedDocument = { sourceType: "xml", documentType: "invoice" };

  const getText = (element: unknown): string => {
    if (!element) return "";
    if (typeof element === "string") return element;
    if (asRecord(element)["#text"]) return String(asRecord(element)["#text"]);
    return String(element);
  };

  invoice.invoiceNumber = getText(asRecord(root)["cbc:ID"] || asRecord(root)["ID"]);

  invoice.invoiceDate = formatDate(
    getText(asRecord(root)["cbc:IssueDate"] || asRecord(root)["IssueDate"] || "")
  );
  invoice.dueDate = formatDate(
    getText(asRecord(root)["cbc:DueDate"] || asRecord(root)["DueDate"] || "")
  );

  invoice.currency = getText(
    asRecord(root)["cbc:DocumentCurrencyCode"] || asRecord(root)["DocumentCurrencyCode"] || "EUR"
  );

  const supplier =
    asRecord(root)["cac:AccountingSupplierParty"] || asRecord(root)["AccountingSupplierParty"];
  const supplierParty = asRecord(supplier)["cac:Party"] || asRecord(supplier)["Party"];
  const supplierPartyName =
    asRecord(supplierParty)["cac:PartyName"] || asRecord(supplierParty)["PartyName"];
  invoice.vendorName = getText(
    asRecord(supplierPartyName)["cbc:Name"] || asRecord(supplierPartyName)["Name"] || ""
  );
  invoice.vendorAddress = {
    street: getText(
      asRecord(asRecord(supplierParty)["cac:PostalAddress"])["cbc:StreetName"] || ""
    ),
    postalCode: getText(
      asRecord(asRecord(supplierParty)["cac:PostalAddress"])["cbc:PostalZone"] || ""
    ),
    city: getText(
      asRecord(asRecord(supplierParty)["cac:PostalAddress"])["cbc:CityName"] || ""
    ),
    country: getText(
      asRecord(
        asRecord(asRecord(supplierParty)["cac:PostalAddress"])["cac:Country"]
      )["cbc:IdentificationCode"] || ""
    ),
  };
  invoice.vendorTaxId = getText(
    asRecord(asRecord(supplierParty)["cac:PartyTaxScheme"])["cbc:CompanyID"] || ""
  ) || undefined;

  const customer =
    asRecord(root)["cac:AccountingCustomerParty"] || asRecord(root)["AccountingCustomerParty"];
  const customerParty = asRecord(customer)["cac:Party"] || asRecord(customer)["Party"];
  const customerPartyName =
    asRecord(customerParty)["cac:PartyName"] || asRecord(customerParty)["PartyName"];
  invoice.buyerName = getText(
    asRecord(customerPartyName)["cbc:Name"] || asRecord(customerPartyName)["Name"] || ""
  );
  invoice.buyerAddress = {
    street: getText(
      asRecord(asRecord(customerParty)["cac:PostalAddress"])["cbc:StreetName"] || ""
    ),
    postalCode: getText(
      asRecord(asRecord(customerParty)["cac:PostalAddress"])["cbc:PostalZone"] || ""
    ),
    city: getText(
      asRecord(asRecord(customerParty)["cac:PostalAddress"])["cbc:CityName"] || ""
    ),
    country: getText(
      asRecord(
        asRecord(asRecord(customerParty)["cac:PostalAddress"])["cac:Country"]
      )["cbc:IdentificationCode"] || ""
    ),
  };

  const monetary =
    asRecord(root)["cac:LegalMonetaryTotal"] || asRecord(root)["LegalMonetaryTotal"];
  const taxExclusiveAmt =
    asRecord(monetary)["cbc:TaxExclusiveAmount"] || asRecord(monetary)["TaxExclusiveAmount"];
  const taxInclusiveAmt =
    asRecord(monetary)["cbc:TaxInclusiveAmount"] || asRecord(monetary)["TaxInclusiveAmount"];
  const payableAmt =
    asRecord(monetary)["cbc:PayableAmount"] || asRecord(monetary)["PayableAmount"];

  invoice.totalNet = parseFloat(getText(taxExclusiveAmt)) || null;
  invoice.totalGross = parseFloat(getText(payableAmt || taxInclusiveAmt)) || null;

  const taxTotal = asRecord(root)["cac:TaxTotal"] || asRecord(root)["TaxTotal"];
  const taxAmount = asRecord(taxTotal)["cbc:TaxAmount"] || asRecord(taxTotal)["TaxAmount"];
  invoice.totalVat = parseFloat(getText(taxAmount)) || null;

  const paymentTerms = asRecord(root)["cac:PaymentTerms"] || asRecord(root)["PaymentTerms"];
  invoice.paymentTerms =
    getText(asRecord(paymentTerms)["cbc:Note"] || asRecord(paymentTerms)["Note"] || "") ||
    undefined;

  const invoicePeriod = asRecord(root)["cac:InvoicePeriod"] || asRecord(root)["InvoicePeriod"];
  const startDate = getText(
    asRecord(invoicePeriod)["cbc:StartDate"] || asRecord(invoicePeriod)["StartDate"] || ""
  );
  const endDate = getText(
    asRecord(invoicePeriod)["cbc:EndDate"] || asRecord(invoicePeriod)["EndDate"] || ""
  );
  if (startDate || endDate) {
    invoice.servicePeriod = [startDate, endDate].filter(Boolean).join(" - ");
  }
  const deliveryDate = getText(
    asRecord(asRecord(root)["cac:Delivery"])["cbc:ActualDeliveryDate"] ||
      asRecord(asRecord(root)["Delivery"])["ActualDeliveryDate"] ||
      ""
  );
  if (deliveryDate) {
    invoice.serviceDate = formatDate(deliveryDate);
  }

  const taxSubtotals = asRecord(taxTotal)["cac:TaxSubtotal"] || asRecord(taxTotal)["TaxSubtotal"];
  if (taxSubtotals) {
    const subtotalArray = Array.isArray(taxSubtotals) ? taxSubtotals : [taxSubtotals];
    invoice.vatItems = subtotalArray.map((subtotal) => {
      const taxCategory =
        asRecord(subtotal)["cac:TaxCategory"] || asRecord(subtotal)["TaxCategory"];
      const percent =
        asRecord(taxCategory)["cbc:Percent"] || asRecord(taxCategory)["Percent"];
      const taxableAmount =
        asRecord(subtotal)["cbc:TaxableAmount"] || asRecord(subtotal)["TaxableAmount"];
      const taxAmt = asRecord(subtotal)["cbc:TaxAmount"] || asRecord(subtotal)["TaxAmount"];

      return {
        rate: parseFloat(getText(percent)) / 100 || 0,
        netAmount: parseFloat(getText(taxableAmount)) || 0,
        amount: parseFloat(getText(taxAmt)) || 0,
      };
    });
  }

  const invoiceLines = asRecord(root)["cac:InvoiceLine"] || asRecord(root)["InvoiceLine"];
  if (invoiceLines) {
    const linesArray = Array.isArray(invoiceLines) ? invoiceLines : [invoiceLines];
    invoice.lineItems = linesArray.map((line) => {
      const lineRecord = asRecord(line);
      const item = lineRecord["cac:Item"] || lineRecord["Item"];
      const price = lineRecord["cac:Price"] || lineRecord["Price"];

      const description = getText(
        asRecord(item)["cbc:Description"] ||
          asRecord(item)["Description"] ||
          asRecord(item)["cbc:Name"] ||
          asRecord(item)["Name"] ||
          ""
      );

      const quantity =
        lineRecord["cbc:InvoicedQuantity"] || lineRecord["InvoicedQuantity"];
      const lineExtension =
        lineRecord["cbc:LineExtensionAmount"] || lineRecord["LineExtensionAmount"];
      const priceAmount =
        asRecord(price)["cbc:PriceAmount"] || asRecord(price)["PriceAmount"];

      const taxCategory =
        asRecord(item)["cac:ClassifiedTaxCategory"] || asRecord(item)["ClassifiedTaxCategory"];
      const taxPercent =
        asRecord(taxCategory)["cbc:Percent"] || asRecord(taxCategory)["Percent"];

      const lineItem = {
        description,
        quantity: parseFloat(getText(quantity)) || null,
        unitPrice: parseFloat(getText(priceAmount)) || null,
        totalPrice: parseFloat(getText(lineExtension)) || null,
        vatRate: parseFloat(getText(taxPercent)) / 100 || null,
      };
      normalizeLineTotals(lineItem);
      return lineItem;
    });
  }

  return invoice;
}

function parseGenericXML(xmlObj: XmlRecord): ParsedDocument {
  const invoice: ParsedDocument = {
    sourceType: "xml",
    documentType: "invoice",
    rawMeta: xmlObj,
  };

  const root =
    xmlObj["Invoice"] || xmlObj["Rechnung"] || xmlObj["invoice"] || xmlObj;
  const header = asRecord(root)["Header"] || asRecord(root)["header"] || root;

  const invoiceNumber = firstText(
    asRecord(header)["InvoiceNumber"],
    asRecord(header)["Rechnungsnummer"],
    asRecord(header)["InvoiceID"],
    asRecord(header)["ID"]
  );
  invoice.invoiceNumber = invoiceNumber ?? undefined;

  const invoiceDateText = firstText(
    asRecord(header)["InvoiceDate"],
    asRecord(header)["Rechnungsdatum"],
    asRecord(header)["Date"],
    asRecord(header)["Datum"]
  );
  invoice.invoiceDate = formatDate(invoiceDateText ?? "");

  const dueDateText = firstText(
    asRecord(header)["DueDate"],
    asRecord(header)["Faelligkeitsdatum"],
    asRecord(header)["PaymentDueDate"]
  );
  invoice.dueDate = formatDate(dueDateText ?? "");

  invoice.currency = (asRecord(header)["Currency"] ||
    asRecord(header)["Waehrung"] ||
    "EUR") as string;

  const seller =
    asRecord(root)["Seller"] ||
    asRecord(root)["Verkaeufer"] ||
    asRecord(root)["Supplier"] ||
    asRecord(root)["Lieferant"];
  const buyer =
    asRecord(root)["Buyer"] ||
    asRecord(root)["Kaeufer"] ||
    asRecord(root)["Customer"] ||
    asRecord(root)["Kunde"];

  invoice.vendorName =
    (asRecord(seller)["Name"] || asRecord(seller)["CompanyName"] || null) as string | null;
  invoice.vendorAddress = {
    street:
      (asRecord(seller)["Street"] ||
        asRecord(seller)["Strasse"] ||
        asRecord(seller)["StreetName"] ||
        null) as string | null,
    postalCode:
      (asRecord(seller)["PostalCode"] ||
        asRecord(seller)["Postcode"] ||
        asRecord(seller)["PLZ"] ||
        null) as string | null,
    city:
      (asRecord(seller)["City"] || asRecord(seller)["Ort"] || null) as string | null,
    country:
      (asRecord(seller)["Country"] || asRecord(seller)["Land"] || null) as string | null,
  };
  invoice.vendorTaxId =
    (asRecord(seller)["VatId"] ||
      asRecord(seller)["UStId"] ||
      asRecord(seller)["UStIdNr"] ||
      null) as string | null;
  invoice.vendorTaxNumber =
    (asRecord(seller)["TaxNumber"] || asRecord(seller)["Steuernummer"] || null) as string | null;

  invoice.buyerName =
    (asRecord(buyer)["Name"] || asRecord(buyer)["CompanyName"] || null) as string | null;
  invoice.buyerAddress = {
    street:
      (asRecord(buyer)["Street"] ||
        asRecord(buyer)["Strasse"] ||
        asRecord(buyer)["StreetName"] ||
        null) as string | null,
    postalCode:
      (asRecord(buyer)["PostalCode"] ||
        asRecord(buyer)["Postcode"] ||
        asRecord(buyer)["PLZ"] ||
        null) as string | null,
    city:
      (asRecord(buyer)["City"] || asRecord(buyer)["Ort"] || null) as string | null,
    country:
      (asRecord(buyer)["Country"] || asRecord(buyer)["Land"] || null) as string | null,
  };

  const totals =
    asRecord(root)["Totals"] ||
    asRecord(root)["Summen"] ||
    asRecord(root)["Summary"] ||
    root;

  invoice.totalNet =
    parseFloat(
      (asRecord(totals)["TotalNetAmount"] ||
        asRecord(totals)["NettoSumme"] ||
        asRecord(totals)["NetAmount"] ||
        "0") as string
    ) || null;
  invoice.totalVat =
    parseFloat(
      (asRecord(totals)["TotalVatAmount"] ||
        asRecord(totals)["MwStSumme"] ||
        asRecord(totals)["VatAmount"] ||
        asRecord(totals)["TaxAmount"] ||
        "0") as string
    ) || null;
  invoice.totalGross =
    parseFloat(
      (asRecord(totals)["TotalGrossAmount"] ||
        asRecord(totals)["BruttoSumme"] ||
        asRecord(totals)["GrossAmount"] ||
        asRecord(totals)["TotalAmount"] ||
        "0") as string
    ) || null;

  const lineItemsContainer =
    asRecord(root)["LineItems"] ||
    asRecord(root)["Positionen"] ||
    asRecord(root)["Items"] ||
    asRecord(root)["Lines"];
  if (lineItemsContainer) {
    const items =
      asRecord(lineItemsContainer)["LineItem"] ||
      asRecord(lineItemsContainer)["Position"] ||
      asRecord(lineItemsContainer)["Item"] ||
      asRecord(lineItemsContainer)["Line"];

    if (items) {
      const itemArray = Array.isArray(items) ? items : [items];
      invoice.lineItems = itemArray.map((item) => ({
        description:
          (asRecord(item)["Description"] ||
            asRecord(item)["Beschreibung"] ||
            asRecord(item)["Name"] ||
            "") as string,
        quantity:
          parseFloat((asRecord(item)["Quantity"] || asRecord(item)["Menge"] || "0") as string) ||
          null,
        unitPrice:
          parseFloat(
            (asRecord(item)["UnitPrice"] ||
              asRecord(item)["Einzelpreis"] ||
              asRecord(item)["Price"] ||
              "0") as string
          ) || null,
        totalPrice:
          parseFloat(
            (asRecord(item)["NetAmount"] ||
              asRecord(item)["GrossAmount"] ||
              asRecord(item)["Amount"] ||
              asRecord(item)["Summe"] ||
              asRecord(item)["Total"] ||
              "0") as string
          ) || null,
        vatRate:
          parseFloat(
            (asRecord(item)["VatRate"] ||
              asRecord(item)["MwStSatz"] ||
              asRecord(item)["TaxRate"] ||
              "0") as string
          ) / 100 || null,
      }));
      invoice.lineItems.forEach((item) => normalizeLineTotals(item));
    }
  }

  if (invoice.lineItems && invoice.lineItems.length > 0) {
    const vatMap = new Map<number, { amount: number; netAmount: number }>();

    invoice.lineItems.forEach((item) => {
      if (item.vatRate != null && item.vatRate > 0) {
        const existing = vatMap.get(item.vatRate) || { amount: 0, netAmount: 0 };
        const netAmount = item.totalPrice || 0;
        const vatAmount = netAmount * item.vatRate;
        vatMap.set(item.vatRate, {
          amount: existing.amount + vatAmount,
          netAmount: existing.netAmount + netAmount,
        });
      }
    });

    if (vatMap.size > 0) {
      invoice.vatItems = Array.from(vatMap.entries()).map(([rate, values]) => ({
        rate,
        amount: Math.round(values.amount * 100) / 100,
        netAmount: Math.round(values.netAmount * 100) / 100,
      }));
    }
  }

  return invoice;
}

function formatDate(dateStr: string | number): string {
  if (!dateStr) return "";

  let str = String(dateStr);

  if (str.includes("e") || str.includes("E")) {
    const num = Number(dateStr);
    if (!Number.isNaN(num)) {
      str = String(Math.round(num));
    }
  }

  if (/^\d{8}$/.test(str)) {
    return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  return str;
}
