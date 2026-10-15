import { describe, it, expect } from "vitest";
import { useMapboxFallback } from "../src/domain/map-provider";
describe("Map fallback boundaries", () => {
  it("only switches after actual failure or missing Google configuration", () => {
    expect(useMapboxFallback(true, "pk.test", "google", false)).toBe(false);
    expect(useMapboxFallback(true, "pk.test", "google", true)).toBe(true);
    expect(useMapboxFallback(true, "pk.test", "", false)).toBe(true);
  });
  it("never falls back for unknown/Google content or missing/secret credentials", () => {
    for (const allowed of [false, undefined])
      expect(useMapboxFallback(allowed, "pk.test", "", true)).toBe(false);
    for (const token of ["", "sk.secret"])
      expect(useMapboxFallback(true, token, "", true)).toBe(false);
  });
});
