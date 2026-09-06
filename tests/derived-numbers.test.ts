import { describe, it, expect } from "vitest";
import { percentChange, absoluteDifference, ratio, tryDeriveMatch } from "../lib/ai/derived-numbers";

describe("derived numbers", () => {
  it("computes percentage growth, matching the brief's own worked example", () => {
    const r = percentChange(268, 412);
    expect(r.formatted).toBe("53.7%");
    expect(r.from).toEqual([268, 412]);
  });

  it("computes percentage decline as a negative value", () => {
    const r = percentChange(31400, 22800);
    expect(r.value).toBeLessThan(0);
    expect(r.formatted).toBe("-27.4%");
  });

  it("computes an absolute difference", () => {
    expect(absoluteDifference(268, 412).value).toBe(144);
  });

  it("computes a ratio", () => {
    const r = ratio(4.8, 2.4);
    expect(r.formatted).toBe("2x");
  });

  it("never reports false precision beyond one decimal place", () => {
    const r = percentChange(268, 411);
    // 411/268 growth is 53.358...% — must round, never show raw float noise.
    expect(r.formatted).not.toMatch(/\.\d{2,}/);
    expect(r.formatted.split(".")[1]?.replace("%", "").length ?? 0).toBeLessThanOrEqual(1);
  });

  it("avoids a fabricated-looking negative zero", () => {
    const r = percentChange(100, 100.001);
    expect(r.formatted).not.toBe("-0%");
  });

  it("refuses to divide by a zero baseline rather than returning Infinity", () => {
    expect(() => percentChange(0, 50)).toThrow(RangeError);
    expect(() => ratio(5, 0)).toThrow(RangeError);
  });

  describe("tryDeriveMatch", () => {
    it("recognises a percentage-growth figure computed from two source numbers", () => {
      const m = tryDeriveMatch(53.7, [268, 412, 9400]);
      expect(m?.kind).toBe("percentChange");
      expect(m?.from).toEqual([268, 412]);
    });

    it("recognises a ratio figure", () => {
      const m = tryDeriveMatch(2, [4.8, 2.4]);
      expect(m?.kind).toBe("ratio");
    });

    it("returns null when no combination of source numbers explains the figure", () => {
      expect(tryDeriveMatch(999, [1, 2, 3])).toBeNull();
    });

    it("tolerates the same rounding the formatter itself applies", () => {
      // 268 -> 412 is 53.731...%; a draft that wrote "53.7%" must still match.
      const m = tryDeriveMatch(53.7, [268, 412]);
      expect(m).not.toBeNull();
    });
  });
});
