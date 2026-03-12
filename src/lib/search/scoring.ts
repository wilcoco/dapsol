/**
 * 하이브리드 검색 점수 계산
 *
 * 세 가지 요소를 결합:
 * 1. 텍스트 매칭 점수 (토큰 매칭률)
 * 2. 벡터 유사도 점수 (코사인 유사도)
 * 3. 투자 점수 (총 투자액 기반)
 *
 * 관련성 가중치(relevanceWeight)로 관련성 vs 투자 비율 조절
 */

export interface HybridScoreParams {
  textMatchCount: number;     // 매칭된 검색 토큰 수
  totalSearchTerms: number;   // 전체 검색 토큰 수
  vectorSimilarity: number;   // 코사인 유사도 (0~1)
  totalInvested: number;      // Q&A의 총 투자액
  maxInvested: number;        // 결과 중 최대 투자액 (정규화용)
  relevanceWeight: number;    // 관련성 가중치 (0~1, UI 슬라이더)
}

export interface HybridScoreResult {
  finalScore: number;
  relevanceScore: number;
  investScore: number;
  textScore: number;
  vectorScore: number;
}

export function calculateHybridScore(params: HybridScoreParams): HybridScoreResult {
  const {
    textMatchCount,
    totalSearchTerms,
    vectorSimilarity,
    totalInvested,
    maxInvested,
    relevanceWeight,
  } = params;

  // 1. 텍스트 매칭 점수 (0~1)
  const textScore =
    totalSearchTerms > 0 ? Math.min(1, textMatchCount / totalSearchTerms) : 0;

  // 2. 벡터 유사도 점수 (0~1)
  const vectorScore = Math.max(0, Math.min(1, vectorSimilarity));

  // 3. 관련성 복합 점수: 텍스트 40% + 벡터 60%
  // 벡터가 없으면 (vectorScore === 0) 텍스트만 사용
  const hasVector = vectorScore > 0;
  const relevanceScore = hasVector
    ? 0.4 * textScore + 0.6 * vectorScore
    : textScore;

  // 4. 투자 점수 (0~1, 로그 스케일로 큰 투자 격차 완화)
  const investScore =
    maxInvested > 0
      ? Math.log1p(totalInvested) / Math.log1p(maxInvested)
      : 0;

  // 5. 최종 점수: 관련성 vs 투자 가중 평균
  const clampedWeight = Math.max(0, Math.min(1, relevanceWeight));
  const finalScore =
    clampedWeight * relevanceScore + (1 - clampedWeight) * investScore;

  return { finalScore, relevanceScore, investScore, textScore, vectorScore };
}

/**
 * 텍스트 매칭 토큰 수 계산
 * 검색 토큰이 대상 텍스트에 포함되어 있는지 확인
 */
export function countTextMatches(
  searchTerms: string[],
  targetTexts: string[]
): number {
  const lowerTargets = targetTexts.map((t) => t.toLowerCase());
  const combined = lowerTargets.join(" ");

  let matchCount = 0;
  for (const term of searchTerms) {
    if (combined.includes(term.toLowerCase())) {
      matchCount++;
    }
  }
  return matchCount;
}
