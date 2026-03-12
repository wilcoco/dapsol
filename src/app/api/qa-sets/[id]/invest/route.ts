import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  calculateHubWeightedDistribution,
  calculateEffectiveAmount,
  calculateQualityPoolRelease,
  QUALITY_POOL_MILESTONES,
  type HubWeightedInvestor,
  type RewardDistribution,
} from "@/lib/engine/reward-calculator";
import {
  recalculateHITS,
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

/** 마이너스 투자 최소 신뢰 레벨 */
const MIN_TRUST_LEVEL_FOR_NEGATIVE = 2;

// POST /api/qa-sets/[id]/invest - Authority-weighted investment (positive & negative)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const amount = body.amount;
  const isNegative: boolean = body.isNegative === true;
  const comment: string | undefined = body.comment ? String(body.comment).slice(0, 100) : undefined;
  const huntingReason: string | undefined = isNegative ? body.huntingReason : undefined;
  const huntingEvidence: string | undefined = isNegative ? body.huntingEvidence?.slice(0, 500) : undefined;
  const huntingTargetMessageId: string | undefined = isNegative ? body.huntingTargetMessageId : undefined;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "경작 포인트를 입력해주세요." }, { status: 400 });
  }

  // Get user and Q&A set with existing investments + investor hub scores
  const [user, qaSet] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, balance: true, hubScore: true, trustLevel: true, createdAt: true },
    }),
    prisma.qASet.findUnique({
      where: { id },
      include: {
        investments: {
          where: { isActive: true },
          orderBy: { position: "asc" },
          include: {
            user: { select: { id: true, hubScore: true } },
          },
        },
        messages: { select: { id: true } },
        creator: { select: { id: true, authorityScore: true, hubScore: true } },
      },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!qaSet) return NextResponse.json({ error: "Q&A set not found" }, { status: 404 });
  if (!qaSet.isShared) {
    return NextResponse.json({ error: "공유되지 않은 Q&A에는 경작할 수 없습니다." }, { status: 400 });
  }
  if (user.balance < amount) {
    return NextResponse.json({ error: "잔액이 부족합니다." }, { status: 400 });
  }

  // ── 마이너스 투자 전용 검증 ──
  if (isNegative) {
    // 사냥 사유 필수
    if (!huntingReason) {
      return NextResponse.json({
        error: "사냥 사유를 선택해주세요.",
        code: "HUNTING_REASON_REQUIRED",
      }, { status: 400 });
    }

    // 신뢰 레벨 체크
    if (user.trustLevel < MIN_TRUST_LEVEL_FOR_NEGATIVE) {
      return NextResponse.json({
        error: `사냥은 신뢰 레벨 Lv.${MIN_TRUST_LEVEL_FOR_NEGATIVE} 이상부터 가능합니다. (현재: Lv.${user.trustLevel})`,
        code: "NEGATIVE_TRUST_LEVEL",
      }, { status: 403 });
    }

    // 이미 플러스 투자한 QA에는 마이너스 투자 불가
    const hasPositiveInvestment = qaSet.investments.some(
      (inv) => inv.userId === session.user.id && !inv.isNegative
    );
    if (hasPositiveInvestment) {
      return NextResponse.json({
        error: "이미 경작 중인 Q&A는 사냥할 수 없습니다.",
        code: "ALREADY_POSITIVE_INVESTED",
      }, { status: 400 });
    }

    // 자기 QA에 마이너스 투자 불가
    if (session.user.id === qaSet.creatorId) {
      return NextResponse.json({
        error: "본인이 만든 Q&A는 사냥할 수 없습니다.",
        code: "SELF_NEGATIVE",
      }, { status: 403 });
    }
  } else {
    // 이미 마이너스 투자한 QA에는 플러스 투자 불가
    const hasNegativeInvestment = qaSet.investments.some(
      (inv) => inv.userId === session.user.id && inv.isNegative
    );
    if (hasNegativeInvestment) {
      return NextResponse.json({
        error: "이미 사냥 중인 Q&A는 경작할 수 없습니다.",
        code: "ALREADY_NEGATIVE_INVESTED",
      }, { status: 400 });
    }
  }

  // ── Trust level 최대 투자 한도 체크 ──
  const maxByLevel = getMaxInvestmentByLevel(user.trustLevel);
  if (amount > maxByLevel) {
    return NextResponse.json({
      error: `현재 신뢰 레벨(Lv.${user.trustLevel})에서는 1회 최대 ${maxByLevel} 🌱까지 경작할 수 있습니다.`,
      code: "TRUST_LEVEL_LIMIT",
      maxInvestment: maxByLevel,
      trustLevel: user.trustLevel,
    }, { status: 400 });
  }

  // ── Anti-gaming checks ──
  const violation = await checkInvestmentRules(
    prisma,
    session.user.id,
    id,
    qaSet.creatorId,
    amount,
    user.createdAt,
    isNegative
  );
  if (violation) {
    return NextResponse.json({ error: violation.message, code: violation.code }, { status: violation.statusCode });
  }

  // Mutual investment blocking (플러스 투자만)
  if (!isNegative) {
    const mutualViolation = await detectMutualInvestment(prisma, session.user.id, id);
    if (mutualViolation) {
      return NextResponse.json({ error: mutualViolation.message, code: mutualViolation.code }, { status: mutualViolation.statusCode });
    }
  }

  // ══════════════════════════════════════════════════
  // ── 마이너스 투자 처리 (대칭 구조) ──
  // ══════════════════════════════════════════════════
  if (isNegative) {
    const response = await handleNegativeInvestment(session.user.id, id, amount, user, qaSet, comment, huntingReason, huntingEvidence, huntingTargetMessageId);
    // Trigger controversy question check after negative investment
    checkAndTriggerControversy(id).catch(console.error);
    return response;
  }

  // ══════════════════════════════════════════════════
  // ── 플러스 투자 처리 (기존 로직) ──
  // ══════════════════════════════════════════════════

  // ── 포크 로열티: Authority 비율 기반 동적 배분 계산 ──
  let royaltyAmount = 0;
  let royaltyRate = 0;
  let parentCreatorAuth = 0;
  let forkCreatorAuth = 0;

  if (qaSet.parentQASetId) {
    const parentQACreator = await prisma.qASet.findUnique({
      where: { id: qaSet.parentQASetId },
      select: {
        creatorId: true,
        creator: { select: { authorityScore: true } },
      },
    });

    if (parentQACreator) {
      parentCreatorAuth = parentQACreator.creator.authorityScore;
      forkCreatorAuth = qaSet.creator.authorityScore;

      royaltyRate = calculateForkSplitRatio(
        parentCreatorAuth,
        forkCreatorAuth,
        qaSet.parentMessageCount,
        qaSet.messages.length
      );

      royaltyAmount = Math.floor(amount * royaltyRate);
      const maxRoyalty = Math.floor(amount * 0.50);
      royaltyAmount = Math.min(royaltyAmount, maxRoyalty);
    }
  }

  // Build existing positive investor data
  const existingPositiveInvestors: HubWeightedInvestor[] = qaSet.investments
    .filter((inv) => !inv.isNegative)
    .map((inv) => ({
      userId: inv.userId,
      amount: inv.amount,
      hubScore: inv.user.hubScore,
      cumulativeReward: inv.cumulativeReward,
    }));

  const split = calculateHubWeightedDistribution(
    amount,
    user.hubScore,
    existingPositiveInvestors
  );

  const adjustedQualityPool = Math.max(0, split.qualityPool - royaltyAmount);
  const burnAmount = split.burnAmount;

  const effAmount = calculateEffectiveAmount(amount, user.hubScore);

  // Consolidated single transaction: position + balance + rewards + audit
  const { newPosition, investmentId } = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency check
    const currentQASet = await tx.qASet.findUnique({
      where: { id },
      select: { version: true },
    });
    if (!currentQASet) throw new Error("QASet not found in transaction");

    const maxPos = await tx.investment.aggregate({
      where: { qaSetId: id, isNegative: false },
      _max: { position: true },
    });
    const pos = (maxPos._max.position ?? 0) + 1;

    const inv = await tx.investment.create({
      data: {
        qaSetId: id,
        userId: session.user.id,
        amount,
        position: pos,
        effectiveAmount: effAmount,
        isNegative: false,
        comment,
      },
    });

    await tx.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: amount } },
    });

    await tx.qASet.update({
      where: { id, version: currentQASet.version },
      data: {
        totalInvested: { increment: amount },
        investorCount: { increment: 1 },
        qualityPool: { increment: adjustedQualityPool },
        burnedAmount: { increment: burnAmount },
        version: { increment: 1 },
      },
    });

    // Distribute rewards within the same transaction
    for (const reward of split.rewards) {
      await tx.user.update({
        where: { id: reward.recipientId },
        data: { balance: { increment: reward.amount } },
      });
      const existingInv = qaSet.investments.find((i) => i.userId === reward.recipientId && !i.isNegative);
      if (existingInv) {
        await tx.investment.update({
          where: { id: existingInv.id },
          data: { cumulativeReward: { increment: reward.amount } },
        });
      }
    }

    // Create reward events within transaction
    if (split.rewards.length > 0) {
      await tx.rewardEvent.createMany({
        data: split.rewards.map((r) => ({
          recipientId: r.recipientId,
          amount: r.amount,
          qaSetId: id,
          sourceInvestmentId: inv.id,
          rewardType: "hub_weighted_distribution",
        })),
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        action: "invest",
        userId: session.user.id,
        qaSetId: id,
        amount,
        metadata: JSON.stringify({
          position: pos,
          qualityPool: adjustedQualityPool,
          rewardPool: split.rewardPool,
          burnAmount,
          rewardCount: split.rewards.length,
        }),
      },
    });

    if (burnAmount > 0) {
      await tx.auditLog.create({
        data: {
          action: "burn",
          userId: session.user.id,
          qaSetId: id,
          amount: burnAmount,
          metadata: JSON.stringify({ source: "investment_burn_ratio" }),
        },
      });
    }

    return { newPosition: pos, investmentId: inv.id };
  });

  // ── 알림: 투자 수신 (creator) + 보상 수신 (reward recipients) ──
  {
    const investorName = user.name ?? "익명";
    const notifOps: Promise<any>[] = [];

    // Notify creator (unless self-invest)
    if (session.user.id !== qaSet.creatorId) {
      notifOps.push(
        createNotification({
          userId: qaSet.creatorId,
          type: "investment_received",
          title: "새로운 경작!",
          body: `${investorName}님이 ${amount}🌱 경작했습니다`,
          link: `/?qaSetId=${id}`,
          qaSetId: id,
          investmentId,
        })
      );
    }

    // Notify reward recipients
    for (const reward of split.rewards) {
      if (reward.recipientId !== session.user.id) {
        notifOps.push(
          createNotification({
            userId: reward.recipientId,
            type: "reward_earned",
            title: "경작 보상!",
            body: `+${reward.amount}🌱 보상을 받았습니다`,
            link: `/?qaSetId=${id}`,
            qaSetId: id,
          })
        );
      }
    }

    if (notifOps.length > 0) {
      Promise.all(notifOps).catch(console.error);
    }
  }

  // ── 품질 풀 마일스톤 해제 ──
  let poolRelease = null;
  if (QUALITY_POOL_MILESTONES.includes(newPosition as 3 | 10 | 25)) {
    const updatedQASet = await prisma.qASet.findUnique({
      where: { id },
      select: {
        qualityPool: true,
        investorCount: true,
        creatorId: true,
        investments: {
          where: { isActive: true, isNegative: false },
          select: { userId: true, amount: true, effectiveAmount: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (updatedQASet && updatedQASet.investorCount === newPosition) {
      // Fetch actual hub scores and cumulative rewards for fair distribution
      const investorUsers = await prisma.user.findMany({
        where: { id: { in: updatedQASet.investments.map((inv) => inv.userId) } },
        select: { id: true, hubScore: true },
      });
      const hubMap = new Map(investorUsers.map((u) => [u.id, u.hubScore]));

      const investmentRewards = await prisma.investment.findMany({
        where: { userId: { in: updatedQASet.investments.map((inv) => inv.userId) }, isActive: true, isNegative: false, qaSetId: id },
        select: { userId: true, cumulativeReward: true },
      });
      const rewardMap = new Map(investmentRewards.map((r) => [r.userId, r.cumulativeReward]));

      const allInvestors: HubWeightedInvestor[] = updatedQASet.investments.map((inv) => ({
        userId: inv.userId,
        amount: inv.amount,
        hubScore: hubMap.get(inv.userId) ?? 1.0,
        cumulativeReward: rewardMap.get(inv.userId) ?? 0,
      }));

      poolRelease = calculateQualityPoolRelease(
        updatedQASet.qualityPool,
        updatedQASet.investorCount,
        allInvestors
      );

      if (poolRelease && poolRelease.releasedAmount > 0) {
        const releaseOps: any[] = [
          prisma.qASet.update({
            where: { id },
            data: { qualityPool: { decrement: poolRelease.releasedAmount } },
          }),
        ];

        for (const inv of poolRelease.stakeholderRewards) {
          releaseOps.push(
            prisma.user.update({
              where: { id: inv.recipientId },
              data: { balance: { increment: inv.amount } },
            })
          );
        }

        await prisma.$transaction(releaseOps);

        const poolRewardEvents = poolRelease.stakeholderRewards
          .filter((e) => e.amount > 0)
          .map((inv) => ({
            recipientId: inv.recipientId,
            amount: inv.amount,
            qaSetId: id,
            sourceInvestmentId: investmentId,
            rewardType: `quality_pool_milestone_${poolRelease!.milestone}`,
          }));

        if (poolRewardEvents.length > 0) {
          await prisma.rewardEvent.createMany({ data: poolRewardEvents });
        }

        // 품질 풀 해제 알림
        {
          const poolNotifs: Promise<any>[] = [];
          for (const inv of poolRelease!.stakeholderRewards) {
            poolNotifs.push(
              createNotification({
                userId: inv.recipientId,
                type: "quality_pool_release",
                title: "성장 풀 수확!",
                body: `${poolRelease!.milestone}번째 경작자 마일스톤! +${inv.amount}🌱 보상`,
                link: `/?qaSetId=${id}`,
                qaSetId: id,
              })
            );
          }
          Promise.all(poolNotifs).catch(console.error);
        }
      }
    }
  }

  // ── 포크 로열티 배분 ──
  let forkRoyalty: {
    parentQASetId: string;
    royaltyAmount: number;
    royaltyRate: number;
    recipientCount: number;
    parentCreatorAuth: number;
    forkCreatorAuth: number;
  } | null = null;

  if (qaSet.parentQASetId && royaltyAmount > 0) {
    try {
      const parentQA = await prisma.qASet.findUnique({
        where: { id: qaSet.parentQASetId },
        select: {
          id: true,
          investments: {
            where: { isActive: true, isNegative: false },
            orderBy: { position: "asc" },
            include: { user: { select: { id: true, hubScore: true } } },
          },
        },
      });

      if (parentQA && parentQA.investments.length > 0) {
        const totalWeight = parentQA.investments.reduce(
          (sum, inv) => sum + Math.sqrt(inv.amount) * inv.user.hubScore,
          0
        );
        const royaltyDist: RewardDistribution[] = [];
        let distributed = 0;

        if (totalWeight > 0) {
          for (const inv of parentQA.investments) {
            const w = Math.sqrt(inv.amount) * inv.user.hubScore;
            const share = Math.floor(royaltyAmount * (w / totalWeight));
            if (share > 0) {
              royaltyDist.push({ recipientId: inv.userId, amount: share });
              distributed += share;
            }
          }
          const remainder = royaltyAmount - distributed;
          if (remainder > 0 && royaltyDist.length > 0) royaltyDist[0].amount += remainder;
        }

        if (royaltyDist.length > 0) {
          const royaltyOps: any[] = [
            prisma.qASet.update({
              where: { id: qaSet.parentQASetId },
              data: { totalInvested: { increment: royaltyAmount } },
            }),
            ...royaltyDist.map((r) =>
              prisma.user.update({
                where: { id: r.recipientId },
                data: { balance: { increment: r.amount } },
              })
            ),
          ];
          await prisma.$transaction(royaltyOps);

          await prisma.rewardEvent.createMany({
            data: royaltyDist.map((r) => ({
              recipientId: r.recipientId,
              amount: r.amount,
              qaSetId: qaSet.parentQASetId!,
              sourceInvestmentId: investmentId,
              rewardType: "authority_ratio_royalty",
            })),
          });

          forkRoyalty = {
            parentQASetId: qaSet.parentQASetId,
            royaltyAmount,
            royaltyRate: Math.round(royaltyRate * 100),
            recipientCount: royaltyDist.length,
            parentCreatorAuth,
            forkCreatorAuth,
          };
        }
      }
    } catch (err) {
      console.error("Fork royalty distribution error:", err);
    }
  }

  // Trust level 재계산
  let trustLevelUp = null;
  try {
    const tlResult = await recalculateAndUpdateTrustLevel(prisma, session.user.id);
    if (tlResult?.leveledUp) {
      trustLevelUp = { oldLevel: tlResult.oldLevel, newLevel: tlResult.newLevel };
    }
  } catch { /* ignore */ }

  // Authority/Hub 점수 재계산
  const usersToRecalc = new Set<string>([session.user.id, qaSet.creatorId]);
  if (qaSet.parentQASetId) {
    const parentQA = await prisma.qASet.findUnique({
      where: { id: qaSet.parentQASetId },
      select: { creatorId: true },
    });
    if (parentQA) usersToRecalc.add(parentQA.creatorId);
  }
  for (const reward of split.rewards) usersToRecalc.add(reward.recipientId);

  Promise.all(
    [...usersToRecalc].map((uid) =>
      recalculateUserScores(prisma, uid).catch(() => {})
    )
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    isNegative: false,
    split: {
      qualityPool: adjustedQualityPool,
      rewardPool: split.rewardPool,
      burnAmount,
    },
    rewards: split.rewards.map((r) => ({
      recipientId: r.recipientId,
      amount: r.amount,
    })),
    investorHub: user.hubScore,
    effectiveAmount: Math.round(effAmount * 100) / 100,
    trustLevelUp,
    poolRelease: poolRelease
      ? {
          milestone: poolRelease.milestone,
          releasedAmount: poolRelease.releasedAmount,
          recipientCount: poolRelease.stakeholderRewards.length,
        }
      : null,
    forkRoyalty,
  });
}

// ══════════════════════════════════════════════════════════════
// ── 마이너스 투자 처리 함수 (대칭 구조) ──
// 50% → negativePool, 50% → 선행 마이너스 투자자 보상
// ══════════════════════════════════════════════════════════════
async function handleNegativeInvestment(
  userId: string,
  qaSetId: string,
  amount: number,
  user: { id: string; name: string | null; balance: number; hubScore: number; trustLevel: number },
  qaSet: any,
  comment?: string,
  huntingReason?: string,
  huntingEvidence?: string,
  huntingTargetMessageId?: string,
) {
  const NEGATIVE_POOL_RATIO = 0.50;
  const NEGATIVE_REWARD_RATIO = 0.50;

  const rewardPool = Math.floor(amount * NEGATIVE_REWARD_RATIO);
  let negativePool = amount - rewardPool;

  // 기존 마이너스 투자자들 (선행 사냥꾼)
  const existingNegativeInvestors = qaSet.investments
    .filter((inv: any) => inv.isNegative)
    .map((inv: any) => ({
      userId: inv.userId,
      investmentId: inv.id,
      amount: inv.amount,
      hubScore: inv.user.hubScore,
      cumulativeReward: inv.cumulativeReward,
    }));

  // 보상 분배 (기존 마이너스 투자자에게)
  const rewards: RewardDistribution[] = [];
  let excessToPool = 0;

  if (existingNegativeInvestors.length > 0 && rewardPool > 0) {
    const weights = existingNegativeInvestors.map((inv: any) => ({
      userId: inv.userId,
      investmentId: inv.investmentId,
      weight: Math.sqrt(inv.amount) * Math.max(inv.hubScore, 0.01),
      cap: inv.amount * 2 - inv.cumulativeReward, // 보상 상한: 원금의 2배
    }));

    const totalWeight = weights.reduce((sum: number, w: any) => sum + w.weight, 0);

    if (totalWeight > 0) {
      for (const w of weights) {
        const ratio = w.weight / totalWeight;
        let reward = Math.floor(rewardPool * ratio);
        const remainingCap = Math.max(w.cap, 0);
        if (reward > remainingCap) {
          excessToPool += reward - remainingCap;
          reward = remainingCap;
        }
        if (reward > 0) {
          rewards.push({ recipientId: w.userId, amount: reward });
        }
      }

      const totalDistributed = rewards.reduce((sum, r) => sum + r.amount, 0);
      const remainder = rewardPool - totalDistributed - excessToPool;
      if (remainder > 0) {
        if (rewards.length > 0) {
          rewards[0].amount += remainder;
        } else {
          excessToPool += remainder;
        }
      }
    } else {
      excessToPool = rewardPool;
    }
  } else {
    // 첫 마이너스 투자자: 보상풀이 모두 negativePool로
    excessToPool = rewardPool;
  }

  negativePool += excessToPool;

  // 마이너스 투자 position — interactive transaction for concurrency safety
  const effAmount = Math.sqrt(amount) * Math.max(user.hubScore, 0.01);

  const { negativePosition, negInvestmentId } = await prisma.$transaction(async (tx) => {
    const maxPos = await tx.investment.aggregate({
      where: { qaSetId, isNegative: true },
      _max: { position: true },
    });
    const pos = (maxPos._max.position ?? 0) + 1;

    const inv = await tx.investment.create({
      data: {
        qaSetId,
        userId,
        amount,
        position: pos,
        effectiveAmount: effAmount,
        isNegative: true,
        comment,
        huntingReason,
        huntingEvidence,
        huntingTargetMessageId,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    await tx.qASet.update({
      where: { id: qaSetId },
      data: {
        negativeInvested: { increment: amount },
        negativeCount: { increment: 1 },
        negativePool: { increment: negativePool },
      },
    });

    return { negativePosition: pos, negInvestmentId: inv.id };
  });

  // 선행 마이너스 투자자에게 보상 분배
  const rewardOps: any[] = [];
  for (const reward of rewards) {
    rewardOps.push(
      prisma.user.update({
        where: { id: reward.recipientId },
        data: { balance: { increment: reward.amount } },
      })
    );
    const inv = existingNegativeInvestors.find((i: any) => i.userId === reward.recipientId);
    if (inv) {
      rewardOps.push(
        prisma.investment.update({
          where: { id: inv.investmentId },
          data: { cumulativeReward: { increment: reward.amount } },
        })
      );
    }
  }
  if (rewardOps.length > 0) {
    await prisma.$transaction(rewardOps);
  }

  // RewardEvent 기록
  if (rewards.length > 0) {
    await prisma.rewardEvent.createMany({
      data: rewards.map((r) => ({
        recipientId: r.recipientId,
        amount: r.amount,
        qaSetId,
        sourceInvestmentId: negInvestmentId,
        rewardType: "negative_investment_distribution",
      })),
    });
  }

  // ── 알림: 마이너스 투자 (사냥) 수신 + 보상 ──
  {
    const investorName = user.name ?? "익명";
    const negNotifs: Promise<any>[] = [];

    // Notify creator about hunt (userId !== qaSet.creatorId is already guaranteed for negative)
    negNotifs.push(
      createNotification({
        userId: qaSet.creatorId,
        type: "hunt_received",
        title: "사냥 알림!",
        body: `${investorName}님이 ${amount}🏹 사냥했습니다`,
        link: `/?qaSetId=${qaSetId}`,
        qaSetId,
        investmentId: negInvestmentId,
      })
    );

    // Notify reward recipients (prior negative investors)
    for (const reward of rewards) {
      if (reward.recipientId !== userId) {
        negNotifs.push(
          createNotification({
            userId: reward.recipientId,
            type: "reward_earned",
            title: "사냥 보상!",
            body: `+${reward.amount}🏹 보상을 받았습니다`,
            link: `/?qaSetId=${qaSetId}`,
            qaSetId,
          })
        );
      }
    }

    if (negNotifs.length > 0) {
      Promise.all(negNotifs).catch(console.error);
    }
  }

  // ── 마이너스 투자 마일스톤: negativeCount가 3, 10, 25에 도달하면 negativePool 해제 ──
  let negPoolRelease = null;
  const NEGATIVE_MILESTONES = [3, 10, 25] as const;
  const NEGATIVE_MILESTONE_RATIOS: Record<number, number> = { 3: 0.20, 10: 0.30, 25: 0.50 };

  if (NEGATIVE_MILESTONES.includes(negativePosition as 3 | 10 | 25)) {
    const updatedQA = await prisma.qASet.findUnique({
      where: { id: qaSetId },
      select: {
        negativePool: true,
        negativeCount: true,
        investments: {
          where: { isActive: true, isNegative: true },
          select: { userId: true, amount: true, effectiveAmount: true },
        },
      },
    });

    if (updatedQA && updatedQA.negativeCount === negativePosition) {
      const ratio = NEGATIVE_MILESTONE_RATIOS[negativePosition];
      if (ratio && updatedQA.negativePool > 0) {
        const releasedAmount = Math.floor(updatedQA.negativePool * ratio);
        if (releasedAmount > 0) {
          // 마이너스 투자 풀: 100% 마이너스 투자자에게 (creator 없음)
          const negInvestors = updatedQA.investments;
          const totalW = negInvestors.reduce((s, inv) => s + Math.sqrt(inv.amount), 0);
          const investorRewards: RewardDistribution[] = [];

          if (totalW > 0) {
            let dist = 0;
            for (const inv of negInvestors) {
              const share = Math.floor(releasedAmount * (Math.sqrt(inv.amount) / totalW));
              if (share > 0) {
                investorRewards.push({ recipientId: inv.userId, amount: share });
                dist += share;
              }
            }
            const rem = releasedAmount - dist;
            if (rem > 0 && investorRewards.length > 0) investorRewards[0].amount += rem;
          }

          if (investorRewards.length > 0) {
            const releaseOps: any[] = [
              prisma.qASet.update({
                where: { id: qaSetId },
                data: { negativePool: { decrement: releasedAmount } },
              }),
              ...investorRewards.map((r) =>
                prisma.user.update({
                  where: { id: r.recipientId },
                  data: { balance: { increment: r.amount } },
                })
              ),
            ];
            await prisma.$transaction(releaseOps);

            await prisma.rewardEvent.createMany({
              data: investorRewards.map((r) => ({
                recipientId: r.recipientId,
                amount: r.amount,
                qaSetId,
                sourceInvestmentId: negInvestmentId,
                rewardType: `negative_pool_milestone_${negativePosition}`,
              })),
            });

            negPoolRelease = {
              milestone: negativePosition,
              releasedAmount,
              investorCount: investorRewards.length,
            };

            // 마이너스 풀 해제 알림
            {
              const negPoolNotifs: Promise<any>[] = [];
              for (const inv of investorRewards) {
                negPoolNotifs.push(
                  createNotification({
                    userId: inv.recipientId,
                    type: "quality_pool_release",
                    title: "사냥 풀 해제!",
                    body: `${negativePosition}번째 사냥꾼 마일스톤! +${inv.amount}🏹 보상`,
                    link: `/?qaSetId=${qaSetId}`,
                    qaSetId,
                  })
                );
              }
              Promise.all(negPoolNotifs).catch(console.error);
            }
          }
        }
      }
    }
  }

  // ── 콘텐츠 접힘 여부 (강화된 임계값) ──
  const updatedQAFinal = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { totalInvested: true, negativeInvested: true, investorCount: true, negativeCount: true },
  });
  const { checkCollapseThreshold } = await import("@/lib/engine/collapse-threshold");
  const collapseResult = updatedQAFinal
    ? checkCollapseThreshold(
        updatedQAFinal.investorCount,
        updatedQAFinal.negativeCount,
        updatedQAFinal.totalInvested,
        updatedQAFinal.negativeInvested
      )
    : { isCollapsed: false, negativeRatio: 0 };
  const netInvested = updatedQAFinal
    ? updatedQAFinal.totalInvested - updatedQAFinal.negativeInvested
    : 0;
  const isCollapsed = collapseResult.isCollapsed;

  // Trust level 재계산
  let trustLevelUp = null;
  try {
    const tlResult = await recalculateAndUpdateTrustLevel(prisma, userId);
    if (tlResult?.leveledUp) {
      trustLevelUp = { oldLevel: tlResult.oldLevel, newLevel: tlResult.newLevel };
    }
  } catch { /* ignore */ }

  // Authority/Hub 점수 재계산 (투자자 + 콘텐츠 창작자)
  const usersToRecalc = new Set<string>([userId, qaSet.creatorId]);
  for (const reward of rewards) usersToRecalc.add(reward.recipientId);

  Promise.all(
    [...usersToRecalc].map((uid) =>
      recalculateUserScores(prisma, uid).catch(() => {})
    )
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    isNegative: true,
    split: {
      negativePool,
      rewardPool: rewards.reduce((s, r) => s + r.amount, 0),
    },
    rewards: rewards.map((r) => ({
      recipientId: r.recipientId,
      amount: r.amount,
    })),
    investorHub: user.hubScore,
    effectiveAmount: Math.round(effAmount * 100) / 100,
    trustLevelUp,
    negPoolRelease: negPoolRelease ?? null,
    netInvested,
    isCollapsed,
    huntingReason,
  });
}
