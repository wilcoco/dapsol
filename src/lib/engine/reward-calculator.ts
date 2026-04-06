/**
 * Dapsol 발자국 투자 시스템
 *
 * 단순 비례 분배:
 *   100% → 기존 투자자에게 발자국 수 비례 분배
 *   0% → 품질 풀 (제거)
 *   0% → 소각 (제거)
 *
 * 예시: User1(2발자국), User2(3발자국), User3(5발자국) = 총 10발자국
 *       새로운 10발자국 투자 시:
 *       User1: 2/10 × 10 = 2발자국
 *       User2: 3/10 × 10 = 3발자국
 *       User3: 5/10 × 10 = 5발자국
 *
 * 발자국 획득 방법:
 *   - 가입 시: +30 발자국
 *   - AI 답변 생성 시: +5 발자국
 *   - 개척 (새 길 생성) 시: +10 발자국
 */

// ─── 분배 비율 상수 ───
export const POOL_RATIO = 0;       // 품질 풀 제거
export const REWARD_RATIO = 1.00;  // 100% 선투자자 보상
export const BURN_RATIO = 0;       // 소각 제거

// ─── 발자국 획득 보상 ───
export const FOOTPRINT_REWARDS = {
  SIGNUP: 30,       // 가입 시
  AI_ANSWER: 5,     // AI 답변 생성 시
  PIONEER: 10,      // 새 길 개척 시
  GAP_FILL: 25,     // AI 빈틈 채우기 (사냥 보상 - 2배 이상)
} as const;

// 보상 상한 (제한 없음 - 무제한)
export const REWARD_CAP_MULTIPLIER = Infinity;

// ─── 타입 ───

export interface HubWeightedInvestor {
  userId: string;
  amount: number;         // 투자한 발자국 수
  hubScore: number;       // (미사용, 호환성 유지)
  cumulativeReward: number; // 지금까지 받은 보상 합계
}

export interface RewardDistribution {
  recipientId: string;
  amount: number;
}

export interface InvestmentSplit {
  qualityPool: number;    // 항상 0
  rewardPool: number;     // 전액 분배
  rewards: RewardDistribution[];
  excessToPool: number;   // 항상 0
  burnAmount: number;     // 항상 0
}

/**
 * 실효 지분 계산: 단순 발자국 수
 * (기존 sqrt×hubScore 제거)
 */
export function effectiveWeight(amount: number, _hubScore: number): number {
  return Math.max(amount, 0);
}

/**
 * 새 투자 발생 시 분배 계산.
 * 100% 기존 투자자에게 발자국 수 비례 분배.
 *
 * @param newAmount - 새 투자 발자국 수
 * @param newInvestorHub - (미사용)
 * @param existingInvestors - 기존 투자자 목록
 * @returns 분배 결과
 */
export function calculateHubWeightedDistribution(
  newAmount: number,
  _newInvestorHub: number,
  existingInvestors: HubWeightedInvestor[]
): InvestmentSplit {
  const burnAmount = 0;
  const rewardPool = newAmount; // 100% 분배

  // 기존 투자자 없으면 분배할 대상 없음
  if (existingInvestors.length === 0) {
    return {
      qualityPool: 0,
      rewardPool: 0,
      rewards: [],
      excessToPool: 0,
      burnAmount: 0,
    };
  }

  // 단순 발자국 수 기준 지분 계산
  const weights = existingInvestors.map((inv) => ({
    userId: inv.userId,
    weight: effectiveWeight(inv.amount, inv.hubScore),
  }));

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight === 0) {
    return {
      qualityPool: 0,
      rewardPool: 0,
      rewards: [],
      excessToPool: 0,
      burnAmount: 0,
    };
  }

  // 비례 분배 (상한 없음)
  const rewards: RewardDistribution[] = [];

  for (const w of weights) {
    const ratio = w.weight / totalWeight;
    const reward = Math.floor(rewardPool * ratio);

    if (reward > 0) {
      rewards.push({ recipientId: w.userId, amount: reward });
    }
  }

  // 반올림 나머지 처리 → 최대 투자자에게
  const totalDistributed = rewards.reduce((sum, r) => sum + r.amount, 0);
  const remainder = rewardPool - totalDistributed;
  if (remainder > 0 && rewards.length > 0) {
    rewards.sort((a, b) => b.amount - a.amount);
    rewards[0].amount += remainder;
  }

  return {
    qualityPool: 0,
    rewardPool: totalDistributed + remainder,
    rewards,
    excessToPool: 0,
    burnAmount: 0,
  };
}

/**
 * 새 투자자의 실효 투자량 계산.
 * (단순 발자국 수 반환)
 */
export function calculateEffectiveAmount(amount: number, _hubScore: number): number {
  return effectiveWeight(amount, 0);
}

// ─── 품질 풀 마일스톤 (호환성 유지, 실제로 미사용) ───
export const QUALITY_POOL_MILESTONES = [] as const;
export const MILESTONE_RELEASE_RATIOS: Record<number, number> = {};

export interface QualityPoolReleaseResult {
  milestone: number;
  releasedAmount: number;
  stakeholderRewards: RewardDistribution[];
}

/**
 * 마일스톤 도달 시 품질 풀 해제 (비활성화 - 항상 null 반환)
 */
export function calculateQualityPoolRelease(
  _currentPool: number,
  _newCount: number,
  _allInvestors: HubWeightedInvestor[]
): QualityPoolReleaseResult | null {
  return null;
}

/**
 * 예상 수익 미리보기 (UI용)
 * 다음 투자 시 내가 받을 발자국 수 계산
 */
export function previewReturn(
  myAmount: number,
  _myHub: number,
  existingInvestors: HubWeightedInvestor[],
  hypotheticalNextAmount: number,
  _hypotheticalNextHub: number
): number {
  const myWeight = effectiveWeight(myAmount, 0);
  const totalWeight =
    existingInvestors.reduce(
      (sum, inv) => sum + effectiveWeight(inv.amount, inv.hubScore),
      0
    ) + myWeight;
  if (totalWeight === 0) return 0;

  const rewardPool = hypotheticalNextAmount; // 100% 분배
  return Math.floor(rewardPool * (myWeight / totalWeight));
}
