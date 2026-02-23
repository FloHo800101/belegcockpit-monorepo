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

describe("invoice number hard match with incoming receivable", () => {
  it("finalizes one_to_one even when tx direction is in", async () => {
    const doc = {
      id: "doc-ar-1",
      tenant_id: "tenant-1",
      amount: 357,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-01T00:00:00.000Z",
      invoice_no: "RE0291",
      vendor_norm: "digitalwirt",
      text_norm: "rechnung re0291",
    };

    const tx = {
      id: "tx-ar-1",
      tenant_id: "tenant-1",
      amount: 357,
      direction: "in" as const,
      currency: "EUR",
      booking_date: "2025-05-02T00:00:00.000Z",
      link_state: "unlinked" as const,
      ref: "Risthaus Versicherungsmakler GmbH RE0291",
      vendor_norm: "risthaus versicherungsmakler",
      text_norm: "risthaus versicherungsmakler re0291",
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
    expect(finalOneToOne?.reason_codes).toContain("HARD_INVOICE_NO");
  });
});
