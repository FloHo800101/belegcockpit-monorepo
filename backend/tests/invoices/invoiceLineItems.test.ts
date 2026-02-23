import { describe, expect, it } from "vitest";
import { buildInvoiceLineItemRows } from "../../supabase/functions/_shared/invoice-line-items";

describe("buildInvoiceLineItemRows", () => {
  it("creates signed and absolute line-item rows and skips zero values", () => {
    const rows = buildInvoiceLineItemRows({
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      documentId: "invoice-1",
      currency: "eur",
      nowISO: "2026-02-18T10:00:00.000Z",
      lineItems: [
        { description: "Monatliches Abonnement", totalPrice: 29 },
        { description: "Voucher", totalPrice: -20 },
        { description: "Zero", totalPrice: 0 },
        { description: "Missing" },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      line_index: 0,
      description: "Monatliches Abonnement",
      amount_signed: 29,
      amount_abs: 29,
      open_amount: 29,
      currency: "EUR",
      link_state: "unlinked",
    });
    expect(rows[1]).toMatchObject({
      line_index: 1,
      description: "Voucher",
      amount_signed: -20,
      amount_abs: 20,
      open_amount: 20,
      currency: "EUR",
      link_state: "unlinked",
    });
  });
});
