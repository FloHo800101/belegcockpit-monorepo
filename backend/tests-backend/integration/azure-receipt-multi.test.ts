if ("Deno" in globalThis) {
  const { mapAzureReceiptToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );
  const { detectDocumentType } = await import(
    "../../supabase/functions/_shared/document-type-detection.ts"
  );

  // --- Receipt Mapper Tests ---

  Deno.test("receipt mapper: single receipt returns original amount", () => {
    const azureResult = {
      content: "Wiener Linien\nEinzelkarte\n€ 2,40\ninkl. 10% USt.",
      documents: [
        {
          confidence: 0.985,
          fields: {
            MerchantName: { valueString: "Wiener Linien GmbH" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2023-02-16" },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalGross !== 2.4) {
      throw new Error(`Expected totalGross 2.4, got ${result.parsed.totalGross}`);
    }
    if (result.parsed.currency !== "EUR") {
      throw new Error(`Expected currency EUR, got ${result.parsed.currency}`);
    }
  });

  Deno.test("receipt mapper: OCR fallback extracts multiple amounts from multi-receipt page", () => {
    // Simulates 5 tickets scanned on one page, Azure only found one document
    const ocrContent = [
      "OBB VOR: 1 Fahrt WIEN",
      "gültig Do, 16. Feb 2023 um 18:28",
      "Wien Quartier Belvedere Bahnhst",
      "Wien Mitte-Landstraße Bahnhof",
      "€ 2,40 inkl. 10% Steuerbetrag € 0,22",
      "BAR.",
      "WIENER LINIEN",
      "Einzelkarte",
      "1507527",
      "730LA 16.02.2023 07:44",
      "1 Fahrt WIEN",
      "€ 2,40",
      "inkl. 10 % USt.",
      "Einzelkarte",
      "1506887",
      "730LA 15.02.2023 07:33",
      "1 Fahrt WIEN",
      "€ 2,40",
      "inkl. 10 % USt.",
      "VOR",
      "Einzelkarte",
      "LAM3V1402230732",
      "1 Fahrt WIEN",
      "€ 2,40",
      "inkl. 10 % USt.",
      "Einzelkarte",
      "1508219",
      "730LA 17.02.2023 07:55",
      "1 Fahrt WIEN",
      "€ 2,40",
      "inkl. 10 % USt.",
    ].join("\n");

    const azureResult = {
      content: ocrContent,
      documents: [
        {
          confidence: 0.985,
          fields: {
            MerchantName: { valueString: "Wiener Linien GmbH" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "USD" } },
            TransactionDate: { valueDate: "2023-02-16" },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");

    if (result.parsed.totalGross !== 12) {
      throw new Error(`Expected totalGross 12.00, got ${result.parsed.totalGross}`);
    }
    if (!result.parsed.lineItems || result.parsed.lineItems.length < 5) {
      throw new Error(
        `Expected >= 5 line items, got ${result.parsed.lineItems?.length ?? 0}`
      );
    }
    if (result.parsed.currency !== "EUR") {
      throw new Error(`Expected currency EUR (from OCR €), got ${result.parsed.currency}`);
    }
  });

  Deno.test("receipt mapper: multi-document Azure response aggregates all receipts", () => {
    const azureResult = {
      content: "Ticket 1\n€ 2,40\nTicket 2\n€ 2,40",
      documents: [
        {
          confidence: 0.9,
          fields: {
            MerchantName: { valueString: "Wiener Linien" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2023-02-15" },
          },
        },
        {
          confidence: 0.85,
          fields: {
            MerchantName: { valueString: "Wiener Linien" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2023-02-16" },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalGross !== 4.8) {
      throw new Error(`Expected totalGross 4.8, got ${result.parsed.totalGross}`);
    }
    if (!result.parsed.lineItems || result.parsed.lineItems.length !== 2) {
      throw new Error(`Expected 2 line items, got ${result.parsed.lineItems?.length ?? 0}`);
    }
    if (result.parsed.vendorName !== "Wiener Linien") {
      throw new Error(`Expected vendorName "Wiener Linien", got ${result.parsed.vendorName}`);
    }
    // Earliest date
    if (result.parsed.invoiceDate !== "2023-02-15") {
      throw new Error(`Expected invoiceDate "2023-02-15", got ${result.parsed.invoiceDate}`);
    }
  });

  Deno.test("receipt mapper: currency fix prefers OCR € over Azure USD", () => {
    const azureResult = {
      content: "Einzelkarte\n€ 2,40\ninkl. 10 % USt.",
      documents: [
        {
          confidence: 0.9,
          fields: {
            MerchantName: { valueString: "Wiener Linien" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "USD" } },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.currency !== "EUR") {
      throw new Error(`Expected EUR, got ${result.parsed.currency}`);
    }
  });

  // --- Date Fallback Tests ---

  Deno.test("receipt mapper: OCR fallback sets invoiceDate from Azure TransactionDate when available", () => {
    const ocrContent = "Ticket 1\n16.02.2023\n€ 2,40\nTicket 2\n17.02.2023\n€ 2,40";
    const azureResult = {
      content: ocrContent,
      documents: [
        {
          confidence: 0.9,
          fields: {
            MerchantName: { valueString: "Test" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "EUR" } },
            TransactionDate: { valueDate: "2023-02-16" },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    // Azure TransactionDate takes priority
    if (result.parsed.invoiceDate !== "2023-02-16") {
      throw new Error(`Expected invoiceDate "2023-02-16", got "${result.parsed.invoiceDate}"`);
    }
  });

  Deno.test("receipt mapper: OCR fallback extracts latest date when Azure has no TransactionDate", () => {
    const ocrContent = [
      "Ticket 1",
      "15.02.2023",
      "€ 2,40",
      "Ticket 2",
      "16.02.2023",
      "€ 2,40",
      "Ticket 3",
      "17.02.2023",
      "€ 2,40",
    ].join("\n");

    const azureResult = {
      content: ocrContent,
      documents: [
        {
          confidence: 0.9,
          fields: {
            MerchantName: { valueString: "Test" },
            Total: { valueNumber: 2.4, valueCurrency: { amount: 2.4, currencyCode: "EUR" } },
            // No TransactionDate!
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    // Should pick the latest date from OCR
    if (result.parsed.invoiceDate !== "2023-02-17") {
      throw new Error(`Expected invoiceDate "2023-02-17" (latest from OCR), got "${result.parsed.invoiceDate}"`);
    }
  });

  Deno.test("receipt mapper: single receipt also gets OCR date fallback", () => {
    const azureResult = {
      content: "Quittung\n05.03.2023\n€ 15,00",
      documents: [
        {
          confidence: 0.9,
          fields: {
            MerchantName: { valueString: "Shop" },
            Total: { valueNumber: 15, valueCurrency: { amount: 15, currencyCode: "EUR" } },
            // No TransactionDate
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.invoiceDate !== "2023-03-05") {
      throw new Error(`Expected invoiceDate "2023-03-05", got "${result.parsed.invoiceDate}"`);
    }
  });

  // --- Detection Tests ---

  Deno.test("detection: travel expense with ticket keywords returns receipt", () => {
    const text = [
      "WIENER LINIEN",
      "Einzelkarte",
      "1507527",
      "730LA 16.02.2023 07:44",
      "Bitte entwerten",
      "Please validate",
      "1 Fahrt WIEN",
      "€ 2,40",
      "inkl. 10 % USt.",
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType !== "receipt") {
      throw new Error(`Expected "receipt", got "${result.documentType}"`);
    }
    if (result.confidence <= 0) {
      throw new Error(`Expected confidence > 0, got ${result.confidence}`);
    }
  });

  Deno.test("detection: Reisekosten + Quittung returns receipt", () => {
    const text = "Reisekosten Februar 2023\nQuittung\nSumme: € 12,00";
    const result = detectDocumentType({ text });
    if (result.documentType !== "receipt") {
      throw new Error(`Expected "receipt", got "${result.documentType}"`);
    }
  });

  Deno.test("detection: single ticket keyword does NOT return receipt", () => {
    // Only one keyword – should not match
    const text = "Einzelkarte\n€ 2,40";
    const result = detectDocumentType({ text });
    if (result.documentType === "receipt") {
      throw new Error(`Expected not "receipt" with only 1 keyword`);
    }
  });

  Deno.test("detection: receipt keywords do not override bank_statement", () => {
    const text = "Kontoauszug\nEinzelkarte\nFahrkarte\nAlter Saldo 1.000,00\nNeuer Saldo 950,00";
    const result = detectDocumentType({ text });
    if (result.documentType !== "bank_statement") {
      throw new Error(`Expected "bank_statement", got "${result.documentType}"`);
    }
  });

  // --- DB Online-Ticket Tests ---

  Deno.test("detection: DB Online-Ticket with 'Buchung' in sentence returns receipt", () => {
    const text = [
      "Deutsche Bahn",
      "Online-Ticket",
      "Fahrkarte",
      "Wien Hbf -> Rosenheim",
      "Die Buchung Ihres Online-Tickets erfolgte am 15.01.2025",
      "Positionen  Preis     MwSt (D) 19%  MwSt (D) 7%",
      "Fahrkarte   93,20€    23,80€        1,56€",
      "Summe       93,20€    23,80€        1,56€",
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType !== "receipt") {
      throw new Error(
        `Expected "receipt", got "${result.documentType}" (reasons: ${result.reasons.join(", ")})`
      );
    }
    if (result.confidence <= 0) {
      throw new Error(`Expected confidence > 0, got ${result.confidence}`);
    }
  });

  Deno.test("receipt mapper: swaps totalGross and totalNet when Azure reverses Total/Subtotal", () => {
    const azureResult = {
      content: [
        "Deutsche Bahn",
        "Online-Ticket",
        "Fahrkarte Wien Hbf -> Rosenheim",
        "Summe 93,20€",
        "Auftragsnummer: Y9D3FE",
      ].join("\n"),
      documents: [
        {
          confidence: 0.8,
          fields: {
            MerchantName: { valueString: "Deutsche Bahn" },
            Total: { valueNumber: 23.8, valueCurrency: { amount: 23.8, currencyCode: "EUR" } },
            Subtotal: { valueNumber: 93.2 },
            TotalTax: { valueNumber: 1.56 },
            TransactionDate: { valueDate: "2025-01-15" },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalGross !== 93.2) {
      throw new Error(`Expected totalGross 93.2, got ${result.parsed.totalGross}`);
    }
    if (result.parsed.totalNet !== 23.8) {
      throw new Error(`Expected totalNet 23.8, got ${result.parsed.totalNet}`);
    }
    if (result.parsed.invoiceNumber !== "Y9D3FE") {
      throw new Error(`Expected invoiceNumber "Y9D3FE", got "${result.parsed.invoiceNumber}"`);
    }
  });

  Deno.test("receipt mapper: does not swap when Total > Subtotal (normal case)", () => {
    const azureResult = {
      content: "Shop XYZ\n€ 10,00\ninkl. 19% MwSt",
      documents: [
        {
          confidence: 0.95,
          fields: {
            MerchantName: { valueString: "Shop XYZ" },
            Total: { valueNumber: 10.0, valueCurrency: { amount: 10.0, currencyCode: "EUR" } },
            Subtotal: { valueNumber: 8.4 },
            TotalTax: { valueNumber: 1.6 },
          },
        },
      ],
    };

    const result = mapAzureReceiptToParseResult(azureResult);
    if (!result.parsed) throw new Error("Expected parsed result.");
    if (result.parsed.totalGross !== 10.0) {
      throw new Error(`Expected totalGross 10.0, got ${result.parsed.totalGross}`);
    }
    if (result.parsed.totalNet !== 8.4) {
      throw new Error(`Expected totalNet 8.4, got ${result.parsed.totalNet}`);
    }
  });

  Deno.test("detection: bank statement with specific 'Buchungstag' keyword detected correctly", () => {
    const text = [
      "Girokonto",
      "Buchungstag Verwendungszweck Betrag (EUR)",
      "Valuta",
      "01.02.2023 Lastschrift Firma A -100,00",
      "02.02.2023 Gutschrift Firma B 200,00",
      "03.02.2023 Lastschrift Firma C -50,00",
      "04.02.2023 Lastschrift Firma D -75,00",
      "05.02.2023 Gutschrift Firma E 300,00",
      "06.02.2023 Lastschrift Firma F -25,00",
      "07.02.2023 Lastschrift Firma G -60,00",
      "08.02.2023 Gutschrift Firma H 150,00",
      "Alter Saldo 1.000,00",
      "Neuer Saldo 1.340,00",
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType !== "bank_statement") {
      throw new Error(
        `Expected "bank_statement", got "${result.documentType}" (reasons: ${result.reasons.join(", ")})`
      );
    }
  });

  // --- Hotel Invoice Detection Tests ---

  Deno.test("detection: hotel invoice with IBAN in footer returns invoice, not bank_statement", () => {
    const text = [
      "Mercure Grand Hotel Biedermeier Wien",
      "Rechnungsnr. : 5357-352252",
      "Datum : 17.02.23",
      "Anreise : 13.02.23",
      "Abreise : 17.02.23",
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
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType !== "invoice") {
      throw new Error(
        `Expected "invoice", got "${result.documentType}" (reasons: ${result.reasons.join(", ")})`
      );
    }
    if (!result.reasons.includes("priority:invoice_keyword")) {
      throw new Error(
        `Expected reason "priority:invoice_keyword", got: ${result.reasons.join(", ")}`
      );
    }
  });

  Deno.test("detection: Rechnungsnr. abbreviation triggers structure:invoice_number", () => {
    const text = "Rechnungsnr. : 5357-352252\nRECHNUNG\nSumme 100,00 EUR";
    const result = detectDocumentType({ text });
    if (result.documentType !== "invoice") {
      throw new Error(`Expected "invoice", got "${result.documentType}"`);
    }
    if (!result.reasons.includes("structure:invoice_number")) {
      throw new Error(
        `Expected reason "structure:invoice_number", got: ${result.reasons.join(", ")}`
      );
    }
  });

  Deno.test("detection: bank statement with Buchungstag + RECHNUNG in reference still works", () => {
    // A bank statement that contains "Rechnung" in a transaction reference
    // should still be detected as bank_statement because bankKeywordHit is true
    const text = [
      "Girokonto",
      "Buchungstag Verwendungszweck Betrag (EUR)",
      "Valuta",
      "01.02.2023 Rechnung Nr 12345 Firma A -100,00",
      "02.02.2023 Gutschrift Firma B 200,00",
      "03.02.2023 Lastschrift Firma C -50,00",
      "04.02.2023 Lastschrift Firma D -75,00",
      "05.02.2023 Gutschrift Firma E 300,00",
      "06.02.2023 Lastschrift Firma F -25,00",
      "07.02.2023 Lastschrift Firma G -60,00",
      "08.02.2023 Gutschrift Firma H 150,00",
      "Alter Saldo 1.000,00",
      "Neuer Saldo 1.340,00",
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType !== "bank_statement") {
      throw new Error(
        `Expected "bank_statement", got "${result.documentType}" (reasons: ${result.reasons.join(", ")})`
      );
    }
  });
} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure receipt multi-receipt deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
