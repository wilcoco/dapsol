import { prisma } from "@/lib/prisma";
import { analyzeWithAI } from "./ai-analysis";

export async function detectGapsForCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    include: {
      qaSets: {
        where: { isShared: true },
        select: {
          id: true,
          title: true,
          knowledgeCard: true,
          messages: { take: 4, orderBy: { orderIndex: "asc" }, select: { role: true, content: true } },
        },
      },
    },
  });

  if (!cluster || cluster.qaSets.length < 2) return;

  const qaDescriptions = cluster.qaSets.map((qa, i) => {
    const card = qa.knowledgeCard ? JSON.parse(qa.knowledgeCard) : null;
    const firstA = qa.messages.find((m) => m.role === "assistant")?.content?.slice(0, 300) ?? "";
    return `[Q&A ${i + 1}, ID: ${qa.id}] ${qa.title ?? ""}
답변: ${firstA}
${card ? `주장: ${card.coreClaim}` : ""}`;
  }).join("\n");

  const result = await analyzeWithAI<{
    gaps: { gapType: string; description: string; affectedIds: number[]; severity: string }[];
  }>({
    prompt: `다음은 "${cluster.name}" 주제의 Q&A 모음입니다. 지식 격차를 분석하세요.

${qaDescriptions}

지식 격차 유형:
- uncertain_answer: AI가 불확실하게 답한 부분
- inconsistency: 서로 다른 Q&A 간 모순되는 답변
- missing_evidence: 주장은 있으나 근거가 부족
- conflicting_claims: 명시적으로 갈등하는 주장

JSON으로 응답 (없으면 빈 배열):
{"gaps": [{"gapType": "...", "description": "한국어 설명", "affectedIds": [1, 3], "severity": "low|medium|high"}]}`,
  });

  if (!result?.gaps?.length) return;

  // Clear old unresolved gaps and create new ones
  await prisma.knowledgeGap.deleteMany({
    where: { topicClusterId: clusterId, isResolved: false },
  });

  const qaSetIds = cluster.qaSets.map((q) => q.id);
  await Promise.all(
    result.gaps.map((gap) =>
      prisma.knowledgeGap.create({
        data: {
          topicClusterId: clusterId,
          gapType: gap.gapType,
          description: gap.description,
          affectedQASetIds: JSON.stringify(gap.affectedIds.map((i) => qaSetIds[i - 1]).filter(Boolean)),
          severity: gap.severity,
        },
      })
    )
  );
}
