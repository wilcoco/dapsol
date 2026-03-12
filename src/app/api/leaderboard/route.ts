import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") ?? "hub";

  const users = await prisma.user.findMany({
    take: 50,
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
    orderBy:
      sort === "balance"
        ? { balance: "desc" }
        : sort === "qaSets"
        ? { qaSets: { _count: "desc" } }
        : sort === "investments"
        ? { investments: { _count: "desc" } }
        : sort === "hub"
        ? { hubScore: "desc" }
        : sort === "authority"
        ? { authorityScore: "desc" }
        : { trustLevel: "desc" },
  });

  // Enrich with shared Q&A count and total invested
  const enriched = await Promise.all(
    users.map(async (user) => {
      const [sharedQASets, totalInvested, totalRewards] = await Promise.all([
        prisma.qASet.count({ where: { creatorId: user.id, isShared: true } }),
        prisma.investment.aggregate({
          where: { userId: user.id, isActive: true },
          _sum: { amount: true },
        }),
        prisma.rewardEvent.aggregate({
          where: { recipientId: user.id },
          _sum: { amount: true },
        }),
      ]);
      return {
        ...user,
        sharedQASets,
        totalAmountInvested: totalInvested._sum.amount ?? 0,
        totalRewardsReceived: totalRewards._sum.amount ?? 0,
      };
    })
  );

  // Sort after enrichment
  if (sort === "invested") {
    enriched.sort((a, b) => b.totalAmountInvested - a.totalAmountInvested);
  } else if (sort === "hub") {
    enriched.sort((a, b) => (b.hubScore ?? 1.0) - (a.hubScore ?? 1.0));
  } else if (sort === "authority") {
    enriched.sort((a, b) => (b.authorityScore ?? 0) - (a.authorityScore ?? 0));
  }

  return NextResponse.json(enriched);
}
