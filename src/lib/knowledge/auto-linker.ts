import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/search/embedding";
import { analyzeWithAI } from "./ai-analysis";

export async function autoLinkQASet(qaSetId: string): Promise<void> {
  // 1. Get the QASet's embedding
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      id: true,
      title: true,
      summary: true,
      embedding: true,
      messages: {
        take: 2,
        orderBy: { orderIndex: "asc" },
        select: { content: true, role: true },
      },
    },
  });
  if (!qaSet?.embedding) return;

  const sourceEmbedding = JSON.parse(qaSet.embedding) as number[];

  // 2. Get all other shared QASets with embeddings
  const candidates = await prisma.qASet.findMany({
    where: { isShared: true, id: { not: qaSetId }, embedding: { not: null } },
    select: { id: true, title: true, summary: true, embedding: true },
  });

  // 3. Find top 5 most similar
  const scored = candidates
    .map((c) => {
      const emb = JSON.parse(c.embedding!) as number[];
      return { ...c, similarity: cosineSimilarity(sourceEmbedding, emb) };
    })
    .filter((c) => c.similarity > 0.65)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  if (scored.length === 0) return;

  // 4. Check existing relations to avoid duplicates
  const existingRels = await prisma.nodeRelation.findMany({
    where: {
      OR: [
        { sourceQASetId: qaSetId, targetQASetId: { in: scored.map((s) => s.id) } },
        { targetQASetId: qaSetId, sourceQASetId: { in: scored.map((s) => s.id) } },
      ],
    },
    select: { sourceQASetId: true, targetQASetId: true },
  });
  const linkedIds = new Set(existingRels.flatMap((r) => [r.sourceQASetId, r.targetQASetId]));

  const unlinked = scored.filter((s) => !linkedIds.has(s.id));
  if (unlinked.length === 0) return;

  // 5. Ask AI to classify relation types (batch)
  const sourceDesc = `${qaSet.title ?? ""}: ${qaSet.messages?.[0]?.content?.slice(0, 200) ?? ""}`;
  const candidateDescs = unlinked
    .map((c, i) => `${i + 1}. ${c.title ?? "제목 없음"}: ${c.summary?.slice(0, 100) ?? ""}`)
    .join("\n");

  const analysis = await analyzeWithAI<{
    relations: { index: number; relationType: string }[];
  }>({
    prompt: `두 Q&A 간의 지식 관계를 분석하세요.

원본 Q&A: ${sourceDesc}

후보 Q&A 목록:
${candidateDescs}

각 후보에 대해 원본과의 관계 유형을 하나 선택하세요:
clarification(명확화), deepening(심화), evidence(근거), verification(검증), counterargument(반박), application(적용), synthesis(정리), generalization(일반화), specialization(구체화), analogy(유추), cause_effect(인과관계), prerequisite(선행조건), extension(확장)

관계가 약하면 제외하세요. JSON으로 응답:
{"relations": [{"index": 1, "relationType": "evidence"}, ...]}`,
  });

  if (!analysis?.relations) return;

  // 6. Create NodeRelations (max 3)
  const toCreate = analysis.relations.slice(0, 3);
  await Promise.all(
    toCreate.map((rel) => {
      const target = unlinked[rel.index - 1];
      if (!target) return Promise.resolve();
      return prisma.nodeRelation.create({
        data: {
          sourceQASetId: qaSetId,
          targetQASetId: target.id,
          relationType: rel.relationType,
          isAIGenerated: true,
        },
      });
    })
  );
}
