if ("Deno" in globalThis) {
  const { mapAzureInvoiceToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );

  Deno.test("invoiceDate fallback parses 'Ausgestellt am' from OCR content", () => {
    const azureResult = {
      content: "Rechnung\nAusgestellt am: 31/05/25\nQonto",
      documents: [
        {
          confidence: 0.99,
          fields: {
            InvoiceId: { valueString: "05-25-invoice-24275693" },
            InvoiceTotal: { valueCurrency: { amount: 18.38, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.invoiceDate !== "2025-05-31") {
      throw new Error(`Expected invoiceDate 2025-05-31, got ${String(result.parsed.invoiceDate)}`);
    }
    if (result.parsed.dueDate !== null) {
      throw new Error(`Expected dueDate null, got ${String(result.parsed.dueDate)}`);
    }
  });

  Deno.test("invoiceDate fallback parses generic 'Datum' from OCR content", () => {
    const azureResult = {
      content: [
        "1. Mahnung",
        "Datum: 19.05.2025",
        "Zu zahlen: 200,03",
        "Stümpges & Steuber GmbH WPG",
      ].join("\n"),
      documents: [
        {
          confidence: 0.92,
          fields: {
            MerchantName: { valueString: "Stümpges & Steuber GmbH WPG" },
            Total: { valueCurrency: { amount: 200.03, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.invoiceDate !== "2025-05-19") {
      throw new Error(`Expected invoiceDate 2025-05-19, got ${String(result.parsed.invoiceDate)}`);
    }
  });

  Deno.test("dueDate fallback only parses explicit due labels", () => {
    const azureResult = {
      content: "Invoice date: 2025-05-31\nDue date: 15/06/25",
      documents: [
        {
          confidence: 0.99,
          fields: {
            InvoiceId: { valueString: "INV-1" },
            InvoiceTotal: { valueCurrency: { amount: 99, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.invoiceDate !== "2025-05-31") {
      throw new Error(`Expected invoiceDate 2025-05-31, got ${String(result.parsed.invoiceDate)}`);
    }
    if (result.parsed.dueDate !== "2025-06-15") {
      throw new Error(`Expected dueDate 2025-06-15, got ${String(result.parsed.dueDate)}`);
    }
  });

  Deno.test("invoice mapper falls back to receipt-like fields", () => {
    const azureResult = {
      content: "Rechnung Nr: RE0291\nAusgestellt am: 01.05.2025\nEinzel €\nGesamt €\n",
      documents: [
        {
          confidence: 0.93,
          fields: {
            Total: { valueCurrency: { amount: 357, currencyCode: "USD" } },
            Subtotal: { valueCurrency: { amount: 300, currencyCode: "USD" } },
            MerchantName: { valueString: "digitalwirt GmbH" },
            TransactionDate: { valueDate: "2025-01-05", content: "01.05.2025" },
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Description: { valueString: "Social Media Content Management" },
                    Quantity: { valueNumber: 1 },
                    Price: { valueCurrency: { amount: 300, currencyCode: "USD" } },
                    TotalPrice: { valueCurrency: { amount: 300, currencyCode: "USD" } },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.totalGross !== 357) {
      throw new Error(`Expected totalGross 357, got ${String(result.parsed.totalGross)}`);
    }
    if (result.parsed.totalNet !== 300) {
      throw new Error(`Expected totalNet 300, got ${String(result.parsed.totalNet)}`);
    }
    if (result.parsed.currency !== "EUR") {
      throw new Error(`Expected currency EUR, got ${String(result.parsed.currency)}`);
    }
    if (result.parsed.invoiceDate !== "2025-05-01") {
      throw new Error(`Expected invoiceDate 2025-05-01, got ${String(result.parsed.invoiceDate)}`);
    }
    if (result.parsed.invoiceNumber !== "RE0291") {
      throw new Error(
        `Expected invoiceNumber RE0291, got ${String(result.parsed.invoiceNumber)}`
      );
    }
    if (result.parsed.lineItems?.[0]?.totalPrice !== 300) {
      throw new Error(
        `Expected first lineItem.totalPrice 300, got ${String(result.parsed.lineItems?.[0]?.totalPrice)}`
      );
    }
  });

  Deno.test("buyerName prefers recipient block when customer field is duplicated vendor", () => {
    const azureResult = {
      content:
        "Rechnung\nRechnungsempfänger\nVESCH Digital GmbH\nMusterstraße 1\n12345 Berlin\n",
      documents: [
        {
          confidence: 0.95,
          fields: {
            InvoiceId: { valueString: "RE0287" },
            InvoiceTotal: { valueCurrency: { amount: 443.28, currencyCode: "EUR" } },
            VendorName: { valueString: "digitalwirt GmbH" },
            CustomerName: { valueString: "digitalwirt GmbH" },
            CustomerAddressRecipient: {
              valueString: "VESCH Digital GmbH\nMusterstraße 1\n12345 Berlin",
            },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.vendorName !== "digitalwirt GmbH") {
      throw new Error(`Expected vendorName digitalwirt GmbH, got ${String(result.parsed.vendorName)}`);
    }
    if (result.parsed.buyerName !== "VESCH Digital GmbH") {
      throw new Error(`Expected buyerName VESCH Digital GmbH, got ${String(result.parsed.buyerName)}`);
    }
  });

  Deno.test("buyerName is extracted from header block when only merchant field exists", () => {
    const azureResult = {
      content: [
        "digitalwirt GmbH",
        "Dorfstr., 27c",
        "25495 Kummerfeld",
        "digitalwirt.de",
        "VESCH DIGITAL GmbH",
        "Herrn Ralf Versteegden",
        "Große Bleichen 10",
        "20354 Hamburg",
        "Rechnung",
        "Rechnungsnr.: RE0287",
      ].join("\n"),
      documents: [
        {
          confidence: 0.92,
          fields: {
            MerchantName: { valueString: "digitalwirt GmbH" },
            Total: { valueCurrency: { amount: 443.28, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.vendorName !== "digitalwirt GmbH") {
      throw new Error(`Expected vendorName digitalwirt GmbH, got ${String(result.parsed.vendorName)}`);
    }
    if (result.parsed.buyerName !== "VESCH DIGITAL GmbH") {
      throw new Error(`Expected buyerName VESCH DIGITAL GmbH, got ${String(result.parsed.buyerName)}`);
    }
  });

  Deno.test("invoice mapper falls back to recurring contract amount and ignores UST as invoice number", () => {
    const azureResult = {
      content: [
        "Invoice",
        "USt-IdNr.: DE123456789",
        "Leasingvertrag",
        "Monatliche Leasingrate (brutto)",
        "238,00 €",
      ].join("\n"),
      documents: [
        {
          confidence: 0.91,
          fields: {
            MerchantName: { valueString: "RCI Banque Deutschland" },
            TransactionDate: { valueDate: "2023-09-05" },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.totalGross !== 238) {
      throw new Error(`Expected totalGross 238, got ${String(result.parsed.totalGross)}`);
    }
    if (result.parsed.totalNet !== 238) {
      throw new Error(`Expected totalNet 238, got ${String(result.parsed.totalNet)}`);
    }
    if (result.parsed.invoiceNumber != null) {
      throw new Error(
        `Expected invoiceNumber to be empty for UST candidate, got ${String(result.parsed.invoiceNumber)}`
      );
    }
  });
} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure invoice date fallback deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
