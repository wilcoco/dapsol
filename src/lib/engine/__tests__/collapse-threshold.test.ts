import { describe, it, expect } from "vitest";
import { checkCollapseThreshold } from "../collapse-threshold";

describe("checkCollapseThreshold", () => {
  it("does not collapse with fewer than 3 hunters", () => {
    const result = checkCollapseThreshold(1, 2, 100, 200);
    expect(result.isCollapsed).toBe(false);
  });

  it("does not collapse when negative ratio <= 60%", () => {
    // 5 positive, 3 negative → 3/8 = 37.5%
    const result = checkCollapseThreshold(5, 3, 500, 300);
    expect(result.isCollapsed).toBe(false);
  });

  it("collapses with 3+ hunters and >60% ratio", () => {
    // 1 positive, 4 negative → 4/5 = 80%
    const result = checkCollapseThreshold(1, 4, 100, 400);
    expect(result.isCollapsed).toBe(true);
    expect(result.negativeRatio).toBeCloseTo(0.8);
    expect(result.reason).toBeDefined();
  });

  it("collapses at exactly 3 hunters and >60%", () => {
    // 1 positive, 3 negative → 3/4 = 75%
    const result = checkCollapseThreshold(1, 3, 100, 300);
    expect(result.isCollapsed).toBe(true);
  });

  it("does not collapse at exactly 60%", () => {
    // 2 positive, 3 negative → 3/5 = 60% (not > 60%)
    const result = checkCollapseThreshold(2, 3, 200, 300);
    expect(result.isCollapsed).toBe(false);
  });

  it("handles zero investors", () => {
    const result = checkCollapseThreshold(0, 0, 0, 0);
    expect(result.isCollapsed).toBe(false);
    expect(result.negativeRatio).toBe(0);
  });
});
