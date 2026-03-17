import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity-graph
 * 최근 활동이 있는 공유 QASet 30개 + 상호 관계 엣지를 반환.
 * 홈 화면 Live Activity Graph용.
 */
export async function GET() {
  try {
    // 1. 최근 활동이 있는 QASet ID를 AuditLog에서 추출
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        action: { in: ["share", "invest", "hunt", "milestone"] },
        qaSetId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        qaSetId: true,
        action: true,
        createdAt: true,
      },
    });

    // QASet별 최신 활동 추출 (중복 제거, 최대 30개)
    const qaSetActivity = new Map<string, { lastAction: string; lastActivityAt: Date }>();
    for (const log of recentLogs) {
      if (!log.qaSetId || qaSetActivity.size >= 30) continue;
      if (!qaSetActivity.has(log.qaSetId)) {
        qaSetActivity.set(log.qaSetId, {
          lastAction: log.action,
          lastActivityAt: log.createdAt,
        });
      }
    }

    const qaSetIds = [...qaSetActivity.keys()];

    if (qaSetIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [] });
    }

    // 2. QASet 상세 정보
    const qaSets = await prisma.qASet.findMany({
      where: { id: { in: qaSetIds }, isShared: true },
      select: {
        id: true,
        title: true,
        totalInvested: true,
        investorCount: true,
        negativeCount: true,
        parentQASetId: true,
        creator: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } }, take: 3 },
      },
    });

    const qaSetIdSet = new Set(qaSets.map((q) => q.id));

    // 3. 이 QASet들 사이의 NodeRelation (지식 관계)
    const relations = await prisma.nodeRelation.findMany({
      where: {
        sourceQASetId: { in: qaSetIds },
        targetQASetId: { in: qaSetIds },
      },
      select: {
        sourceQASetId: true,
        targetQASetId: true,
        relationType: true,
      },
    });

    // 4. 노드 구성
    const nodes = qaSets.map((q) => {
      const activity = qaSetActivity.get(q.id);
      return {
        id: q.id,
        title: q.title ?? "제목 없음",
        creatorName: q.creator?.name ?? "익명",
        totalInvested: q.totalInvested,
        investorCount: q.investorCount,
        negativeCount: q.negativeCount,
        lastAction: activity?.lastAction ?? "share",
        lastActivityAt: activity?.lastActivityAt?.toISOString() ?? new Date().toISOString(),
        parentId: q.parentQASetId && qaSetIdSet.has(q.parentQASetId) ? q.parentQASetId : null,
        tags: q.tags.map((t) => t.tag.name),
      };
    });

    // 5. 엣지 구성 (포크 + 지식 관계)
    const edges: Array<{
      source: string;
      target: string;
      type: "fork" | "relation";
      relationType?: string;
    }> = [];

    // 포크 관계
    for (const q of qaSets) {
      if (q.parentQASetId && qaSetIdSet.has(q.parentQASetId)) {
        edges.push({
          source: q.parentQASetId,
          target: q.id,
          type: "fork",
        });
      }
    }

    // 지식 관계
    for (const rel of relations) {
      if (rel.sourceQASetId && rel.targetQASetId) {
        edges.push({
          source: rel.sourceQASetId,
          target: rel.targetQASetId,
          type: "relation",
          relationType: rel.relationType,
        });
      }
    }

    return NextResponse.json({ nodes, edges });
  } catch (err) {
    console.error("Activity graph error:", err);
    return NextResponse.json({ nodes: [], edges: [] });
  }
}
