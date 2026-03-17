import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity-graph
 *
 * 홈 화면 지식 네트워크용.
 * 노드: 질문(rect), 답변(rect), 투자(circle), 반대투자(circle), 의견(rect), 작성자(circle)
 * 링크: Q→A, 후속질문, 투자, 의견, 지식관계(AI제안/확정), 포크, 작성자→QA
 */
export async function GET() {
  try {
    const qaSets = await prisma.qASet.findMany({
      where: { isShared: true },
      orderBy: { sharedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        parentQASetId: true,
        creatorId: true,
        topicClusterId: true,
        topicCluster: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        messages: {
          orderBy: { orderIndex: "asc" },
          take: 4,
          select: {
            id: true,
            role: true,
            content: true,
            relationSimple: true,
            orderIndex: true,
          },
        },
        investments: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            amount: true,
            isNegative: true,
            user: { select: { id: true, name: true } },
          },
        },
        totalInvested: true,
        investorCount: true,
        negativeCount: true,
      },
    });

    const qaSetIds = qaSets.map((q) => q.id);

    // OpinionNodes
    const opinions = await prisma.opinionNode.findMany({
      where: {
        relationsAsSource: { some: { targetQASetId: { in: qaSetIds } } },
      },
      take: 15,
      select: {
        id: true,
        content: true,
        user: { select: { name: true } },
        relationsAsSource: {
          where: { targetQASetId: { in: qaSetIds } },
          select: { targetQASetId: true, relationType: true },
        },
      },
    });

    // NodeRelations (QASet간)
    const relations = await prisma.nodeRelation.findMany({
      where: {
        sourceQASetId: { in: qaSetIds },
        targetQASetId: { in: qaSetIds },
      },
      select: {
        sourceQASetId: true,
        targetQASetId: true,
        relationType: true,
        isAIGenerated: true,
        isUserModified: true,
      },
    });

    // ─── Build ───
    type GNode = {
      id: string;
      type: "question" | "answer" | "invest" | "hunt" | "opinion" | "author";
      label: string;
      sublabel?: string;
      qaSetId: string;
      amount?: number;
      relationSimple?: string | null;
      clusterId?: string | null;
      clusterName?: string | null;
    };
    type GEdge = {
      source: string;
      target: string;
      type: "qa" | "followup" | "invest" | "hunt" | "opinion" | "knowledge" | "fork" | "author";
      label?: string;
      relationType?: string;
      isAIGenerated?: boolean;
      isUserConfirmed?: boolean;
    };

    const nodes: GNode[] = [];
    const edges: GEdge[] = [];
    const qaSetFirstMsgId = new Map<string, string>();
    const seenAuthors = new Set<string>();

    for (const qs of qaSets) {
      // 작성자 노드
      if (!seenAuthors.has(qs.creatorId)) {
        seenAuthors.add(qs.creatorId);
        nodes.push({
          id: `author-${qs.creatorId}`,
          type: "author",
          label: qs.creator?.name ?? "익명",
          qaSetId: qs.id,
        });
      }

      let prevMsgId: string | null = null;
      let prevRole: string | null = null;

      for (const msg of qs.messages) {
        const isQ = msg.role === "user";
        const firstLine = msg.content.split("\n")[0];
        nodes.push({
          id: msg.id,
          type: isQ ? "question" : "answer",
          label: firstLine.slice(0, 50) + (firstLine.length > 50 ? "..." : ""),
          sublabel: isQ ? undefined : qs.creator?.name ?? undefined,
          qaSetId: qs.id,
          relationSimple: msg.relationSimple,
          clusterId: qs.topicClusterId,
          clusterName: qs.topicCluster?.name ?? null,
        });

        if (msg.orderIndex === 0) {
          qaSetFirstMsgId.set(qs.id, msg.id);
          // 작성자 → 첫 질문
          edges.push({
            source: `author-${qs.creatorId}`,
            target: msg.id,
            type: "author",
          });
        }

        if (prevMsgId) {
          if (prevRole === "user" && !isQ) {
            edges.push({ source: prevMsgId, target: msg.id, type: "qa" });
          } else if (prevRole === "assistant" && isQ) {
            edges.push({
              source: prevMsgId,
              target: msg.id,
              type: "followup",
              label: msg.relationSimple ?? undefined,
            });
          }
        }

        prevMsgId = msg.id;
        prevRole = msg.role;
      }

      // 투자 노드
      for (const inv of qs.investments.slice(0, 3)) {
        const invNodeId = `inv-${inv.id}`;
        nodes.push({
          id: invNodeId,
          type: inv.isNegative ? "hunt" : "invest",
          label: `${inv.user.name ?? "익명"} ${inv.amount}P`,
          qaSetId: qs.id,
          amount: inv.amount,
        });
        const targetMsg = qs.messages.filter((m) => m.role === "assistant").pop() ?? qs.messages[0];
        if (targetMsg) {
          edges.push({
            source: invNodeId,
            target: targetMsg.id,
            type: inv.isNegative ? "hunt" : "invest",
            label: `${inv.amount}P`,
          });
        }
      }
    }

    // 의견 노드
    for (const op of opinions) {
      const opNodeId = `op-${op.id}`;
      const firstLine = op.content.split("\n")[0];
      nodes.push({
        id: opNodeId,
        type: "opinion",
        label: firstLine.slice(0, 40) + (firstLine.length > 40 ? "..." : ""),
        sublabel: op.user?.name ?? undefined,
        qaSetId: op.relationsAsSource[0]?.targetQASetId ?? "",
      });
      for (const rel of op.relationsAsSource) {
        if (rel.targetQASetId) {
          const targetId = qaSetFirstMsgId.get(rel.targetQASetId);
          if (targetId) {
            edges.push({
              source: opNodeId,
              target: targetId,
              type: "opinion",
              relationType: rel.relationType,
              label: rel.relationType,
            });
          }
        }
      }
    }

    // 포크
    for (const qs of qaSets) {
      if (qs.parentQASetId && qaSetFirstMsgId.has(qs.parentQASetId) && qaSetFirstMsgId.has(qs.id)) {
        edges.push({
          source: qaSetFirstMsgId.get(qs.parentQASetId)!,
          target: qaSetFirstMsgId.get(qs.id)!,
          type: "fork",
        });
      }
    }

    // 지식 관계
    for (const rel of relations) {
      if (rel.sourceQASetId && rel.targetQASetId) {
        const srcId = qaSetFirstMsgId.get(rel.sourceQASetId);
        const tgtId = qaSetFirstMsgId.get(rel.targetQASetId);
        if (srcId && tgtId) {
          edges.push({
            source: srcId,
            target: tgtId,
            type: "knowledge",
            relationType: rel.relationType,
            label: rel.relationType,
            isAIGenerated: rel.isAIGenerated,
            isUserConfirmed: rel.isUserModified || !rel.isAIGenerated,
          });
        }
      }
    }

    // ─── Clusters ───
    const CLUSTER_COLORS = [
      "#f43f5e", "#06b6d4", "#a78bfa", "#fb923c",
      "#34d399", "#38bdf8", "#d4a574", "#c084fc",
    ];
    const clusterMap = new Map<string, { id: string; name: string; nodeIds: string[] }>();
    for (const n of nodes) {
      if (n.clusterId) {
        const existing = clusterMap.get(n.clusterId);
        if (existing) {
          existing.nodeIds.push(n.id);
        } else {
          clusterMap.set(n.clusterId, {
            id: n.clusterId,
            name: n.clusterName ?? "기타",
            nodeIds: [n.id],
          });
        }
      }
    }
    const clusters = Array.from(clusterMap.values()).map((c, i) => ({
      ...c,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
    }));

    return NextResponse.json({ nodes, edges, clusters });
  } catch (err) {
    console.error("Activity graph error:", err);
    return NextResponse.json({ nodes: [], edges: [], clusters: [] });
  }
}
