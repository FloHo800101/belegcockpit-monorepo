import { describe, expect, it } from "vitest";
import { detectDocumentType } from "../../supabase/functions/_shared/document-type-detection";

describe("detectDocumentType tax notice", () => {
  it("classifies Finanzamt tax prepayment notices as invoice instead of bank statement", () => {
    const result = detectDocumentType({
      text: [
        "Finanzamt Itzehoe",
        "Steuernummer 18/291/26420",
        "Gewerbesteuerbescheid Festsetzung Vorauszahlung 2025",
        "Gesamtbetrag 8.884,00 EUR",
        "Vorauszahlungen jeweils 2.221,00 EUR je Vierteljahr",
      ].join("\n"),
      fileName: "20_Gewerbesteuerbescheid_Festsetzung_Vorauszahlung_2025.pdf",
      azureResult: {
        documents: [
          {
            fields: {
              InvoiceTotal: { valueCurrency: { amount: 8884, currencyCode: "EUR" } },
            },
          },
        ],
      },
    });

    expect(result.documentType).toBe("invoice");
    expect(result.reasons).toContain("keyword:tax_notice");
  });
});
