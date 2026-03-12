/**
 * Trust Level System
 *
 * 신뢰 레벨: 총 활동량(투자한 금액 + 받은 보상)에 따라 자동 레벨업.
 * 레벨이 높을수록 1회 투자 상한 증가.
 *
 * Level | 이름     | 활동 점수 기준 | 1회 최대 투자
 * ------+----------+---------------+--------------
 *   1   | 신규     |       0+      |      50
 *   2   | 기여자   |     150+      |     100
 *   3   | 전문가   |     500+      |     200
 *   4   | 마스터   |    1500+      |     350
 *   5   | 권위자   |    5000+      |     500
 *
 * 활동 점수 = 총 투자 금액(isActive) + 총 받은 보상
 */

import { PrismaClient } from "@prisma/client";

export interface TrustLevelDef {
  level: number;
  name: string;
  minScore: number;       // 이 레벨에 진입하기 위한 최소 활동 점수
  maxInvestment: number;  // 1회 최대 투자 가능 금액
}

export const TRUST_LEVELS: TrustLevelDef[] = [
  { level: 1, name: "신규",   minScore:    0, maxInvestment:  50 },
  { level: 2, name: "기여자", minScore:  150, maxInvestment: 100 },
  { level: 3, name: "전문가", minScore:  500, maxInvestment: 200 },
  { level: 4, name: "마스터", minScore: 1500, maxInvestment: 350 },
  { level: 5, name: "권위자", minScore: 5000, maxInvestment: 500 },
];

/** 활동 점수 → 신뢰 레벨 번호 */
export function calculateTrustLevel(activityScore: number): number {
  const found = [...TRUST_LEVELS].reverse().find((l) => activityScore >= l.minScore);
  return found?.level ?? 1;
}

/** 레벨 번호 → 1회 최대 투자 금액 */
export function getMaxInvestmentByLevel(level: number): number {
  return TRUST_LEVELS.find((l) => l.level === level)?.maxInvestment ?? 50;
}

/** 레벨 정의 전체 반환 */
export function getTrustLevelDef(level: number): TrustLevelDef {
  return TRUST_LEVELS.find((l) => l.level === level) ?? TRUST_LEVELS[0];
}

/**
 * 다음 레벨까지 남은 점수 계산.
 * 최고 레벨이면 null 반환.
 */
export function getProgressToNextLevel(
  activityScore: number
): { currentLevel: number; nextLevel: number | null; progress: number; remaining: number } {
  const currentLevel = calculateTrustLevel(activityScore);
  const nextDef = TRUST_LEVELS.find((l) => l.level === currentLevel + 1);

  if (!nextDef) {
    return { currentLevel, nextLevel: null, progress: 100, remaining: 0 };
  }

  const currentDef = TRUST_LEVELS.find((l) => l.level === currentLevel)!;
  const span = nextDef.minScore - currentDef.minScore;
  const earned = activityScore - currentDef.minScore;
  const progress = Math.min(100, Math.round((earned / span) * 100));
  const remaining = Math.max(0, nextDef.minScore - activityScore);

  return { currentLevel, nextLevel: nextDef.level, progress, remaining };
}

/**
 * DB에서 사용자의 활동 점수를 조회하고 trustLevel 업데이트.
 * 레벨이 변경된 경우 새 레벨 번호 반환, 변경 없으면 null 반환.
 */
export async function recalculateAndUpdateTrustLevel(
  prisma: PrismaClient,
  userId: string
): Promise<{ newLevel: number; oldLevel: number; leveledUp: boolean } | null> {
  const [user, invested, rewards] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { trustLevel: true },
    }),
    prisma.investment.aggregate({
      where: { userId, isActive: true },
      _sum: { amount: true },
    }),
    prisma.rewardEvent.aggregate({
      where: { recipientId: userId },
      _sum: { amount: true },
    }),
  ]);

  if (!user) return null;

  const totalInvested = invested._sum.amount ?? 0;
  const totalRewards = rewards._sum.amount ?? 0;
  const activityScore = totalInvested + totalRewards;

  const newLevel = calculateTrustLevel(activityScore);
  const oldLevel = user.trustLevel;

  if (newLevel !== oldLevel) {
    await prisma.user.update({
      where: { id: userId },
      data: { trustLevel: newLevel },
    });
    return { newLevel, oldLevel, leveledUp: newLevel > oldLevel };
  }

  return { newLevel, oldLevel, leveledUp: false };
}
