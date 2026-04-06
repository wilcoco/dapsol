import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/opinions/ai-approved
 *
 * AI가 인정한 의견 목록 (시스템 계정이 투자한 의견)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(20, Number(searchParams.get("limit")) || 10);

  // 시스템 AI 계정 찾기
  const systemUser = await prisma.user.findFirst({
    where: { isSystemAI: true },
    select: { id: true },
  });

  if (!systemUser) {
    return NextResponse.json({ opinions: [] });
  }

  // AI가 투자한 의견 조회
  const aiInvestments = await prisma.investment.findMany({
    where: {
      userId: systemUser.id,
      opinionNodeId: { not: null },
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      opinionNode: {
        include: {
          user: { select: { id: true, name: true, image: true } },
          investments: {
            where: { isActive: true },
            select: { amount: true, userId: true },
          },
          relationsAsSource: {
            where: { targetQASetId: { not: null } },
            take: 1,
            include: {
              targetQASet: {
                select: {
                  id: true,
                  title: true,
                  isShared: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const opinions = aiInvestments
    .filter(inv => inv.opinionNode)
    .map(inv => {
      const opinion = inv.opinionNode!;
      const qaSet = opinion.relationsAsSource[0]?.targetQASet;
      const totalInvested = opinion.investments.reduce((sum, i) => sum + i.amount, 0);
      const investorCount = opinion.investments.length;

      return {
        id: opinion.id,
        content: opinion.content,
        createdAt: opinion.createdAt,
        user: opinion.user,
        aiInvestment: inv.amount,
        aiComment: inv.comment,
        totalInvested,
        investorCount,
        qaSet: qaSet ? {
          id: qaSet.id,
          title: qaSet.title,
          isShared: qaSet.isShared,
        } : null,
      };
    });

  return NextResponse.json({ opinions });
}
