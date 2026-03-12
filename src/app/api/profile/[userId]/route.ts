import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      image: true,
      balance: true,
      trustLevel: true,
      hubScore: true,
      authorityScore: true,
      createdAt: true,
      _count: {
        select: {
          qaSets: true,
          investments: true,
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Stats
  const [sharedQASets, totalInvested, recentQASets, recentInvestments] = await Promise.all([
    // Count shared Q&A sets
    prisma.qASet.count({ where: { creatorId: userId, isShared: true } }),

    // Total points invested by this user
    prisma.investment.aggregate({
      where: { userId, isActive: true },
      _sum: { amount: true },
    }),

    // Recent Q&A sets
    prisma.qASet.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        isShared: true,
        totalInvested: true,
        investorCount: true,
        negativeInvested: true,
        negativeCount: true,
        authorityScore: true,
        qualityPool: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
    }),

    // Recent investments (positive + negative)
    prisma.investment.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        qaSet: {
          select: { id: true, title: true, totalInvested: true, negativeInvested: true, authorityScore: true },
        },
      },
    }),
  ]);

  // Total rewards received + recent reward history
  const [totalRewards, rewardHistory] = await Promise.all([
    prisma.rewardEvent.aggregate({
      where: { recipientId: userId },
      _sum: { amount: true },
    }),
    prisma.rewardEvent.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Attach qaSet info to reward history
  const rewardQaSetIds = [...new Set(rewardHistory.map((r) => r.qaSetId))];
  const rewardQaSets = rewardQaSetIds.length > 0
    ? await prisma.qASet.findMany({
        where: { id: { in: rewardQaSetIds } },
        select: { id: true, title: true },
      })
    : [];
  const qaSetMap = new Map(rewardQaSets.map((q) => [q.id, q]));
  const rewardHistoryWithQaSet = rewardHistory.map((r) => ({
    ...r,
    qaSet: qaSetMap.get(r.qaSetId) ?? { id: r.qaSetId, title: null },
  }));

  return NextResponse.json({
    user,
    stats: {
      totalQASets: user._count.qaSets,
      sharedQASets,
      totalInvestments: user._count.investments,
      totalAmountInvested: totalInvested._sum.amount ?? 0,
      totalRewardsReceived: totalRewards._sum.amount ?? 0,
    },
    recentQASets,
    recentInvestments,
    rewardHistory: rewardHistoryWithQaSet,
  });
}
