if ("Deno" in globalThis) {
  const { resolveInvoiceAmount } = await import(
    "../../supabase/functions/_shared/invoice-amount-candidates.ts"
  );

  // --- resolveInvoiceAmount Tests ---

  Deno.test("resolveInvoiceAmount: prefers totalGross over line items", () => {
    const result = resolveInvoiceAmount({
      totalGross: 500,
      totalNet: 420,
      lineItems: [{ totalPrice: 100 }, { totalPrice: 200 }],
    });
    if (result !== 500) throw new Error(`Expected 500, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: falls back to totalNet when totalGross is null", () => {
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: 420,
      lineItems: [{ totalPrice: 100 }, { totalPrice: 200 }],
    });
    if (result !== 420) throw new Error(`Expected 420, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: sums positive line items when totals are null", () => {
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: null,
      lineItems: [{ totalPrice: 100 }, { totalPrice: 50 }, { totalPrice: 25 }],
    });
    if (result !== 175) throw new Error(`Expected 175, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: respects discount (negative line item reduces total)", () => {
    // Invoice with a discount line
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: null,
      lineItems: [
        { totalPrice: 100 },
        { totalPrice: 50 },
        { totalPrice: -10 }, // discount
      ],
    });
    // Signed sum = 100 + 50 - 10 = 140 > 0 → uses signed sum
    if (result !== 140) throw new Error(`Expected 140, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: hotel invoice with payment returns charges only", () => {
    // Mercure hotel: accommodation charges + EC card payment that cancels them
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: null,
      lineItems: [
        { totalPrice: 104.49 },  // Accommodation
        { totalPrice: 104.49 },  // Accommodation
        { totalPrice: 96.39 },   // Accommodation
        { totalPrice: 96.39 },   // Accommodation
        { totalPrice: -401.76 }, // EC-/Maestro Card Manual (payment)
      ],
    });
    // Signed sum = 401.76 - 401.76 = 0 → falls back to positive sum = 401.76
    if (result !== 401.76) throw new Error(`Expected 401.76, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: does NOT use Math.abs on negative items (regression)", () => {
    // Old bug: Math.abs(-401.76) = 401.76 was added → total 803.52
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: null,
      lineItems: [
        { totalPrice: 104.49 },
        { totalPrice: 104.49 },
        { totalPrice: 96.39 },
        { totalPrice: 96.39 },
        { totalPrice: -401.76 },
      ],
    });
    if (result === 803.52) throw new Error("Bug: Math.abs inflated total to 803.52");
    if (result !== 401.76) throw new Error(`Expected 401.76, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: returns null for empty line items and null totals", () => {
    const result = resolveInvoiceAmount({
      totalGross: null,
      totalNet: null,
      lineItems: [],
    });
    if (result !== null) throw new Error(`Expected null, got ${result}`);
  });

  Deno.test("resolveInvoiceAmount: returns null for null parsed", () => {
    const result = resolveInvoiceAmount(null);
    if (result !== null) throw new Error(`Expected null, got ${result}`);
  });
} else {
  // vitest placeholder
  const { describe, it } = await import("vitest");
  describe("resolveInvoiceAmount", () => {
    it.skip("runs under Deno", () => {});
  });
}
