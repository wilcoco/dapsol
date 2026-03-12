/**
 * Authority & Hub Score Calculator (Log-Scaled)
 *
 * Authority(user) = 100 + 50 × log₂(1 + 외부투자평균 / 100)
 *   → 기본 100 보장
 *   → 로그 스케일: 높은 점수일수록 올리기 지수적으로 어려움
 *   → 파밍으로 인위적 상승 비효율적
 *
 * Hub(user) = 1 + 4 × log₂(1 + 평균배당 / 10)
 *   → 기본 1.0, 로그 스케일로 체감 수익 감소
 *   → 좋은 안목의 투자자는 자연스럽게 상승, 파밍은 비효율
 *
 * 공유 시 creator.authorityScore 를 QASet.creatorAuthorityStake 로 스냅샷.
 * 창작자는 자기 QA에 투자 불가 — Authority stake 가 투자금 역할.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Recalculate Authority and Hub scores for a specific user.
 * Call after investments, reward distributions, or new QA shares.
 */
export async function recalculateUserScores(
  prisma: PrismaClient,
  userId: string
): Promise<{ hubScore: number; authorityScore: number }> {
  // ── Authority: 100 + (순외부투자 합계 / 공유 QA 수) ──
  // 순투자 = totalInvested - negativeInvested (마이너스 투자 반영)
  const userQAs = await prisma.qASet.findMany({
    where: { creatorId: userId, isShared: true },
    select: { id: true, totalInvested: true, negativeInvested: true },
  });

  const sharedQACount = userQAs.length;

  // 자기 투자분 합계를 빼서 순수 외부 투자만 계산
  let selfInvestedTotal = 0;
  if (sharedQACount > 0) {
    const selfInvestments = await prisma.investment.aggregate({
      where: {
        userId,
        qaSetId: { in: userQAs.map((qa) => qa.id) },
        isActive: true,
        isNegative: false,
      },
      _sum: { amount: true },
    });
    selfInvestedTotal = selfInvestments._sum.amount ?? 0;
  }

  // 순투자 = (총 플러스 투자 - 마이너스 투자) - 자기투자
  const totalInvestedSum = userQAs.reduce((sum, qa) => sum + qa.totalInvested, 0);
  const totalNegativeSum = userQAs.reduce((sum, qa) => sum + qa.negativeInvested, 0);
  const externalInvestedSum = totalInvestedSum - totalNegativeSum - selfInvestedTotal;

  // 로그 스케일: 높은 점수일수록 올리기 지수적으로 어려움
  // Authority = 100 + 50 × log₂(1 + 외부투자평균 / 100)
  // 예) 외부투자평균 100 → 150, 1000 → 267, 10000 → 433
  const rawAuthorityAvg = sharedQACount > 0
    ? Math.max(0, externalInvestedSum) / sharedQACount
    : 0;
  const authorityScore = sharedQACount > 0
    ? Math.round((100 + 50 * Math.log2(1 + rawAuthorityAvg / 100)) * 100) / 100
    : 100;

  // ── Hub: 투자하여 얻은 평균 배당 (플러스+마이너스 투자 보상 모두 포함) ──
  const [rewardAgg, investmentCount] = await Promise.all([
    prisma.rewardEvent.aggregate({
      where: {
        recipientId: userId,
        rewardType: {
          in: [
            "hub_weighted_distribution",
            "fork_royalty",
            "authority_ratio_royalty",
            "negative_investment_distribution",
            "negative_pool_milestone_3",
            "negative_pool_milestone_10",
            "negative_pool_milestone_25",
          ],
        },
      },
      _sum: { amount: true },
    }),
    prisma.investment.count({
      where: { userId, isActive: true },
    }),
  ]);

  // 로그 스케일: Hub = 1 + 4 × log₂(1 + 평균배당 / 10)
  // 예) 평균배당 10 → 5, 100 → 14.4, 1000 → 27.6
  const totalRewards = rewardAgg._sum.amount ?? 0;
  const rawHubAvg = investmentCount > 0 ? totalRewards / investmentCount : 0;
  const hubScore = investmentCount > 0
    ? Math.round((1 + 4 * Math.log2(1 + rawHubAvg / 10)) * 100) / 100
    : 1.0; // 신규 사용자 기본값

  await prisma.user.update({
    where: { id: userId },
    data: { hubScore, authorityScore },
  });

  return { hubScore, authorityScore };
}

/**
 * Get a user's Authority score (cached in DB).
 * Returns 100 for users with no data (base authority).
 */
export async function getUserAuthority(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { authorityScore: true },
  });
  return user?.authorityScore ?? 100;
}

/**
 * Calculate fork investment split ratio based on creators' Authority scores.
 *
 * @returns parentRatio (0-1): 원본 QA 창작자에게 갈 비율
 *
 * 규칙:
 *   1. 둘 다 Authority > 100 (기본 이상) → Authority 비율 사용
 *   2. 한쪽이라도 기본값(100) → 메시지 수 비율로 폴백
 *   3. 메시지 수 비율도 불가 → 50/50
 */
export function calculateForkSplitRatio(
  parentCreatorAuth: number,
  forkCreatorAuth: number,
  parentMessageCount: number,
  totalMessageCount: number
): number {
  // 둘 다 기본값(100) 초과: 실적 기반 비율
  if (parentCreatorAuth > 100 && forkCreatorAuth > 100) {
    return parentCreatorAuth / (parentCreatorAuth + forkCreatorAuth);
  }

  // 한쪽이라도 기본값 → 메시지 수(콘텐츠) 비율
  if (totalMessageCount > 0 && parentMessageCount > 0 && parentMessageCount < totalMessageCount) {
    return parentMessageCount / totalMessageCount;
  }

  // 최종 폴백: 50/50
  return 0.5;
}

/**
 * Full recalculation for all users (batch).
 * Backward-compatible: replaces the old HITS algorithm.
 */
export async function recalculateHITS(prisma: PrismaClient): Promise<{
  usersUpdated: number;
  qaSetsUpdated: number;
  iterations: number;
}> {
  // 모든 활동 사용자 수집 (투자자 + 창작자)
  const userIds = new Set<string>();

  const investors = await prisma.investment.findMany({
    where: { isActive: true },
    select: { userId: true },
    distinct: ["userId"],
  });
  for (const inv of investors) userIds.add(inv.userId);

  const creators = await prisma.qASet.findMany({
    where: { isShared: true },
    select: { creatorId: true },
    distinct: ["creatorId"],
  });
  for (const qa of creators) userIds.add(qa.creatorId);

  // 각 사용자 점수 재계산
  for (const userId of userIds) {
    await recalculateUserScores(prisma, userId);
  }

  // QASet authorityScore = 순투자 (totalInvested - negativeInvested)
  const sharedQAs = await prisma.qASet.findMany({
    where: { isShared: true },
    select: { id: true, totalInvested: true, negativeInvested: true },
  });

  const qaSetOps = sharedQAs.map((qa) =>
    prisma.qASet.update({
      where: { id: qa.id },
      data: { authorityScore: Math.max(0, qa.totalInvested - qa.negativeInvested) },
    })
  );

  // 비활동 사용자 기본값 리셋 (Authority = 100, Hub = 1.0)
  const resetUserOp = prisma.user.updateMany({
    where: { id: { notIn: [...userIds] } },
    data: { hubScore: 1.0, authorityScore: 100.0 },
  });

  // 비공유 QA 초기화
  const resetQASetOp = prisma.qASet.updateMany({
    where: { isShared: false, authorityScore: { not: 0.0 } },
    data: { authorityScore: 0.0 },
  });

  if (qaSetOps.length > 0) {
    await prisma.$transaction([...qaSetOps, resetUserOp, resetQASetOp]);
  } else {
    await prisma.$transaction([resetUserOp, resetQASetOp]);
  }

  return {
    usersUpdated: userIds.size,
    qaSetsUpdated: qaSetOps.length,
    iterations: 1,
  };
}
