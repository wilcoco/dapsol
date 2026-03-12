import { prisma } from "@/lib/prisma";
import { CLUSTER_RELATION_LABELS, CLUSTER_RELATION_COLORS, CLUSTER_RELATION_DIRECTION } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/graph/clusters?focusId=xxx
 *
 * 포컬 클러스터 + 인접 클러스터 반환 (4방향 탐색).
 * focusId 없으면 가장 큰 클러스터를 포컬로 선택.
 *
 * 방향: broader=up, narrower=down, related=right, conflicting=left
 */
export async function GET(req: NextRequest) {
  const focusId = req.nextUrl.searchParams.get("focusId");

  // 포컬 클러스터 결정
  let focalCluster;
  if (focusId) {
    focalCluster = await prisma.topicCluster.findUnique({
      where: { id: focusId },
      select: { id: true },
    });
  }
  if (!focalCluster) {
    // 가장 QA가 많은 클러스터를 기본 포컬로
    const biggest = await prisma.topicCluster.findFirst({
      orderBy: { qaSets: { _count: "desc" } },
      select: { id: true },
    });
    if (!biggest) return NextResponse.json({ focal: null, nodes: [], edges: [], directions: { up: { count: 0 }, down: { count: 0 }, left: { count: 0 }, right: { count: 0 } } });
    focalCluster = biggest;
  }

  // 포컬 클러스터의 모든 관계 가져오기 (source 또는 target으로)
  const relations = await prisma.clusterRelation.findMany({
    where: {
      OR: [
        { sourceClusterId: focalCluster.id },
        { targetClusterId: focalCluster.id },
      ],
    },
    select: {
      id: true,
      sourceClusterId: true,
      targetClusterId: true,
      relationType: true,
      weight: true,
      label: true,
    },
    orderBy: { weight: "desc" },
  });

  // 인접 클러스터 ID + 방향 계산
  const neighborMap = new Map<string, { direction: string; relationId: string; relationType: string; weight: number; label: string | null }>();

  for (const rel of relations) {
    const isFocalSource = rel.sourceClusterId === focalCluster.id;
    const neighborId = isFocalSource ? rel.targetClusterId : rel.sourceClusterId;
    const direction = CLUSTER_RELATION_DIRECTION[rel.relationType] ?? "right";
    // 역방향: source→target이 broader이면 target→source는 narrower (반대)
    const effectiveDir = isFocalSource ? direction : flipDirection(direction);

    if (!neighborMap.has(neighborId) || rel.weight > (neighborMap.get(neighborId)?.weight ?? 0)) {
      neighborMap.set(neighborId, {
        direction: effectiveDir,
        relationId: rel.id,
        relationType: rel.relationType,
        weight: rel.weight,
        label: rel.label,
      });
    }
  }

  // 포컬 + 인접 클러스터 데이터 로드
  const allClusterIds = [focalCluster.id, ...neighborMap.keys()];
  const clusters = await prisma.topicCluster.findMany({
    where: { id: { in: allClusterIds } },
    select: {
      id: true,
      name: true,
      nameEn: true,
      description: true,
      synthesisText: true,
      _count: { select: { qaSets: true, knowledgeGaps: true } },
      knowledgeGaps: {
        where: { isResolved: false },
        orderBy: { severity: "desc" },
        take: 5,
        select: { id: true, description: true, gapType: true, severity: true, isResolved: true },
      },
      contributions: {
        orderBy: { topicAuthority: "desc" },
        take: 3,
        select: {
          userId: true,
          topicAuthority: true,
          questionsAsked: true,
          insightsContributed: true,
        },
      },
    },
  });

  // 기여자 이름 조회
  const allUserIds = [...new Set(clusters.flatMap(c => c.contributions.map(ct => ct.userId)))];
  const users = allUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, name: true } })
    : [];
  const userMap = new Map(users.map(u => [u.id, u.name]));

  // 레이아웃: 포컬 = 중앙, 인접 = 4방향 배치
  const CX = 600;
  const CY = 400;
  const DIST = 300;

  const directionOffsets: Record<string, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -DIST },
    down: { dx: 0, dy: DIST },
    right: { dx: DIST, dy: 0 },
    left: { dx: -DIST, dy: 0 },
  };

  // 방향별 인접 클러스터 분류
  const byDir: Record<string, string[]> = { up: [], down: [], left: [], right: [] };
  for (const [nId, info] of neighborMap) {
    const dir = info.direction;
    byDir[dir] = byDir[dir] ?? [];
    byDir[dir].push(nId);
  }

  const clusterMap = new Map(clusters.map(c => [c.id, c]));

  function buildNode(c: typeof clusters[0], x: number, y: number, direction: string) {
    return {
      id: c.id,
      label: c.name,
      labelEn: c.nameEn,
      description: c.description,
      qaCount: c._count.qaSets,
      gapCount: c._count.knowledgeGaps,
      gaps: c.knowledgeGaps,
      contributors: c.contributions.map(ct => ({
        userId: ct.userId,
        name: userMap.get(ct.userId) ?? "익명",
        topicAuthority: ct.topicAuthority,
        questionsAsked: ct.questionsAsked,
        insightsContributed: ct.insightsContributed,
      })),
      direction,
      x,
      y,
    };
  }

  const nodes = [];
  const edges = [];

  // 포컬 노드
  const focalData = clusterMap.get(focalCluster.id);
  if (focalData) {
    nodes.push(buildNode(focalData, CX, CY, "center"));
  }

  // 인접 노드 배치
  for (const [dir, ids] of Object.entries(byDir)) {
    const offset = directionOffsets[dir];
    if (!offset) continue;
    ids.forEach((nId, i) => {
      const c = clusterMap.get(nId);
      if (!c) return;
      // 같은 방향에 여러 개면 수직/수평으로 분산
      const spread = ids.length > 1 ? (i - (ids.length - 1) / 2) * 160 : 0;
      const x = CX + offset.dx + (offset.dx === 0 ? spread : 0);
      const y = CY + offset.dy + (offset.dy === 0 ? spread : 0);
      nodes.push(buildNode(c, x, y, dir));
    });
  }

  // 엣지 생성
  for (const rel of relations) {
    const isFocalSource = rel.sourceClusterId === focalCluster.id;
    const neighborId = isFocalSource ? rel.targetClusterId : rel.sourceClusterId;
    edges.push({
      id: rel.id,
      source: focalCluster.id,
      target: neighborId,
      type: rel.relationType,
      label: rel.label ?? CLUSTER_RELATION_LABELS[rel.relationType] ?? rel.relationType,
      color: CLUSTER_RELATION_COLORS[rel.relationType] ?? "#6b7280",
      weight: rel.weight,
    });
  }

  // 방향별 카운트
  const directions = {
    up: { count: byDir.up.length, label: "상위 (broader)" },
    down: { count: byDir.down.length, label: "하위 (narrower)" },
    right: { count: byDir.right.length, label: "관련 (related)" },
    left: { count: byDir.left.length, label: "대립 (conflicting)" },
  };

  // 포컬 정보
  const focal = focalData ? {
    id: focalData.id,
    name: focalData.name,
    nameEn: focalData.nameEn,
    description: focalData.description,
    qaCount: focalData._count.qaSets,
    gapCount: focalData._count.knowledgeGaps,
  } : null;

  return NextResponse.json({ focal, nodes, edges, directions });
}

/** broader↔narrower, related↔related, conflicting↔conflicting */
function flipDirection(dir: string): string {
  switch (dir) {
    case "up": return "down";
    case "down": return "up";
    default: return dir; // related/conflicting are symmetric
  }
}
