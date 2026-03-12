import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cosineSimilarity } from "@/lib/search/embedding";
import { KNOWLEDGE_RELATION_LABELS, CLUSTER_RELATION_LABELS } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";

type Direction = "center" | "right" | "up" | "down" | "left";

interface ExploreNode {
  id: string;
  type: "qaset" | "user";
  direction: Direction;
  data: Record<string, unknown>;
}

interface ExploreEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

type QASetWithCreatorAndTags = {
  id: string;
  title: string | null;
  summary: string | null;
  totalInvested: number;
  investorCount: number;
  negativeInvested: number;
  embedding: string | null;
  tags: { tag: { name: string } }[];
  creator: {
    id: string;
    name: string | null;
    image: string | null;
    authorityScore: number;
    hubScore: number;
  };
};

interface NeighborResult {
  qa: QASetWithCreatorAndTags;
  edgeLabel: string;
  edgeType: string;
  /** Optional: override edge source/target (defaults to focal↔qa) */
  edgeSourceId?: string;
  edgeTargetId?: string;
}

const qaSetInclude = {
  creator: {
    select: { id: true, name: true, image: true, authorityScore: true, hubScore: true },
  },
  tags: { include: { tag: true } },
} as const;

/**
 * GET /api/graph/explore?focusId=<qaSetId>&direction=all&limit=5
 *
 * Returns nodes and edges around a focal Q&A, organized by semantic direction.
 *
 * 레벨 1 (지식 단위 관계): NodeRelation — clarification, deepening, evidence, etc. (13종)
 * 레벨 2 (주제 영역 관계): ClusterRelation — SKOS 기반 4종:
 *   right  = related   (관련 — 같은 클러스터/태그/유사도)
 *   up     = broader   (상위 — 포크 부모, 일반화)
 *   down   = narrower  (하위 — 포크 자식, 구체화)
 *   left   = conflicting (대립 — 반박, 논쟁)
 */
export async function GET(req: NextRequest) {
  try {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let focusId = searchParams.get("focusId");
  const directionFilter = (searchParams.get("direction") ?? "all") as "all" | Direction;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "5", 10) || 5, 1), 20);

  // If no focusId, pick the most recent shared Q&A
  if (!focusId) {
    const latest = await prisma.qASet.findFirst({
      where: { isShared: true },
      orderBy: { sharedAt: "desc" },
      select: { id: true },
    });
    if (!latest) {
      return NextResponse.json({
        focal: null,
        nodes: [],
        edges: [],
        directions: buildEmptyDirections(),
      });
    }
    focusId = latest.id;
  }

  // 1. Fetch focal Q&A
  const focal = await prisma.qASet.findUnique({
    where: { id: focusId },
    include: {
      creator: {
        select: { id: true, name: true, image: true, authorityScore: true, hubScore: true },
      },
      tags: { include: { tag: true } },
      topicCluster: { select: { id: true, name: true, nameEn: true } },
    },
  });

  if (!focal) {
    return NextResponse.json({ error: "QASet not found" }, { status: 404 });
  }

  const focalEmbedding = focal.embedding ? (JSON.parse(focal.embedding) as number[]) : null;
  const focalTagNames = focal.tags.map((t) => t.tag.name);
  // Capture focal id for use in closures (TypeScript can't narrow inside nested functions)
  const focalId = focal.id;

  // Collect nodes and edges
  const nodesMap = new Map<string, ExploreNode>();
  const edgesMap = new Map<string, ExploreEdge>();
  const userNodeIds = new Set<string>();

  // Add focal QASet node
  addQASetNode(nodesMap, focal, "center");
  addUserNode(nodesMap, userNodeIds, focal.creator, "center");
  const focalEdgeId = `created-${focal.creator.id}-${focal.id}`;
  edgesMap.set(focalEdgeId, {
    id: focalEdgeId,
    source: `user-${focal.creator.id}`,
    target: `qaset-${focal.id}`,
    type: "created",
    label: "생성",
  });

  // Determine which directions to fetch
  const wantRight = directionFilter === "all" || directionFilter === "right";
  const wantUp = directionFilter === "all" || directionFilter === "up";
  const wantDown = directionFilter === "all" || directionFilter === "down";
  const wantLeft = directionFilter === "all" || directionFilter === "left";

  // Track total counts per direction for hasMore
  const totalCounts = { right: 0, up: 0, down: 0, left: 0 };

  // Pre-fetch all NodeRelations for the focal QA to overlay proper labels
  const focalRelations = await prisma.nodeRelation.findMany({
    where: {
      OR: [
        { sourceQASetId: focalId },
        { targetQASetId: focalId },
      ],
    },
    select: { sourceQASetId: true, targetQASetId: true, relationType: true },
  });
  // Map: otherId → relationType label
  const relationLabelMap = new Map<string, string>();
  for (const rel of focalRelations) {
    const otherId = rel.sourceQASetId === focalId ? rel.targetQASetId : rel.sourceQASetId;
    if (otherId) {
      relationLabelMap.set(otherId, KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType);
    }
  }

  // Helper to add neighbor results to the graph
  function addNeighborResults(
    results: NeighborResult[],
    direction: Direction,
    directionKey: "right" | "up" | "down" | "left",
  ) {
    let addedCount = 0;
    const limited = results.slice(0, limit);
    for (const { qa, edgeLabel, edgeType, edgeSourceId, edgeTargetId } of limited) {
      const nodeKey = `qaset-${qa.id}`;
      const isNew = !nodesMap.has(nodeKey);
      addQASetNode(nodesMap, qa, direction);
      if (isNew) addedCount++;
      addUserNode(nodesMap, userNodeIds, qa.creator, direction);
      const createdEdgeId = `created-${qa.creator.id}-${qa.id}`;
      if (!edgesMap.has(createdEdgeId)) {
        edgesMap.set(createdEdgeId, {
          id: createdEdgeId,
          source: `user-${qa.creator.id}`,
          target: `qaset-${qa.id}`,
          type: "created",
        });
      }
      // Use NodeRelation label if available, otherwise fallback to structural label
      const resolvedLabel = relationLabelMap.get(qa.id) ?? edgeLabel;
      const relEdgeId = `${edgeType}-${focalId}-${qa.id}`;
      if (!edgesMap.has(relEdgeId)) {
        edgesMap.set(relEdgeId, {
          id: relEdgeId,
          source: edgeSourceId ?? `qaset-${focalId}`,
          target: edgeTargetId ?? `qaset-${qa.id}`,
          type: edgeType,
          label: resolvedLabel,
        });
      }
    }
    // Count actually added nodes (not deduplicated) + remaining not-yet-loaded
    totalCounts[directionKey] = addedCount + Math.max(0, results.length - limited.length);
  }

  // 2a. RIGHT: Similar Q&As
  if (wantRight) {
    const results = await findRightNeighbors(
      focal.id,
      focal.topicClusterId,
      focalEmbedding,
      focalTagNames,
      limit,
    );
    addNeighborResults(results, "right", "right");
  }

  // 2b. UP: Broader / parent / generalization
  if (wantUp) {
    const results = await findUpNeighbors(focal.id, focal.topicClusterId, focal.parentQASetId, limit);
    addNeighborResults(results, "up", "up");
  }

  // 2c. DOWN: More specific / children / specialization
  if (wantDown) {
    const results = await findDownNeighbors(focal.id, focal.topicClusterId, limit);
    addNeighborResults(results, "down", "down");
  }

  // 2d. LEFT: Opposing / controversial
  if (wantLeft) {
    const results = await findLeftNeighbors(focal.id, focal.topicClusterId, limit);
    addNeighborResults(results, "left", "left");
  }

  return NextResponse.json({
    focal: {
      id: focal.id,
      title: focal.title,
      creator: { id: focal.creator.id, name: focal.creator.name },
      totalInvested: focal.totalInvested,
      tags: focal.tags.map((t) => t.tag.name),
      topicCluster: focal.topicCluster
        ? { id: focal.topicCluster.id, name: focal.topicCluster.name, nameEn: focal.topicCluster.nameEn }
        : null,
    },
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
    directions: {
      right: { hasMore: totalCounts.right > limit, count: totalCounts.right, label: "유사 주제" },
      up: { hasMore: totalCounts.up > limit, count: totalCounts.up, label: "일반화" },
      down: { hasMore: totalCounts.down > limit, count: totalCounts.down, label: "구체화" },
      left: { hasMore: totalCounts.left > limit, count: totalCounts.left, label: "반대 견해" },
    },
  });
  } catch (error) {
    console.error("[explore] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// RIGHT: Similar Q&As (same cluster, same tags, cosine similarity)
// ─────────────────────────────────────────────

async function findRightNeighbors(
  focalId: string,
  topicClusterId: string | null,
  focalEmbedding: number[] | null,
  focalTagNames: string[],
  limit: number,
): Promise<NeighborResult[]> {
  const seen = new Set<string>();
  const results: NeighborResult[] = [];

  // Signal 1: Same topic cluster
  if (topicClusterId) {
    const clusterMatches = await prisma.qASet.findMany({
      where: { isShared: true, id: { not: focalId }, topicClusterId },
      include: qaSetInclude,
      orderBy: { sharedAt: "desc" },
      take: 50,
    });

    // If we have embeddings, rank by cosine similarity
    let ranked: QASetWithCreatorAndTags[];
    if (focalEmbedding && clusterMatches.length > 0) {
      ranked = clusterMatches
        .map((qa) => {
          const emb = qa.embedding ? (JSON.parse(qa.embedding) as number[]) : null;
          const similarity = emb ? cosineSimilarity(focalEmbedding, emb) : 0;
          return { qa, similarity };
        })
        .sort((a, b) => b.similarity - a.similarity)
        .map((s) => s.qa);
    } else {
      ranked = clusterMatches;
    }

    for (const qa of ranked) {
      if (!seen.has(qa.id)) {
        seen.add(qa.id);
        results.push({ qa, edgeLabel: "유사 주제", edgeType: "similar" });
      }
    }
  }

  // Signal 2: Same tags (fallback when no cluster or not enough results)
  if (results.length < limit && focalTagNames.length > 0) {
    const tagMatches = await prisma.qASet.findMany({
      where: {
        isShared: true,
        id: { not: focalId },
        tags: { some: { tag: { name: { in: focalTagNames } } } },
      },
      include: qaSetInclude,
      orderBy: { totalInvested: "desc" },
      take: limit * 2,
    });

    for (const qa of tagMatches) {
      if (!seen.has(qa.id)) {
        seen.add(qa.id);
        results.push({ qa, edgeLabel: "같은 태그", edgeType: "same_tag" });
      }
    }
  }

  // Signal 3: If still empty, use most recent shared Q&As
  if (results.length === 0) {
    const recent = await prisma.qASet.findMany({
      where: { isShared: true, id: { not: focalId } },
      include: qaSetInclude,
      orderBy: { sharedAt: "desc" },
      take: limit,
    });

    for (const qa of recent) {
      if (!seen.has(qa.id)) {
        seen.add(qa.id);
        results.push({ qa, edgeLabel: "최근 공유", edgeType: "recent" });
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// UP: Broader / parent / generalization
// ─────────────────────────────────────────────

async function findUpNeighbors(
  focalId: string,
  topicClusterId: string | null,
  parentQASetId: string | null,
  limit: number,
): Promise<NeighborResult[]> {
  const seen = new Set<string>();
  const results: NeighborResult[] = [];

  // Signal 1: Fork parent — the original/broader version
  if (parentQASetId) {
    const parent = await prisma.qASet.findUnique({
      where: { id: parentQASetId },
      include: qaSetInclude,
    });
    if (parent && parent.id !== focalId) {
      seen.add(parent.id);
      results.push({
        qa: parent as QASetWithCreatorAndTags,
        edgeLabel: "원본 질문",
        edgeType: "fork_parent",
        edgeSourceId: `qaset-${parent.id}`,
        edgeTargetId: `qaset-${focalId}`,
      });
    }
  }

  // Signal 2: NodeRelation generalization (keep existing)
  if (results.length < limit) {
    const genRelations = await prisma.nodeRelation.findMany({
      where: {
        OR: [
          { sourceQASetId: focalId, relationType: "generalization" },
          { targetQASetId: focalId, relationType: "specialization" },
        ],
      },
      include: {
        sourceQASet: { include: qaSetInclude },
        targetQASet: { include: qaSetInclude },
      },
    });

    for (const rel of genRelations) {
      const otherId = rel.sourceQASetId === focalId ? rel.targetQASetId : rel.sourceQASetId;
      const otherQASet = rel.sourceQASetId === focalId ? rel.targetQASet : rel.sourceQASet;
      if (otherId && otherQASet && !seen.has(otherId)) {
        seen.add(otherId);
        results.push({
          qa: otherQASet as QASetWithCreatorAndTags,
          edgeLabel: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
          edgeType: rel.relationType,
        });
      }
    }
  }

  // Signal 3: ClusterRelation — 다른 클러스터에서 일반화 방향 QA 찾기
  if (results.length < limit && topicClusterId) {
    const clusterRels = await prisma.clusterRelation.findMany({
      where: {
        OR: [
          { sourceClusterId: topicClusterId, relationType: "broader" },
          { targetClusterId: topicClusterId, relationType: "narrower" },
        ],
      },
      orderBy: { weight: "desc" },
      take: limit,
    });

    for (const cr of clusterRels) {
      if (results.length >= limit) break;
      const otherClusterId = cr.sourceClusterId === topicClusterId ? cr.targetClusterId : cr.sourceClusterId;
      const representative = await prisma.qASet.findFirst({
        where: { isShared: true, topicClusterId: otherClusterId, id: { notIn: [...seen] } },
        include: qaSetInclude,
        orderBy: { totalInvested: "desc" },
      });
      if (representative && !seen.has(representative.id)) {
        seen.add(representative.id);
        results.push({
          qa: representative as QASetWithCreatorAndTags,
          edgeLabel: cr.label ?? CLUSTER_RELATION_LABELS[cr.relationType] ?? cr.relationType,
          edgeType: cr.relationType,
        });
      }
    }
  }

  // Signal 4: Fork count 기반 (폴백)
  if (results.length < limit && topicClusterId) {
    const moreForkable = await prisma.qASet.findMany({
      where: {
        isShared: true,
        id: { not: focalId },
        topicClusterId,
        forks: { some: {} },
      },
      include: {
        ...qaSetInclude,
        _count: { select: { forks: true } },
      },
      orderBy: { totalInvested: "desc" },
      take: limit * 2,
    });

    moreForkable.sort((a, b) => b._count.forks - a._count.forks);

    for (const qa of moreForkable) {
      if (!seen.has(qa.id)) {
        seen.add(qa.id);
        results.push({ qa: qa as QASetWithCreatorAndTags, edgeLabel: "더 넓은 주제", edgeType: "broader_topic" });
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// DOWN: More specific / children / specialization
// ─────────────────────────────────────────────

async function findDownNeighbors(
  focalId: string,
  topicClusterId: string | null,
  limit: number,
): Promise<NeighborResult[]> {
  const seen = new Set<string>();
  const results: NeighborResult[] = [];

  // Signal 1: Fork children — deeper dives from this Q&A
  const forkChildren = await prisma.qASet.findMany({
    where: { parentQASetId: focalId, isShared: true },
    include: qaSetInclude,
    orderBy: { sharedAt: "desc" },
  });

  for (const qa of forkChildren) {
    if (!seen.has(qa.id)) {
      seen.add(qa.id);
      results.push({
        qa: qa as QASetWithCreatorAndTags,
        edgeLabel: "확장 질문",
        edgeType: "fork_child",
        edgeSourceId: `qaset-${focalId}`,
        edgeTargetId: `qaset-${qa.id}`,
      });
    }
  }

  // Signal 2: NodeRelation specialization (keep existing)
  if (results.length < limit) {
    const specRelations = await prisma.nodeRelation.findMany({
      where: {
        OR: [
          { sourceQASetId: focalId, relationType: "specialization" },
          { targetQASetId: focalId, relationType: "generalization" },
        ],
      },
      include: {
        sourceQASet: { include: qaSetInclude },
        targetQASet: { include: qaSetInclude },
      },
    });

    for (const rel of specRelations) {
      const otherId = rel.sourceQASetId === focalId ? rel.targetQASetId : rel.sourceQASetId;
      const otherQASet = rel.sourceQASetId === focalId ? rel.targetQASet : rel.sourceQASet;
      if (otherId && otherQASet && !seen.has(otherId)) {
        seen.add(otherId);
        results.push({
          qa: otherQASet as QASetWithCreatorAndTags,
          edgeLabel: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
          edgeType: rel.relationType,
        });
      }
    }
  }

  // Signal 3: NodeRelation elaboration/extension/evidence
  if (results.length < limit) {
    const extensions = await prisma.nodeRelation.findMany({
      where: {
        OR: [
          { sourceQASetId: focalId, relationType: { in: ["deepening", "extension", "evidence", "application", "elaboration"] } },
          { targetQASetId: focalId, relationType: { in: ["deepening", "extension", "evidence", "application", "elaboration"] } },
        ],
      },
      include: {
        sourceQASet: { include: qaSetInclude },
        targetQASet: { include: qaSetInclude },
      },
    });

    for (const rel of extensions) {
      const otherId = rel.sourceQASetId === focalId ? rel.targetQASetId : rel.sourceQASetId;
      const otherQASet = rel.sourceQASetId === focalId ? rel.targetQASet : rel.sourceQASet;
      if (otherId && otherQASet && !seen.has(otherId)) {
        seen.add(otherId);
        results.push({
          qa: otherQASet as QASetWithCreatorAndTags,
          edgeLabel: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
          edgeType: rel.relationType,
        });
      }
    }
  }

  // Signal 4: ClusterRelation — 다른 클러스터에서 구체화 방향 QA 찾기
  if (results.length < limit && topicClusterId) {
    const clusterRels = await prisma.clusterRelation.findMany({
      where: {
        OR: [
          { sourceClusterId: topicClusterId, relationType: "narrower" },
          { targetClusterId: topicClusterId, relationType: "broader" },
        ],
      },
      orderBy: { weight: "desc" },
      take: limit,
    });

    for (const cr of clusterRels) {
      if (results.length >= limit) break;
      const otherClusterId = cr.sourceClusterId === topicClusterId ? cr.targetClusterId : cr.sourceClusterId;
      const representative = await prisma.qASet.findFirst({
        where: { isShared: true, topicClusterId: otherClusterId, id: { notIn: [...seen] } },
        include: qaSetInclude,
        orderBy: { totalInvested: "desc" },
      });
      if (representative && !seen.has(representative.id)) {
        seen.add(representative.id);
        results.push({
          qa: representative as QASetWithCreatorAndTags,
          edgeLabel: cr.label ?? CLUSTER_RELATION_LABELS[cr.relationType] ?? cr.relationType,
          edgeType: cr.relationType,
        });
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// LEFT: Opposing / controversial
// ─────────────────────────────────────────────

async function findLeftNeighbors(
  focalId: string,
  topicClusterId: string | null,
  limit: number,
): Promise<NeighborResult[]> {
  const seen = new Set<string>();
  const results: NeighborResult[] = [];

  // Signal 1: NodeRelation counterargument or contradiction (keep existing)
  const oppRelations = await prisma.nodeRelation.findMany({
    where: {
      OR: [
        { sourceQASetId: focalId, relationType: { in: ["counterargument", "contradiction"] } },
        { targetQASetId: focalId, relationType: { in: ["counterargument", "contradiction"] } },
      ],
    },
    include: {
      sourceQASet: { include: qaSetInclude },
      targetQASet: { include: qaSetInclude },
    },
  });

  for (const rel of oppRelations) {
    const otherId = rel.sourceQASetId === focalId ? rel.targetQASetId : rel.sourceQASetId;
    const otherQASet = rel.sourceQASetId === focalId ? rel.targetQASet : rel.sourceQASet;
    if (otherId && otherQASet && !seen.has(otherId)) {
      seen.add(otherId);
      results.push({
        qa: otherQASet as QASetWithCreatorAndTags,
        edgeLabel: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
        edgeType: rel.relationType,
      });
    }
  }

  // Signal 2: Q&As made by "hunters" — users who negatively invested in the focal Q&A
  // and also created their own Q&As (alternative perspectives)
  if (results.length < limit) {
    const hunterInvestments = await prisma.investment.findMany({
      where: { qaSetId: focalId, isNegative: true },
      select: { userId: true },
    });
    const hunterUserIds = [...new Set(hunterInvestments.map((h) => h.userId))];

    if (hunterUserIds.length > 0) {
      const hunterQAs = await prisma.qASet.findMany({
        where: {
          isShared: true,
          creatorId: { in: hunterUserIds },
          id: { not: focalId },
        },
        include: qaSetInclude,
        orderBy: { totalInvested: "desc" },
        take: limit * 2,
      });

      for (const qa of hunterQAs) {
        if (!seen.has(qa.id)) {
          seen.add(qa.id);
          results.push({ qa: qa as QASetWithCreatorAndTags, edgeLabel: "대안 견해", edgeType: "hunter_alternative" });
        }
      }
    }
  }

  // Signal 3: Q&As in same cluster with high negative investment (controversial content)
  if (results.length < limit && topicClusterId) {
    const controversial = await prisma.qASet.findMany({
      where: {
        isShared: true,
        topicClusterId,
        id: { not: focalId },
        negativeInvested: { gt: 0 },
      },
      include: qaSetInclude,
      orderBy: { negativeInvested: "desc" },
      take: limit * 2,
    });

    for (const qa of controversial) {
      if (!seen.has(qa.id)) {
        seen.add(qa.id);
        results.push({ qa: qa as QASetWithCreatorAndTags, edgeLabel: "논쟁 중", edgeType: "controversial" });
      }
    }
  }

  // Signal 4: ClusterRelation — 다른 클러스터에서 반론/모순 방향 QA 찾기
  if (results.length < limit && topicClusterId) {
    const clusterRels = await prisma.clusterRelation.findMany({
      where: {
        OR: [
          { sourceClusterId: topicClusterId, relationType: "conflicting" },
          { targetClusterId: topicClusterId, relationType: "conflicting" },
        ],
      },
      orderBy: { weight: "desc" },
      take: limit,
    });

    for (const cr of clusterRels) {
      if (results.length >= limit) break;
      const otherClusterId = cr.sourceClusterId === topicClusterId ? cr.targetClusterId : cr.sourceClusterId;
      const representative = await prisma.qASet.findFirst({
        where: { isShared: true, topicClusterId: otherClusterId, id: { notIn: [...seen] } },
        include: qaSetInclude,
        orderBy: { totalInvested: "desc" },
      });
      if (representative && !seen.has(representative.id)) {
        seen.add(representative.id);
        results.push({
          qa: representative as QASetWithCreatorAndTags,
          edgeLabel: cr.label ?? CLUSTER_RELATION_LABELS[cr.relationType] ?? cr.relationType,
          edgeType: cr.relationType,
        });
      }
    }
  }

  // Signal 5: Investments with negative comments on the focal Q&A — find Q&As by those commenters
  if (results.length < limit) {
    const negativeCommenters = await prisma.investment.findMany({
      where: {
        qaSetId: focalId,
        isNegative: true,
        comment: { not: null },
      },
      select: { userId: true },
    });
    const commenterIds = [...new Set(negativeCommenters.map((c) => c.userId))];

    if (commenterIds.length > 0) {
      const commenterQAs = await prisma.qASet.findMany({
        where: {
          isShared: true,
          creatorId: { in: commenterIds },
          id: { not: focalId },
        },
        include: qaSetInclude,
        orderBy: { totalInvested: "desc" },
        take: limit,
      });

      for (const qa of commenterQAs) {
        if (!seen.has(qa.id)) {
          seen.add(qa.id);
          results.push({ qa: qa as QASetWithCreatorAndTags, edgeLabel: "비평자 대안", edgeType: "critic_alternative" });
        }
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// Helper: Node builders
// ─────────────────────────────────────────────

function addQASetNode(
  nodesMap: Map<string, ExploreNode>,
  qa: {
    id: string;
    title: string | null;
    summary: string | null;
    totalInvested: number;
    investorCount: number;
    negativeInvested: number;
    creator: { id: string; name: string | null };
    tags: { tag: { name: string } }[];
  },
  direction: Direction,
) {
  const key = `qaset-${qa.id}`;
  if (nodesMap.has(key)) return;
  nodesMap.set(key, {
    id: key,
    type: "qaset",
    direction,
    data: {
      id: qa.id,
      title: qa.title,
      summary: qa.summary,
      creator: { id: qa.creator.id, name: qa.creator.name },
      totalInvested: qa.totalInvested,
      investorCount: qa.investorCount,
      negativeInvested: qa.negativeInvested,
      tags: qa.tags.map((t) => t.tag.name),
    },
  });
}

function addUserNode(
  nodesMap: Map<string, ExploreNode>,
  userNodeIds: Set<string>,
  user: { id: string; name: string | null; image: string | null; authorityScore: number; hubScore: number },
  direction: Direction,
) {
  const key = `user-${user.id}`;
  if (userNodeIds.has(user.id)) return;
  userNodeIds.add(user.id);
  nodesMap.set(key, {
    id: key,
    type: "user",
    direction,
    data: {
      id: user.id,
      name: user.name,
      image: user.image,
      authorityScore: user.authorityScore,
      hubScore: user.hubScore,
    },
  });
}

function buildEmptyDirections() {
  return {
    right: { hasMore: false, count: 0, label: "유사 주제" },
    up: { hasMore: false, count: 0, label: "일반화" },
    down: { hasMore: false, count: 0, label: "구체화" },
    left: { hasMore: false, count: 0, label: "반대 견해" },
  };
}
