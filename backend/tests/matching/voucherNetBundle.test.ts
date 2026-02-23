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

describe("voucher net bundle", () => {
  it("prefers item-first partial over premature one_to_one final", async () => {
    const doc = {
      id: "doc-voucher",
      tenant_id: "tenant-1",
      amount: 18.38,
      amount_candidates: [9],
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-31",
      vendor_norm: "qonto",
      items: [
        { id: "li-1", line_index: 0, amount_signed: 29, amount_abs: 29, open_amount: 29 },
        { id: "li-2", line_index: 1, amount_signed: -20, amount_abs: 20, open_amount: 20 },
      ],
    };

    const tx = {
      id: "tx-voucher-net",
      tenant_id: "tenant-1",
      amount: 9,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-31T00:00:00.000Z",
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

    const partial = result.decisions.find(
      (entry) =>
        entry.state === "partial" &&
        entry.relation_type === "one_to_many" &&
        entry.doc_ids.includes(doc.id)
    );
    const directFinal = result.decisions.find(
      (entry) =>
        entry.state === "final" &&
        entry.relation_type === "one_to_one" &&
        entry.doc_ids.includes(doc.id)
    );

    expect(partial).toBeTruthy();
    expect(partial?.inputs?.matched_via_bundle).toBe(true);
    expect(directFinal).toBeFalsy();
  });
});
