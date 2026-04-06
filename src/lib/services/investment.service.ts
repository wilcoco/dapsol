/**
 * Investment Service
 *
 * 투자(투자/반대 투자)의 모든 비즈니스 로직을 담당.
 * 라우트 핸들러에서 HTTP 관심사만 남기고 비즈니스 로직은 여기서 처리.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  calculateHubWeightedDistribution,
  calculateEffectiveAmount,
  calculateQualityPoolRelease,
  QUALITY_POOL_MILESTONES,
  type HubWeightedInvestor,
  type RewardDistribution,
} from "@/lib/engine/reward-calculator";
import {
  recalculateUserScores,
  calculateForkSplitRatio,
} from "@/lib/engine/hits";
import { checkInvestmentRules, detectMutualInvestment } from "@/lib/engine/anti-gaming";
import {
  getMaxInvestmentByLevel,
  recalculateAndUpdateTrustLevel,
} from "@/lib/engine/trust-level";
import { createNotification } from "@/lib/notifications";
import { checkAndTriggerControversy } from "@/lib/knowledge/controversy-question";
import { invalidate as invalidateSessionCache } from "@/lib/session-cache";

// ─── Constants ───

const MIN_TRUST_LEVEL_FOR_NEGATIVE = 2;

const NEGATIVE_POOL_RATIO = 0.50;
const NEGATIVE_REWARD_RATIO = 0.50;

const NEGATIVE_MILESTONES = [3, 10, 25] as const;
const NEGATIVE_MILESTONE_RATIOS: Record<number, number> = { 3: 0.20, 10: 0.30, 25: 0.50 };

// ─── Types ───

export interface InvestmentInput {
  userId: string;
  userName: string | null;
  qaSetId?: string;          // QASet 투자
  opinionNodeId?: string;    // 의견 투자 (추가)
  amount: number;
  isNegative: boolean;
  comment?: string;
  huntingReason?: string;
  huntingEvidence?: string;
  huntingTargetMessageId?: string;
}

export interface InvestmentResult {
  success: true;
  isNegative: boolean;
  split: Record<string, number>;
  rewards: Array<{ recipientId: string; amount: number }>;
  investorHub: number;
  effectiveAmount: number;
  trustLevelUp: { oldLevel: number; newLevel: number } | null;
  poolRelease?: {
    milestone: number;
    releasedAmount: number;
    recipientCount: number;
  } | null;
  forkRoyalty?: {
    parentQASetId: string;
    royaltyAmount: number;
    royaltyRate: number;
    recipientCount: number;
    parentCreatorAuth: number;
    forkCreatorAuth: number;
  } | null;
  // Negative-only fields
  negPoolRelease?: {
    milestone: number;
    releasedAmount: number;
    investorCount: number;
  } | null;
  netInvested?: number;
  isCollapsed?: boolean;
  huntingReason?: string;
}

export class InvestmentValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvestmentValidationError";
  }
}

// ─── Validation ───

interface LoadedUser {
  id: string;
  name: string | null;
  balance: number;
  hubScore: number;
  trustLevel: number;
  createdAt: Date;
}

interface LoadedQASet {
  id: string;
  isShared: boolean;
  creatorId: string;
  parentQASetId: string | null;
  parentMessageCount: number;
  version: number;
  qualityPool: number;
  investorCount: number;
  negativePool: number;
  negativeCount: number;
  totalInvested: number;
  negativeInvested: number;
  burnedAmount: number;
  investments: Array<{
    id: string;
    userId: string;
    amount: number;
    position: number;
    isNegative: boolean;
    effectiveAmount: number;
    cumulativeReward: number;
    user: { id: string; hubScore: number };
  }>;
  messages: Array<{ id: string }>;
  creator: { id: string; authorityScore: number; hubScore: number };
}

async function loadEntities(userId: string, qaSetId: string): Promise<{ user: LoadedUser; qaSet: LoadedQASet }> {
  const [user, qaSet] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, balance: true, hubScore: true, trustLevel: true, createdAt: true },
    }),
    prisma.qASet.findUnique({
      where: { id: qaSetId },
      include: {
        investments: {
          where: { isActive: true },
          orderBy: { position: "asc" as const },
          include: { user: { select: { id: true, hubScore: true } } },
        },
        messages: { select: { id: true } },
        creator: { select: { id: true, authorityScore: true, hubScore: true } },
      },
    }),
  ]);

  if (!user) throw new InvestmentValidationError("User not found", "USER_NOT_FOUND", 404);
  if (!qaSet) throw new InvestmentValidationError("Q&A set not found", "QASET_NOT_FOUND", 404);

  return { user: user as LoadedUser, qaSet: qaSet as unknown as LoadedQASet };
}

export async function validateInvestment(
  input: InvestmentInput,
  user: LoadedUser,
  qaSet: LoadedQASet,
): Promise<void> {
  if (!input.amount || input.amount <= 0) {
    throw new InvestmentValidationError("투자 포인트를 입력해주세요.", "INVALID_AMOUNT", 400);
  }

  if (!qaSet.isShared) {
    throw new InvestmentValidationError("공유되지 않은 Q&A에는 투자할 수 없습니다.", "NOT_SHARED", 400);
  }

  if (user.balance < input.amount) {
    throw new InvestmentValidationError("잔액이 부족합니다.", "INSUFFICIENT_BALANCE", 400);
  }

  // Trust level max investment
  const maxByLevel = getMaxInvestmentByLevel(user.trustLevel);
  if (input.amount > maxByLevel) {
    throw new InvestmentValidationError(
      `현재 신뢰 레벨(Lv.${user.trustLevel})에서는 1회 최대 ${maxByLevel} 💰까지 투자할 수 있습니다.`,
      "TRUST_LEVEL_LIMIT",
      400,
      { maxInvestment: maxByLevel, trustLevel: user.trustLevel },
    );
  }

  if (input.isNegative) {
    validateNegativeInvestment(input, user, qaSet);
  } else {
    validatePositiveInvestment(input, user, qaSet);
  }

  // Anti-gaming (qaSetId is guaranteed by guard above)
  const qaSetId = input.qaSetId!;
  const violation = await checkInvestmentRules(
    prisma, input.userId, qaSetId, qaSet.creatorId,
    input.amount, user.createdAt, input.isNegative,
  );
  if (violation) {
    throw new InvestmentValidationError(violation.message, violation.code, violation.statusCode);
  }

  // Mutual investment blocking (positive only)
  if (!input.isNegative) {
    const mutualViolation = await detectMutualInvestment(prisma, input.userId, qaSetId);
    if (mutualViolation) {
      throw new InvestmentValidationError(mutualViolation.message, mutualViolation.code, mutualViolation.statusCode);
    }
  }
}

function validateNegativeInvestment(input: InvestmentInput, user: LoadedUser, qaSet: LoadedQASet): void {
  if (!input.huntingReason) {
    throw new InvestmentValidationError("반대 사유를 선택해주세요.", "HUNTING_REASON_REQUIRED", 400);
  }
  if (user.trustLevel < MIN_TRUST_LEVEL_FOR_NEGATIVE) {
    throw new InvestmentValidationError(
      `반대 투자는 신뢰 레벨 Lv.${MIN_TRUST_LEVEL_FOR_NEGATIVE} 이상부터 가능합니다. (현재: Lv.${user.trustLevel})`,
      "NEGATIVE_TRUST_LEVEL", 403,
    );
  }
  if (qaSet.investments.some((inv) => inv.userId === input.userId && !inv.isNegative)) {
    throw new InvestmentValidationError("이미 투자 중인 Q&A는 반대 투자할 수 없습니다.", "ALREADY_POSITIVE_INVESTED", 400);
  }
  if (input.userId === qaSet.creatorId) {
    throw new InvestmentValidationError("본인이 만든 Q&A는 반대 투자할 수 없습니다.", "SELF_NEGATIVE", 403);
  }
}

function validatePositiveInvestment(input: InvestmentInput, _user: LoadedUser, qaSet: LoadedQASet): void {
  if (qaSet.investments.some((inv) => inv.userId === input.userId && inv.isNegative)) {
    throw new InvestmentValidationError("이미 반대 투자 중인 Q&A는 투자할 수 없습니다.", "ALREADY_NEGATIVE_INVESTED", 400);
  }
}

// ─── Positive Investment ───

async function processPositiveInvestment(
  input: InvestmentInput,
  user: LoadedUser,
  qaSet: LoadedQASet,
): Promise<InvestmentResult> {
  const qaSetId = input.qaSetId!; // Guaranteed by processInvestment guard

  // Fork royalty calculation
  let royaltyAmount = 0;
  let royaltyRate = 0;
  let parentCreatorAuth = 0;
  let forkCreatorAuth = 0;

  if (qaSet.parentQASetId) {
    const parentQACreator = await prisma.qASet.findUnique({
      where: { id: qaSet.parentQASetId },
      select: { creatorId: true, creator: { select: { authorityScore: true } } },
    });
    if (parentQACreator) {
      parentCreatorAuth = parentQACreator.creator.authorityScore;
      forkCreatorAuth = qaSet.creator.authorityScore;
      royaltyRate = calculateForkSplitRatio(
        parentCreatorAuth, forkCreatorAuth, qaSet.parentMessageCount, qaSet.messages.length,
      );
      royaltyAmount = Math.min(Math.floor(input.amount * royaltyRate), Math.floor(input.amount * 0.50));
    }
  }

  // Distribution calculation
  const existingPositiveInvestors: HubWeightedInvestor[] = qaSet.investments
    .filter((inv) => !inv.isNegative)
    .map((inv) => ({
      userId: inv.userId, amount: inv.amount,
      hubScore: inv.user.hubScore, cumulativeReward: inv.cumulativeReward,
    }));

  const split = calculateHubWeightedDistribution(input.amount, user.hubScore, existingPositiveInvestors);
  const adjustedQualityPool = Math.max(0, split.qualityPool - royaltyAmount);
  const burnAmount = split.burnAmount;
  const effAmount = calculateEffectiveAmount(input.amount, user.hubScore);

  // Consolidated transaction
  const { newPosition, investmentId } = await prisma.$transaction(async (tx) => {
    const currentQASet = await tx.qASet.findUnique({ where: { id: qaSetId }, select: { version: true } });
    if (!currentQASet) throw new Error("QASet not found in transaction");

    const maxPos = await tx.investment.aggregate({
      where: { qaSetId, isNegative: false }, _max: { position: true },
    });
    const pos = (maxPos._max.position ?? 0) + 1;

    const inv = await tx.investment.create({
      data: {
        qaSetId, userId: input.userId, amount: input.amount,
        position: pos, effectiveAmount: effAmount, isNegative: false, comment: input.comment,
      },
    });

    await tx.user.update({ where: { id: input.userId }, data: { balance: { decrement: input.amount } } });

    await tx.qASet.update({
      where: { id: qaSetId, version: currentQASet.version },
      data: {
        totalInvested: { increment: input.amount },
        investorCount: { increment: 1 },
        qualityPool: { increment: adjustedQualityPool },
        burnedAmount: { increment: burnAmount },
        version: { increment: 1 },
      },
    });

    // Distribute rewards
    for (const reward of split.rewards) {
      await tx.user.update({ where: { id: reward.recipientId }, data: { balance: { increment: reward.amount } } });
      const existingInv = qaSet.investments.find((i) => i.userId === reward.recipientId && !i.isNegative);
      if (existingInv) {
        await tx.investment.update({
          where: { id: existingInv.id }, data: { cumulativeReward: { increment: reward.amount } },
        });
      }
    }

    // Reward events
    if (split.rewards.length > 0) {
      await tx.rewardEvent.createMany({
        data: split.rewards.map((r) => ({
          recipientId: r.recipientId, amount: r.amount, qaSetId,
          sourceInvestmentId: inv.id, rewardType: "hub_weighted_distribution",
        })),
      });
    }

    // Audit logs
    await tx.auditLog.create({
      data: {
        action: "invest", userId: input.userId, qaSetId, amount: input.amount,
        metadata: JSON.stringify({
          position: pos, qualityPool: adjustedQualityPool,
          rewardPool: split.rewardPool, burnAmount, rewardCount: split.rewards.length,
        }),
      },
    });
    if (burnAmount > 0) {
      await tx.auditLog.create({
        data: {
          action: "burn", userId: input.userId, qaSetId, amount: burnAmount,
          metadata: JSON.stringify({ source: "investment_burn_ratio" }),
        },
      });
    }

    return { newPosition: pos, investmentId: inv.id };
  });

  // Notifications (fire-and-forget)
  sendPositiveNotifications(input, user, qaSet, split.rewards, investmentId);

  // Quality pool milestone
  const poolRelease = await handlePositiveMilestone(qaSetId, newPosition, investmentId);

  // Fork royalty
  const forkRoyalty = await handleForkRoyalty(qaSet, royaltyAmount, royaltyRate, parentCreatorAuth, forkCreatorAuth, investmentId);

  // Trust level recalculation
  const trustLevelUp = await recalcTrustLevel(input.userId);

  // HITS recalculation (fire-and-forget)
  recalcHITS(input.userId, qaSet, split.rewards);

  return {
    success: true,
    isNegative: false,
    split: { qualityPool: adjustedQualityPool, rewardPool: split.rewardPool, burnAmount },
    rewards: split.rewards.map((r) => ({ recipientId: r.recipientId, amount: r.amount })),
    investorHub: user.hubScore,
    effectiveAmount: Math.round(effAmount * 100) / 100,
    trustLevelUp,
    poolRelease,
    forkRoyalty,
  };
}

// ─── Negative Investment ───

async function processNegativeInvestment(
  input: InvestmentInput,
  user: LoadedUser,
  qaSet: LoadedQASet,
): Promise<InvestmentResult> {
  const qaSetId = input.qaSetId!; // Guaranteed by processInvestment guard
  const rewardPool = Math.floor(input.amount * NEGATIVE_REWARD_RATIO);
  let negativePool = input.amount - rewardPool;

  // Existing negative investors
  const existingNegInvestors = qaSet.investments
    .filter((inv) => inv.isNegative)
    .map((inv) => ({
      userId: inv.userId, investmentId: inv.id, amount: inv.amount,
      hubScore: inv.user.hubScore, cumulativeReward: inv.cumulativeReward,
    }));

  // Reward distribution
  const { rewards, excessToPool } = distributeNegativeRewards(rewardPool, existingNegInvestors);
  negativePool += excessToPool;

  const effAmount = Math.sqrt(input.amount) * Math.max(user.hubScore, 0.01);

  // Transaction
  const { negativePosition, negInvestmentId } = await prisma.$transaction(async (tx) => {
    const maxPos = await tx.investment.aggregate({
      where: { qaSetId, isNegative: true }, _max: { position: true },
    });
    const pos = (maxPos._max.position ?? 0) + 1;

    const inv = await tx.investment.create({
      data: {
        qaSetId, userId: input.userId, amount: input.amount,
        position: pos, effectiveAmount: effAmount, isNegative: true, comment: input.comment,
        huntingReason: input.huntingReason, huntingEvidence: input.huntingEvidence,
        huntingTargetMessageId: input.huntingTargetMessageId,
      },
    });

    await tx.user.update({ where: { id: input.userId }, data: { balance: { decrement: input.amount } } });

    await tx.qASet.update({
      where: { id: qaSetId },
      data: {
        negativeInvested: { increment: input.amount },
        negativeCount: { increment: 1 },
        negativePool: { increment: negativePool },
      },
    });

    return { negativePosition: pos, negInvestmentId: inv.id };
  });

  // Distribute rewards to prior negative investors
  await distributeNegativeRewardsToInvestors(rewards, existingNegInvestors, negInvestmentId, qaSetId);

  // Notifications
  sendNegativeNotifications(input, user, qaSet, rewards, negInvestmentId);

  // Negative milestone
  const negPoolRelease = await handleNegativeMilestone(qaSetId, negativePosition, negInvestmentId);

  // Collapse check
  const { netInvested, isCollapsed } = await checkCollapse(qaSetId);

  // Trust level + HITS
  const trustLevelUp = await recalcTrustLevel(input.userId);
  recalcHITS(input.userId, qaSet, rewards);

  // Trigger controversy check
  checkAndTriggerControversy(qaSetId).catch(console.error);

  return {
    success: true,
    isNegative: true,
    split: { negativePool, rewardPool: rewards.reduce((s, r) => s + r.amount, 0) },
    rewards: rewards.map((r) => ({ recipientId: r.recipientId, amount: r.amount })),
    investorHub: user.hubScore,
    effectiveAmount: Math.round(effAmount * 100) / 100,
    trustLevelUp,
    negPoolRelease,
    netInvested,
    isCollapsed,
    huntingReason: input.huntingReason,
  };
}

// ─── Helpers ───

function distributeNegativeRewards(
  rewardPool: number,
  investors: Array<{ userId: string; investmentId: string; amount: number; hubScore: number; cumulativeReward: number }>,
): { rewards: RewardDistribution[]; excessToPool: number } {
  if (investors.length === 0 || rewardPool <= 0) {
    return { rewards: [], excessToPool: rewardPool };
  }

  const weights = investors.map((inv) => ({
    userId: inv.userId,
    weight: Math.sqrt(inv.amount) * Math.max(inv.hubScore, 0.01),
    cap: inv.amount * 2 - inv.cumulativeReward,
  }));

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight === 0) return { rewards: [], excessToPool: rewardPool };

  const rewards: RewardDistribution[] = [];
  let excessToPool = 0;

  for (const w of weights) {
    let reward = Math.floor(rewardPool * (w.weight / totalWeight));
    const remainingCap = Math.max(w.cap, 0);
    if (reward > remainingCap) {
      excessToPool += reward - remainingCap;
      reward = remainingCap;
    }
    if (reward > 0) rewards.push({ recipientId: w.userId, amount: reward });
  }

  const totalDistributed = rewards.reduce((sum, r) => sum + r.amount, 0);
  const remainder = rewardPool - totalDistributed - excessToPool;
  if (remainder > 0) {
    if (rewards.length > 0) rewards[0].amount += remainder;
    else excessToPool += remainder;
  }

  return { rewards, excessToPool };
}

async function distributeNegativeRewardsToInvestors(
  rewards: RewardDistribution[],
  existingInvestors: Array<{ userId: string; investmentId: string }>,
  sourceInvestmentId: string,
  qaSetId: string,
): Promise<void> {
  if (rewards.length === 0) return;

  const rewardOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const reward of rewards) {
    rewardOps.push(prisma.user.update({
      where: { id: reward.recipientId }, data: { balance: { increment: reward.amount } },
    }));
    const inv = existingInvestors.find((i) => i.userId === reward.recipientId);
    if (inv) {
      rewardOps.push(prisma.investment.update({
        where: { id: inv.investmentId }, data: { cumulativeReward: { increment: reward.amount } },
      }));
    }
  }
  await prisma.$transaction(rewardOps);

  await prisma.rewardEvent.createMany({
    data: rewards.map((r) => ({
      recipientId: r.recipientId, amount: r.amount, qaSetId,
      sourceInvestmentId, rewardType: "negative_investment_distribution",
    })),
  });
}

async function handlePositiveMilestone(
  qaSetId: string, newPosition: number, investmentId: string,
): Promise<InvestmentResult["poolRelease"]> {
  // 발자국 시스템: 품질 풀 마일스톤 비활성화 (100% 즉시 분배)
  // @ts-expect-error - QUALITY_POOL_MILESTONES is empty array (milestones disabled)
  if (QUALITY_POOL_MILESTONES.length === 0 || !QUALITY_POOL_MILESTONES.includes(newPosition)) return null;

  const updatedQASet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      qualityPool: true, investorCount: true, creatorId: true,
      investments: {
        where: { isActive: true, isNegative: false },
        select: { userId: true, amount: true, effectiveAmount: true },
        orderBy: { position: "asc" as const },
      },
    },
  });

  if (!updatedQASet || updatedQASet.investorCount !== newPosition) return null;

  const investorUsers = await prisma.user.findMany({
    where: { id: { in: updatedQASet.investments.map((inv) => inv.userId) } },
    select: { id: true, hubScore: true },
  });
  const hubMap = new Map(investorUsers.map((u) => [u.id, u.hubScore]));

  const investmentRewards = await prisma.investment.findMany({
    where: { userId: { in: updatedQASet.investments.map((inv) => inv.userId) }, isActive: true, isNegative: false, qaSetId },
    select: { userId: true, cumulativeReward: true },
  });
  const rewardMap = new Map(investmentRewards.map((r) => [r.userId, r.cumulativeReward]));

  const allInvestors: HubWeightedInvestor[] = updatedQASet.investments.map((inv) => ({
    userId: inv.userId, amount: inv.amount,
    hubScore: hubMap.get(inv.userId) ?? 1.0, cumulativeReward: rewardMap.get(inv.userId) ?? 0,
  }));

  const poolRelease = calculateQualityPoolRelease(
    updatedQASet.qualityPool, updatedQASet.investorCount, allInvestors,
  );
  if (!poolRelease || poolRelease.releasedAmount <= 0) return null;

  // Release pool
  const releaseOps: Prisma.PrismaPromise<unknown>[] = [
    prisma.qASet.update({ where: { id: qaSetId }, data: { qualityPool: { decrement: poolRelease.releasedAmount } } }),
    ...poolRelease.stakeholderRewards.map((inv) =>
      prisma.user.update({ where: { id: inv.recipientId }, data: { balance: { increment: inv.amount } } }),
    ),
  ];
  await prisma.$transaction(releaseOps);

  const poolRewardEvents = poolRelease.stakeholderRewards
    .filter((e) => e.amount > 0)
    .map((inv) => ({
      recipientId: inv.recipientId, amount: inv.amount, qaSetId,
      sourceInvestmentId: investmentId, rewardType: `quality_pool_milestone_${poolRelease.milestone}`,
    }));
  if (poolRewardEvents.length > 0) {
    await prisma.rewardEvent.createMany({ data: poolRewardEvents });
  }

  // Notifications
  for (const inv of poolRelease.stakeholderRewards) {
    createNotification({
      userId: inv.recipientId, type: "quality_pool_release",
      title: "성장 풀 수익!", body: `${poolRelease.milestone}번째 투자자 마일스톤! +${inv.amount}💰 보상`,
      link: `/?qaSetId=${qaSetId}`, qaSetId,
    }).catch(console.error);
  }

  return {
    milestone: poolRelease.milestone,
    releasedAmount: poolRelease.releasedAmount,
    recipientCount: poolRelease.stakeholderRewards.length,
  };
}

async function handleNegativeMilestone(
  qaSetId: string, negativePosition: number, negInvestmentId: string,
): Promise<InvestmentResult["negPoolRelease"]> {
  if (!NEGATIVE_MILESTONES.includes(negativePosition as 3 | 10 | 25)) return null;

  const updatedQA = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      negativePool: true, negativeCount: true,
      investments: { where: { isActive: true, isNegative: true }, select: { userId: true, amount: true } },
    },
  });

  if (!updatedQA || updatedQA.negativeCount !== negativePosition) return null;

  const ratio = NEGATIVE_MILESTONE_RATIOS[negativePosition];
  if (!ratio || updatedQA.negativePool <= 0) return null;

  const releasedAmount = Math.floor(updatedQA.negativePool * ratio);
  if (releasedAmount <= 0) return null;

  const totalW = updatedQA.investments.reduce((s, inv) => s + Math.sqrt(inv.amount), 0);
  const investorRewards: RewardDistribution[] = [];

  if (totalW > 0) {
    let dist = 0;
    for (const inv of updatedQA.investments) {
      const share = Math.floor(releasedAmount * (Math.sqrt(inv.amount) / totalW));
      if (share > 0) { investorRewards.push({ recipientId: inv.userId, amount: share }); dist += share; }
    }
    const rem = releasedAmount - dist;
    if (rem > 0 && investorRewards.length > 0) investorRewards[0].amount += rem;
  }

  if (investorRewards.length === 0) return null;

  const releaseOps: Prisma.PrismaPromise<unknown>[] = [
    prisma.qASet.update({ where: { id: qaSetId }, data: { negativePool: { decrement: releasedAmount } } }),
    ...investorRewards.map((r) =>
      prisma.user.update({ where: { id: r.recipientId }, data: { balance: { increment: r.amount } } }),
    ),
  ];
  await prisma.$transaction(releaseOps);

  await prisma.rewardEvent.createMany({
    data: investorRewards.map((r) => ({
      recipientId: r.recipientId, amount: r.amount, qaSetId,
      sourceInvestmentId: negInvestmentId, rewardType: `negative_pool_milestone_${negativePosition}`,
    })),
  });

  for (const inv of investorRewards) {
    createNotification({
      userId: inv.recipientId, type: "quality_pool_release",
      title: "반대 풀 해제!", body: `${negativePosition}번째 반대 투자자 마일스톤! +${inv.amount}📉 보상`,
      link: `/?qaSetId=${qaSetId}`, qaSetId,
    }).catch(console.error);
  }

  return { milestone: negativePosition, releasedAmount, investorCount: investorRewards.length };
}

async function handleForkRoyalty(
  qaSet: LoadedQASet,
  royaltyAmount: number,
  royaltyRate: number,
  parentCreatorAuth: number,
  forkCreatorAuth: number,
  investmentId: string,
): Promise<InvestmentResult["forkRoyalty"]> {
  if (!qaSet.parentQASetId || royaltyAmount <= 0) return null;

  try {
    const parentQA = await prisma.qASet.findUnique({
      where: { id: qaSet.parentQASetId },
      select: {
        id: true,
        investments: {
          where: { isActive: true, isNegative: false },
          orderBy: { position: "asc" as const },
          include: { user: { select: { id: true, hubScore: true } } },
        },
      },
    });

    if (!parentQA || parentQA.investments.length === 0) return null;

    const totalWeight = parentQA.investments.reduce(
      (sum, inv) => sum + Math.sqrt(inv.amount) * inv.user.hubScore, 0,
    );
    const royaltyDist: RewardDistribution[] = [];

    if (totalWeight > 0) {
      let distributed = 0;
      for (const inv of parentQA.investments) {
        const w = Math.sqrt(inv.amount) * inv.user.hubScore;
        const share = Math.floor(royaltyAmount * (w / totalWeight));
        if (share > 0) { royaltyDist.push({ recipientId: inv.userId, amount: share }); distributed += share; }
      }
      const remainder = royaltyAmount - distributed;
      if (remainder > 0 && royaltyDist.length > 0) royaltyDist[0].amount += remainder;
    }

    if (royaltyDist.length === 0) return null;

    await prisma.$transaction([
      prisma.qASet.update({
        where: { id: qaSet.parentQASetId }, data: { totalInvested: { increment: royaltyAmount } },
      }),
      ...royaltyDist.map((r) =>
        prisma.user.update({ where: { id: r.recipientId }, data: { balance: { increment: r.amount } } }),
      ),
    ]);

    await prisma.rewardEvent.createMany({
      data: royaltyDist.map((r) => ({
        recipientId: r.recipientId, amount: r.amount, qaSetId: qaSet.parentQASetId!,
        sourceInvestmentId: investmentId, rewardType: "authority_ratio_royalty",
      })),
    });

    return {
      parentQASetId: qaSet.parentQASetId,
      royaltyAmount,
      royaltyRate: Math.round(royaltyRate * 100),
      recipientCount: royaltyDist.length,
      parentCreatorAuth,
      forkCreatorAuth,
    };
  } catch (err) {
    console.error("Fork royalty distribution error:", err);
    return null;
  }
}

async function checkCollapse(qaSetId: string): Promise<{ netInvested: number; isCollapsed: boolean }> {
  const qa = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { totalInvested: true, negativeInvested: true, investorCount: true, negativeCount: true },
  });
  if (!qa) return { netInvested: 0, isCollapsed: false };

  const { checkCollapseThreshold } = await import("@/lib/engine/collapse-threshold");
  const collapseResult = checkCollapseThreshold(
    qa.investorCount, qa.negativeCount, qa.totalInvested, qa.negativeInvested,
  );
  return {
    netInvested: qa.totalInvested - qa.negativeInvested,
    isCollapsed: collapseResult.isCollapsed,
  };
}

function sendPositiveNotifications(
  input: InvestmentInput, user: LoadedUser, qaSet: LoadedQASet,
  rewards: RewardDistribution[], investmentId: string,
): void {
  const qaSetId = input.qaSetId!;
  const investorName = user.name ?? "익명";
  const notifs: Promise<unknown>[] = [];

  if (input.userId !== qaSet.creatorId) {
    notifs.push(createNotification({
      userId: qaSet.creatorId, type: "investment_received",
      title: "새로운 투자!", body: `${investorName}님이 ${input.amount}💰 투자했습니다`,
      link: `/?qaSetId=${qaSetId}`, qaSetId, investmentId,
    }));
  }

  for (const reward of rewards) {
    if (reward.recipientId !== input.userId) {
      notifs.push(createNotification({
        userId: reward.recipientId, type: "reward_earned",
        title: "투자 보상!", body: `+${reward.amount}💰 보상을 받았습니다`,
        link: `/?qaSetId=${qaSetId}`, qaSetId,
      }));
    }
  }

  if (notifs.length > 0) Promise.all(notifs).catch(console.error);
}

function sendNegativeNotifications(
  input: InvestmentInput, user: LoadedUser, qaSet: LoadedQASet,
  rewards: RewardDistribution[], investmentId: string,
): void {
  const qaSetId = input.qaSetId!;
  const investorName = user.name ?? "익명";
  const notifs: Promise<unknown>[] = [];

  notifs.push(createNotification({
    userId: qaSet.creatorId, type: "hunt_received",
    title: "반대 투자 알림!", body: `${investorName}님이 ${input.amount}📉 반대 투자했습니다`,
    link: `/?qaSetId=${qaSetId}`, qaSetId, investmentId,
  }));

  for (const reward of rewards) {
    if (reward.recipientId !== input.userId) {
      notifs.push(createNotification({
        userId: reward.recipientId, type: "reward_earned",
        title: "반대 투자 보상!", body: `+${reward.amount}📉 보상을 받았습니다`,
        link: `/?qaSetId=${qaSetId}`, qaSetId,
      }));
    }
  }

  Promise.all(notifs).catch(console.error);
}

async function recalcTrustLevel(userId: string): Promise<{ oldLevel: number; newLevel: number } | null> {
  try {
    const result = await recalculateAndUpdateTrustLevel(prisma, userId);
    if (result?.leveledUp) return { oldLevel: result.oldLevel, newLevel: result.newLevel };
  } catch { /* ignore */ }
  return null;
}

function recalcHITS(userId: string, qaSet: LoadedQASet, rewards: RewardDistribution[]): void {
  const users = new Set<string>([userId, qaSet.creatorId]);
  for (const r of rewards) users.add(r.recipientId);

  // Invalidate session cache for all affected users
  for (const uid of users) invalidateSessionCache(uid);

  Promise.all(
    [...users].map((uid) => recalculateUserScores(prisma, uid).catch(() => {})),
  ).catch(() => {});
}

// ─── Public API ───

/**
 * 투자 처리 메인 함수.
 * 검증 → 처리 → 결과 반환.
 *
 * @throws InvestmentValidationError 검증 실패 시
 */
export async function processInvestment(input: InvestmentInput): Promise<InvestmentResult> {
  if (!input.qaSetId) {
    throw new InvestmentValidationError("QASet ID is required", "QASET_ID_REQUIRED", 400);
  }
  const { user, qaSet } = await loadEntities(input.userId, input.qaSetId);
  await validateInvestment(input, user, qaSet);

  if (input.isNegative) {
    return processNegativeInvestment(input, user, qaSet);
  } else {
    return processPositiveInvestment(input, user, qaSet);
  }
}
