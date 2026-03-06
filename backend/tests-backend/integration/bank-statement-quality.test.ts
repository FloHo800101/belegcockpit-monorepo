// Tests for bank statement data quality fixes:
// - Phantom transaction filtering (balance lines, all-same-amount patterns)
// - Counterparty name cleaning (VISA prefix, STEUERNR, reference numbers)
// - Date validation (invalid months, future dates)
// - Timesheet anti-bank-statement detection

if ("Deno" in globalThis) {
  const { mapAzureBankStatementToParseResult } = await import(
    "../../supabase/functions/_shared/azure-mappers.ts"
  );
  const { cleanBankCounterpartyName } = await import(
    "../../supabase/functions/_shared/azure-mappers/bank-statement-transactions.ts"
  );
  const { detectDocumentType } = await import(
    "../../supabase/functions/_shared/document-type-detection.ts"
  );
  const { coerceDate } = await import(
    "../../supabase/functions/_shared/upsert-helpers.ts"
  );

  // --- filterPhantomTransactions ---

  Deno.test("filters out transaction matching closing balance amount", () => {
    const azureResult = {
      content: [
        "Kontoauszug",
        "Zeitraum 01.12.2022 - 31.12.2022",
        "Alter Saldo 250.000,00",
        "02.12 UEBERWEISUNG Hays AG -5.000,00",
        "15.12 LASTSCHRIFT BARMER -500,00",
        "Neuer Saldo 274.791,18",
        // This line should NOT become a transaction:
        "31.12 274.791,18",
      ].join("\n"),
      documents: [{ fields: {} }],
    };

    const result = mapAzureBankStatementToParseResult(azureResult, "Girokonto_test.pdf");
    if (!result.parsed) throw new Error("Expected parsed result");

    const txAmounts = (result.parsed.transactions ?? []).map((tx) => tx.amount);
    const hasBalanceAmount = txAmounts.some((a) => Math.abs(Number(a) - 274791.18) < 0.01);
    if (hasBalanceAmount) {
      throw new Error(
        `Closing balance 274791.18 should not appear as transaction. Got amounts: ${JSON.stringify(txAmounts)}`
      );
    }
  });

  Deno.test("filters all-same-amount-and-counterparty pattern (garbage extraction)", () => {
    // Simulates the AYTU timesheet misparse: all transactions identical
    const lines = ["Kontoauszug", "Zeitraum 01.09.2023 - 30.09.2023"];
    for (let i = 0; i < 20; i++) {
      lines.push(`01.09 7510.PST3 0,03`);
    }
    const azureResult = {
      content: lines.join("\n"),
      documents: [{ fields: {} }],
    };

    const result = mapAzureBankStatementToParseResult(azureResult, "AYTU_test.pdf");
    if (!result.parsed) throw new Error("Expected parsed result");

    const txCount = (result.parsed.transactions ?? []).length;
    if (txCount > 0) {
      throw new Error(
        `Expected 0 transactions after all-same filter, got ${txCount}`
      );
    }
  });

  Deno.test("keeps legitimate transactions with different amounts", () => {
    const azureResult = {
      content: [
        "Kontoauszug",
        "Zeitraum 01.12.2022 - 31.12.2022",
        "02.12 UEBERWEISUNG Hays AG -5.000,00",
        "15.12 LASTSCHRIFT BARMER -500,00",
        "20.12 GUTSCHRIFT AYTU GmbH 8.000,00",
      ].join("\n"),
      documents: [{ fields: {} }],
    };

    const result = mapAzureBankStatementToParseResult(azureResult, "Girokonto_test.pdf");
    if (!result.parsed) throw new Error("Expected parsed result");

    const txCount = (result.parsed.transactions ?? []).length;
    if (txCount !== 3) {
      throw new Error(`Expected 3 transactions, got ${txCount}`);
    }
  });

  // --- cleanBankCounterpartyName ---

  Deno.test("strips VISA prefix and trailing transaction ID", () => {
    const cases: Array<[string, string | null]> = [
      ["VISA LIMEHOME GMBH KXRVYZEU", "LIMEHOME GMBH"],
      ["VISA MSFT * E0500PBXHJ", "MSFT"],
      ["VISA TRADINGVIEWVPRODUCT", "TRADINGVIEWVPRODUCT"],
      ["VISA BKG*HOTEL AT BOOKING.C", "BKG*HOTEL AT BOOKING.C"],
    ];
    for (const [input, expected] of cases) {
      const result = cleanBankCounterpartyName(input);
      if (result !== expected) {
        throw new Error(
          `cleanBankCounterpartyName("${input}"): expected "${expected}", got "${result}"`
        );
      }
    }
  });

  Deno.test("returns null for STEUERNR as counterparty", () => {
    const result = cleanBankCounterpartyName(
      "STEUERNR 031/033/61486 EINK.ST 2020 87,00EUR UMS.ST JAN.23"
    );
    if (result !== null) {
      throw new Error(`Expected null for STEUERNR string, got "${result}"`);
    }
  });

  Deno.test("returns null for reference number as counterparty", () => {
    const result = cleanBankCounterpartyName("10580804 PI-FN1605 34 03 22");
    if (result !== null) {
      throw new Error(`Expected null for reference number, got "${result}"`);
    }
  });

  Deno.test("strips Dauerauftrag/Terminueberw. prefix", () => {
    const result = cleanBankCounterpartyName("Dauerauftrag/Terminueberw. Minijob-Zentrale");
    if (result !== "Minijob-Zentrale") {
      throw new Error(`Expected "Minijob-Zentrale", got "${result}"`);
    }
  });

  Deno.test("strips Gehalt/Rente prefix", () => {
    const result = cleanBankCounterpartyName("Gehalt/Rente EWE Aktiengesellschaft");
    if (result !== "EWE Aktiengesellschaft") {
      throw new Error(`Expected "EWE Aktiengesellschaft", got "${result}"`);
    }
  });

  Deno.test("returns null for null/empty input", () => {
    if (cleanBankCounterpartyName(null) !== null) throw new Error("null input should return null");
    if (cleanBankCounterpartyName("") !== null) throw new Error("empty input should return null");
    if (cleanBankCounterpartyName("  ") !== null) throw new Error("whitespace should return null");
  });

  // --- coerceDate validation ---

  Deno.test("coerceDate rejects invalid month 22", () => {
    const result = coerceDate("2026-22-12");
    if (result !== null) {
      throw new Error(`Expected null for invalid month 22, got "${result}"`);
    }
  });

  Deno.test("coerceDate rejects far-future dates", () => {
    const result = coerceDate("2099-01-01");
    if (result !== null) {
      throw new Error(`Expected null for far-future date, got "${result}"`);
    }
  });

  Deno.test("coerceDate accepts valid dates", () => {
    const cases: Array<[string, string]> = [
      ["15.12.2023", "2023-12-15"],
      ["2023-12-15", "2023-12-15"],
      ["20231215", "2023-12-15"],
    ];
    for (const [input, expected] of cases) {
      const result = coerceDate(input);
      if (result !== expected) {
        throw new Error(`coerceDate("${input}"): expected "${expected}", got "${result}"`);
      }
    }
  });

  // --- Timesheet anti-bank-statement detection ---

  Deno.test("detects timesheet as non-bank-statement", () => {
    const text = [
      "Florian Hoffmann Zeiterfassungsbogen fuer 01 Dez - 31 Dez 2023",
      "Status: Gesperrt | Kunde: EON | Lieferant: AYTU GmbH",
      "Datum Einheiten Projekt Arbeitszeit-Code",
      "01.12 8,00 7510.PST301.900.03 Offsite",
      "04.12 8,00 7510.PST301.900.03 Offsite",
      "05.12 8,00 7510.PST301.900.03 Offsite",
      "06.12 8,00 7510.PST301.900.03 Offsite",
      "07.12 8,00 7510.PST301.900.03 Offsite",
      "08.12 8,00 7510.PST301.900.03 Offsite",
      "11.12 8,00 7510.PST301.900.03 Offsite",
      "12.12 8,00 7510.PST301.900.03 Offsite",
      "13.12 8,00 7510.PST301.900.03 Offsite",
    ].join("\n");

    const result = detectDocumentType({ text });
    if (result.documentType === "bank_statement") {
      throw new Error(
        `Timesheet should not be classified as bank_statement. ` +
        `Got: ${result.documentType} (confidence: ${result.confidence}, reasons: ${result.reasons.join(", ")})`
      );
    }
  });
}
