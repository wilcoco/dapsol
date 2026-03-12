import { prisma } from "@/lib/prisma";
import { generateEmbedding, cosineSimilarity } from "@/lib/search/embedding";

export interface GapContext {
  clusterName: string;
  gaps: { id: string; description: string; gapType: string; severity: string }[];
}

/**
 * Find knowledge gaps related to the conversation topic.
 * 1차: 임베딩 유사도 (centroidEmbedding vs 질문)
 * 2차: 텍스트 포함 비교 (폴백)
 */
export async function findRelevantGaps(firstUserMessage: string): Promise<GapContext | null> {
  const clustersWithGaps = await prisma.topicCluster.findMany({
    where: {
      knowledgeGaps: { some: { isResolved: false } },
    },
    select: {
      id: true,
      name: true,
      centroidEmbedding: true,
      knowledgeGaps: {
        where: { isResolved: false },
        orderBy: { severity: "desc" },
        take: 3,
        select: { id: true, description: true, gapType: true, severity: true },
      },
    },
  });

  if (clustersWithGaps.length === 0) return null;

  // 1차: 임베딩 유사도 매칭
  let bestMatch: typeof clustersWithGaps[0] | null = null;
  let bestScore = 0;

  try {
    if (process.env.OPENAI_API_KEY) {
      const queryEmbedding = await generateEmbedding(firstUserMessage);

      for (const cluster of clustersWithGaps) {
        if (!cluster.centroidEmbedding) continue;
        try {
          const centroid = JSON.parse(cluster.centroidEmbedding) as number[];
          const similarity = cosineSimilarity(queryEmbedding, centroid);
          if (similarity > bestScore && similarity >= 0.55) {
            bestScore = similarity;
            bestMatch = cluster;
          }
        } catch {
          // 파싱 실패 무시
        }
      }
    }
  } catch {
    // 임베딩 생성 실패 → 텍스트 폴백
  }

  // 2차: 텍스트 폴백 (임베딩 매칭 실패 시)
  if (!bestMatch) {
    const query = firstUserMessage.toLowerCase();
    for (const cluster of clustersWithGaps) {
      const nameWords = cluster.name.toLowerCase().split(/\s+/);
      const matchCount = nameWords.filter((w) => w.length >= 2 && query.includes(w)).length;
      const score = matchCount / nameWords.length;
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = cluster;
      }
    }
  }

  if (!bestMatch) return null;

  return {
    clusterName: bestMatch.name,
    gaps: bestMatch.knowledgeGaps,
  };
}
