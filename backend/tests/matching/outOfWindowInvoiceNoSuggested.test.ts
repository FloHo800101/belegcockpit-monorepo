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

describe("out-of-window invoice number suggestion", () => {
  it("suggests when amount and invoice_no match even with vendor mismatch", async () => {
    const doc = {
      id: "doc-re0287",
      tenant_id: "tenant-1",
      amount: 443.28,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-04-01T00:00:00.000Z",
      invoice_no: "RE0287",
      vendor_norm: "digitalwirt",
      buyer_norm: "digitalwirt",
      text_norm: "digitalwirt re0287",
    };

    const tx = {
      id: "tx-re0287",
      tenant_id: "tenant-1",
      amount: 443.28,
      direction: "in" as const,
      currency: "EUR",
      booking_date: "2025-05-02T00:00:00.000Z",
      link_state: "unlinked" as const,
      ref: "VESCH DIGITAL GMBH RE0287",
      vendor_norm: "vesch digital",
      text_norm: "vesch digital gmbh re0287",
    };

    const result = await run_pipeline(
      {
        docs: [doc],
        txs: [tx],
      },
      buildNoopRepo()
    );

    const suggestedOneToOne = result.decisions.find(
      (decision) =>
        decision.state === "suggested" &&
        decision.relation_type === "one_to_one" &&
        decision.doc_ids.includes(doc.id) &&
        decision.tx_ids.includes(tx.id)
    );

    expect(suggestedOneToOne).toBeTruthy();
    expect(suggestedOneToOne?.reason_codes).toContain(
      "SOFT_INVOICE_NO_AMOUNT_OUT_OF_WINDOW"
    );
  });
});
