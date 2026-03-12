import { prisma } from "@/lib/prisma";
import { analyzeWithAI } from "./ai-analysis";

/**
 * 새 QASet이 클러스터에 할당된 후, 해당 클러스터의 미해결 갭을 해결했는지 확인.
 */
export async function checkAndResolveGaps(qaSetId: string, clusterId: string): Promise<void> {
  const gaps = await prisma.knowledgeGap.findMany({
    where: { topicClusterId: clusterId, isResolved: false },
    select: { id: true, description: true, gapType: true },
  });

  if (gaps.length === 0) return;

  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      title: true,
      messages: {
        orderBy: { orderIndex: "asc" },
        take: 4,
        select: { role: true, content: true, isInsight: true },
      },
    },
  });

  if (!qaSet) return;

  const qaContent = qaSet.messages
    .map((m) => `[${m.role === "user" ? "질문" : "답변"}${m.isInsight ? " (인사이트)" : ""}] ${m.content.slice(0, 300)}`)
    .join("\n");

  const gapList = gaps
    .map((g, i) => `${i + 1}. [${g.gapType}] ${g.description}`)
    .join("\n");

  const result = await analyzeWithAI<{
    resolved: { index: number; confidence: number }[];
  }>({
    prompt: `새로운 Q&A가 공유되었습니다. 이 Q&A가 기존 지식 갭을 해결하는지 판단하세요.

Q&A: ${qaSet.title ?? ""}
${qaContent}

미해결 지식 갭:
${gapList}

각 갭에 대해, 이 Q&A가 해당 갭을 해결(또는 부분적으로 해결)하는지 판단하세요.
인간의 경험적 지식이나 인사이트가 포함된 경우 더 높은 confidence를 부여하세요.

JSON: {"resolved": [{"index": 1, "confidence": 0.8}]}
confidence 0.6 이상만 포함. 해결된 것이 없으면 빈 배열.`,
    maxTokens: 256,
  });

  if (!result?.resolved?.length) return;

  for (const item of result.resolved) {
    const gap = gaps[item.index - 1];
    if (!gap || item.confidence < 0.6) continue;

    await prisma.knowledgeGap.update({
      where: { id: gap.id },
      data: {
        isResolved: true,
        resolvedByQASetId: qaSetId,
      },
    });

    // 진화 이벤트 기록
    const qaSetData = await prisma.qASet.findUnique({
      where: { id: qaSetId },
      select: { creatorId: true },
    });

    if (qaSetData) {
      await prisma.knowledgeEvolutionEvent.create({
        data: {
          topicClusterId: clusterId,
          eventType: "evidence",
          description: `지식 갭 해결: ${gap.description.slice(0, 80)}`,
          userId: qaSetData.creatorId,
          qaSetId,
        },
      });
    }
  }
}
