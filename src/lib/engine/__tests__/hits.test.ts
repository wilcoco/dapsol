import { describe, it, expect } from "vitest";
import { calculateForkSplitRatio } from "../hits";

describe("calculateForkSplitRatio", () => {
  it("uses authority ratio when both > 100", () => {
    // parent 200, fork 200 → 50%
    expect(calculateForkSplitRatio(200, 200, 5, 10)).toBeCloseTo(0.5);
    // parent 300, fork 150 → 300/450 ≈ 0.667
    expect(calculateForkSplitRatio(300, 150, 5, 10)).toBeCloseTo(0.667, 2);
  });

  it("falls back to message ratio when one is at base 100", () => {
    // parent auth = 100 (base), fork auth = 200
    // parentMessageCount = 3, totalMessageCount = 10 → 30%
    expect(calculateForkSplitRatio(100, 200, 3, 10)).toBeCloseTo(0.3);
  });

  it("falls back to 50% when both are base and no messages", () => {
    expect(calculateForkSplitRatio(100, 100, 0, 0)).toBe(0.5);
  });

  it("falls back to 50% when parentMessageCount == totalMessageCount", () => {
    // Both base, parentMessageCount = totalMessageCount → not valid for message ratio
    expect(calculateForkSplitRatio(100, 100, 10, 10)).toBe(0.5);
  });

  it("handles asymmetric authority correctly", () => {
    // parent 150, fork 450 → 150/600 = 25%
    expect(calculateForkSplitRatio(150, 450, 5, 10)).toBeCloseTo(0.25);
  });
});
