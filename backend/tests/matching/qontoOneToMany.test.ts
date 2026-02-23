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

describe("qonto one-to-many", () => {
  it("builds one_to_many final for split qonto transactions", async () => {
    const doc = {
      id: "doc-qonto",
      tenant_id: "tenant-1",
      amount: 18.38,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-01",
      due_date: "2025-05-31",
      vendor_norm: "qonto",
      text_norm: "qonto kontofuhrung",
    };

    const txs = [
      { id: "tx-9", amount: 9 },
      { id: "tx-8", amount: 8 },
      { id: "tx-009", amount: 0.09 },
      { id: "tx-018", amount: 0.18 },
      { id: "tx-034", amount: 0.34 },
      { id: "tx-077", amount: 0.77 },
    ].map((item, index) => ({
      id: item.id,
      tenant_id: "tenant-1",
      amount: item.amount,
      direction: "out" as const,
      currency: "EUR",
      booking_date: `2025-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      link_state: "unlinked" as const,
      vendor_norm: "qonto abonnement zusatzgebuhren",
      text_norm: "qonto abonnement zusatzgebuhren",
    }));

    const result = await run_pipeline(
      {
        docs: [doc],
        txs,
      },
      buildNoopRepo()
    );

    const oneToManyFinal = result.decisions.find(
      (decision) =>
        decision.state === "final" &&
        decision.relation_type === "one_to_many" &&
        decision.doc_ids.includes(doc.id)
    );

    expect(oneToManyFinal).toBeTruthy();
    expect(oneToManyFinal?.tx_ids).toHaveLength(6);
  });
});
