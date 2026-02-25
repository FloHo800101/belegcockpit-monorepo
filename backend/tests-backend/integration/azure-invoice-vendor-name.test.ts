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
} else {
  const { describe, it, expect } = await import("vitest");

  describe("azure invoice vendor name deno tests", () => {
    it("is executed via deno test", () => {
      expect(true).toBe(true);
    });
  });
}
