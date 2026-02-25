if ("Deno" in globalThis) {
  const { mapAzureBankStatementToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );

  Deno.test("bank statement mapper extracts foreign currency details from exchange-rate lines", () => {
    const azureResult = {
      content: [
        "Kontoauszug",
        "Zeitraum 01.05.2025 - 31.05.2025",
        "05.05.2025",
        "ENGAGEQ.COM",
        "4,44 EUR",
        "1.12612612612613 USD = 1.00 EUR",
        "Karte ** 0504",
      ].join("\n"),
      documents: [
        {
          fields: {
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Date: { valueString: "05.05.2025" },
                    Amount: { valueCurrency: { amount: 4.44, currencyCode: "EUR" } },
                    Description: { valueString: "ENGAGEQ.COM" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureBankStatementToParseResult(
      azureResult,
      "2025-05-digitalwirt-gmbh-7953-hauptkonto-1-statement.pdf"
    );
    if (!result.parsed) {
      throw new Error("Expected parsed bank statement result.");
    }

    const tx = (result.parsed.transactions ?? []).find((item) =>
      (item.description ?? "").toUpperCase().includes("ENGAGEQ")
    );
    if (!tx) {
      throw new Error("Expected at least one ENGAGEQ transaction.");
    }

    if (tx.currency !== "EUR") {
      throw new Error(`Expected booking currency EUR, got ${String(tx.currency)}`);
    }
    if (tx.foreignCurrency !== "USD") {
      throw new Error(`Expected foreign currency USD, got ${String(tx.foreignCurrency)}`);
    }
    if (tx.foreignAmount == null || Math.abs(tx.foreignAmount - 5) > 0.01) {
      throw new Error(`Expected foreign amount 5.00, got ${String(tx.foreignAmount)}`);
    }
    if (tx.exchangeRate == null || Math.abs(tx.exchangeRate - 1.12612612612613) > 1e-12) {
      throw new Error(`Expected exchange rate 1.12612612612613, got ${String(tx.exchangeRate)}`);
    }
  });

  Deno.test("bank statement mapper keeps foreign currency fields empty without fx line", () => {
    const azureResult = {
      content: [
        "Kontoauszug",
        "Zeitraum 01.05.2025 - 31.05.2025",
        "10.05.2025",
        "ACME SERVICE",
        "12,34 EUR",
      ].join("\n"),
      documents: [
        {
          fields: {
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Date: { valueString: "10.05.2025" },
                    Amount: { valueCurrency: { amount: 12.34, currencyCode: "EUR" } },
                    Description: { valueString: "ACME SERVICE" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureBankStatementToParseResult(azureResult, "statement.pdf");
    if (!result.parsed) {
      throw new Error("Expected parsed bank statement result.");
    }
    const tx = (result.parsed.transactions ?? [])[0];
    if (!tx) {
      throw new Error("Expected one parsed transaction.");
    }
    if (tx.foreignCurrency != null) {
      throw new Error(`Expected no foreign currency, got ${String(tx.foreignCurrency)}`);
    }
    if (tx.foreignAmount != null) {
      throw new Error(`Expected no foreign amount, got ${String(tx.foreignAmount)}`);
    }
    if (tx.exchangeRate != null) {
      throw new Error(`Expected no exchange rate, got ${String(tx.exchangeRate)}`);
    }
  });

  Deno.test("bank statement mapper infers inbound fx refund from statement-level rate hint", () => {
    const azureResult = {
      content: [
        "Kontoauszug",
        "Zeitraum 01.05.2025 - 31.05.2025",
        "05.05.2025",
        "ENGAGEQ.COM",
        "4,44 EUR",
        "1.12612612612613 USD = 1.00 EUR",
        "Karte ** 0504",
        "16.05.2025",
        "ENGAGEQ.COM",
        "3,05 EUR",
        "= 1.00 EUR",
        "Karte ** 0504",
      ].join("\n"),
      documents: [
        {
          fields: {
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Date: { valueString: "05.05.2025" },
                    Amount: { valueCurrency: { amount: 4.44, currencyCode: "EUR" } },
                    Description: { valueString: "ENGAGEQ.COM" },
                  },
                },
                {
                  valueObject: {
                    Date: { valueString: "16.05.2025" },
                    Amount: { valueCurrency: { amount: 3.05, currencyCode: "EUR" } },
                    Description: { valueString: "ENGAGEQ.COM" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureBankStatementToParseResult(
      azureResult,
      "2025-05-digitalwirt-gmbh-7953-hauptkonto-1-statement.pdf"
    );
    if (!result.parsed) {
      throw new Error("Expected parsed bank statement result.");
    }

    const tx = (result.parsed.transactions ?? []).find(
      (item) => item.bookingDate === "2025-05-16" && Math.abs(Number(item.amount) - 3.05) < 0.01
    );
    if (!tx) {
      throw new Error("Expected inbound ENGAGEQ refund transaction.");
    }
    if (tx.foreignCurrency !== "USD") {
      throw new Error(`Expected foreign currency USD, got ${String(tx.foreignCurrency)}`);
    }
    if (tx.foreignAmount == null || Math.abs(tx.foreignAmount - 3.4) > 0.01) {
      throw new Error(`Expected inferred foreign amount about 3.40, got ${String(tx.foreignAmount)}`);
    }
    if (tx.exchangeRate == null || Math.abs(tx.exchangeRate - 1.12612612612613) > 1e-12) {
      throw new Error(`Expected exchange rate 1.12612612612613, got ${String(tx.exchangeRate)}`);
    }
  });

  Deno.test("bank statement mapper handles Qonto DD/MM date-only lines and extracts correct counterparty", () => {
    // Simulates real Qonto layout where dates are on separate lines in DD/MM format
    const azureResult = {
      content: [
        "Kontoauszüge",
        "Qonto",
        "Vom 01/05/2025 bis zum 31/05/2025",
        "digitalwirt GmbH",
        "IBAN: DE44 1001 0123 5569 5631 15",
        "BIC: QNTODEB2XXX",
        "Abrechnungstag Transaktionen",
        "Belastung",
        "Gutschrift",
        "05/05",
        "RCI BANQUE S.A. NL Deutschland",
        "- 238.00 EUR",
        "Renault",
        "Leasing/VT608715560/001/0025795104/Einzug",
        "05.05.2025",
        "05/05",
        "ENGAGEQ.COM",
        "- 4.44 EUR",
        "1.12612612612613 USD = 1.00 EUR",
        "- 5.00 USD",
        "Karte ** 0504",
        "05/05",
        "Qonto",
        "- 0.09 EUR",
        "Abonnement / Zusatzgebühren",
      ].join("\n"),
      documents: [
        {
          fields: {
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Date: { valueString: "05/05" },
                    Amount: { valueCurrency: { amount: -238, currencyCode: "EUR" } },
                    Description: { valueString: "RCI BANQUE S.A. NL Deutschland" },
                  },
                },
                {
                  valueObject: {
                    Date: { valueString: "05/05" },
                    Amount: { valueCurrency: { amount: -4.44, currencyCode: "EUR" } },
                    Description: { valueString: "05/05" },
                  },
                },
                {
                  valueObject: {
                    Date: { valueString: "05/05" },
                    Amount: { valueCurrency: { amount: -0.09, currencyCode: "EUR" } },
                    Description: { valueString: "Qonto" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureBankStatementToParseResult(
      azureResult,
      "2025-05-digitalwirt-gmbh-7953-hauptkonto-1-statement.pdf"
    );
    if (!result.parsed) {
      throw new Error("Expected parsed bank statement result.");
    }

    const transactions = result.parsed.transactions ?? [];

    // Find the -4.44 EUR transaction (ENGAGEQ.COM)
    const engageqTx = transactions.find(
      (tx) => Math.abs(Number(tx.amount) - (-4.44)) < 0.01
    );
    if (!engageqTx) {
      throw new Error("Expected ENGAGEQ.COM transaction with amount -4.44.");
    }

    // counterpartyName must NOT be "05/05" — it must be "ENGAGEQ.COM"
    if (!engageqTx.counterpartyName || engageqTx.counterpartyName === "05/05") {
      throw new Error(
        `Expected counterpartyName "ENGAGEQ.COM", got "${String(engageqTx.counterpartyName)}"`
      );
    }
    if (!engageqTx.counterpartyName.toUpperCase().includes("ENGAGEQ")) {
      throw new Error(
        `Expected counterpartyName to contain "ENGAGEQ", got "${engageqTx.counterpartyName}"`
      );
    }

    // The Qonto -0.09 fee should have counterpartyName "Qonto", not "ENGAGEQ.COM"
    const qontoTx = transactions.find(
      (tx) => Math.abs(Number(tx.amount) - (-0.09)) < 0.01
    );
    if (!qontoTx) {
      throw new Error("Expected Qonto fee transaction with amount -0.09.");
    }
    if (qontoTx.counterpartyName !== "Qonto") {
      throw new Error(
        `Expected Qonto fee counterpartyName "Qonto", got "${String(qontoTx.counterpartyName)}"`
      );
    }
  });

  // --- Tests for isStatementBoilerplateLine ---

  const { isStatementBoilerplateLine, extractCounterpartyName } = await import(
    "../../supabase/functions/_shared/azure-mappers/bank-statement-transactions.ts"
  );

  Deno.test("isStatementBoilerplateLine detects page headers", () => {
    const boilerplate = [
      "Girokonto Nummer 5430878061",
      "Kontoauszug Februar 2023",
      "Buchung / Verwendungszweck",
      "Betrag (EUR)",
      "Valuta",
      "Seite 1 von 2",
      "2 von 2",
    ];
    for (const line of boilerplate) {
      if (!isStatementBoilerplateLine(line)) {
        throw new Error(`Expected boilerplate: "${line}"`);
      }
    }
  });

  Deno.test("isStatementBoilerplateLine detects balance and summary lines", () => {
    const boilerplate = [
      "Neuer Saldo",
      "Alter Saldo",
      "Kunden-Information",
      "Vorliegender Freistellungsauftrag",
      "Verbrauchter Sparer-Pauschbetrag",
    ];
    for (const line of boilerplate) {
      if (!isStatementBoilerplateLine(line)) {
        throw new Error(`Expected boilerplate: "${line}"`);
      }
    }
  });

  Deno.test("isStatementBoilerplateLine detects bank footer and legal text", () => {
    const boilerplate = [
      "ING-DiBa AG · Theodor-Heuss-Allee 2 · 60486 Frankfurt am Main · Vorsitzende des Aufsichtsrates: Susanne Klöß-Braekler · Vorstand: Nick Jue (Vorsitzender),",
      "Bitte beachten Sie auch die Hinweise auf der Folgeseite.",
      "Bitte beachten Sie die nachstehenden Hinweise:",
      "34GKKA5430878061_T",
      "Herrn",
    ];
    for (const line of boilerplate) {
      if (!isStatementBoilerplateLine(line)) {
        throw new Error(`Expected boilerplate: "${line}"`);
      }
    }
  });

  Deno.test("isStatementBoilerplateLine does NOT flag valid reference lines", () => {
    const valid = [
      "Glaeubiger-ID: DE62ZZZ00002129458 M andatsreferenz:10902",
      "RNr: 329/03.02 .23 Mand: 10902",
      "Mandat: 10902",
      "Referenz: 2302031703-0000012",
      "/ K 396572 /2022-24/ v. 31.12.2022 /",
      "942,64 BEITRAG 0123-0123 FLORIAN HO FFMANN",
      "Kd 0038616255 Wir sagen Danke. RG-N r. M23012470685 56,80",
      "/GSV/1660691081/60C25655601/2022",
      "10580804 PI-FN1605 45 02 23",
      "STEUERNR 031/033/61486 UMS.ST VZ202 3 1.955,66EUR",
      "Rueckueberweisung Lastschrift vom 0 3.01.2023",
      "Rechnungsnummer: 2022-23",
    ];
    for (const line of valid) {
      if (isStatementBoilerplateLine(line)) {
        throw new Error(`Should NOT be boilerplate: "${line}"`);
      }
    }
  });

  // --- Tests for extractCounterpartyName mid-string fix ---

  Deno.test("extractCounterpartyName strips booking type prefix at start", () => {
    const cases: Array<[string, string]> = [
      ["Gutschrift EWE VERTRIEB GmbH", "EWE VERTRIEB GmbH"],
      ["Lastschrift Finanzamt Pinneberg", "Finanzamt Pinneberg"],
      ["Ueberweisung Hoffmann/Hoffmann", "Hoffmann/Hoffmann"],
      ["Lastschrift mobilcom-debitel ist nun freenet", "mobilcom-debitel ist nun freenet"],
    ];
    for (const [input, expected] of cases) {
      const result = extractCounterpartyName(input);
      if (result !== expected) {
        throw new Error(`extractCounterpartyName("${input}") = "${result}", expected "${expected}"`);
      }
    }
  });

  Deno.test("extractCounterpartyName finds booking type keyword mid-string", () => {
    const cases: Array<[string, string]> = [
      ["/ K 396572 /2022-24/ v. 31.12.2022 / Referenz: 0061010908 Gutschrift EWE VERTRIEB GmbH", "EWE VERTRIEB GmbH"],
      ["STEUERNR 031/033/61486 UMS.ST VZ202 3 Lastschrift BARMER", "BARMER"],
      ["914,29 BEITRAG 1222-1222 FLORIAN HO FFMANN Mandat: 0108089063000002 Referenz: C8903612314 OB-P700116906 Gutschrift CONVIDIUS BUSINESS SOLUTIONS GMBH", "CONVIDIUS BUSINESS SOLUTIONS GMBH"],
    ];
    for (const [input, expected] of cases) {
      const result = extractCounterpartyName(input);
      if (result !== expected) {
        throw new Error(`extractCounterpartyName mid-string: got "${result}", expected "${expected}"`);
      }
    }
  });

  // --- Integration test: ING statement with reference noise ---

  Deno.test("ING bank statement: reference blocks do not contain page footer noise", () => {
    // Simulate the ING February statement page boundary (last tx on page 1 → page 2 header)
    const azureResult = {
      content: [
        "Girokonto Nummer 5430878061",
        "Kontoauszug Februar 2023",
        "Buchung Buchung / Verwendungszweck Betrag (EUR)",
        "Valuta",
        "27.02.2023 Lastschrift Audi Bank Zweigniederlassung der VW Bank GmbH -352,67",
        "27.02.2023 10580804 PI-FN1605 45 02 23",
        "Mandat: 041600105808040002",
        "Referenz: KKFA1058080420230220045174078228048",
        "Neuer Saldo 136.494,15",
        "Kunden-Information",
        "Vorliegender Freistellungsauftrag 1.000,00",
        "Bitte beachten Sie auch die Hinweise auf der Folgeseite.",
        "ING-DiBa AG",
        "34GKKA5430878061_T",
      ].join("\n"),
      documents: [
        {
          fields: {
            Items: {
              valueArray: [
                {
                  valueObject: {
                    Date: { valueString: "27.02.2023" },
                    Amount: { valueCurrency: { amount: -352.67, currencyCode: "EUR" } },
                    Description: { valueString: "Lastschrift Audi Bank Zweigniederlassung der VW Bank GmbH" },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const result = mapAzureBankStatementToParseResult(azureResult, "kontoauszug.pdf");
    if (!result.parsed) {
      throw new Error("Expected parsed result.");
    }
    const tx = (result.parsed.transactions ?? [])[0];
    if (!tx) {
      throw new Error("Expected one transaction.");
    }

    // counterpartyName should be clean
    if (tx.counterpartyName !== "Audi Bank Zweigniederlassung der VW Bank GmbH") {
      throw new Error(`Unexpected counterpartyName: "${tx.counterpartyName}"`);
    }

    // reference should NOT contain "Neuer Saldo", "Kunden-Information", footer text
    const ref = tx.reference ?? "";
    if (ref.includes("Neuer Saldo")) {
      throw new Error(`Reference should not contain "Neuer Saldo": ${ref}`);
    }
    if (ref.includes("Kunden-Information")) {
      throw new Error(`Reference should not contain "Kunden-Information": ${ref}`);
    }
    if (ref.includes("ING-DiBa AG")) {
      throw new Error(`Reference should not contain "ING-DiBa AG": ${ref}`);
    }
    if (ref.includes("34GKKA")) {
      throw new Error(`Reference should not contain barcode ID: ${ref}`);
    }

    // reference SHOULD contain the actual reference data
    if (!ref.includes("Mandat:") || !ref.includes("Referenz:")) {
      throw new Error(`Reference should contain Mandat/Referenz: ${ref}`);
    }
  });
} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure bank statement fx deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
