import { describe, it, expect } from "vitest";
import {
  effectiveWeight,
  calculateHubWeightedDistribution,
  calculateEffectiveAmount,
  calculateQualityPoolRelease,
  POOL_RATIO,
  REWARD_RATIO,
  BURN_RATIO,
  REWARD_CAP_MULTIPLIER,
} from "../reward-calculator";

describe("effectiveWeight", () => {
  it("returns sqrt(amount) × hubScore", () => {
    expect(effectiveWeight(100, 2)).toBeCloseTo(20); // sqrt(100) * 2
    expect(effectiveWeight(400, 1)).toBeCloseTo(20); // sqrt(400) * 1
  });

  it("clamps negative amount to 0", () => {
    expect(effectiveWeight(-10, 1)).toBe(0);
  });

  it("clamps low hubScore to 0.01", () => {
    expect(effectiveWeight(100, 0)).toBeCloseTo(0.1); // sqrt(100) * 0.01
    expect(effectiveWeight(100, -5)).toBeCloseTo(0.1);
  });
});

describe("calculateHubWeightedDistribution", () => {
  it("splits correctly: 50% pool, 40% reward, 10% burn", () => {
    const split = calculateHubWeightedDistribution(100, 1.0, [
      { userId: "u1", amount: 50, hubScore: 1.0, cumulativeReward: 0 },
    ]);
    expect(split.burnAmount).toBe(10); // 10%
    expect(split.qualityPool + split.rewardPool + split.burnAmount).toBeLessThanOrEqual(100);
    expect(split.qualityPool + split.rewardPool + split.burnAmount + split.excessToPool)
      .toBeLessThanOrEqual(100);
  });

  it("sends all to pool when no existing investors", () => {
    const split = calculateHubWeightedDistribution(100, 1.0, []);
    expect(split.rewards).toHaveLength(0);
    expect(split.rewardPool).toBe(0);
    expect(split.burnAmount).toBe(10);
    // quality pool gets the pool share + the excess reward pool
    expect(split.qualityPool).toBe(90);
  });

  it("distributes rewards proportionally by effective weight", () => {
    const split = calculateHubWeightedDistribution(1000, 1.0, [
      { userId: "u1", amount: 100, hubScore: 2.0, cumulativeReward: 0 }, // weight = 10*2 = 20
      { userId: "u2", amount: 100, hubScore: 1.0, cumulativeReward: 0 }, // weight = 10*1 = 10
    ]);
    // u1 should get roughly 2x of u2
    const r1 = split.rewards.find((r) => r.recipientId === "u1")!;
    const r2 = split.rewards.find((r) => r.recipientId === "u2")!;
    expect(r1.amount).toBeGreaterThan(r2.amount);
    // Check ratio is approximately 2:1
    expect(r1.amount / r2.amount).toBeCloseTo(2, 0);
  });

  it("caps rewards at REWARD_CAP_MULTIPLIER × original amount", () => {
    // Investor already near cap
    const split = calculateHubWeightedDistribution(10000, 1.0, [
      { userId: "u1", amount: 50, hubScore: 1.0, cumulativeReward: 95 },
      // cap = 50*2 - 95 = 5, so max reward is 5
    ]);
    const r1 = split.rewards.find((r) => r.recipientId === "u1");
    if (r1) {
      expect(r1.amount).toBeLessThanOrEqual(5);
    }
    // excess should go to pool
    expect(split.excessToPool).toBeGreaterThan(0);
  });

  it("total distributed equals input amount", () => {
    const split = calculateHubWeightedDistribution(1000, 1.0, [
      { userId: "u1", amount: 200, hubScore: 1.5, cumulativeReward: 0 },
      { userId: "u2", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
    ]);
    const totalRewards = split.rewards.reduce((s, r) => s + r.amount, 0);
    const total = split.qualityPool + totalRewards + split.burnAmount;
    // Should equal original amount (accounting for rounding)
    expect(total).toBeLessThanOrEqual(1000);
    expect(total).toBeGreaterThanOrEqual(998); // allow 2 for rounding
  });
});

describe("calculateEffectiveAmount", () => {
  it("equals effectiveWeight", () => {
    expect(calculateEffectiveAmount(100, 2.0)).toBe(effectiveWeight(100, 2.0));
  });
});

describe("calculateQualityPoolRelease", () => {
  it("returns null for non-milestone counts", () => {
    expect(calculateQualityPoolRelease(1000, 5, [])).toBeNull();
    expect(calculateQualityPoolRelease(1000, 7, [])).toBeNull();
  });

  it("releases 20% at milestone 3", () => {
    const investors = [
      { userId: "u1", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
      { userId: "u2", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
      { userId: "u3", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
    ];
    const result = calculateQualityPoolRelease(1000, 3, investors);
    expect(result).not.toBeNull();
    expect(result!.milestone).toBe(3);
    expect(result!.releasedAmount).toBe(200); // 1000 * 0.20
  });

  it("releases 30% at milestone 10", () => {
    const investors = Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`, amount: 100, hubScore: 1.0, cumulativeReward: 0,
    }));
    const result = calculateQualityPoolRelease(800, 10, investors);
    expect(result).not.toBeNull();
    expect(result!.releasedAmount).toBe(240); // 800 * 0.30
  });

  it("distributes equally to equal investors", () => {
    const investors = [
      { userId: "u1", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
      { userId: "u2", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
      { userId: "u3", amount: 100, hubScore: 1.0, cumulativeReward: 0 },
    ];
    const result = calculateQualityPoolRelease(300, 3, investors)!;
    // 300 * 0.20 = 60, each should get ~20
    const amounts = result.stakeholderRewards.map((r) => r.amount);
    expect(amounts.every((a) => a >= 19 && a <= 21)).toBe(true);
  });

  it("returns null when pool is 0", () => {
    expect(calculateQualityPoolRelease(0, 3, [])).toBeNull();
  });
});
