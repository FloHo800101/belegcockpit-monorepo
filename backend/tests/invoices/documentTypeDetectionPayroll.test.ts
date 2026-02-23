import { describe, expect, it } from "vitest";
import { detectDocumentType } from "../../supabase/functions/_shared/document-type-detection";

describe("document type detection payroll", () => {
  it("classifies payroll slips as invoice despite IBAN/BIC and amount-heavy lines", () => {
    const text = [
      "Entgeltabrechnung",
      "Arbeitnehmer Andrea Lunow",
      "Steuerklasse 6",
      "Lohnsteuer 211,83",
      "Sozialversicherung 353,51",
      "Gesamtbrutto 1.917,45",
      "IBAN DE581203000010531213",
      "BIC GENODEMIDNW",
      "31.05.2025 1.360,00",
      "31.05.2025 211,83",
      "31.05.2025 353,51",
      "31.05.2025 198,60",
      "31.05.2025 75,25",
      "31.05.2025 1.500,00",
      "31.05.2025 342,20",
      "31.05.2025 115,48",
    ].join("\n");

    const result = detectDocumentType({
      text,
      fileName: "38_Gehalt Andrea Lunow_05-2025_digitalwirt GmbH-2025-05 Kopie.pdf",
      azureResult: {
        documents: [{ fields: {} }],
      },
    });

    expect(result.documentType).toBe("invoice");
    expect(result.reasons).toContain("keyword:payroll");
  });
});

