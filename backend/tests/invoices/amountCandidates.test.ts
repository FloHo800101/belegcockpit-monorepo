import { describe, expect, it } from "vitest";
import { buildInvoiceAmountCandidates } from "../../supabase/functions/_shared/invoice-amount-candidates";

describe("buildInvoiceAmountCandidates", () => {
  it("builds net candidates from positive and negative line items", () => {
    const candidates = buildInvoiceAmountCandidates({
      totalGross: 18.38,
      totalNet: 38.38,
      lineItems: [
        { description: "Monatliches Abonnement", quantity: 1, unitPrice: 29, totalPrice: 29, vatRate: 0 },
        { description: "Voucher", quantity: 1, unitPrice: -20, totalPrice: -20, vatRate: 0 },
        { description: "Plus Card", quantity: 1, unitPrice: 8, totalPrice: 8, vatRate: 0 },
        { description: "FX fee 1", quantity: 1, unitPrice: 0.09, totalPrice: 0.09, vatRate: 0 },
        { description: "FX fee 2", quantity: 1, unitPrice: 0.18, totalPrice: 0.18, vatRate: 0 },
        { description: "FX fee 3", quantity: 1, unitPrice: 0.34, totalPrice: 0.34, vatRate: 0 },
        { description: "FX fee 4", quantity: 1, unitPrice: 0.77, totalPrice: 0.77, vatRate: 0 },
      ],
    });

    expect(candidates).toContain(18.38);
    expect(candidates).toContain(9);
    expect(candidates).toContain(8);
    expect(candidates).toContain(0.09);
    expect(candidates).toContain(0.18);
    expect(candidates).toContain(0.34);
    expect(candidates).toContain(0.77);
  });
});
