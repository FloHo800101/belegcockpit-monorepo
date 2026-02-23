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

describe("out-of-window one-to-one fallback", () => {
  it("creates a suggested match for strong amount+vendor fit outside the date window", async () => {
    const doc = {
      id: "doc-hiscox",
      tenant_id: "tenant-1",
      amount: 357,
      amount_candidates: [357],
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2022-01-06T00:00:00.000Z",
      vendor_norm: "hiscox",
      text_norm: "hiscox hv dsc 6643290",
    };

    const tx = {
      id: "tx-hiscox",
      tenant_id: "tenant-1",
      amount: 357,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-02T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "hiscox sa",
      text_norm: "hiscox sa versicherungsscheinnummer pl psc906643290",
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
    expect(suggestedOneToOne?.reason_codes).toContain("SOFT_AMOUNT_VENDOR_OUT_OF_WINDOW");
  });
});
