import { prisma } from "@/lib/prisma";
import { analyzeWithAI } from "./ai-analysis";

export async function generateSynthesis(clusterId: string): Promise<void> {
  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    include: {
      qaSets: {
        where: { isShared: true },
        select: {
          id: true,
          title: true,
          knowledgeCard: true,
          summary: true,
          creator: { select: { name: true } },
          messages: { take: 4, orderBy: { orderIndex: "asc" }, select: { role: true, content: true } },
        },
      },
    },
  });

  if (!cluster || cluster.qaSets.length < 2) return;

  const qaDescriptions = cluster.qaSets.map((qa, i) => {
    const card = qa.knowledgeCard ? JSON.parse(qa.knowledgeCard) : null;
    const firstQ = qa.messages.find((m) => m.role === "user")?.content?.slice(0, 200) ?? "";
    const firstA = qa.messages.find((m) => m.role === "assistant")?.content?.slice(0, 300) ?? "";
    return `[Q&A ${i + 1}] 제목: ${qa.title ?? "없음"} (by ${qa.creator?.name ?? "익명"})
질문: ${firstQ}
답변 요약: ${firstA}
${card ? `핵심 주장: ${card.coreClaim}` : ""}`;
  }).join("\n\n");

  const result = await analyzeWithAI<{ synthesis: string }>({
    prompt: `다음은 "${cluster.name}" 주제에 대한 여러 Q&A입니다. 이들의 지식을 종합하세요.

${qaDescriptions}

다음 형식의 마크다운으로 종합하세요:

## 합산된 지식
- 핵심 포인트 (출처 Q&A 번호 표기)

## 갈등하는 견해 (있다면)
- 어떤 부분에서 의견이 갈리는지

## 아직 답이 없는 질문
- 이 주제에서 추가 탐구가 필요한 부분

JSON으로 감싸서 응답: {"synthesis": "마크다운 텍스트"}`,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  if (result?.synthesis) {
    await prisma.topicCluster.update({
      where: { id: clusterId },
      data: { synthesisText: result.synthesis, synthesizedAt: new Date() },
    });
  }
}
