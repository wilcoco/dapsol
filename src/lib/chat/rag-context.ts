/**
 * RAG Context Retrieval
 * Retrieves relevant shared Q&As from the knowledge base to augment AI responses.
 * Ensures accumulated collective intelligence is actually used by the AI.
 */

import { prisma } from "@/lib/prisma";

interface RAGResult {
  qaSetId: string;
  title: string;
  coreClaim: string;
  evidence: string[];
  limitations: string[];
  confidence: string;
  investorCount: number;
  negativeCount: number;
  similarity: number;
}

/**
 * Find relevant shared Q&As based on the current conversation topic.
 * Uses embedding similarity when available, falls back to keyword matching.
 */
export async function retrieveRelevantKnowledge(
  queryText: string,
  excludeQASetId?: string,
  maxResults: number = 3
): Promise<RAGResult[]> {
  try {
    // Strategy 1: Try embedding-based search if OpenAI key available
    if (process.env.OPENAI_API_KEY) {
      const embeddingResults = await searchByEmbedding(queryText, excludeQASetId, maxResults);
      if (embeddingResults.length > 0) return embeddingResults;
    }

    // Strategy 2: Keyword-based fallback
    return await searchByKeyword(queryText, excludeQASetId, maxResults);
  } catch (err) {
    console.error("[RAG] Failed to retrieve knowledge:", err);
    return [];
  }
}

async function searchByEmbedding(
  queryText: string,
  excludeQASetId?: string,
  maxResults: number = 3
): Promise<RAGResult[]> {
  try {
    const { generateEmbedding, vectorSearch } = await import("@/lib/search/embedding");
    const queryEmbedding = await generateEmbedding(queryText.slice(0, 500));

    // Try pgvector native search first (no 50-item limit)
    let scored: Array<{ id: string; similarity: number }> = [];
    try {
      scored = await vectorSearch(prisma, queryEmbedding, {
        excludeQASetId,
        limit: maxResults,
        minSimilarity: 0.3,
      });
    } catch {
      // pgvector not available, fall through to legacy
    }

    // Fallback to in-memory cosine similarity if pgvector returned nothing
    if (scored.length === 0) {
      const sharedQASets = await prisma.qASet.findMany({
        where: {
          isShared: true,
          embedding: { not: null },
          knowledgeCard: { not: null },
          ...(excludeQASetId ? { id: { not: excludeQASetId } } : {}),
        },
        select: { id: true, embedding: true },
        take: 50,
        orderBy: { totalInvested: "desc" },
      });

      scored = sharedQASets
        .map((qa) => {
          const emb = JSON.parse(qa.embedding!) as number[];
          const sim = cosineSimilarity(queryEmbedding, emb);
          return { id: qa.id, similarity: sim };
        })
        .filter((qa) => qa.similarity > 0.3)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults);
    }

    // Fetch full QASet data for results
    const qaSetIds = scored.map((s) => s.id);
    const simMap = new Map(scored.map((s) => [s.id, s.similarity]));

    const qaSets = await prisma.qASet.findMany({
      where: { id: { in: qaSetIds }, knowledgeCard: { not: null } },
      select: { id: true, title: true, knowledgeCard: true, investorCount: true, negativeCount: true },
    });

    const results = qaSets.map((qa: any) => {
      const card = parseKnowledgeCard(qa.knowledgeCard);
      return {
        qaSetId: qa.id,
        title: qa.title ?? "",
        coreClaim: card.coreClaim,
        evidence: card.evidence,
        limitations: card.limitations,
        confidence: card.confidence,
        investorCount: qa.investorCount,
        negativeCount: qa.negativeCount,
        similarity: simMap.get(qa.id) ?? 0.5,
      };
    });

    // Add hunting evidence to limitations
    for (const result of results) {
      const huntInvestments = await prisma.investment.findMany({
        where: {
          qaSetId: result.qaSetId,
          isNegative: true,
          huntingEvidence: { not: null },
        },
        select: { huntingReason: true, huntingEvidence: true },
        take: 3,
      });
      for (const hunt of huntInvestments) {
        if (hunt.huntingEvidence) {
          result.limitations.push(`⚠ [${hunt.huntingReason}] ${hunt.huntingEvidence}`);
        }
      }
    }

    return results;
  } catch (err) {
    console.error("[RAG] Embedding search failed:", err);
    return [];
  }
}

async function searchByKeyword(
  queryText: string,
  excludeQASetId?: string,
  maxResults: number = 3
): Promise<RAGResult[]> {
  const keywords = queryText
    .replace(/[^\w\s가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  const qaSets = await prisma.qASet.findMany({
    where: {
      isShared: true,
      knowledgeCard: { not: null },
      ...(excludeQASetId ? { id: { not: excludeQASetId } } : {}),
      OR: keywords.map((kw) => ({
        OR: [
          { title: { contains: kw } },
          { searchKeywords: { contains: kw } },
        ],
      })),
    },
    select: {
      id: true,
      title: true,
      knowledgeCard: true,
      investorCount: true,
      negativeCount: true,
    },
    take: maxResults,
    orderBy: { totalInvested: "desc" },
  });

  return qaSets.map((qa) => {
    const card = parseKnowledgeCard(qa.knowledgeCard);
    return {
      qaSetId: qa.id,
      title: qa.title ?? "",
      coreClaim: card.coreClaim,
      evidence: card.evidence,
      limitations: card.limitations,
      confidence: card.confidence,
      investorCount: qa.investorCount,
      negativeCount: qa.negativeCount,
      similarity: 0.5, // fallback score
    };
  });
}

function parseKnowledgeCard(raw: string | null): {
  coreClaim: string;
  evidence: string[];
  limitations: string[];
  confidence: string;
} {
  if (!raw) return { coreClaim: "", evidence: [], limitations: [], confidence: "low" };
  try {
    const card = JSON.parse(raw);
    return {
      coreClaim: card.coreClaim ?? "",
      evidence: Array.isArray(card.evidence) ? card.evidence : [],
      limitations: Array.isArray(card.limitations) ? card.limitations : [],
      confidence: card.confidence ?? "low",
    };
  } catch {
    return { coreClaim: "", evidence: [], limitations: [], confidence: "low" };
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Format RAG results into a system prompt section
 */
export function formatRAGContext(results: RAGResult[]): string {
  if (results.length === 0) return "";

  const entries = results.map((r) => {
    const trustSignal = r.negativeCount > 0
      ? `⚠ ${r.negativeCount}명이 오류를 지적함`
      : `✓ ${r.investorCount}명이 경작(추천)함`;
    const evidenceStr = r.evidence.length > 0
      ? `\n  근거: ${r.evidence.slice(0, 2).join("; ")}`
      : "";
    const limitStr = r.limitations.length > 0
      ? `\n  한계: ${r.limitations.slice(0, 2).join("; ")}`
      : "";
    return `- "${r.title}": ${r.coreClaim} [${trustSignal}]${evidenceStr}${limitStr}`;
  }).join("\n");

  return `

KNOWLEDGE BASE CONTEXT (기존 집단지성):
The following relevant knowledge has been accumulated by the community. Reference it when answering, but note the trust signals:
${entries}

INSTRUCTIONS:
- If relevant, naturally reference or build upon this existing knowledge.
- If the user's question contradicts known knowledge, acknowledge both perspectives.
- If knowledge has been challenged (⚠), mention this uncertainty.
- Do NOT simply repeat the knowledge — add value with your response.`;
}
