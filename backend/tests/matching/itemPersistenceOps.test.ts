import { describe, expect, it } from "vitest";
import { toApplyOps } from "../../src/matching-engine/persistence";

describe("item persistence ops", () => {
  it("emits invoice line-item update ops for matched item refs", () => {
    const ops = toApplyOps({
      state: "partial",
      relation_type: "one_to_many",
      tx_ids: ["tx-1"],
      doc_ids: ["doc-1"],
      confidence: 0.9,
      reason_codes: ["ITEM_FIRST_BUNDLE_MATCH"],
      inputs: {
        tenant_id: "tenant-1",
        matched_item_refs: [
          { id: "li-1", line_index: 0 },
          { line_index: 1 },
        ],
      },
      matched_by: "system",
      match_group_id: "grp-1",
      open_amount_after: 9,
    });

    const itemOps = ops.filter((entry) => entry.kind === "update_invoice_line_item");
    expect(itemOps).toHaveLength(2);
    expect(itemOps[0]).toMatchObject({
      kind: "update_invoice_line_item",
      invoice_id: "doc-1",
      line_item_id: "li-1",
      link_state: "linked",
      open_amount: 0,
    });
  });
});
