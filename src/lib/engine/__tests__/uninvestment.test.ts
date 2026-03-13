import { describe, it, expect } from "vitest";
import {
  calculateUninvestRefund,
  UNINVEST_PENALTY_RATE,
  UNINVEST_WINDOW_HOURS,
} from "../uninvestment";

describe("calculateUninvestRefund", () => {
  it("refunds 80% within window", () => {
    const now = new Date();
    const result = calculateUninvestRefund(100, now);
    expect(result.eligible).toBe(true);
    expect(result.result!.refundAmount).toBe(80);
    expect(result.result!.penaltyAmount).toBe(20);
    expect(result.result!.originalAmount).toBe(100);
  });

  it("refunds correctly for odd amounts", () => {
    const now = new Date();
    const result = calculateUninvestRefund(77, now);
    expect(result.eligible).toBe(true);
    expect(result.result!.penaltyAmount).toBe(Math.floor(77 * UNINVEST_PENALTY_RATE)); // 15
    expect(result.result!.refundAmount).toBe(77 - 15); // 62
  });

  it("rejects after 24 hours", () => {
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const result = calculateUninvestRefund(100, past);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain(`${UNINVEST_WINDOW_HOURS}시간`);
  });

  it("accepts at exactly 23 hours", () => {
    const past = new Date(Date.now() - 23 * 60 * 60 * 1000);
    const result = calculateUninvestRefund(100, past);
    expect(result.eligible).toBe(true);
  });
});
