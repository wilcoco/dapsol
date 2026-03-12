import Anthropic from "@anthropic-ai/sdk";

/**
 * AI를 이용한 검색 쿼리 확장
 * 원본 검색어에서 한국어+영어 동의어/관련어를 생성
 */
export async function expandQuery(query: string): Promise<{
  expandedTerms: string[];
  expandedQuery: string;
}> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { expandedTerms: [], expandedQuery: query };
    }

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `검색어: "${query}"

이 검색어의 동의어, 관련어, 영어/한국어 번역을 생성하세요.
규칙:
- 한국어 키워드 3~5개 + 영어 키워드 3~5개
- 원본 검색어는 포함하지 마세요
- 쉼표로만 구분된 키워드 목록만 출력 (설명 없이)
- 너무 일반적인 단어는 제외 (예: "것", "the", "is")`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    if (!text) {
      return { expandedTerms: [], expandedQuery: query };
    }

    const expandedTerms = text
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t !== query);

    const expandedQuery = [query, ...expandedTerms].join(" ");

    return { expandedTerms, expandedQuery };
  } catch (error) {
    // graceful degradation: AI 실패 시 원본 쿼리만 사용
    console.error("Query expansion failed:", error);
    return { expandedTerms: [], expandedQuery: query };
  }
}
