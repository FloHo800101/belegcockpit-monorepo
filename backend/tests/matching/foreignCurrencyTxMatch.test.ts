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

describe("foreign currency tx support", () => {
  it("matches USD doc against EUR tx when tx carries USD foreign amount", async () => {
    const doc = {
      id: "doc-usd-1",
      tenant_id: "tenant-1",
      amount: 5,
      currency: "USD",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-04T00:00:00.000Z",
      due_date: "2025-05-04T00:00:00.000Z",
      vendor_norm: "engageq",
      text_norm: "engageq invoice",
    };

    const tx = {
      id: "tx-eur-usd-1",
      tenant_id: "tenant-1",
      amount: 4.44,
      direction: "out" as const,
      currency: "EUR",
      foreign_amount: 5,
      foreign_currency: "USD",
      exchange_rate: 1.12612612612613,
      booking_date: "2025-05-05T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "engageq com karte 0504",
      ref: "ENGAGEQ.COM 1.12612612612613 USD = 1.00 EUR Karte ** 0504",
      text_norm: "engageq com usd eur karte",
    };

    const result = await run_pipeline(
      {
        docs: [doc],
        txs: [tx],
      },
      buildNoopRepo()
    );

    const decision = result.decisions.find(
      (item) =>
        item.relation_type === "one_to_one" &&
        item.doc_ids.includes(doc.id) &&
        item.tx_ids.includes(tx.id)
    );

    expect(decision).toBeTruthy();
    expect(decision?.state).toBe("final");
    expect(decision?.inputs?.tx_amount).toBe(5);
    expect(decision?.inputs?.currency).toBe("USD");
  });

  it("does not match USD doc against EUR tx without foreign amount", async () => {
    const doc = {
      id: "doc-usd-2",
      tenant_id: "tenant-1",
      amount: 5,
      currency: "USD",
      link_state: "unlinked" as const,
      invoice_date: "2025-05-04T00:00:00.000Z",
      due_date: "2025-05-04T00:00:00.000Z",
      vendor_norm: "engageq",
      text_norm: "engageq invoice",
    };

    const tx = {
      id: "tx-eur-only-1",
      tenant_id: "tenant-1",
      amount: 4.44,
      direction: "out" as const,
      currency: "EUR",
      booking_date: "2025-05-05T00:00:00.000Z",
      link_state: "unlinked" as const,
      vendor_norm: "engageq com karte 0504",
      ref: "ENGAGEQ.COM Karte ** 0504",
      text_norm: "engageq com karte",
    };

    const result = await run_pipeline(
      {
        docs: [doc],
        txs: [tx],
      },
      buildNoopRepo()
    );

    const decision = result.decisions.find(
      (item) =>
        item.relation_type === "one_to_one" &&
        item.doc_ids.includes(doc.id) &&
        item.tx_ids.includes(tx.id)
    );

    expect(decision).toBeFalsy();
  });
});
