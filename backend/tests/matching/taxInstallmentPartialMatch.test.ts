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

describe("tax installment partial matching", () => {
  it("links one quarterly payment and keeps document partially open", async () => {
    const doc = {
      id: "doc-tax-1",
      tenant_id: "tenant-1",
      amount: 8884,
      currency: "EUR",
      link_state: "unlinked" as const,
      invoice_date: "2025-01-10T00:00:00.000Z",
      due_date: "2025-12-31T00:00:00.000Z",
      vendor_norm: "finanzamt itzehoe",
      text_norm: "gewerbesteuervorauszahlung",
      items: [
        { id: "inst-1", line_index: 0, amount_signed: 2221, amount_abs: 2221, open_amount: 2221 },
        { id: "inst-2", line_index: 1, amount_signed: 2221, amount_abs: 2221, open_amount: 2221 },
        { id: "inst-3", line_index: 2, amount_signed: 2221, amount_abs: 2221, open_amount: 2221 },
        { id: "inst-4", line_index: 3, amount_signed: 2221, amount_abs: 2221, open_amount: 2221 },
      ],
    };

    const tx = {
      id: "tx-tax-q2",
      tenant_id: "tenant-1",
      amount: 2221,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-12T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "finanzamt itzehoe steuernummer 18 291 26420 digitalwirt",
      text_norm: "gewerbesteuervorauszahlung q2",
    };

    const result = await run_pipeline({ docs: [doc], txs: [tx] }, buildNoopRepo());
    const decision = result.decisions.find((entry) => entry.doc_ids.includes(doc.id));

    expect(decision?.state).toBe("partial");
    expect(decision?.relation_type).toBe("one_to_many");
    expect(decision?.tx_ids).toEqual([tx.id]);
    expect(decision?.open_amount_after).toBe(6663);
  });
});
