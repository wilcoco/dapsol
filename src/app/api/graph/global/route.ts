import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KNOWLEDGE_RELATION_LABELS, KNOWLEDGE_RELATION_COLORS } from "@/lib/constants";
import { NextResponse } from "next/server";

/**
 * GET /api/graph/global
 *
 * Returns ALL shared QASets as a QASet-level graph for the global knowledge map.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all shared QASets
  const qaSets = await prisma.qASet.findMany({
    where: { isShared: true },
    select: {
      id: true,
      title: true,
      summary: true,
      totalInvested: true,
      investorCount: true,
      negativeInvested: true,
      negativeCount: true,
      creatorId: true,
      parentQASetId: true,
      creator: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (qaSets.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const qaSetIds = qaSets.map((q) => q.id);

  // Grid layout: sqrt(N) columns, 250px spacing
  const cols = Math.max(1, Math.ceil(Math.sqrt(qaSets.length)));
  const SPACING_X = 280;
  const SPACING_Y = 160;

  const nodes = qaSets.map((qa, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    // Size hint based on investment (min 0, scales up)
    const sizeHint = Math.min(1, qa.totalInvested / 500);

    return {
      id: qa.id,
      label: (qa.title ?? "Untitled").slice(0, 30),
      x: 120 + col * SPACING_X,
      y: 80 + row * SPACING_Y,
      data: {
        qaSetId: qa.id,
        title: qa.title ?? "Untitled",
        summary: qa.summary,
        creatorName: qa.creator.name,
        totalInvested: qa.totalInvested,
        investorCount: qa.investorCount,
        negativeInvested: qa.negativeInvested,
        messageCount: qa._count.messages,
        sizeHint,
      },
    };
  });

  const edges: {
    id: string;
    source: string;
    target: string;
    edgeType: "fork" | "relation";
    label: string | null;
    color: string;
  }[] = [];

  // Fork edges (parent -> child)
  for (const qa of qaSets) {
    if (qa.parentQASetId && qaSetIds.includes(qa.parentQASetId)) {
      edges.push({
        id: `fork-${qa.parentQASetId}-${qa.id}`,
        source: qa.parentQASetId,
        target: qa.id,
        edgeType: "fork",
        label: "확장",
        color: "#14b8a6",
      });
    }
  }

  // Cross-QASet NodeRelations
  const relations = await prisma.nodeRelation.findMany({
    where: {
      sourceQASetId: { in: qaSetIds },
      targetQASetId: { in: qaSetIds },
    },
  });

  for (const rel of relations) {
    if (rel.sourceQASetId && rel.targetQASetId) {
      edges.push({
        id: `rel-${rel.id}`,
        source: rel.sourceQASetId,
        target: rel.targetQASetId,
        edgeType: "relation",
        label: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
        color: KNOWLEDGE_RELATION_COLORS[rel.relationType] ?? "#6b7280",
      });
    }
  }

  return NextResponse.json({ nodes, edges });
}
