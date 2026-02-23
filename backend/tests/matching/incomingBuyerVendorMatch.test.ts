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

describe("incoming tx uses buyer for vendor matching", () => {
  it("creates a suggestion only when buyer matches incoming tx counterparty", async () => {
    const tx = {
      id: "tx-in-buyer-1",
      tenant_id: "tenant-1",
      amount: 357,
      direction: "in" as const,
      currency: "EUR",
      booking_date: "2025-05-03T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "risthaus versicherungsmakler",
      text_norm: "zahlung rechnung 0291",
    };

    const docWithBuyer = {
      id: "doc-with-buyer",
      tenant_id: "tenant-1",
      amount: 357,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-01T00:00:00.000Z",
      vendor_norm: "digitalwirt gmbh",
      buyer_norm: "risthaus versicherungsmakler gmbh",
      text_norm: "ausgangsrechnung",
    };

    const docWithoutBuyer = {
      ...docWithBuyer,
      id: "doc-without-buyer",
      buyer_norm: undefined,
    };

    const withBuyer = await run_pipeline(
      { docs: [docWithBuyer], txs: [tx] },
      buildNoopRepo(),
      { cfgOverride: { scoring: { minSuggestScore: 0.8 } } }
    );

    const withoutBuyer = await run_pipeline(
      { docs: [docWithoutBuyer], txs: [tx] },
      buildNoopRepo(),
      { cfgOverride: { scoring: { minSuggestScore: 0.8 } } }
    );

    const withBuyerSuggested = withBuyer.decisions.find(
      (decision) =>
        decision.state === "suggested" &&
        decision.relation_type === "one_to_one" &&
        decision.doc_ids.includes(docWithBuyer.id) &&
        decision.tx_ids.includes(tx.id)
    );

    const withoutBuyerSuggested = withoutBuyer.decisions.find(
      (decision) =>
        decision.state === "suggested" &&
        decision.relation_type === "one_to_one" &&
        decision.doc_ids.includes(docWithoutBuyer.id) &&
        decision.tx_ids.includes(tx.id)
    );

    expect(withBuyerSuggested).toBeTruthy();
    expect(withoutBuyerSuggested).toBeFalsy();
  });
});
