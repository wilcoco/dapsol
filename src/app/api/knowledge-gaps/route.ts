import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const personalized = searchParams.get("personalized") === "true";
  const limit = parseInt(searchParams.get("limit") || "10");

  // 기본: 심각도순 갭 목록
  const gaps = await prisma.knowledgeGap.findMany({
    where: { isResolved: false },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: Math.min(limit, 30),
    include: {
      topicCluster: {
        select: { id: true, name: true },
      },
    },
  });

  if (!personalized) {
    return NextResponse.json({ gaps });
  }

  // 맞춤형: 사용자의 topicAuthority 기반 정렬
  const contributions = await prisma.userTopicContribution.findMany({
    where: { userId: session.user.id },
    select: { topicClusterId: true, topicAuthority: true, questionsAsked: true, insightsContributed: true },
  });

  const authorityMap = new Map(contributions.map(c => [c.topicClusterId, c]));

  const scored = gaps.map(gap => {
    const contrib = authorityMap.get(gap.topicClusterId);
    // 사용자의 해당 주제 전문성이 높을수록 우선 표시
    const authorityScore = contrib?.topicAuthority ?? 0;
    const activityScore = (contrib?.questionsAsked ?? 0) + (contrib?.insightsContributed ?? 0) * 2;
    const severityScore = gap.severity === "high" ? 3 : gap.severity === "medium" ? 2 : 1;
    // 종합 점수: 전문성(40%) + 활동(30%) + 심각도(30%)
    const totalScore = authorityScore * 0.4 + activityScore * 0.3 + severityScore * 0.3;
    return { ...gap, _personalScore: totalScore, _isRelevant: authorityScore > 0 || activityScore > 0 };
  });

  // 관련 있는 것 먼저, 그 다음 점수순
  scored.sort((a, b) => {
    if (a._isRelevant !== b._isRelevant) return a._isRelevant ? -1 : 1;
    return b._personalScore - a._personalScore;
  });

  return NextResponse.json({ gaps: scored });
}
