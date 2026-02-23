import { describe, expect, it } from "vitest";
import { buildSafeStoragePath, sanitizeStorageKeySegment } from "../../src/documents/storagePath";

describe("storage path sanitization", () => {
  it("normalizes combining marks into ASCII-safe segments", () => {
    const value = "01_Qonto_Kontoführung_05-25-invoice-24275693.pdf";
    expect(sanitizeStorageKeySegment(value, "file")).toBe(
      "01_Qonto_Kontofuhrung_05-25-invoice-24275693.pdf",
    );
  });

  it("replaces path separators and disallowed chars", () => {
    const value = "foo/bar\\baz:*?report.pdf";
    expect(sanitizeStorageKeySegment(value, "file")).toBe("foo-bar-baz-report.pdf");
  });

  it("compresses repeated special chars and trims dashes", () => {
    const value = "   ###A---B___C###   ";
    expect(sanitizeStorageKeySegment(value, "file")).toBe("A-B___C");
  });

  it("builds a safe path without double slashes", () => {
    const path = buildSafeStoragePath([
      "tests",
      "analyzes",
      "azure//analyze",
      "2026-02-18T08-38-06-959Z-uuid",
      "01_Qonto_Kontoführung_05-25-invoice-24275693.pdf",
    ]);

    expect(path).not.toContain("//");
    expect(path).toBe(
      "tests/analyzes/azure-analyze/2026-02-18T08-38-06-959Z-uuid/01_Qonto_Kontofuhrung_05-25-invoice-24275693.pdf",
    );
  });
});

