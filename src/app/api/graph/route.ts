import { prisma } from "@/lib/prisma";
import { KNOWLEDGE_RELATION_LABELS, KNOWLEDGE_RELATION_COLORS } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";

// 메시지의 한국어 relationSimple → 레벨 1 key 매핑 (색상 조회용)
const SIMPLE_TO_KEY: Record<string, string> = {
  명확화: "clarification",
  더깊게: "deepening",
  심화: "deepening",
  근거: "evidence",
  검증: "verification",
  반박: "counterargument",
  적용: "application",
  정리: "synthesis",
};

/**
 * GET /api/graph?qaSetId=xxx
 *
 * qaSetId 제공 시 → 해당 Q&A + 부모 + 자식 + cross-relations만 반환.
 * qaSetId 없을 시 → 전체 공유 Q&A (레거시용).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const focusId = searchParams.get("qaSetId");

  let targetIds: string[] = [];

  if (focusId) {
    // 1. 요청된 Q&A 로드
    const focus = await prisma.qASet.findUnique({
      where: { id: focusId },
      select: { id: true, parentQASetId: true },
    });

    if (!focus) return NextResponse.json({ nodes: [], edges: [], focusId });

    const ids = new Set<string>([focusId]);

    // 2. 부모 QASet 포함 (공유 여부 무관 — 원본이 공유됐으면 표시)
    if (focus.parentQASetId) {
      ids.add(focus.parentQASetId);
    }

    // 3. 자식 QASets 포함
    const children = await prisma.qASet.findMany({
      where: { parentQASetId: focusId },
      select: { id: true },
    });
    for (const c of children) ids.add(c.id);

    // 4. Cross-relation으로 연결된 QASets 포함
    const crossRels = await prisma.nodeRelation.findMany({
      where: {
        OR: [
          { sourceQASetId: { in: [...ids] } },
          { targetQASetId: { in: [...ids] } },
        ],
      },
      select: { sourceQASetId: true, targetQASetId: true },
    });
    for (const r of crossRels) {
      if (r.sourceQASetId) ids.add(r.sourceQASetId);
      if (r.targetQASetId) ids.add(r.targetQASetId);
    }

    targetIds = [...ids];
  }

  // 5. QASets 로드
  const qaSets = await prisma.qASet.findMany({
    where: focusId ? { id: { in: targetIds } } : { isShared: true },
    include: {
      messages: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          relationSimple: true,
          relationQ1Q2: true,
          relationA1Q2: true,
          relationStance: true,
        },
      },
      creator: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (qaSets.length === 0) {
    return NextResponse.json({ nodes: [], edges: [], focusId: focusId ?? null });
  }

  // Focus Q&A의 parent id (하이라이팅용)
  const focusSet = qaSets.find((q) => q.id === focusId);
  const parentId = focusSet?.parentQASetId ?? null;

  // 포커스 Q&A → 부모 → 자식 → 기타 순으로 정렬
  const sorted = focusId
    ? [
        ...qaSets.filter((q) => q.id === focusId),
        ...qaSets.filter((q) => q.id === parentId),
        ...qaSets.filter((q) => q.id !== focusId && q.id !== parentId && q.parentQASetId === focusId),
        ...qaSets.filter((q) => q.id !== focusId && q.id !== parentId && q.parentQASetId !== focusId),
      ]
    : qaSets;

  const nodes: {
    id: string;
    type: "question" | "answer";
    isFocus: boolean;
    isParent: boolean;
    isChild: boolean;
    label: string;
    x: number;
    y: number;
    data: {
      messageId: string;
      qaSetId: string;
      qaSetTitle: string | null;
      creatorName: string | null;
      content: string;
      role: string;
      relationSimple: string | null;
      relationQ1Q2: string | null;
      relationA1Q2: string | null;
      relationStance: string | null;
    };
  }[] = [];

  const edges: {
    id: string;
    source: string;
    target: string;
    edgeType: "qa" | "followup" | "cross" | "fork";
    label: string | null;
    color: string;
  }[] = [];

  // Build a map of parent QASet last message ID (fork point) for branching
  const parentLastMsgMap = new Map<string, string>(); // childQASetId → parent's fork-point msg node id

  // First pass: identify fork points
  for (const qaSet of sorted) {
    if (qaSet.parentQASetId && qaSet.parentMessageCount > 0) {
      const parentQA = sorted.find((q) => q.id === qaSet.parentQASetId);
      if (parentQA && parentQA.messages.length >= qaSet.parentMessageCount) {
        // Fork point = parent's message at index (parentMessageCount - 1)
        const forkPointMsg = parentQA.messages[qaSet.parentMessageCount - 1];
        if (forkPointMsg) {
          parentLastMsgMap.set(qaSet.id, `msg-${forkPointMsg.id}`);
        }
      }
    }
  }

  // Track column index separately — children that branch from parent don't need full width
  let colIndex = 0;

  sorted.forEach((qaSet) => {
    const isFocus = qaSet.id === focusId;
    const isParent = parentId !== null && qaSet.id === parentId;
    const isChild = qaSet.parentQASetId === focusId;
    const forkPointNodeId = parentLastMsgMap.get(qaSet.id);

    // For forked children, skip duplicated messages (first parentMessageCount messages)
    const skipCount = forkPointNodeId ? qaSet.parentMessageCount : 0;
    const msgs = qaSet.messages.slice(skipCount);

    if (msgs.length === 0 && forkPointNodeId) {
      // All messages are duplicates — nothing unique to show
      colIndex++;
      return;
    }

    const baseX = 200 + colIndex * 440;
    colIndex++;

    // If branching from parent, start y position based on fork point
    const startY = forkPointNodeId ? 100 + skipCount * 160 : 100;

    msgs.forEach((msg, msgIndex) => {
      const isQ = msg.role === "user";
      const nodeId = `msg-${msg.id}`;
      const x = baseX + (isQ ? -70 : 70);
      const y = startY + msgIndex * 160;

      nodes.push({
        id: nodeId,
        type: isQ ? "question" : "answer",
        isFocus,
        isParent,
        isChild,
        label: msg.content.slice(0, 100),
        x,
        y,
        data: {
          messageId: msg.id,
          qaSetId: qaSet.id,
          qaSetTitle: qaSet.title,
          creatorName: qaSet.creator?.name ?? null,
          content: msg.content,
          role: msg.role,
          relationSimple: msg.relationSimple,
          relationQ1Q2: msg.relationQ1Q2,
          relationA1Q2: msg.relationA1Q2,
          relationStance: msg.relationStance,
        },
      });

      if (msgIndex === 0) {
        // First unique message: connect from fork point (parent's last shared msg)
        if (forkPointNodeId) {
          edges.push({
            id: `fork-branch-${qaSet.parentQASetId}-${qaSet.id}`,
            source: forkPointNodeId,
            target: nodeId,
            edgeType: "fork",
            label: `확장: ${qaSet.creator?.name ?? ""}`,
            color: "#14b8a6",
          });
        }
      } else {
        // Internal edges within this QASet's unique messages
        const prevMsg = msgs[msgIndex - 1];
        const isFollowup = isQ;
        edges.push({
          id: `edge-${prevMsg.id}-${msg.id}`,
          source: `msg-${prevMsg.id}`,
          target: nodeId,
          edgeType: isFollowup ? "followup" : "qa",
          label: isFollowup ? (msg.relationSimple ?? null) : null,
          color: isFollowup
            ? (KNOWLEDGE_RELATION_COLORS[SIMPLE_TO_KEY[msg.relationSimple ?? ""] ?? ""] ?? "#8b5cf6")
            : "#94a3b8",
        });
      }
    });
  });

  const qaSetIds = sorted.map((q) => q.id);
  // Map each QASet to its first unique (non-duplicated) message for cross-relation edges
  const firstMsgByQASet = new Map(sorted.map((qa) => {
    const skipCount = parentLastMsgMap.has(qa.id) ? qa.parentMessageCount : 0;
    const firstUniqueMsg = qa.messages[skipCount] ?? qa.messages[0];
    return [qa.id, firstUniqueMsg?.id];
  }));

  // Cross-QASet relations
  const crossRelations = await prisma.nodeRelation.findMany({
    where: {
      sourceQASetId: { in: qaSetIds },
      targetQASetId: { in: qaSetIds },
    },
  });

  for (const rel of crossRelations) {
    const srcMsg = firstMsgByQASet.get(rel.sourceQASetId ?? "");
    const tgtMsg = firstMsgByQASet.get(rel.targetQASetId ?? "");
    if (srcMsg && tgtMsg) {
      edges.push({
        id: `cross-${rel.id}`,
        source: `msg-${srcMsg}`,
        target: `msg-${tgtMsg}`,
        edgeType: "cross",
        label: KNOWLEDGE_RELATION_LABELS[rel.relationType] ?? rel.relationType,
        color: KNOWLEDGE_RELATION_COLORS[rel.relationType] ?? "#6b7280",
      });
    }
  }

  // Parent→child edges for QAs without parentMessageCount (legacy or no-duplicate forks)
  for (const qaSet of sorted) {
    if (qaSet.parentQASetId && qaSetIds.includes(qaSet.parentQASetId) && !parentLastMsgMap.has(qaSet.id)) {
      const parentFirstMsg = firstMsgByQASet.get(qaSet.parentQASetId);
      const childFirstMsg = firstMsgByQASet.get(qaSet.id);
      if (parentFirstMsg && childFirstMsg) {
        edges.push({
          id: `fork-${qaSet.parentQASetId}-${qaSet.id}`,
          source: `msg-${parentFirstMsg}`,
          target: `msg-${childFirstMsg}`,
          edgeType: "fork",
          label: `확장: ${qaSet.creator?.name ?? ""}`,
          color: "#14b8a6",
        });
      }
    }
  }

  return NextResponse.json({ nodes, edges, focusId: focusId ?? null });
}
