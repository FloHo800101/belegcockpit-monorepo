if ("Deno" in globalThis) {
  const { buildStoragePath } = await import("./_shared.ts");

  Deno.test("buildStoragePath creates a valid safe storage key", () => {
    const path = buildStoragePath(
      "azure-analyze",
      "01_Qonto_Kontoführung_05-25-invoice-24275693.pdf",
    );

    if (path.includes("//")) {
      throw new Error(`Path contains //: ${path}`);
    }
    if (!path.startsWith("tests/analyzes/azure-analyze/")) {
      throw new Error(`Unexpected prefix: ${path}`);
    }

    const fileName = path.split("/").pop() ?? "";
    if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
      throw new Error(`Filename segment contains invalid chars: ${fileName}`);
    }
  });
} else {
  const { describe, it, expect } = await import("vitest");

  describe("_shared storage path deno test", () => {
    it("is only executed with deno test", () => {
      expect(true).toBe(true);
    });
  });
}

