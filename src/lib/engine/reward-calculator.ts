/**
 * HITS-Weighted Investment Reward Calculator
 *
 * 투자금 3분할:
 *   50% → 품질 풀 (QASet에 잠금, 마일스톤 도달 시 지분 비례 해제)
 *   40% → 선투자 보상 (기존 투자자에게 실효 지분 비례 분배)
 *   10% → 소각 (총 공급량 감소)
 *
 * 창작자도 공유 시 Authority 범위 내에서 투자 → position 1 투자자
 * 품질 풀 해제 시 창작자/투자자 구분 없이 전원 지분 비례 배분
 *
 * 실효 지분 = sqrt(투자금) × hub점수
 *   → 고래 방지 (sqrt) + 안목 보상 (hub)
 *
 * 보상 상한: 각 투자자 누적 보상 ≤ 원금 × REWARD_CAP_MULTIPLIER
 */

// ─── 분배 비율 상수 ───
export const POOL_RATIO = 0.50;     // 품질 풀 (원본 Q&A)
export const REWARD_RATIO = 0.40;   // 선투자 보상
export const BURN_RATIO = 0.10;     // 소각 (총 공급량 감소)

// 보상 상한 배수 (원금의 2배까지만 수익)
export const REWARD_CAP_MULTIPLIER = 2;

// ─── 타입 ───

export interface HubWeightedInvestor {
  userId: string;
  amount: number;         // 원본 투자금
  hubScore: number;       // 투자자의 현재 hub 점수
  cumulativeReward: number; // 지금까지 받은 보상 합계
}

export interface RewardDistribution {
  recipientId: string;
  amount: number;
}

export interface InvestmentSplit {
  qualityPool: number;    // QASet에 잠기는 금액
  rewardPool: number;     // 선투자자 분배 금액
  rewards: RewardDistribution[];
  excessToPool: number;   // 상한 초과로 품질풀에 추가된 금액
  burnAmount: number;     // 소각된 금액
}

/**
 * 실효 지분 계산: sqrt(amount) × hubScore
 * sqrt로 고래 한계효용 감소, hubScore로 안목 가중
 */
export function effectiveWeight(amount: number, hubScore: number): number {
  return Math.sqrt(Math.max(amount, 0)) * Math.max(hubScore, 0.01);
}

/**
 * 새 투자 발생 시 분배 계산.
 *
 * @param newAmount - 새 투자금 (raw)
 * @param newInvestorHub - 새 투자자의 hub 점수
 * @param existingInvestors - 기존 투자자 목록 (hub 점수 포함)
 * @returns 분배 결과
 */
export function calculateHubWeightedDistribution(
  newAmount: number,
  newInvestorHub: number,
  existingInvestors: HubWeightedInvestor[]
): InvestmentSplit {
  // 3분할
  const burnAmount = Math.floor(newAmount * BURN_RATIO);
  const rewardPool = Math.floor(newAmount * REWARD_RATIO);
  let qualityPool = newAmount - rewardPool - burnAmount; // 나머지 = 50%+반올림분

  // 기존 투자자 없으면 보상풀을 품질풀에 추가 (소각은 유지)
  if (existingInvestors.length === 0) {
    return {
      qualityPool: qualityPool + rewardPool,
      rewardPool: 0,
      rewards: [],
      excessToPool: rewardPool,
      burnAmount,
    };
  }

  // 실효 지분 계산
  const weights = existingInvestors.map((inv) => ({
    userId: inv.userId,
    weight: effectiveWeight(inv.amount, inv.hubScore),
    cap: inv.amount * REWARD_CAP_MULTIPLIER - inv.cumulativeReward, // 남은 상한
  }));

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight === 0) {
    return {
      qualityPool: qualityPool + rewardPool,
      rewardPool: 0,
      rewards: [],
      excessToPool: rewardPool,
      burnAmount,
    };
  }

  // 비례 분배 (상한 적용)
  const rewards: RewardDistribution[] = [];
  let excessToPool = 0;

  for (const w of weights) {
    const ratio = w.weight / totalWeight;
    let reward = Math.floor(rewardPool * ratio);

    // 상한 적용
    const remainingCap = Math.max(w.cap, 0);
    if (reward > remainingCap) {
      excessToPool += reward - remainingCap;
      reward = remainingCap;
    }

    if (reward > 0) {
      rewards.push({ recipientId: w.userId, amount: reward });
    }
  }

  // 반올림 나머지 처리
  const totalDistributed = rewards.reduce((sum, r) => sum + r.amount, 0);
  const remainder = rewardPool - totalDistributed - excessToPool;
  if (remainder > 0) {
    if (rewards.length > 0) {
      rewards.sort((a, b) => b.amount - a.amount);
      rewards[0].amount += remainder;
    } else {
      excessToPool += remainder;
    }
  }

  qualityPool += excessToPool;

  return {
    qualityPool,
    rewardPool: totalDistributed,
    rewards,
    excessToPool,
    burnAmount,
  };
}

/**
 * 새 투자자의 실효 투자량 계산.
 * DB에 effectiveAmount로 저장되어 HITS 계산에 사용.
 */
export function calculateEffectiveAmount(amount: number, hubScore: number): number {
  return effectiveWeight(amount, hubScore);
}

// ─── 품질 풀 마일스톤 ───
/** 투자자 수가 이 값에 도달할 때 품질 풀 일부 해제 */
export const QUALITY_POOL_MILESTONES = [3, 10, 25] as const;
/** 각 마일스톤에서 현재 품질 풀의 몇 %를 해제할지 */
export const MILESTONE_RELEASE_RATIOS: Record<number, number> = {
  3:  0.20,  // 1차: 풀의 20% 해제
  10: 0.30,  // 2차: 나머지 풀의 30% 해제
  25: 0.50,  // 3차: 나머지 풀의 50% 해제
};
export interface QualityPoolReleaseResult {
  milestone: number;
  releasedAmount: number;        // 풀에서 빠져나가는 총량
  stakeholderRewards: RewardDistribution[]; // 전원 지분 비례 배분
}

/**
 * 마일스톤 도달 시 품질 풀 해제 금액 계산.
 *
 * 호출 조건: 투자 후 새로운 investorCount 가 QUALITY_POOL_MILESTONES 중 하나와 같을 때.
 * 분배: 해제량 100% → 모든 지분 보유자 (창작자 포함) 실효 지분 비례
 *   창작자도 공유 시 투자했으므로 동일한 지분으로 참여
 *
 * @param currentPool  - 현재 남아 있는 qualityPool (릴리즈 전)
 * @param newCount     - 방금 갱신된 investorCount
 * @param allInvestors - 창작자 포함 전체 투자자 목록
 */
export function calculateQualityPoolRelease(
  currentPool: number,
  newCount: number,
  allInvestors: HubWeightedInvestor[]
): QualityPoolReleaseResult | null {
  const ratio = MILESTONE_RELEASE_RATIOS[newCount];
  if (ratio === undefined || currentPool <= 0) return null;

  const releasedAmount = Math.floor(currentPool * ratio);
  if (releasedAmount <= 0) return null;

  const stakeholderRewards: RewardDistribution[] = [];

  if (allInvestors.length > 0 && releasedAmount > 0) {
    const totalW = allInvestors.reduce(
      (sum, inv) => sum + effectiveWeight(inv.amount, inv.hubScore),
      0
    );
    if (totalW > 0) {
      for (const inv of allInvestors) {
        const w = effectiveWeight(inv.amount, inv.hubScore);
        const share = Math.floor(releasedAmount * (w / totalW));
        if (share > 0) {
          stakeholderRewards.push({ recipientId: inv.userId, amount: share });
        }
      }
      // 반올림 나머지 → 지분 최대 투자자에게
      const distributed = stakeholderRewards.reduce((s, r) => s + r.amount, 0);
      const remainder = releasedAmount - distributed;
      if (remainder > 0 && stakeholderRewards.length > 0) {
        stakeholderRewards.sort((a, b) => b.amount - a.amount);
        stakeholderRewards[0].amount += remainder;
      }
    }
  }

  return {
    milestone: newCount,
    releasedAmount,
    stakeholderRewards,
  };
}

/**
 * 예상 수익 미리보기 (UI용)
 */
export function previewReturn(
  myAmount: number,
  myHub: number,
  existingInvestors: HubWeightedInvestor[],
  hypotheticalNextAmount: number,
  hypotheticalNextHub: number
): number {
  const myWeight = effectiveWeight(myAmount, myHub);
  const totalWeight =
    existingInvestors.reduce(
      (sum, inv) => sum + effectiveWeight(inv.amount, inv.hubScore),
      0
    ) + myWeight;
  if (totalWeight === 0) return 0;

  const rewardPool = Math.floor(hypotheticalNextAmount * REWARD_RATIO);
  return Math.floor(rewardPool * (myWeight / totalWeight));
}
