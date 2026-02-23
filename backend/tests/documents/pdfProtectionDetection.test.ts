import { describe, expect, it } from "vitest";
import { isPdfLikelyEncrypted } from "../../src/documents/uploader";

describe("isPdfLikelyEncrypted", () => {
  it("returns false for plain pdf bytes", () => {
    const bytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "latin1");
    expect(isPdfLikelyEncrypted(bytes)).toBe(false);
  });

  it("returns true for pdf bytes containing encrypt marker", () => {
    const bytes = Buffer.from(
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Encrypt 5 0 R >>\nendobj\n",
      "latin1"
    );
    expect(isPdfLikelyEncrypted(bytes)).toBe(true);
  });
});

