import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { expandQuery } from "@/lib/search/query-expander";
import { generateEmbedding, cosineSimilarity } from "@/lib/search/embedding";
import { calculateHybridScore, countTextMatches } from "@/lib/search/scoring";

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

  // ── 1. 기본 토큰 준비 ──
  const baseTokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const baseSearchTerms = Array.from(new Set([q, ...baseTokens]));

  const baseTermConditions = baseSearchTerms.flatMap((term) => [
    { title: { contains: term } },
    { summary: { contains: term } },
    { searchKeywords: { contains: term } },
    { messages: { some: { content: { contains: term } } } },
  ]);

  // ── 2. 기본 텍스트 검색 + AI 확장 + 벡터 준비 모두 동시 시작 ──
  const [baseTextResults, expansionResult, vectorCandidates, queryEmbedding] =
    await Promise.all([
      // 2a. 기본 토큰으로 텍스트 검색 (즉시 시작 — AI 안 기다림)
      prisma.qASet.findMany({
        where: { isShared: true, OR: baseTermConditions },
        take: 100,
        include: qaSetInclude,
      }),

      // 2b. AI 쿼리 확장 (1~3초 걸림, 병렬)
      expandQuery(q),

      // 2c. 임베딩 있는 QASet 조회 (벡터 검색용)
      prisma.qASet.findMany({
        where: { isShared: true, embedding: { not: null } },
        select: {
          id: true,
          embedding: true,
          title: true,
          summary: true,
          searchKeywords: true,
          totalInvested: true,
        },
      }),

      // 2d. 쿼리 임베딩 생성
      generateEmbeddingSafe(q),
    ]);

  const { expandedTerms } = expansionResult;

  // ── 3. 확장 토큰으로 추가 텍스트 검색 (확장어가 있을 때만) ──
  const baseResultIds = new Set(baseTextResults.map((r) => r.id));
  let expandedTextResults: typeof baseTextResults = [];

  if (expandedTerms.length > 0) {
    const expandedConditions = expandedTerms.flatMap((term) => [
      { title: { contains: term } },
      { summary: { contains: term } },
      { searchKeywords: { contains: term } },
      { messages: { some: { content: { contains: term } } } },
    ]);

    expandedTextResults = await prisma.qASet.findMany({
      where: {
        isShared: true,
        id: { notIn: [...baseResultIds] }, // 중복 제거
        OR: expandedConditions,
      },
      take: 50,
      include: qaSetInclude,
    });
  }

  // ── 4. 벡터 유사도 계산 ──
  const vectorScoreMap = new Map<string, number>();

  if (queryEmbedding && vectorCandidates.length > 0) {
    for (const candidate of vectorCandidates) {
      if (!candidate.embedding) continue;
      try {
        const embeddingVec = JSON.parse(candidate.embedding) as number[];
        const similarity = cosineSimilarity(queryEmbedding, embeddingVec);
        if (similarity > 0.1) {
          vectorScoreMap.set(candidate.id, similarity);
        }
      } catch {
        // 파싱 실패 무시
      }
    }
  }

  // ── 5. 후보 통합 (기본 텍스트 + 확장 텍스트 + 벡터 only) ──
  const allTextIds = new Set([
    ...baseTextResults.map((r) => r.id),
    ...expandedTextResults.map((r) => r.id),
  ]);

  const vectorOnlyIds = [...vectorScoreMap.entries()]
    .filter(([id]) => !allTextIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  let vectorOnlyResults: typeof baseTextResults = [];
  if (vectorOnlyIds.length > 0) {
    vectorOnlyResults = await prisma.qASet.findMany({
      where: { id: { in: vectorOnlyIds } },
      include: qaSetInclude,
    });
  }

  const allResults = [
    ...baseTextResults,
    ...expandedTextResults,
    ...vectorOnlyResults,
  ];

  // ── 6. 하이브리드 스코어링 ──
  const allSearchTerms = Array.from(
    new Set([...baseSearchTerms, ...expandedTerms])
  );
  const maxInvested = Math.max(1, ...allResults.map((r) => r.totalInvested));

  // 최소 점수 임계점 — 관련성이 너무 낮은 결과 제외
  const MIN_SCORE_THRESHOLD = 0.20;
  // 관련성 자체가 너무 낮은 결과도 제외 (투자 점수만으로 올라온 무관한 결과 방지)
  const MIN_RELEVANCE_THRESHOLD = 0.15;

  const scoredResults = allResults.map((result) => {
    const targetTexts = [
      result.title ?? "",
      result.summary ?? "",
      result.searchKeywords ?? "",
      ...(result.messages?.map((m) => m.content) ?? []),
    ];

    const textMatchCount = countTextMatches(allSearchTerms, targetTexts);
    const vectorSimilarity = vectorScoreMap.get(result.id) ?? 0;

    const scoreResult = calculateHybridScore({
      textMatchCount,
      totalSearchTerms: allSearchTerms.length,
      vectorSimilarity,
      totalInvested: result.totalInvested,
      maxInvested,
      relevanceWeight,
    });

    return {
      ...result,
      _score: scoreResult.finalScore,
      _relevanceScore: scoreResult.relevanceScore,
      _investScore: scoreResult.investScore,
      _textScore: scoreResult.textScore,
      _vectorScore: scoreResult.vectorScore,
    };
  });

  // ── 7. 임계점 필터 + 정렬 + 페이지네이션 ──
  const filteredResults = scoredResults.filter((r) => r._score >= MIN_SCORE_THRESHOLD && r._relevanceScore >= MIN_RELEVANCE_THRESHOLD);
  filteredResults.sort((a, b) => b._score - a._score);

  const total = filteredResults.length;
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const pagedResults = filteredResults.slice(skip, skip + limit);

  const results = pagedResults.map(({ _score, _relevanceScore, _investScore, _textScore, _vectorScore, ...rest }) => ({
    ...rest,
    scoreDetail: {
      total: Math.round(_score * 100),
      relevance: Math.round(_relevanceScore * 100),
      invest: Math.round(_investScore * 100),
      text: Math.round(_textScore * 100),
      vector: Math.round(_vectorScore * 100),
    },
  }));

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
