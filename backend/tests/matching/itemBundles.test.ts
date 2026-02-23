import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/matching-engine/config";
import { runItemFirstPhase } from "../../src/matching-engine/item-first";

describe("item bundle matching", () => {
  it("matches tx amount against a 2-item net bundle (29 + -20 = 9)", () => {
    const cfg = resolveConfig();
    const result = runItemFirstPhase(
      [
        {
          id: "doc-1",
          tenant_id: "tenant-1",
          amount: 18.38,
          currency: "EUR",
          link_state: "unlinked",
          invoice_date: "2025-05-31",
          vendor_norm: "qonto",
          items: [
            { id: "li-1", line_index: 0, amount_signed: 29, amount_abs: 29, open_amount: 29 },
            { id: "li-2", line_index: 1, amount_signed: -20, amount_abs: 20, open_amount: 20 },
          ],
        },
      ],
      [
        {
          id: "tx-1",
          tenant_id: "tenant-1",
          amount: 9,
          direction: "out",
          currency: "EUR",
          booking_date: "2025-05-31T00:00:00.000Z",
          link_state: "unlinked",
          vendor_norm: "qonto abonnement zusatzgebuhren",
        },
      ],
      cfg
    );

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].state).toBe("partial");
    expect(result.decisions[0].reason_codes).toContain("ITEM_FIRST_BUNDLE_MATCH");
    expect(result.decisions[0].inputs?.matched_via_bundle).toBe(true);
    expect(result.decisions[0].inputs?.matched_item_ids).toEqual(["li-1", "li-2"]);
  });
});
