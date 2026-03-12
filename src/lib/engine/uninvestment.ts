/**
 * Uninvestment (투자 철회) 처리
 *
 * 규칙:
 * - 투자 후 24시간 이내에만 철회 가능 (쿨다운 보호)
 * - 원금의 20% 페널티 → 80% 환급
 * - 이미 받은 보상(cumulativeReward)은 유지
 * - isActive = false 로 마킹 → 이후 투자에서 보상 대상에서 제외
 * - 품질 풀(qualityPool)에 기여한 금액은 환급 불가 (커뮤니티 자산)
 *
 * 환급액 = floor(originalAmount × 0.80)
 */

export const UNINVEST_PENALTY_RATE = 0.20;   // 20% 페널티
export const UNINVEST_WINDOW_HOURS = 24;      // 24시간 이내에만 철회 가능

export interface UninvestResult {
  refundAmount: number;    // 실제 환급액
  penaltyAmount: number;   // 페널티 (소각)
  originalAmount: number;  // 원래 투자액
}

/**
 * 철회 가능 여부 확인 및 환급액 계산.
 */
export function calculateUninvestRefund(
  amount: number,
  createdAt: Date
): { eligible: boolean; reason?: string; result?: UninvestResult } {
  const ageMs = Date.now() - createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > UNINVEST_WINDOW_HOURS) {
    return {
      eligible: false,
      reason: `투자 후 ${UNINVEST_WINDOW_HOURS}시간이 지나 철회할 수 없습니다. (${Math.floor(ageHours)}시간 경과)`,
    };
  }

  const penaltyAmount = Math.floor(amount * UNINVEST_PENALTY_RATE);
  const refundAmount = amount - penaltyAmount;

  return {
    eligible: true,
    result: {
      refundAmount,
      penaltyAmount,
      originalAmount: amount,
    },
  };
}
