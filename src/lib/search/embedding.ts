import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_TEXT_LENGTH = 1000;

/**
 * QASet의 제목 + 첫 질문 + 첫 답변을 결합하여 임베딩용 텍스트 생성
 */
export function assembleTextForEmbedding(
  title: string | null,
  messages: { role: string; content: string }[]
): string {
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const firstAssistant = messages.find((m) => m.role === "assistant")?.content ?? "";

  const parts = [
    title ? `제목: ${title}` : "",
    firstUser ? `질문: ${firstUser.slice(0, 400)}` : "",
    firstAssistant ? `답변: ${firstAssistant.slice(0, 500)}` : "",
  ].filter(Boolean);

  return parts.join("\n").slice(0, MAX_TEXT_LENGTH);
}

/**
 * 단일 텍스트의 임베딩 벡터 생성 (검색 쿼리용)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text.slice(0, MAX_TEXT_LENGTH),
    maxRetries: 0, // quota 없을 때 재시도로 시간 낭비 방지
  });
  return embedding;
}

/**
 * 여러 텍스트의 임베딩 벡터 일괄 생성 (백필용)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts.map((t) => t.slice(0, MAX_TEXT_LENGTH)),
  });
  return embeddings;
}

/**
 * 코사인 유사도 계산 (0~1 범위로 정규화)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  // 코사인 유사도는 -1~1 범위이지만, 임베딩은 보통 0~1 범위
  return Math.max(0, dotProduct / denominator);
}

/**
 * pgvector: Save embedding as native vector column
 * Also keeps JSON string for backward compatibility
 */
export async function saveEmbeddingToDb(
  prisma: any,
  qaSetId: string,
  embedding: number[]
): Promise<void> {
  const embeddingJson = JSON.stringify(embedding);
  const vectorStr = `[${embedding.join(",")}]`;

  // Update both the JSON text field and the native vector column
  await prisma.$executeRaw`
    UPDATE "QASet"
    SET "embedding" = ${embeddingJson},
        "embeddingModel" = ${EMBEDDING_MODEL},
        "embeddingVec" = ${vectorStr}::vector
    WHERE "id" = ${qaSetId}
  `;
}

/**
 * pgvector: Semantic search using native vector cosine distance
 * Returns QASet IDs with similarity scores, no 50-item limit
 */
export async function vectorSearch(
  prisma: any,
  queryEmbedding: number[],
  options: {
    excludeQASetId?: string;
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<Array<{ id: string; similarity: number }>> {
  const { excludeQASetId, limit = 20, minSimilarity = 0.3 } = options;
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // cosine distance: 1 - similarity, so we order by distance ASC
  const results: Array<{ id: string; similarity: number }> = await prisma.$queryRaw`
    SELECT id, 1 - ("embeddingVec" <=> ${vectorStr}::vector) as similarity
    FROM "QASet"
    WHERE "isShared" = true
      AND "embeddingVec" IS NOT NULL
      ${excludeQASetId ? prisma.$queryRaw`AND "id" != ${excludeQASetId}` : prisma.$queryRaw``}
    HAVING 1 - ("embeddingVec" <=> ${vectorStr}::vector) > ${minSimilarity}
    ORDER BY "embeddingVec" <=> ${vectorStr}::vector
    LIMIT ${limit}
  `.catch(() => {
    // Fallback: if pgvector query fails (e.g., extension not installed), return empty
    console.warn("[pgvector] Vector search failed, falling back to in-memory search");
    return [];
  });

  return results;
}

export { EMBEDDING_MODEL };
