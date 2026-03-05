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

  // ---------- Fix A: lineItems totalPrice decimal correction ----------

  Deno.test("invoice mapper: corrects lineItem totalPrice when qty*unit differs by factor 1000", () => {
    // Azure OCR reads "7.560.,00 €" as 7.56 instead of 7560
    const azureResult = {
      content: "Rechnung\nBeratung\n7.560,00 €\n",
      documents: [
        {
          confidence: 0.95,
          fields: {
            VendorName: { valueString: "AYTU GmbH" },
            InvoiceId: { valueString: "R-2023-06" },
            InvoiceDate: { valueDate: "2023-06-30" },
            InvoiceTotal: { valueCurrency: { amount: 17850, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 15000, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 2850, currencyCode: "EUR" } },
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Description: { valueString: "Beratung REMOTE" },
                    Quantity: { valueNumber: 62 },
                    UnitPrice: { valueCurrency: { amount: 120, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 7440, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Description: { valueString: "Beratung ONSITE" },
                    Quantity: { valueNumber: 56 },
                    UnitPrice: { valueCurrency: { amount: 135, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 7.56, currencyCode: "EUR" } },
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
    const item2 = result.parsed.lineItems?.[1];
    if (!item2) throw new Error("Expected second line item.");
    if (item2.totalPrice !== 7560) {
      throw new Error(`Expected totalPrice 7560, got ${item2.totalPrice}`);
    }
  });

  // ---------- Fix B: vatItems sanity — filter absurd amounts ----------

  Deno.test("invoice mapper: filters vatItem with amount exceeding totalGross (OCR decimal error)", () => {
    // Azure reads "3.127" (German 3,127 = 3.13 EUR) as 3127
    const azureResult = {
      content: "Bewirtungsbeleg\nGesamt 54,80\n",
      documents: [
        {
          confidence: 0.9,
          fields: {
            VendorName: { valueString: "Restaurant XY" },
            InvoiceTotal: { valueCurrency: { amount: 54.8, currencyCode: "EUR" } },
            TaxDetails: {
              valueArray: [
                {
                  valueObject: {
                    Rate: { valueNumber: 0.07 },
                    Amount: { valueCurrency: { amount: 3127, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: 44.673, currencyCode: "EUR" } },
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
    // The absurd vatItem (3127 > 54.8) should be filtered, leaving no vatItems
    if ((result.parsed.vatItems?.length ?? 0) !== 0) {
      throw new Error(`Expected 0 vatItems, got ${result.parsed.vatItems?.length}`);
    }
    // totalNet should fallback to totalGross (tax-free fallback)
    if (result.parsed.totalNet !== 54.8) {
      throw new Error(`Expected totalNet 54.8, got ${result.parsed.totalNet}`);
    }
  });

  // ---------- Fix B: vatItems sanity — filter negative netAmount ----------

  Deno.test("invoice mapper: filters vatItem with negative netAmount (deposit transfer)", () => {
    const azureResult = {
      content: "Hotel Invoice\nTotal 291.64\n",
      documents: [
        {
          confidence: 0.95,
          fields: {
            VendorName: { valueString: "Hotel Wien" },
            InvoiceTotal: { valueCurrency: { amount: 291.64, currencyCode: "EUR" } },
            TaxDetails: {
              valueArray: [
                {
                  valueObject: {
                    Rate: { valueString: "10%", content: "10%" },
                    Amount: { valueCurrency: { amount: 25.84, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: 258.44, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Rate: { valueString: "0%", content: "0%" },
                    Amount: { valueCurrency: { amount: 0, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: -291.64, currencyCode: "EUR" } },
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
    // Only the valid vatItem should remain
    if (result.parsed.vatItems?.length !== 1) {
      throw new Error(`Expected 1 vatItem, got ${result.parsed.vatItems?.length}`);
    }
    if (result.parsed.totalVat !== 25.84) {
      throw new Error(`Expected totalVat 25.84, got ${result.parsed.totalVat}`);
    }
  });

  // ---------- Fix C: buyerName rejects country name ----------

  Deno.test("cleanPartyName: rejects 'DEUTSCHLAND' as party name", async () => {
    const { cleanPartyName } = await import(
      "../../supabase/functions/_shared/azure-mappers/party-extraction.ts"
    );
    const result = cleanPartyName("DEUTSCHLAND");
    if (result !== null) {
      throw new Error(`Expected null for 'DEUTSCHLAND', got "${result}"`);
    }
  });

  // ---------- Fix C: buyerName rejects pure legal form ----------

  Deno.test("cleanPartyName: rejects 'GmbH & Co. KG' (pure legal form, no actual name)", async () => {
    const { cleanPartyName } = await import(
      "../../supabase/functions/_shared/azure-mappers/party-extraction.ts"
    );
    const result = cleanPartyName("GmbH & Co. KG");
    if (result !== null) {
      throw new Error(`Expected null for 'GmbH & Co. KG', got "${result}"`);
    }
  });

  // ---------- Fix F: totalNet sanity — negative totalNet corrected ----------

  Deno.test("invoice mapper: corrects negative totalNet when totalGross is positive", () => {
    const azureResult = {
      content: "Autowäsche\nGesamt 15,00\n",
      documents: [
        {
          confidence: 0.9,
          fields: {
            VendorName: { valueString: "Waschanlage" },
            InvoiceTotal: { valueCurrency: { amount: 15, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: -15, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 30, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalNet! < 0) {
      throw new Error(`Expected positive totalNet, got ${result.parsed.totalNet}`);
    }
    if (result.parsed.totalGross !== 15) {
      throw new Error(`Expected totalGross 15, got ${result.parsed.totalGross}`);
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
