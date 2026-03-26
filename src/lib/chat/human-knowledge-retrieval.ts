/**
 * Human Knowledge Retrieval
 * Retrieves human-contributed knowledge (insights, opinions, human-authored answers)
 * to augment AI responses with collective human wisdom.
 *
 * This is the core of the "AI asks, humans answer → future humans benefit" flywheel.
 */

import { prisma } from "@/lib/prisma";

interface HumanKnowledgeResult {
  id: string;
  type: "insight" | "opinion" | "human_answer";
  content: string;
  context?: string;  // e.g., the question this answered
  authorName: string | null;
  authorTrustLevel: number;
  authorHubScore: number;
  relationType?: string;  // for opinions: evidence, counterargument, etc.
  similarity: number;
  // Credibility signals
  qaSetTitle?: string;
  qaSetInvestorCount?: number;
  insightReason?: string;
}

interface RetrievalOptions {
  excludeQASetId?: string;
  maxResults?: number;
  minSimilarity?: number;
  includeInsights?: boolean;
  includeOpinions?: boolean;
  includeHumanAnswers?: boolean;
}

/**
 * Find relevant human knowledge based on the current query.
 * Searches across:
 * 1. Messages marked as insights (isInsight: true)
 * 2. Human-authored answers (isHumanAuthored: true)
 * 3. User opinions (OpinionNodes with evidence/counterargument types)
 */
export async function retrieveHumanKnowledge(
  queryText: string,
  options: RetrievalOptions = {}
): Promise<HumanKnowledgeResult[]> {
  const {
    excludeQASetId,
    maxResults = 5,
    minSimilarity = 0.3,
    includeInsights = true,
    includeOpinions = true,
    includeHumanAnswers = true,
  } = options;

  const results: HumanKnowledgeResult[] = [];

  try {
    // Strategy 1: Embedding-based search
    if (process.env.OPENAI_API_KEY) {
      const embeddingResults = await searchByEmbedding(queryText, {
        excludeQASetId,
        maxResults,
        minSimilarity,
        includeInsights,
        includeOpinions,
        includeHumanAnswers,
      });
      results.push(...embeddingResults);
    }

    // Strategy 2: Keyword fallback if embedding search returned nothing
    if (results.length === 0) {
      const keywordResults = await searchByKeyword(queryText, {
        excludeQASetId,
        maxResults,
        includeInsights,
        includeOpinions,
        includeHumanAnswers,
      });
      results.push(...keywordResults);
    }

    // Sort by relevance and credibility
    results.sort((a, b) => {
      // Primary: similarity score
      const simDiff = b.similarity - a.similarity;
      if (Math.abs(simDiff) > 0.1) return simDiff;
      // Secondary: author credibility
      return (b.authorHubScore + b.authorTrustLevel) - (a.authorHubScore + a.authorTrustLevel);
    });

    return results.slice(0, maxResults);
  } catch (err) {
    console.error("[HumanKnowledge] Retrieval failed:", err);
    return [];
  }
}

async function searchByEmbedding(
  queryText: string,
  options: RetrievalOptions
): Promise<HumanKnowledgeResult[]> {
  try {
    const { generateEmbedding } = await import("@/lib/search/embedding");
    const queryEmbedding = await generateEmbedding(queryText.slice(0, 500));
    const results: HumanKnowledgeResult[] = [];

    // 1. Search QASets with insights/human-authored content
    if (options.includeInsights || options.includeHumanAnswers) {
      const qaSetsWithHumanKnowledge = await prisma.qASet.findMany({
        where: {
          isShared: true,
          embedding: { not: null },
          ...(options.excludeQASetId ? { id: { not: options.excludeQASetId } } : {}),
          messages: {
            some: {
              OR: [
                ...(options.includeInsights ? [{ isInsight: true }] : []),
                ...(options.includeHumanAnswers ? [{ isHumanAuthored: true }] : []),
              ],
            },
          },
        },
        select: {
          id: true,
          title: true,
          embedding: true,
          investorCount: true,
          messages: {
            where: {
              OR: [
                ...(options.includeInsights ? [{ isInsight: true }] : []),
                ...(options.includeHumanAnswers ? [{ isHumanAuthored: true }] : []),
              ],
            },
            select: {
              id: true,
              content: true,
              isInsight: true,
              insightReason: true,
              isHumanAuthored: true,
              authorUserId: true,
            },
          },
          creator: {
            select: { name: true, trustLevel: true, hubScore: true },
          },
        },
        take: 30, // Fetch more to filter by similarity
      });

      for (const qaSet of qaSetsWithHumanKnowledge) {
        if (!qaSet.embedding) continue;

        const emb = JSON.parse(qaSet.embedding) as number[];
        const sim = cosineSimilarity(queryEmbedding, emb);

        if (sim < (options.minSimilarity ?? 0.3)) continue;

        for (const msg of qaSet.messages) {
          // Get author info for human-authored messages
          let authorName = qaSet.creator.name;
          let authorTrustLevel = qaSet.creator.trustLevel;
          let authorHubScore = qaSet.creator.hubScore;

          if (msg.isHumanAuthored && msg.authorUserId) {
            const author = await prisma.user.findUnique({
              where: { id: msg.authorUserId },
              select: { name: true, trustLevel: true, hubScore: true },
            });
            if (author) {
              authorName = author.name;
              authorTrustLevel = author.trustLevel;
              authorHubScore = author.hubScore;
            }
          }

          results.push({
            id: msg.id,
            type: msg.isInsight ? "insight" : "human_answer",
            content: msg.content,
            authorName,
            authorTrustLevel,
            authorHubScore,
            similarity: sim,
            qaSetTitle: qaSet.title ?? undefined,
            qaSetInvestorCount: qaSet.investorCount,
            insightReason: msg.insightReason ?? undefined,
          });
        }
      }
    }

    // 2. Search OpinionNodes (evidence, counterargument, application types are most valuable)
    if (options.includeOpinions) {
      const valuableOpinionTypes = ["evidence", "counterargument", "application", "extension"];

      const opinionsWithContext = await prisma.nodeRelation.findMany({
        where: {
          sourceOpinion: { isNot: null },
          relationType: { in: valuableOpinionTypes },
          targetQASet: options.excludeQASetId
            ? { id: { not: options.excludeQASetId }, isShared: true, embedding: { not: null } }
            : { isShared: true, embedding: { not: null } },
        },
        select: {
          relationType: true,
          sourceOpinion: {
            select: {
              id: true,
              content: true,
              contentHtml: true,
              user: {
                select: { name: true, trustLevel: true, hubScore: true },
              },
            },
          },
          targetQASet: {
            select: {
              id: true,
              title: true,
              embedding: true,
              investorCount: true,
            },
          },
        },
        take: 30,
      });

      for (const rel of opinionsWithContext) {
        if (!rel.sourceOpinion || !rel.targetQASet?.embedding) continue;

        const emb = JSON.parse(rel.targetQASet.embedding) as number[];
        const sim = cosineSimilarity(queryEmbedding, emb);

        if (sim < (options.minSimilarity ?? 0.3)) continue;

        // Strip HTML if needed
        const plainContent = rel.sourceOpinion.contentHtml
          ? rel.sourceOpinion.contentHtml.replace(/<[^>]*>/g, "")
          : rel.sourceOpinion.content;

        results.push({
          id: rel.sourceOpinion.id,
          type: "opinion",
          content: plainContent.slice(0, 500),
          relationType: rel.relationType,
          authorName: rel.sourceOpinion.user.name,
          authorTrustLevel: rel.sourceOpinion.user.trustLevel,
          authorHubScore: rel.sourceOpinion.user.hubScore,
          similarity: sim,
          qaSetTitle: rel.targetQASet.title ?? undefined,
          qaSetInvestorCount: rel.targetQASet.investorCount,
          context: `의견: ${getRelationLabel(rel.relationType)}`,
        });
      }
    }

    return results;
  } catch (err) {
    console.error("[HumanKnowledge] Embedding search failed:", err);
    return [];
  }
}

async function searchByKeyword(
  queryText: string,
  options: RetrievalOptions
): Promise<HumanKnowledgeResult[]> {
  const keywords = queryText
    .replace(/[^\w\s가-힣]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  const results: HumanKnowledgeResult[] = [];

  // Search insights and human answers
  if (options.includeInsights || options.includeHumanAnswers) {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          ...(options.includeInsights ? [{ isInsight: true }] : []),
          ...(options.includeHumanAnswers ? [{ isHumanAuthored: true }] : []),
        ],
        qaSet: {
          isShared: true,
          ...(options.excludeQASetId ? { id: { not: options.excludeQASetId } } : {}),
        },
        content: {
          contains: keywords[0], // At least match first keyword
        },
      },
      select: {
        id: true,
        content: true,
        isInsight: true,
        insightReason: true,
        isHumanAuthored: true,
        authorUserId: true,
        qaSet: {
          select: {
            title: true,
            investorCount: true,
            creator: {
              select: { name: true, trustLevel: true, hubScore: true },
            },
          },
        },
      },
      take: options.maxResults ?? 5,
    });

    for (const msg of messages) {
      let authorName = msg.qaSet.creator.name;
      let authorTrustLevel = msg.qaSet.creator.trustLevel;
      let authorHubScore = msg.qaSet.creator.hubScore;

      if (msg.isHumanAuthored && msg.authorUserId) {
        const author = await prisma.user.findUnique({
          where: { id: msg.authorUserId },
          select: { name: true, trustLevel: true, hubScore: true },
        });
        if (author) {
          authorName = author.name;
          authorTrustLevel = author.trustLevel;
          authorHubScore = author.hubScore;
        }
      }

      results.push({
        id: msg.id,
        type: msg.isInsight ? "insight" : "human_answer",
        content: msg.content,
        authorName,
        authorTrustLevel,
        authorHubScore,
        similarity: 0.5, // Keyword match baseline
        qaSetTitle: msg.qaSet.title ?? undefined,
        qaSetInvestorCount: msg.qaSet.investorCount,
        insightReason: msg.insightReason ?? undefined,
      });
    }
  }

  // Search opinions
  if (options.includeOpinions) {
    const opinions = await prisma.opinionNode.findMany({
      where: {
        content: { contains: keywords[0] },
        relationsAsSource: {
          some: {
            relationType: { in: ["evidence", "counterargument", "application", "extension"] },
          },
        },
      },
      select: {
        id: true,
        content: true,
        user: {
          select: { name: true, trustLevel: true, hubScore: true },
        },
        relationsAsSource: {
          where: { relationType: { in: ["evidence", "counterargument", "application", "extension"] } },
          select: { relationType: true },
          take: 1,
        },
      },
      take: options.maxResults ?? 5,
    });

    for (const opinion of opinions) {
      results.push({
        id: opinion.id,
        type: "opinion",
        content: opinion.content.slice(0, 500),
        relationType: opinion.relationsAsSource[0]?.relationType,
        authorName: opinion.user.name,
        authorTrustLevel: opinion.user.trustLevel,
        authorHubScore: opinion.user.hubScore,
        similarity: 0.5,
        context: `의견: ${getRelationLabel(opinion.relationsAsSource[0]?.relationType)}`,
      });
    }
  }

  return results;
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

function getRelationLabel(relationType?: string): string {
  const labels: Record<string, string> = {
    evidence: "근거 보충",
    counterargument: "반박",
    application: "경험 공유",
    extension: "추가 정보",
    question: "질문",
  };
  return labels[relationType ?? ""] ?? relationType ?? "";
}

function getTrustBadge(trustLevel: number, hubScore: number): string {
  if (trustLevel >= 4 || hubScore >= 2.0) return "🏅";
  if (trustLevel >= 3 || hubScore >= 1.5) return "⭐";
  if (trustLevel >= 2 || hubScore >= 1.2) return "✓";
  return "";
}

/**
 * Format human knowledge results into a system prompt section
 */
export function formatHumanKnowledgeContext(results: HumanKnowledgeResult[]): string {
  if (results.length === 0) return "";

  const entries = results.map((r) => {
    const badge = getTrustBadge(r.authorTrustLevel, r.authorHubScore);
    const author = r.authorName ? `${badge}${r.authorName}` : "익명 사용자";
    const typeLabel = r.type === "insight"
      ? "💡 통찰"
      : r.type === "human_answer"
        ? "✍️ 인간 답변"
        : `💬 ${r.context ?? "의견"}`;

    const investorSignal = r.qaSetInvestorCount && r.qaSetInvestorCount > 0
      ? ` (${r.qaSetInvestorCount}명 투자)`
      : "";

    const reason = r.insightReason ? ` [${r.insightReason}]` : "";

    return `- [${typeLabel}] ${author}${investorSignal}: "${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}"${reason}`;
  }).join("\n");

  return `

HUMAN KNOWLEDGE CONTEXT (인간 지혜):
The following human-contributed knowledge is relevant to this conversation. These are real experiences and insights from the community:
${entries}

INSTRUCTIONS FOR HUMAN KNOWLEDGE:
- Naturally incorporate these human perspectives when relevant to your answer.
- Cite human contributors when using their insights: "한 사용자의 경험에 따르면..." or "커뮤니티에서는..."
- Human experiences often contain tacit knowledge that AI cannot derive from data alone.
- If human knowledge contradicts your general knowledge, acknowledge both and explain the nuance.
- Do NOT simply repeat human knowledge — synthesize it with your understanding.`;
}

/**
 * Track when human knowledge is cited in an AI response
 * (For future: notify authors when their contribution helps others)
 */
export async function trackCitation(
  humanKnowledgeId: string,
  type: "insight" | "opinion" | "human_answer",
  responseQASetId: string
): Promise<void> {
  try {
    // For now, just log. Later: create notification + track "N명에게 도움됨"
    console.log(`[HumanKnowledge] Cited ${type} ${humanKnowledgeId} in ${responseQASetId}`);

    // TODO: Implement citation tracking
    // 1. Create a Citation model to track usage
    // 2. Update author's contribution stats
    // 3. Send notification: "당신의 답변이 N명에게 도움이 되었습니다"
  } catch (err) {
    console.error("[HumanKnowledge] Citation tracking failed:", err);
  }
}
