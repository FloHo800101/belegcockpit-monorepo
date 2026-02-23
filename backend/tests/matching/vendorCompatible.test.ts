import { describe, expect, it } from "vitest";
import { vendorCompatible } from "../../src/matching-engine/vendor";

describe("vendorCompatible", () => {
  it("matches qonto variants with additional text", () => {
    expect(vendorCompatible("qonto", "qonto abonnement zusatzgebuhren")).toBe(true);
  });

  it("matches station/tankstelle variants for the same brand", () => {
    expect(vendorCompatible("aral tankstelle", "aral station 288017122 karte 1090")).toBe(true);
  });

  it("rejects unrelated vendor names", () => {
    expect(vendorCompatible("qonto", "microsoft")).toBe(false);
  });
});
