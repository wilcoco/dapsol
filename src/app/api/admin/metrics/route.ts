import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getLLMStats } from "@/lib/monitoring/llm-tracker";
import { detectHuntSurges } from "@/lib/monitoring/hunt-surge";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metrics — 경제 시스템 건전성 메트릭
 * 총 유통 포인트, 소각량, 활성 경작/사냥, 사용자 분포 등
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const [
      userStats,
      qaSetStats,
      investmentStats,
      recentActivity,
      topInvestors,
      burnTotal,
      jobStats,
    ] = await Promise.all([
      // User economy overview
      prisma.user.aggregate({
        _sum: { balance: true },
        _avg: { balance: true, hubScore: true, authorityScore: true },
        _count: true,
        _max: { trustLevel: true },
      }),

      // QASet stats
      prisma.qASet.aggregate({
        where: { isShared: true },
        _sum: { totalInvested: true, negativeInvested: true, qualityPool: true },
        _avg: { totalInvested: true, investorCount: true },
        _count: true,
      }),

      // Investment stats
      prisma.investment.aggregate({
        _sum: { amount: true },
        _count: true,
      }),

      // Recent activity counts (last 24h)
      prisma.auditLog.groupBy({
        by: ["action"],
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        _count: true,
        _sum: { amount: true },
      }),

      // Top investors by total amount
      prisma.investment.groupBy({
        by: ["userId"],
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),

      // Total burned points
      prisma.auditLog.aggregate({
        where: { action: "burn" },
        _sum: { amount: true },
      }),

      // Background job stats
      prisma.backgroundJob.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    // Fetch names for top investors
    const topInvestorIds = topInvestors.map((i) => i.userId);
    const topInvestorUsers = await prisma.user.findMany({
      where: { id: { in: topInvestorIds } },
      select: { id: true, name: true },
    });
    const userNameMap = new Map(topInvestorUsers.map((u) => [u.id, u.name]));

    // Trust level distribution
    const trustLevelDist = await prisma.user.groupBy({
      by: ["trustLevel"],
      _count: true,
      orderBy: { trustLevel: "asc" },
    });

    // Active users (last 7 days)
    const activeUsers = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const activityMap: Record<string, { count: number; amount: number }> = {};
    for (const a of recentActivity) {
      activityMap[a.action] = {
        count: a._count,
        amount: a._sum?.amount ?? 0,
      };
    }

    const metrics = {
      economy: {
        totalCirculatingPoints: userStats._sum.balance ?? 0,
        avgBalance: Math.round(userStats._avg.balance ?? 0),
        totalBurned: burnTotal._sum.amount ?? 0,
        totalInvestedInQA: qaSetStats._sum.totalInvested ?? 0,
        totalNegativeInvested: qaSetStats._sum.negativeInvested ?? 0,
        totalQualityPool: qaSetStats._sum.qualityPool ?? 0,
        totalInvestmentAmount: investmentStats._sum.amount ?? 0,
        totalInvestmentCount: investmentStats._count,
      },
      users: {
        total: userStats._count,
        activeInLast7d: activeUsers.length,
        avgHubScore: Math.round((userStats._avg.hubScore ?? 0) * 100) / 100,
        avgAuthorityScore: Math.round((userStats._avg.authorityScore ?? 0) * 100) / 100,
        maxTrustLevel: userStats._max.trustLevel ?? 1,
        trustLevelDistribution: trustLevelDist.map((d) => ({
          level: d.trustLevel,
          count: d._count,
        })),
      },
      content: {
        sharedQASets: qaSetStats._count,
        avgInvestmentPerQA: Math.round(qaSetStats._avg.totalInvested ?? 0),
        avgInvestorsPerQA: Math.round((qaSetStats._avg.investorCount ?? 0) * 10) / 10,
      },
      last24h: {
        shares: activityMap["share"] ?? { count: 0, amount: 0 },
        investments: activityMap["invest"] ?? { count: 0, amount: 0 },
        hunts: activityMap["hunt"] ?? { count: 0, amount: 0 },
        milestones: activityMap["milestone"] ?? { count: 0, amount: 0 },
        burns: activityMap["burn"] ?? { count: 0, amount: 0 },
      },
      topInvestors: topInvestors.map((i) => ({
        name: userNameMap.get(i.userId) ?? "익명",
        totalInvested: i._sum.amount ?? 0,
        investmentCount: i._count,
      })),
      jobs: Object.fromEntries(
        jobStats.map((j) => [j.status, j._count])
      ),
      llm: getLLMStats(),
      huntSurges: await detectHuntSurges(prisma),
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(metrics);
  } catch (err) {
    console.error("Metrics error:", err);
    return NextResponse.json({ error: "메트릭 조회에 실패했습니다." }, { status: 500 });
  }
}
