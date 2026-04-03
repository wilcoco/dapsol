import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

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
  prismaClient: PrismaClient,
  qaSetId: string,
  embedding: number[]
): Promise<void> {
  const embeddingJson = JSON.stringify(embedding);
  const vectorStr = `[${embedding.join(",")}]`;

  // Update both the JSON text field and the native vector column
  await prismaClient.$executeRaw`
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
  prismaClient: PrismaClient,
  queryEmbedding: number[],
  options: {
    excludeQASetId?: string;
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<Array<{ id: string; similarity: number }>> {
  const { excludeQASetId, limit = 20, minSimilarity = 0.3 } = options;
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  try {
    // Use subquery to filter by similarity (can't use column alias in WHERE)
    let results: Array<{ id: string; similarity: number }>;

    if (excludeQASetId) {
      results = await prismaClient.$queryRaw`
        SELECT id, (1 - ("embeddingVec" <=> ${vectorStr}::vector)) as similarity
        FROM "QASet"
        WHERE "isShared" = true
          AND "embeddingVec" IS NOT NULL
          AND "id" != ${excludeQASetId}
          AND (1 - ("embeddingVec" <=> ${vectorStr}::vector)) > ${minSimilarity}
        ORDER BY "embeddingVec" <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    } else {
      results = await prismaClient.$queryRaw`
        SELECT id, (1 - ("embeddingVec" <=> ${vectorStr}::vector)) as similarity
        FROM "QASet"
        WHERE "isShared" = true
          AND "embeddingVec" IS NOT NULL
          AND (1 - ("embeddingVec" <=> ${vectorStr}::vector)) > ${minSimilarity}
        ORDER BY "embeddingVec" <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
    }

    return results;
  } catch {
    console.warn("[pgvector] Vector search failed, falling back to empty results");
    return [];
  }
}

/**
 * Check if pgvector extension and index are properly set up.
 */
export async function checkPgvectorStatus(prismaClient: PrismaClient): Promise<{
  extensionInstalled: boolean;
  columnExists: boolean;
  indexExists: boolean;
  vectorCount: number;
}> {
  try {
    // Check extension
    const extResult = await prismaClient.$queryRaw`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as installed
    ` as Array<{ installed: boolean }>;
    const extensionInstalled = extResult[0]?.installed ?? false;

    // Check column
    const colResult = await prismaClient.$queryRaw`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'QASet' AND column_name = 'embeddingVec'
      ) as exists
    ` as Array<{ exists: boolean }>;
    const columnExists = colResult[0]?.exists ?? false;

    // Check index
    const idxResult = await prismaClient.$queryRaw`
      SELECT EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'QASet' AND indexname = 'idx_qaset_embedding'
      ) as exists
    ` as Array<{ exists: boolean }>;
    const indexExists = idxResult[0]?.exists ?? false;

    // Count vectors
    let vectorCount = 0;
    if (columnExists) {
      const countResult = await prismaClient.$queryRaw`
        SELECT COUNT(*)::int as count FROM "QASet" WHERE "embeddingVec" IS NOT NULL
      ` as Array<{ count: number }>;
      vectorCount = countResult[0]?.count ?? 0;
    }

    return { extensionInstalled, columnExists, indexExists, vectorCount };
  } catch {
    return { extensionInstalled: false, columnExists: false, indexExists: false, vectorCount: 0 };
  }
}

/**
 * tsvector full-text search using PostgreSQL GIN index
 * Uses 'simple' dictionary (works for Korean via whitespace splitting)
 * Returns candidate IDs with ts_rank_cd scores
 */
export async function tsvectorSearch(
  query: string,
  limit: number = 200
): Promise<{ id: string; rank: number }[]> {
  // Split on whitespace, filter short tokens, sanitize + lowercase for tsquery
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/['"\\&|!():*<>]/g, "").toLowerCase());

  if (terms.length === 0) return [];

  const tsquery = terms.join(" | ");

  try {
    const results = await prisma.$queryRaw<{ id: string; rank: number }[]>`
      SELECT id, ts_rank_cd(search_vector, to_tsquery('simple', ${tsquery})) as rank
      FROM "QASet"
      WHERE "isShared" = true
        AND search_vector @@ to_tsquery('simple', ${tsquery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results;
  } catch (error) {
    // Graceful degradation: tsvector column may not exist yet (migration not run)
    console.warn("[tsvector] Full-text search failed, column may not exist:", error);
    return [];
  }
}

/**
 * Check if tsvector search is available (migration has been run)
 */
export async function checkTsvectorStatus(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'QASet' AND column_name = 'search_vector'
      ) as exists
    `;
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

export { EMBEDDING_MODEL };
