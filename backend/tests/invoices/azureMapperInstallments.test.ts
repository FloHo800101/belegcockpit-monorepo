import { describe, expect, it } from "vitest";
import { mapAzureInvoiceToParseResult } from "../../supabase/functions/_shared/azure-mappers";

describe("mapAzureInvoiceToParseResult installments", () => {
  it("adds payment plan metadata and synthetic line items for tax installment notices", () => {
    const result = mapAzureInvoiceToParseResult({
      content:
        "Finanzamt Itzehoe Gewerbesteuervorauszahlung 2025. Gesamtbetrag 8.884,00 EUR. " +
        "Die Vorauszahlungen betragen jeweils 2.221,00 EUR je Vierteljahr.",
      documents: [
        {
          confidence: 0.99,
          fields: {
            InvoiceTotal: { valueCurrency: { amount: 8884, currencyCode: "EUR" } },
            SubTotal: { valueCurrency: { amount: 8884, currencyCode: "EUR" } },
          },
        },
      ],
    });

    expect(result.parsed?.rawMeta).toMatchObject({
      paymentPlan: {
        type: "tax_installments",
        totalAmount: 8884,
        installmentAmount: 2221,
        installmentsCount: 4,
      },
    });
    expect(result.parsed?.lineItems).toHaveLength(4);
    expect(result.parsed?.lineItems?.[0]).toMatchObject({
      totalPrice: 2221,
    });
  });

  it("extracts installment amount from repeated due entries when no explicit keyword-amount pair exists", () => {
    const result = mapAzureInvoiceToParseResult({
      content: [
        "Amt Pinnau",
        "Gewerbesteuerbescheid 2025 Festsetzung der Vorauszahlung",
        "Sollbetrag: 8.884,00",
        "Fälligkeiten: 15.02.2025 15.05.2025 15.08.2025 15.11.2025",
        "Gewerbesteuer 2.221,00 2.221,00 2.221,00 2.221,00",
      ].join("\n"),
      documents: [
        {
          confidence: 0.99,
          fields: {
            InvoiceTotal: { valueCurrency: { amount: 8884, currencyCode: "EUR" } },
          },
        },
      ],
    });

    expect(result.parsed?.rawMeta).toMatchObject({
      paymentPlan: {
        type: "tax_installments",
        totalAmount: 8884,
        installmentAmount: 2221,
        installmentsCount: 4,
      },
    });
    expect(result.parsed?.lineItems).toHaveLength(4);
    expect(result.parsed?.dueDate).toBe("2025-11-15");
  });
});
