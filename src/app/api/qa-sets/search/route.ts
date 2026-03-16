import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { expandQuery } from "@/lib/search/query-expander";
import {
  generateEmbedding,
  vectorSearch,
  tsvectorSearch,
} from "@/lib/search/embedding";

// Prisma include 공통 정의
const qaSetInclude = {
  creator: { select: { id: true, name: true, image: true } },
  tags: { include: { tag: { select: { name: true, slug: true } } } },
  _count: { select: { messages: true } },
  messages: {
    where: { role: "assistant" as const },
    orderBy: { orderIndex: "asc" as const },
    take: 1,
    select: { content: true, role: true },
  },
};

// GET /api/qa-sets/search?q=query&page=1&limit=10&relevanceWeight=0.7
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "10"));
  const relevanceWeight = Math.max(
    0,
    Math.min(1, parseFloat(searchParams.get("relevanceWeight") ?? "0.7"))
  );

  if (!query || query.trim().length < 2) {
    return NextResponse.json({
      results: [],
      total: 0,
      page,
      totalPages: 0,
      expandedTerms: [],
    });
  }

  const q = query.trim();

  // ── 1. Generate query embedding + run parallel searches ──
  // We need the embedding first for vectorSearch, but we can start tsvector and expansion in parallel
  const [queryEmbedding, tsvectorResults, expansionResult] = await Promise.all([
    generateEmbeddingSafe(q),
    tsvectorSearch(q, 200),
    expandQuery(q),
  ]);

  const { expandedTerms } = expansionResult;

  // ── 2. Run vector search (needs embedding from step 1) ──
  let vectorResults: Array<{ id: string; similarity: number }> = [];
  if (queryEmbedding) {
    vectorResults = await vectorSearch(prisma, queryEmbedding, {
      limit: 50,
      minSimilarity: 0.3,
    });
  }

  // ── 3. Merge + deduplicate candidate IDs ──
  const tsvectorScoreMap = new Map<string, number>();
  for (const r of tsvectorResults) {
    tsvectorScoreMap.set(r.id, r.rank);
  }

  const vectorScoreMap = new Map<string, number>();
  for (const r of vectorResults) {
    vectorScoreMap.set(r.id, r.similarity);
  }

  const allCandidateIds = new Set<string>([
    ...tsvectorScoreMap.keys(),
    ...vectorScoreMap.keys(),
  ]);

  if (allCandidateIds.size === 0) {
    // ── Fallback: if both tsvector and pgvector returned nothing, try basic text search ──
    return await fallbackTextSearch(q, expandedTerms, page, limit, relevanceWeight, queryEmbedding);
  }

  // ── 4. Fetch full QASet objects for all candidates (single query) ──
  const candidateIdArray = [...allCandidateIds];
  const candidates = await prisma.qASet.findMany({
    where: { id: { in: candidateIdArray } },
    include: qaSetInclude,
  });

  // ── 5. Compute final hybrid scores ──
  // Normalize tsvector ranks to 0-1 range
  const maxTsvectorRank = Math.max(0.001, ...tsvectorScoreMap.values());
  const maxInvested = Math.max(1, ...candidates.map((r) => r.totalInvested));

  const MIN_SCORE_THRESHOLD = 0.15;

  const scoredResults = candidates.map((result) => {
    const rawTsvectorRank = tsvectorScoreMap.get(result.id) ?? 0;
    const tsvectorScore = rawTsvectorRank / maxTsvectorRank; // normalized 0-1
    const vectorSimilarity = vectorScoreMap.get(result.id) ?? 0;

    // Investment score (log-scaled)
    const investScore =
      maxInvested > 0
        ? Math.log1p(result.totalInvested) / Math.log1p(maxInvested)
        : 0;

    // Relevance = weighted combination of tsvector and vector similarity
    // If only one source found this result, use what we have
    const hasTsvector = rawTsvectorRank > 0;
    const hasVector = vectorSimilarity > 0;

    let relevanceScore: number;
    if (hasTsvector && hasVector) {
      relevanceScore = 0.3 * tsvectorScore + 0.7 * vectorSimilarity;
    } else if (hasVector) {
      relevanceScore = vectorSimilarity;
    } else {
      relevanceScore = tsvectorScore;
    }

    // Final score: relevance vs investment weighted by user preference
    const finalScore =
      relevanceWeight * relevanceScore + (1 - relevanceWeight) * investScore;

    return {
      ...result,
      _score: finalScore,
      _relevanceScore: relevanceScore,
      _investScore: investScore,
      _textScore: tsvectorScore,
      _vectorScore: vectorSimilarity,
    };
  });

  // ── 6. Filter + sort + paginate ──
  const filteredResults = scoredResults.filter(
    (r) => r._score >= MIN_SCORE_THRESHOLD
  );
  filteredResults.sort((a, b) => b._score - a._score);

  const total = filteredResults.length;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const pagedResults = filteredResults.slice(skip, skip + limit);

  const results = pagedResults.map(
    ({ _score, _relevanceScore, _investScore, _textScore, _vectorScore, ...rest }) => ({
      ...rest,
      scoreDetail: {
        total: Math.round(_score * 100),
        relevance: Math.round(_relevanceScore * 100),
        invest: Math.round(_investScore * 100),
        text: Math.round(_textScore * 100),
        vector: Math.round(_vectorScore * 100),
      },
    })
  );

  return NextResponse.json({
    results,
    total,
    page,
    totalPages,
    expandedTerms,
    relevanceWeight: Math.round(relevanceWeight * 100),
  });
}

/**
 * Fallback text search when tsvector/pgvector are not available or return no results.
 * Uses Prisma `contains` queries (like the old implementation).
 */
async function fallbackTextSearch(
  query: string,
  expandedTerms: string[],
  page: number,
  limit: number,
  relevanceWeight: number,
  queryEmbedding: number[] | null
) {
  const baseTokens = query.split(/\s+/).filter((t) => t.length >= 2);
  const allTerms = Array.from(new Set([query, ...baseTokens, ...expandedTerms]));

  const termConditions = allTerms.flatMap((term) => [
    { title: { contains: term } },
    { summary: { contains: term } },
    { searchKeywords: { contains: term } },
  ]);

  if (termConditions.length === 0) {
    return NextResponse.json({
      results: [],
      total: 0,
      page,
      totalPages: 0,
      expandedTerms,
    });
  }

  const textResults = await prisma.qASet.findMany({
    where: { isShared: true, OR: termConditions },
    take: 100,
    include: qaSetInclude,
  });

  // Simple scoring for fallback
  const maxInvested = Math.max(1, ...textResults.map((r) => r.totalInvested));
  const baseTokensLower = allTerms.map((t) => t.toLowerCase());

  const scored = textResults.map((result) => {
    const texts = [
      result.title ?? "",
      result.summary ?? "",
      result.searchKeywords ?? "",
    ]
      .join(" ")
      .toLowerCase();

    let matchCount = 0;
    for (const term of baseTokensLower) {
      if (texts.includes(term)) matchCount++;
    }
    const textScore = baseTokensLower.length > 0 ? matchCount / baseTokensLower.length : 0;
    const investScore =
      maxInvested > 0
        ? Math.log1p(result.totalInvested) / Math.log1p(maxInvested)
        : 0;
    const finalScore = relevanceWeight * textScore + (1 - relevanceWeight) * investScore;

    return {
      ...result,
      _score: finalScore,
      _relevanceScore: textScore,
      _investScore: investScore,
      _textScore: textScore,
      _vectorScore: 0,
    };
  });

  scored.sort((a, b) => b._score - a._score);

  const total = scored.length;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const pagedResults = scored.slice(skip, skip + limit);

  const results = pagedResults.map(
    ({ _score, _relevanceScore, _investScore, _textScore, _vectorScore, ...rest }) => ({
      ...rest,
      scoreDetail: {
        total: Math.round(_score * 100),
        relevance: Math.round(_relevanceScore * 100),
        invest: Math.round(_investScore * 100),
        text: Math.round(_textScore * 100),
        vector: Math.round(_vectorScore * 100),
      },
    })
  );

  return NextResponse.json({
    results,
    total,
    page,
    totalPages,
    expandedTerms,
    relevanceWeight: Math.round(relevanceWeight * 100),
  });
}

/**
 * 임베딩 생성 (실패 시 null 반환, 검색은 텍스트만으로 계속)
 */
async function generateEmbeddingSafe(
  text: string
): Promise<number[] | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    return await generateEmbedding(text);
  } catch (error) {
    console.error("Query embedding generation failed:", error);
    return null;
  }
}
