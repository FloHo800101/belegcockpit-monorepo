import { describe, expect, it } from "vitest";
import type { MatchRepository } from "../../src/matching-engine";
import { run_pipeline } from "../../src/matching-engine";

function buildNoopRepo(): MatchRepository {
  return {
    async applyMatches() {},
    async saveSuggestions() {},
    async audit() {},
    async loadTxHistory() {
      return [];
    },
  };
}

describe("item-first matching", () => {
  it("creates one_to_many final from multiple item-aligned transactions", async () => {
    const doc = {
      id: "doc-item-first",
      tenant_id: "tenant-1",
      amount: 18,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-31",
      vendor_norm: "qonto",
      items: [
        { id: "li-1", line_index: 0, amount_signed: 9, amount_abs: 9, open_amount: 9 },
        { id: "li-2", line_index: 1, amount_signed: 8, amount_abs: 8, open_amount: 8 },
        { id: "li-3", line_index: 2, amount_signed: 1, amount_abs: 1, open_amount: 1 },
      ],
    };

    const txs = [9, 8, 1].map((amount, index) => ({
      id: `tx-${index + 1}`,
      tenant_id: "tenant-1",
      amount,
      direction: "out" as const,
      currency: "EUR",
      booking_date: `2025-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      link_state: "unlinked" as const,
      vendor_norm: "qonto abonnement zusatzgebuhren",
    }));

    const result = await run_pipeline(
      {
        docs: [doc],
        txs,
      },
      buildNoopRepo()
    );

    const decision = result.decisions.find(
      (entry) => entry.relation_type === "one_to_many" && entry.doc_ids.includes(doc.id)
    );

    expect(decision).toBeTruthy();
    expect(decision?.state).toBe("final");
    expect(decision?.tx_ids).toHaveLength(3);
    expect(decision?.inputs?.matched_item_sum).toBe(18);
  });
});
