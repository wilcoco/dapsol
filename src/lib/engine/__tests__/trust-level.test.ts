import { describe, it, expect } from "vitest";
import {
  calculateTrustLevel,
  getMaxInvestmentByLevel,
  getTrustLevelDef,
  getProgressToNextLevel,
  TRUST_LEVELS,
} from "../trust-level";

describe("calculateTrustLevel", () => {
  it("returns level 1 for 0 score", () => {
    expect(calculateTrustLevel(0)).toBe(1);
  });

  it("returns level 1 for score below 150", () => {
    expect(calculateTrustLevel(149)).toBe(1);
  });

  it("returns level 2 at exactly 150", () => {
    expect(calculateTrustLevel(150)).toBe(2);
  });

  it("returns level 3 at 500", () => {
    expect(calculateTrustLevel(500)).toBe(3);
  });

  it("returns level 4 at 1500", () => {
    expect(calculateTrustLevel(1500)).toBe(4);
  });

  it("returns level 5 at 5000", () => {
    expect(calculateTrustLevel(5000)).toBe(5);
  });

  it("returns level 5 for very high scores", () => {
    expect(calculateTrustLevel(999999)).toBe(5);
  });
});

describe("getMaxInvestmentByLevel", () => {
  it("returns 50 for level 1", () => {
    expect(getMaxInvestmentByLevel(1)).toBe(50);
  });

  it("returns 100 for level 2", () => {
    expect(getMaxInvestmentByLevel(2)).toBe(100);
  });

  it("returns 500 for level 5", () => {
    expect(getMaxInvestmentByLevel(5)).toBe(500);
  });

  it("returns 50 for unknown level", () => {
    expect(getMaxInvestmentByLevel(99)).toBe(50);
  });
});

describe("getTrustLevelDef", () => {
  it("returns correct definition for level 3", () => {
    const def = getTrustLevelDef(3);
    expect(def.name).toBe("전문가");
    expect(def.minScore).toBe(500);
    expect(def.maxInvestment).toBe(200);
  });

  it("falls back to level 1 for unknown level", () => {
    const def = getTrustLevelDef(0);
    expect(def.level).toBe(1);
  });
});

describe("getProgressToNextLevel", () => {
  it("shows 0% progress at level 1 start", () => {
    const p = getProgressToNextLevel(0);
    expect(p.currentLevel).toBe(1);
    expect(p.nextLevel).toBe(2);
    expect(p.progress).toBe(0);
    expect(p.remaining).toBe(150);
  });

  it("shows 50% progress at midpoint of level 1", () => {
    const p = getProgressToNextLevel(75);
    expect(p.currentLevel).toBe(1);
    expect(p.progress).toBe(50);
    expect(p.remaining).toBe(75);
  });

  it("shows 100% progress at max level", () => {
    const p = getProgressToNextLevel(10000);
    expect(p.currentLevel).toBe(5);
    expect(p.nextLevel).toBeNull();
    expect(p.progress).toBe(100);
    expect(p.remaining).toBe(0);
  });
});
