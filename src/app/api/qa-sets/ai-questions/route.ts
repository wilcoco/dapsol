import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/qa-sets/ai-questions?limit=5
 *
 * Returns AI-generated questions with answer counts and incentive info.
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "5"), 20);

  const questions = await prisma.qASet.findMany({
    where: {
      isAIGenerated: true,
      isShared: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      aiQuestionType: true,
      firstAnswerRewardMultiplier: true,
      totalInvested: true,
      investorCount: true,
      createdAt: true,
      topicCluster: { select: { id: true, name: true } },
      messages: {
        where: { role: "user" },
        take: 1,
        select: { content: true },
      },
      _count: {
        select: { forks: true }, // answer count = number of forks (human answers)
      },
    },
  });

  const results = questions.map((q) => ({
    id: q.id,
    title: q.title,
    question: q.messages[0]?.content ?? "",
    aiQuestionType: q.aiQuestionType,
    rewardMultiplier: q.firstAnswerRewardMultiplier,
    answerCount: q._count.forks,
    totalInvested: q.totalInvested,
    investorCount: q.investorCount,
    cluster: q.topicCluster,
    createdAt: q.createdAt,
  }));

  return NextResponse.json({ questions: results });
}
