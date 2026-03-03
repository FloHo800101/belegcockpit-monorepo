if ("Deno" in globalThis) {
  const { mapAzureInvoiceToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );
  const { extractInvoiceNumber } = await import(
    "../../supabase/functions/_shared/azure-mappers/installment-plan.ts"
  );
  const {
    extractLabeledParty,
    BUYER_LABELS,
    cleanPartyName,
  } = await import(
    "../../supabase/functions/_shared/azure-mappers/party-extraction.ts"
  );
  const { resolveInvoiceAmount } = await import(
    "../../supabase/functions/_shared/invoice-amount-candidates.ts"
  );

  // ---------- extractInvoiceNumber ----------

  Deno.test("extractInvoiceNumber: handles 'Rechnungsnr. : 5357-352252' with period", () => {
    const content = "Rechnungsnr. : 5357-352252\nAnreise : 13.02.23";
    const result = extractInvoiceNumber(content);
    if (result !== "5357-352252") {
      throw new Error(`Expected "5357-352252", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("extractInvoiceNumber: handles 'Rechnungsnr.: 5357-352252' without space before colon", () => {
    const content = "Rechnungsnr.: 5357-352252\nDatum: 17.02.23";
    const result = extractInvoiceNumber(content);
    if (result !== "5357-352252") {
      throw new Error(`Expected "5357-352252", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("extractInvoiceNumber: handles 'Rechnungsnr 5357-352252' without period", () => {
    const content = "Rechnungsnr 5357-352252\nDatum: 17.02.23";
    const result = extractInvoiceNumber(content);
    if (result !== "5357-352252") {
      throw new Error(`Expected "5357-352252", got ${JSON.stringify(result)}`);
    }
  });

  // ---------- buyer extraction (Gastname) ----------

  Deno.test("extractLabeledParty: finds buyer via 'Gastname' label", () => {
    const content = "Rechnungsnr. : 5357-352252\nGastname : Herrn Florian Hoffmann\nRECHNUNG";
    const result = extractLabeledParty(content, BUYER_LABELS);
    if (result !== "Florian Hoffmann") {
      throw new Error(`Expected "Florian Hoffmann", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: strips 'Herrn' salutation", () => {
    const result = cleanPartyName("Herrn Florian Hoffmann");
    if (result !== "Florian Hoffmann") {
      throw new Error(`Expected "Florian Hoffmann", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: strips 'Frau' salutation", () => {
    const result = cleanPartyName("Frau Maria Müller");
    if (result !== "Maria Müller") {
      throw new Error(`Expected "Maria Müller", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: strips 'Herr' salutation", () => {
    const result = cleanPartyName("Herr Max Mustermann");
    if (result !== "Max Mustermann") {
      throw new Error(`Expected "Max Mustermann", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: does NOT strip 'Herr' from company names", () => {
    const result = cleanPartyName("Herrmann GmbH");
    if (result !== "Herrmann GmbH") {
      throw new Error(`Expected "Herrmann GmbH", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: returns null for salutation-only value 'Herrn'", () => {
    const result = cleanPartyName("Herrn");
    if (result !== null) {
      throw new Error(`Expected null, got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: returns null for salutation-only value 'Herr'", () => {
    const result = cleanPartyName("Herr");
    if (result !== null) {
      throw new Error(`Expected null, got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("cleanPartyName: strips trailing comma from vendor name", () => {
    const result = cleanPartyName("DB Fernverkehr AG,");
    if (result !== "DB Fernverkehr AG") {
      throw new Error(`Expected "DB Fernverkehr AG", got ${JSON.stringify(result)}`);
    }
  });

  // ---------- vendorName: no CustomerName fallback ----------

  Deno.test("mapAzureInvoiceToParseResult: does NOT use CustomerName as vendorName fallback", () => {
    // Simulates Apple iCloud invoice where Azure provides only CustomerName, no VendorName
    const azureResult = {
      content: [
        "Rechnung",
        "29. Mai 2025",
        "digitalwirt GmbH",
        "Dorfstr. 27c",
        "25495 Kummerfeld",
        "iCloud+ mit 2 TB (Monatlich)",
        "9,99 €",
        "© 2025 Apple Distribution International Ltd.",
      ].join("\n"),
      documents: [
        {
          confidence: 0.85,
          fields: {
            CustomerName: { valueString: "digitalwirt GmbH" },
            CustomerAddressRecipient: { valueString: "digitalwirt GmbH" },
            InvoiceId: { valueString: "MNJ06LK5FB" },
            InvoiceDate: { valueDate: "2025-05-29", content: "29. Mai 2025" },
            InvoiceTotal: { valueCurrency: { amount: 9.99, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 8.40, currencyCode: "EUR" } },
            TotalTax: { valueCurrency: { amount: 1.59, currencyCode: "EUR" } },
          },
        },
      ],
    };

    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) {
      throw new Error("Expected parsed invoice result");
    }
    const parsed = result.parsed;

    // vendorName must NOT be the buyer — should be null when Azure provides no vendor fields
    if (parsed.vendorName === "digitalwirt GmbH") {
      throw new Error(
        `vendorName should NOT be buyer name "digitalwirt GmbH" — ` +
        `CustomerName must not be used as vendor fallback`
      );
    }

    // buyerName should still be extracted correctly
    if (parsed.buyerName !== "digitalwirt GmbH") {
      throw new Error(`buyerName: expected "digitalwirt GmbH", got ${JSON.stringify(parsed.buyerName)}`);
    }

    // amounts should still work
    if (parsed.totalGross !== 9.99) {
      throw new Error(`totalGross: expected 9.99, got ${parsed.totalGross}`);
    }
  });

  // ---------- resolvePreferredDate: German DD.MM.YYYY over Azure valueDate ----------

  const { resolvePreferredDate } = await import(
    "../../supabase/functions/_shared/azure-mappers/azure-field-helpers.ts"
  );

  Deno.test("resolvePreferredDate: prefers DD.MM.YYYY content over swapped Azure valueDate", () => {
    // Azure swaps day/month for German dates: 01.05.2025 → 2025-01-05 instead of 2025-05-01
    const field = { valueDate: "2025-01-05", content: "01.05.2025" };
    const result = resolvePreferredDate(field);
    if (result !== "2025-05-01") {
      throw new Error(`Expected "2025-05-01", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("resolvePreferredDate: handles 01.04.2025 correctly", () => {
    const field = { valueDate: "2025-01-04", content: "01.04.2025" };
    const result = resolvePreferredDate(field);
    if (result !== "2025-04-01") {
      throw new Error(`Expected "2025-04-01", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("resolvePreferredDate: falls back to valueDate when no content", () => {
    const field = { valueDate: "2025-05-07" };
    const result = resolvePreferredDate(field);
    if (result !== "2025-05-07") {
      throw new Error(`Expected "2025-05-07", got ${JSON.stringify(result)}`);
    }
  });

  Deno.test("resolvePreferredDate: handles named month '29. Mai 2025'", () => {
    const field = { valueDate: "2025-05-29", content: "29. Mai 2025" };
    const result = resolvePreferredDate(field);
    if (result !== "2025-05-29") {
      throw new Error(`Expected "2025-05-29", got ${JSON.stringify(result)}`);
    }
  });

  // ---------- totalNet fallback: gross - vat ----------

  Deno.test("mapAzureInvoiceToParseResult: calculates totalNet from totalGross - totalVat when SubTotal missing", () => {
    const azureResult = {
      content: "Rechnung\nAral Tankstelle\n56,38 EUR\nMwSt 19% 9,00 EUR",
      documents: [{
        confidence: 0.9,
        fields: {
          VendorName: { valueString: "Aral Tankstelle" },
          InvoiceDate: { valueDate: "2025-05-02", content: "02.05.2025" },
          InvoiceTotal: { valueCurrency: { amount: 56.38, currencyCode: "EUR" } },
          TotalTax: { valueCurrency: { amount: 9.0, currencyCode: "EUR" } },
          // No SubTotal field
        },
      }],
    };
    const result = mapAzureInvoiceToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result");
    if (result.parsed.totalNet !== 47.38) {
      throw new Error(`totalNet: expected 47.38, got ${result.parsed.totalNet}`);
    }
  });

  // ---------- full mapper: Mercure hotel invoice ----------

  Deno.test("mapAzureInvoiceToParseResult: Mercure hotel invoice extracts all fields", () => {
    const azureResult = {
      content: [
        "Mercure Grand Hotel Biedermeier Wien",
        "Landstrasser Hauptstrasse 28",
        "1030 Wien - Österreich",
        "Herrn",
        "Florian Hoffmann",
        "Heinrich- Harder- Str. 5",
        "25495 Kummerfeld",
        "Germany",
        "Rechnungsnr. : 5357-352252",
        "Anreise : 13.02.23",
        "Abreise : 17.02.23",
        "Zimmernr. : 405",
        "Gastname : Herrn Florian Hoffmann",
        "Datum : 17.02.23",
        "Kasse : 535711-101003",
        "RECHNUNG",
        "Datum MwSt. Beschreibung Anzahl E-Preis Total",
        "13.02.23 EC-/Maestro Card Manual -401.76",
        "13.02.23 10% Accommodation 1 104.49 104.49",
        "14.02.23 10% Accommodation 1 104.49 104.49",
        "15.02.23 10% Accommodation 1 96.39 96.39",
        "16.02.23 10% Accommodation 1 96.39 96.39",
        "Beschreibung Netto (EUR) MwSt. (EUR) Brutto (EUR)",
        "MwSt. 10% 356.02 35.60 391.62",
        "City TAX 10.14",
        "Total 356.02 35.60 401.76",
        "Bankverbindung:",
        "Unicredit Bank Austria AG",
        "IBAN AT 52 1200 0100 1700 49 37",
        "SWIFT BKAUATWW",
        "UID ATU71032857",
      ].join("\n"),
      documents: [
        {
          confidence: 0.72,
          fields: {
            VendorName: { valueString: "Mercure Grand Hotel Biedermeier Wien" },
            InvoiceDate: { valueDate: "2023-02-17", content: "17.02.23" },
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Description: { valueString: "EC-/Maestro Card Manual" },
                    Amount: { valueCurrency: { amount: -401.76, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Description: { valueString: "Accommodation" },
                    Quantity: { valueNumber: 1 },
                    UnitPrice: { valueCurrency: { amount: 104.49, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 104.49, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Description: { valueString: "Accommodation" },
                    Quantity: { valueNumber: 1 },
                    UnitPrice: { valueCurrency: { amount: 104.49, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 104.49, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Description: { valueString: "Accommodation" },
                    Quantity: { valueNumber: 1 },
                    UnitPrice: { valueCurrency: { amount: 96.39, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 96.39, currencyCode: "EUR" } },
                  },
                },
                {
                  valueObject: {
                    Description: { valueString: "Accommodation" },
                    Quantity: { valueNumber: 1 },
                    UnitPrice: { valueCurrency: { amount: 96.39, currencyCode: "EUR" } },
                    Amount: { valueCurrency: { amount: 96.39, currencyCode: "EUR" } },
                  },
                },
              ],
            },
            TaxDetails: {
              valueArray: [
                {
                  valueObject: {
                    Rate: { valueString: "10%" },
                    Amount: { valueCurrency: { amount: 35.60, currencyCode: "EUR" } },
                    NetAmount: { valueCurrency: { amount: 356.02, currencyCode: "EUR" } },
                  },
                },
              ],
            },
            PaymentDetails: {
              valueArray: [
                {
                  valueObject: {
                    IBAN: { valueString: "AT 52 1200 0100 1700 49 37" },
                    SWIFT: { valueString: "BKAUATWW" },
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
      throw new Error("Expected parsed invoice result");
    }
    const parsed = result.parsed;

    // vendorName
    if (parsed.vendorName !== "Mercure Grand Hotel Biedermeier Wien") {
      throw new Error(`vendorName: expected "Mercure Grand Hotel Biedermeier Wien", got ${JSON.stringify(parsed.vendorName)}`);
    }

    // invoiceNumber (via OCR fallback)
    if (parsed.invoiceNumber !== "5357-352252") {
      throw new Error(`invoiceNumber: expected "5357-352252", got ${JSON.stringify(parsed.invoiceNumber)}`);
    }

    // buyerName (via Gastname label)
    if (parsed.buyerName !== "Florian Hoffmann") {
      throw new Error(`buyerName: expected "Florian Hoffmann", got ${JSON.stringify(parsed.buyerName)}`);
    }

    // invoiceDate
    if (parsed.invoiceDate !== "2023-02-17") {
      throw new Error(`invoiceDate: expected "2023-02-17", got ${JSON.stringify(parsed.invoiceDate)}`);
    }

    // lineItems count
    if ((parsed.lineItems?.length ?? 0) !== 5) {
      throw new Error(`lineItems: expected 5, got ${parsed.lineItems?.length ?? 0}`);
    }

    // amount via resolveInvoiceAmount (totalGross/totalNet are null, fallback to line items)
    const amount = resolveInvoiceAmount(parsed);
    if (amount !== 401.76) {
      throw new Error(`resolveInvoiceAmount: expected 401.76, got ${amount}`);
    }

    // currency
    if (parsed.currency !== "EUR") {
      throw new Error(`currency: expected "EUR", got ${JSON.stringify(parsed.currency)}`);
    }
  });
}
