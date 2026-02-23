import { describe, expect, it } from "vitest";
import { buildDocumentDateFilter } from "./live-replay-date-filter";

describe("buildDocumentDateFilter", () => {
  it("excludes undated documents by default", () => {
    const filter = buildDocumentDateFilter("2025-01-01", "2025-12-31", false);
    expect(filter).toContain("invoice_date.gte.2025-01-01");
    expect(filter).toContain("due_date.gte.2025-01-01");
    expect(filter).not.toContain("invoice_date.is.null");
  });

  it("includes undated documents when enabled", () => {
    const filter = buildDocumentDateFilter("2025-01-01", "2025-12-31", true);
    expect(filter).toContain("invoice_date.gte.2025-01-01");
    expect(filter).toContain("due_date.gte.2025-01-01");
    expect(filter).toContain("and(invoice_date.is.null,due_date.is.null)");
  });
});

