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

describe("invoice finalization by coverage", () => {
  it("finalizes when remaining open amount is covered", async () => {
    const doc = {
      id: "doc-remaining",
      tenant_id: "tenant-1",
      amount: 18,
      open_amount: 9,
      currency: "EUR",
      link_state: "partial" as const,
      invoice_date: "2025-05-31",
      vendor_norm: "qonto",
      items: [
        { id: "li-1", line_index: 0, amount_signed: 9, amount_abs: 9, open_amount: 9 },
      ],
    };

    const tx = {
      id: "tx-remaining",
      tenant_id: "tenant-1",
      amount: 9,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-06-01T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "qonto abonnement zusatzgebuhren",
    };

    const result = await run_pipeline(
      {
        docs: [doc],
        txs: [tx],
      },
      buildNoopRepo()
    );

    const decision = result.decisions.find(
      (entry) => entry.relation_type === "one_to_many" && entry.doc_ids.includes(doc.id)
    );

    expect(decision).toBeTruthy();
    expect(decision?.state).toBe("final");
    expect(decision?.open_amount_after).toBe(0);
  });
});
