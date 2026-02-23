import { describe, expect, it } from "vitest";
import type { Doc, MatchRepository, Tx } from "../../src/matching-engine";
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

describe("partial docs remain matchable", () => {
  it("can be matched again in a later pass", async () => {
    const baseDoc: Doc = {
      id: "doc-partial",
      tenant_id: "tenant-1",
      amount: 18,
      currency: "EUR",
      link_state: "unlinked",
      invoice_date: "2025-05-31",
      vendor_norm: "qonto",
      items: [
        { id: "li-a", line_index: 0, amount_signed: 9, amount_abs: 9, open_amount: 9 },
        { id: "li-b", line_index: 1, amount_signed: 9, amount_abs: 9, open_amount: 9 },
      ],
    };

    const firstTx: Tx = {
      id: "tx-first",
      tenant_id: "tenant-1",
      amount: 9,
      direction: "out",
      currency: "EUR",
      booking_date: "2025-06-01T00:00:00.000Z",
      link_state: "unlinked",
      vendor_norm: "qonto abonnement zusatzgebuhren",
    };

    const firstPass = await run_pipeline(
      { docs: [baseDoc], txs: [firstTx] },
      buildNoopRepo()
    );
    const firstDecision = firstPass.decisions.find((entry) => entry.doc_ids.includes(baseDoc.id));

    expect(firstDecision?.state).toBe("partial");
    expect(firstDecision?.open_amount_after).toBe(9);

    const secondDoc: Doc = {
      ...baseDoc,
      link_state: "partial",
      open_amount: firstDecision?.open_amount_after ?? 9,
      items: [
        { id: "li-a", line_index: 0, amount_signed: 9, amount_abs: 9, open_amount: 0, link_state: "linked" },
        { id: "li-b", line_index: 1, amount_signed: 9, amount_abs: 9, open_amount: 9, link_state: "unlinked" },
      ],
    };

    const secondTx: Tx = {
      id: "tx-second",
      tenant_id: "tenant-1",
      amount: 9,
      direction: "out",
      currency: "EUR",
      booking_date: "2025-06-03T00:00:00.000Z",
      link_state: "unlinked",
      vendor_norm: "qonto abonnement zusatzgebuhren",
    };

    const secondPass = await run_pipeline(
      { docs: [secondDoc], txs: [secondTx] },
      buildNoopRepo()
    );
    const secondDecision = secondPass.decisions.find((entry) => entry.doc_ids.includes(baseDoc.id));

    expect(secondDecision?.state).toBe("final");
    expect(secondDecision?.open_amount_after).toBe(0);
  });
});
