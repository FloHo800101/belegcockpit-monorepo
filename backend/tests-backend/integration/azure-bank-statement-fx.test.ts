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
} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure bank statement fx deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
