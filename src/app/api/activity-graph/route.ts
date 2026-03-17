import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity-graph
 *
 * 홈 화면 지식 네트워크 그래프용.
 * 최근 공유 QASet의 메시지(Q/A), 투자, 의견을 모두 노드로 반환.
 * 링크: Q→A, 후속질문, 투자, 의견연결, 지식관계(AI제안/확정 구분).
 */
export async function GET() {
  try {
    // 1. 최근 공유된 QASet (최대 15개 — 각 QASet에서 메시지+투자+의견 노드 파생)
    const qaSets = await prisma.qASet.findMany({
      where: { isShared: true },
      orderBy: { sharedAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        parentQASetId: true,
        creator: { select: { name: true } },
        messages: {
          orderBy: { orderIndex: "asc" },
          take: 6, // 최대 3쌍 (Q-A)
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
          take: 5,
          select: {
            id: true,
            amount: true,
            isNegative: true,
            user: { select: { name: true } },
          },
        },
        totalInvested: true,
        investorCount: true,
        negativeCount: true,
      },
    });

    const qaSetIds = qaSets.map((q) => q.id);

    // 2. OpinionNode 연결된 것들
    const opinions = await prisma.opinionNode.findMany({
      where: {
        relationsAsSource: { some: { targetQASetId: { in: qaSetIds } } },
      },
      take: 20,
      select: {
        id: true,
        content: true,
        user: { select: { name: true } },
        relationsAsSource: {
          where: { targetQASetId: { in: qaSetIds } },
          select: {
            targetQASetId: true,
            relationType: true,
          },
        },
      },
    });

    // 3. NodeRelation (QASet간 지식 관계)
    const relations = await prisma.nodeRelation.findMany({
      where: {
        sourceQASetId: { in: qaSetIds },
        targetQASetId: { in: qaSetIds },
      },
      select: {
        id: true,
        sourceQASetId: true,
        targetQASetId: true,
        relationType: true,
        isAIGenerated: true,
        isUserModified: true,
      },
    });

    // ─── Build nodes ───
    type GraphNode = {
      id: string;
      type: "question" | "answer" | "invest" | "hunt" | "opinion";
      label: string;
      sublabel?: string;
      qaSetId: string;
      amount?: number;
      relationSimple?: string | null;
    };
    type GraphEdge = {
      source: string;
      target: string;
      type: "qa" | "followup" | "invest" | "hunt" | "opinion" | "knowledge" | "fork";
      label?: string;
      relationType?: string;
      isAIGenerated?: boolean;
      isUserConfirmed?: boolean;
    };

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const qaSetFirstMsgId = new Map<string, string>(); // qaSetId → first message id

    for (const qs of qaSets) {
      let prevMsgId: string | null = null;
      let prevRole: string | null = null;

      for (const msg of qs.messages) {
        const isQ = msg.role === "user";
        nodes.push({
          id: msg.id,
          type: isQ ? "question" : "answer",
          label: msg.content.slice(0, 40) + (msg.content.length > 40 ? "..." : ""),
          sublabel: isQ ? undefined : qs.creator?.name ?? undefined,
          qaSetId: qs.id,
          relationSimple: msg.relationSimple,
        });

        if (msg.orderIndex === 0) {
          qaSetFirstMsgId.set(qs.id, msg.id);
        }

        // Q→A 또는 후속질문 엣지
        if (prevMsgId) {
          if (prevRole === "user" && !isQ) {
            // Q → A
            edges.push({ source: prevMsgId, target: msg.id, type: "qa" });
          } else if (prevRole === "assistant" && isQ) {
            // A → Q (후속질문)
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

      // 투자 노드 (상위 3개만, 시각적으로)
      for (const inv of qs.investments.slice(0, 3)) {
        const invNodeId = `inv-${inv.id}`;
        nodes.push({
          id: invNodeId,
          type: inv.isNegative ? "hunt" : "invest",
          label: `${inv.user.name ?? "익명"} ${inv.amount}P`,
          qaSetId: qs.id,
          amount: inv.amount,
        });
        // 투자 → QASet의 마지막 답변 노드 (또는 첫 메시지)
        const targetMsg = qs.messages.filter((m) => m.role === "assistant").pop()
          ?? qs.messages[0];
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
      nodes.push({
        id: opNodeId,
        type: "opinion",
        label: op.content.slice(0, 40) + (op.content.length > 40 ? "..." : ""),
        sublabel: op.user?.name ?? undefined,
        qaSetId: op.relationsAsSource[0]?.targetQASetId ?? "",
      });
      // 의견 → QASet 첫 메시지
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

    // 포크 관계 (parent → child 첫 메시지)
    for (const qs of qaSets) {
      if (qs.parentQASetId && qaSetFirstMsgId.has(qs.parentQASetId) && qaSetFirstMsgId.has(qs.id)) {
        edges.push({
          source: qaSetFirstMsgId.get(qs.parentQASetId)!,
          target: qaSetFirstMsgId.get(qs.id)!,
          type: "fork",
        });
      }
    }

    // 지식 관계 (AI제안/사용자확정 구분)
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

    return NextResponse.json({ nodes, edges });
  } catch (err) {
    console.error("Activity graph error:", err);
    return NextResponse.json({ nodes: [], edges: [] });
  }
}
