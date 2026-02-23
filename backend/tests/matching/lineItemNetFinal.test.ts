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

describe("line item net final", () => {
  it("finalizes one_to_one when only an amount candidate matches", async () => {
    const doc = {
      id: "doc-line-item",
      tenant_id: "tenant-1",
      amount: 29,
      amount_candidates: [9],
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-01",
      due_date: "2025-05-31",
      vendor_norm: "qonto",
      text_norm: "qonto kontofuhrung",
    };

    const tx = {
      id: "tx-line-item",
      tenant_id: "tenant-1",
      amount: 9,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-01T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "qonto abonnement zusatzgebuhren",
      text_norm: "qonto abonnement zusatzgebuhren",
    };

    const result = await run_pipeline(
      {
        docs: [doc],
        txs: [tx],
      },
      buildNoopRepo()
    );

    const finalOneToOne = result.decisions.find(
      (decision) =>
        decision.state === "final" &&
        decision.relation_type === "one_to_one" &&
        decision.doc_ids.includes(doc.id) &&
        decision.tx_ids.includes(tx.id)
    );

    expect(finalOneToOne).toBeTruthy();
    expect(finalOneToOne?.reason_codes).toContain("LINE_ITEM_NET_MATCH");
    expect(finalOneToOne?.inputs?.matched_via_amount_candidate).toBe(true);
    expect(finalOneToOne?.inputs?.matched_amount).toBe(9);
  });
});
