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

describe("recurring tx can reuse an already linked contract document", () => {
  it("matches a subscription tx against a linked document when vendor and amount fit", async () => {
    const linkedContractDoc = {
      id: "doc-contract-linked-1",
      tenant_id: "tenant-1",
      amount: 238,
      currency: "EUR",
      link_state: "linked" as const,
      invoice_date: "2025-01-10T00:00:00.000Z",
      due_date: "2025-01-10T00:00:00.000Z",
      vendor_norm: "rci banque deutschland",
      text_norm: "leasing vertrag renault",
    };

    const recurringTx = {
      id: "tx-recurring-1",
      tenant_id: "tenant-1",
      amount: 238,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-10T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "rci banque deutschland",
      ref: "renault leasing",
      text_norm: "rci banque leasing rate",
      is_recurring_hint: true,
    };

    const result = await run_pipeline(
      {
        docs: [linkedContractDoc],
        txs: [recurringTx],
      },
      buildNoopRepo()
    );

    const decision = result.decisions.find(
      (item) =>
        item.relation_type === "one_to_one" &&
        item.state === "final" &&
        item.doc_ids.includes(linkedContractDoc.id) &&
        item.tx_ids.includes(recurringTx.id)
    );

    expect(decision).toBeTruthy();
    expect(decision?.reason_codes).toContain("SUBSCRIPTION_REUSE_LINKED_DOC");
  });
});
