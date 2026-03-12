/**
 * Cluster Relation Aggregation
 *
 * 레벨 1 (지식 단위 관계: NodeRelation + Message.relationSimple)을
 * 레벨 2 (주제 영역 관계: ClusterRelation)로 집계.
 *
 * 레벨 2는 SKOS 기반 4종:
 *   broader  (상위) — ↑ 일반화 방향
 *   narrower (하위) — ↓ 구체화 방향
 *   related  (관련) — → 유사/보완 방향
 *   conflicting (대립) — ← 반대/긴장 방향
 */

import { prisma } from "@/lib/prisma";
import {
  KNOWLEDGE_TO_CLUSTER_MAP,
  CLUSTER_RELATION_LABELS,
  type ClusterRelationType,
} from "@/lib/constants";

// Message.relationSimple(한국어) → 레벨 1 key 매핑
const SIMPLE_TO_KNOWLEDGE: Record<string, string> = {
  명확화: "clarification",
  더깊게: "deepening",
  심화: "deepening",
  근거: "evidence",
  검증: "verification",
  반박: "counterargument",
  적용: "application",
  정리: "synthesis",
};

/** 레벨 1 key → 레벨 2 key */
function toClusterRelationType(knowledgeType: string): ClusterRelationType {
  return KNOWLEDGE_TO_CLUSTER_MAP[knowledgeType] ?? "related";
}

/**
 * 특정 QASet의 NodeRelation + Message 관계를 클러스터 관계로 집계.
 * autoLinkQASet + assignToCluster 완료 후 호출.
 */
export async function aggregateClusterRelationsForQASet(qaSetId: string): Promise<void> {
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      id: true,
      topicClusterId: true,
      messages: {
        where: { relationSimple: { not: null } },
        select: { relationSimple: true },
      },
    },
  });

  if (!qaSet?.topicClusterId) return;
  const sourceClusterId = qaSet.topicClusterId;

  // 1. NodeRelation 기반 집계
  const nodeRelations = await prisma.nodeRelation.findMany({
    where: {
      OR: [
        { sourceQASetId: qaSetId },
        { targetQASetId: qaSetId },
      ],
    },
    include: {
      sourceQASet: { select: { topicClusterId: true } },
      targetQASet: { select: { topicClusterId: true } },
    },
  });

  // 클러스터간 관계 카운트 (레벨 2 어휘로 변환)
  const relationCounts = new Map<string, { type: ClusterRelationType; srcCluster: string; tgtCluster: string; count: number }>();

  for (const rel of nodeRelations) {
    const srcCluster = rel.sourceQASet?.topicClusterId;
    const tgtCluster = rel.targetQASet?.topicClusterId;
    if (!srcCluster || !tgtCluster || srcCluster === tgtCluster) continue;

    const clusterType = toClusterRelationType(rel.relationType);
    const key = `${srcCluster}:${tgtCluster}:${clusterType}`;
    const existing = relationCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      relationCounts.set(key, {
        type: clusterType,
        srcCluster,
        tgtCluster,
        count: 1,
      });
    }
  }

  // 2. Message.relationSimple 기반 보강
  const linkedClusterIds = new Set<string>();
  for (const rel of nodeRelations) {
    const otherCluster = rel.sourceQASetId === qaSetId
      ? rel.targetQASet?.topicClusterId
      : rel.sourceQASet?.topicClusterId;
    if (otherCluster && otherCluster !== sourceClusterId) {
      linkedClusterIds.add(otherCluster);
    }
  }

  if (linkedClusterIds.size > 0 && qaSet.messages.length > 0) {
    const msgRelCounts = new Map<ClusterRelationType, number>();
    for (const msg of qaSet.messages) {
      const knowledgeKey = SIMPLE_TO_KNOWLEDGE[msg.relationSimple!];
      if (!knowledgeKey) continue;
      const clusterType = toClusterRelationType(knowledgeKey);
      msgRelCounts.set(clusterType, (msgRelCounts.get(clusterType) ?? 0) + 1);
    }

    for (const tgtCluster of linkedClusterIds) {
      for (const [clusterType, count] of msgRelCounts) {
        const key = `${sourceClusterId}:${tgtCluster}:${clusterType}`;
        const existing = relationCounts.get(key);
        if (existing) {
          existing.count += count * 0.5;
        } else {
          relationCounts.set(key, {
            type: clusterType,
            srcCluster: sourceClusterId,
            tgtCluster,
            count: count * 0.5,
          });
        }
      }
    }
  }

  // 3. Upsert ClusterRelations
  for (const { type, srcCluster, tgtCluster, count } of relationCounts.values()) {
    await prisma.clusterRelation.upsert({
      where: {
        sourceClusterId_targetClusterId_relationType: {
          sourceClusterId: srcCluster,
          targetClusterId: tgtCluster,
          relationType: type,
        },
      },
      update: {
        weight: { increment: count },
      },
      create: {
        sourceClusterId: srcCluster,
        targetClusterId: tgtCluster,
        relationType: type,
        weight: count,
        label: CLUSTER_RELATION_LABELS[type] ?? type,
      },
    });
  }
}

/**
 * 전체 ClusterRelation 재구축 (클러스터 재생성 후 호출).
 */
export async function rebuildAllClusterRelations(): Promise<number> {
  await prisma.clusterRelation.deleteMany();

  const allRelations = await prisma.nodeRelation.findMany({
    include: {
      sourceQASet: { select: { topicClusterId: true } },
      targetQASet: { select: { topicClusterId: true } },
    },
  });

  const aggregated = new Map<string, { srcCluster: string; tgtCluster: string; type: ClusterRelationType; weight: number }>();

  for (const rel of allRelations) {
    const srcCluster = rel.sourceQASet?.topicClusterId;
    const tgtCluster = rel.targetQASet?.topicClusterId;
    if (!srcCluster || !tgtCluster || srcCluster === tgtCluster) continue;

    const clusterType = toClusterRelationType(rel.relationType);
    const key = `${srcCluster}:${tgtCluster}:${clusterType}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.weight++;
    } else {
      aggregated.set(key, { srcCluster, tgtCluster, type: clusterType, weight: 1 });
    }
  }

  // Message.relationSimple 보강
  const qaSetsWithRelations = await prisma.qASet.findMany({
    where: {
      isShared: true,
      topicClusterId: { not: null },
      messages: { some: { relationSimple: { not: null } } },
    },
    select: {
      id: true,
      topicClusterId: true,
      messages: {
        where: { relationSimple: { not: null } },
        select: { relationSimple: true },
      },
    },
  });

  for (const qa of qaSetsWithRelations) {
    if (!qa.topicClusterId) continue;

    const linkedClusters = new Set<string>();
    for (const rel of allRelations) {
      if (rel.sourceQASetId === qa.id && rel.targetQASet?.topicClusterId && rel.targetQASet.topicClusterId !== qa.topicClusterId) {
        linkedClusters.add(rel.targetQASet.topicClusterId);
      }
      if (rel.targetQASetId === qa.id && rel.sourceQASet?.topicClusterId && rel.sourceQASet.topicClusterId !== qa.topicClusterId) {
        linkedClusters.add(rel.sourceQASet.topicClusterId);
      }
    }

    if (linkedClusters.size === 0) continue;

    for (const msg of qa.messages) {
      const knowledgeKey = SIMPLE_TO_KNOWLEDGE[msg.relationSimple!];
      if (!knowledgeKey) continue;
      const clusterType = toClusterRelationType(knowledgeKey);

      for (const tgtCluster of linkedClusters) {
        const key = `${qa.topicClusterId}:${tgtCluster}:${clusterType}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.weight += 0.5;
        } else {
          aggregated.set(key, { srcCluster: qa.topicClusterId!, tgtCluster, type: clusterType, weight: 0.5 });
        }
      }
    }
  }

  if (aggregated.size > 0) {
    await prisma.clusterRelation.createMany({
      data: [...aggregated.values()].map((v) => ({
        sourceClusterId: v.srcCluster,
        targetClusterId: v.tgtCluster,
        relationType: v.type,
        weight: v.weight,
        label: CLUSTER_RELATION_LABELS[v.type] ?? v.type,
      })),
    });
  }

  return aggregated.size;
}
