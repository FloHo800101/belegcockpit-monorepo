if ("Deno" in globalThis) {
  const { mapAzureInvoiceToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );

  Deno.test("vendorName rejects single-char logo letter and falls back to vendorAddressRecipient", () => {
    // Reproduces the Notion invoice bug: Azure DI picks up the logo "N" as VendorName
    // instead of "Notion Labs, Inc." from VendorAddressRecipient.
    const azureResult = {
      content: [
        "N",
        "Notion Labs, Inc.",
        "685 Market St, Suite 300",
        "San Francisco, CA 94105",
        "Notion",
        "Invoice",
        "digitalwirt GmbH",
        "DE342993279",
        "0F5721FF-0008",
      ].join("\n"),
      documents: [
        {
          confidence: 1.0,
          fields: {
            VendorName: { valueString: "N" },
            VendorAddressRecipient: { valueString: "Notion Labs, Inc." },
            CustomerName: { valueString: "digitalwirt GmbH" },
            InvoiceId: { valueString: "0F5721FF-0008" },
            InvoiceDate: { valueDate: "2025-05-11" },
            DueDate: { valueDate: "2025-05-11" },
            InvoiceTotal: { valueCurrency: { amount: 9.5, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 9.5, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.vendorName !== "Notion Labs, Inc.") {
      throw new Error(
        `Expected vendorName "Notion Labs, Inc.", got ${String(result.parsed.vendorName)}`
      );
    }
    if (result.parsed.buyerName !== "digitalwirt GmbH") {
      throw new Error(
        `Expected buyerName "digitalwirt GmbH", got ${String(result.parsed.buyerName)}`
      );
    }
  });

  Deno.test("vendorName accepts short but multi-char names", () => {
    // Two-char vendor names like "DB" (Deutsche Bahn) should still work
    const azureResult = {
      content: "Invoice\nDB\n",
      documents: [
        {
          confidence: 0.95,
          fields: {
            VendorName: { valueString: "DB" },
            InvoiceId: { valueString: "INV-99" },
            InvoiceTotal: { valueCurrency: { amount: 50, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.vendorName !== "DB") {
      throw new Error(
        `Expected vendorName "DB", got ${String(result.parsed.vendorName)}`
      );
    }
  });

  Deno.test("vendorName falls back through multiple candidates when first is null", () => {
    const azureResult = {
      content: "Invoice\nAcme Corp\n",
      documents: [
        {
          confidence: 0.9,
          fields: {
            VendorAddressRecipient: { valueString: "Acme Corp\n123 Main St" },
            InvoiceId: { valueString: "INV-1" },
            InvoiceTotal: { valueCurrency: { amount: 100, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result.");
    }
    if (result.parsed.vendorName !== "Acme Corp") {
      throw new Error(
        `Expected vendorName "Acme Corp", got ${String(result.parsed.vendorName)}`
      );
    }
  });
  // ---------- Fix: prefer vendorAddressRecipient with business suffix over short logo ----------

  Deno.test("vendorName prefers candidate with business suffix over short logo name", () => {
    // Reproduces the XING bug: VendorName = "X XING" (logo), VendorAddressRecipient = "New Work SE"
    const azureResult = {
      content: [
        "X XING",
        "New Work SE . Am Strandkai 1 . 20457 Hamburg",
        "Florian Hoffmann",
        "Rechnungsdatum 28.11.2022",
        "Rechnungsnummer PRM122110076709",
      ].join("\n"),
      documents: [
        {
          confidence: 1.0,
          fields: {
            VendorName: { valueString: "X XING" },
            VendorAddressRecipient: { valueString: "New Work SE" },
            CustomerName: { valueString: "Florian Hoffmann" },
            InvoiceId: { valueString: "PRM122110076709" },
            InvoiceDate: { valueDate: "2022-11-28" },
            InvoiceTotal: { valueCurrency: { amount: 29.85, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 25.08, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 4.77, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.vendorName !== "New Work SE") {
      throw new Error(
        `Expected vendorName "New Work SE", got "${result.parsed.vendorName}"`
      );
    }
  });

  // ---------- Fix: tax-free invoice sets totalNet=totalGross, totalVat=0 ----------

  Deno.test("invoice mapper: tax-free document sets totalNet=totalGross and totalVat=0", () => {
    // Reproduces the Führungszeugnis bug: Azure provides Total but no TotalTax/SubTotal
    // and TaxDetails have amounts of 0
    const azureResult = {
      content: [
        "Gemeinde Rellingen",
        "Einfaches Führungszeugnis",
        "Gesamtbetrag 13,00 EUR",
        "Mwst. (7% von 0,00) 0,00 EUR",
        "MwSt. (19% von 0,00) 0,00 EUR",
      ].join("\n"),
      documents: [
        {
          confidence: 0.93,
          fields: {
            MerchantName: { valueString: "Gemeinde Rellingen" },
            Total: { valueCurrency: { amount: 13, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2022-11-22" },
            TaxDetails: {
              valueArray: [
                {
                  valueObject: {
                    Rate: { valueNumber: 0.07 },
                    Amount: { valueCurrency: { amount: 0, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: 0, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Rate: { valueNumber: 0.19 },
                    Amount: { valueCurrency: { amount: 0, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: 0, currencyCode: "EUR" } },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalGross !== 13) {
      throw new Error(`Expected totalGross 13, got ${result.parsed.totalGross}`);
    }
    if (result.parsed.totalNet !== 13) {
      throw new Error(`Expected totalNet 13, got ${result.parsed.totalNet}`);
    }
    if (result.parsed.totalVat !== 0) {
      throw new Error(`Expected totalVat 0, got ${result.parsed.totalVat}`);
    }
  });

  // ---------- Fix: Metro receipt — extract invoiceNumber from RECHNUNGS-NR. and buyerName before KUNDE ----------

  Deno.test("Metro receipt: extracts invoiceNumber from RECHNUNGS-NR. and buyerName before KUNDE label", () => {
    // Metro receipts have RECHNUNGS-NR. (hyphenated) as the label on one line
    // and the value on the next. buyerName appears before KUNDE: line.
    const azureResult = {
      content: [
        "METRO Deutschland GmbH",
        "Hamburg-Niendorf",
        "RECHNUNGS-NR.",
        "23.11.2022/033/0/0/0504/057855 TECHNICAL ID:504-189747",
        "033/131 5775",
        "Florian Hoffmann",
        "KUNDE: 33 109407 1 1",
        "SC",
        "Heinrich-Harder-Straße 5",
        "DEU 25495 Kummerfeld",
      ].join("\n"),
      documents: [
        {
          confidence: 0.97,
          fields: {
            MerchantName: { valueString: "METRO Deutschland GmbH" },
            Total: { valueCurrency: { amount: 154.37, currencyCode: "EUR" } },
            Subtotal: { valueCurrency: { amount: 144.27, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 10.1, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2022-11-23" },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.invoiceNumber !== "2022/033/0/0/0504/057855") {
      throw new Error(
        `Expected invoiceNumber "2022/033/0/0/0504/057855", got "${result.parsed.invoiceNumber}"`
      );
    }
    if (result.parsed.buyerName !== "Florian Hoffmann") {
      throw new Error(
        `Expected buyerName "Florian Hoffmann", got "${result.parsed.buyerName}"`
      );
    }
  });

  // ---------- Fix: multi-line CustomerName with anrede prefix ----------

  Deno.test("buyerName extracts name from multi-line 'Herr\\nFlorian Hoffmann'", () => {
    // Reproduces the Freenet bug: CustomerName = "Herr\nFlorian Hoffmann"
    // cleanPartyName used to take only first line "Herr" → stripped → null
    const azureResult = {
      content: [
        "freenet",
        "Rechnungsdatum: 17.11.2022",
        "Rechnungsnr.: M22076230495",
        "Herr",
        "Florian Hoffmann",
        "Kundennr.: 38616255",
        "Rechnungsbetrag netto 50,6445 EUR",
      ].join("\n"),
      documents: [
        {
          confidence: 1.0,
          fields: {
            VendorName: { valueString: "freenet" },
            CustomerName: { valueString: "Herr\nFlorian Hoffmann" },
            InvoiceId: { valueString: "M22076230495" },
            InvoiceDate: { valueDate: "2022-11-17" },
            InvoiceTotal: { valueCurrency: { amount: 60.26, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 50.6445, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 9.62, currencyCode: "EUR" } },
            CustomerId: { valueString: "38616255" },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.buyerName !== "Florian Hoffmann") {
      throw new Error(
        `Expected buyerName "Florian Hoffmann", got "${result.parsed.buyerName}"`
      );
    }
  });

} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure invoice vendor name deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
