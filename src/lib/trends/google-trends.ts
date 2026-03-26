/**
 * Google Trends RSS 피드에서 트렌딩 주제 수집
 *
 * Google Trends는 공식 API가 없어서 RSS 피드를 사용합니다.
 * RSS 피드는 일간 인기 검색어를 제공합니다.
 */

export interface TrendingTopic {
  title: string;
  // traffic 정보가 있으면 추가
  approximateTraffic?: string;
}

/**
 * Google Trends RSS에서 트렌딩 주제를 가져옵니다.
 * @param geo 국가 코드 (기본값: KR)
 * @returns 트렌딩 주제 배열
 */
export async function fetchTrendingTopics(geo: string = "KR"): Promise<TrendingTopic[]> {
  const TRENDS_RSS = `https://trends.google.com/trending/rss?geo=${geo}`;

  try {
    const response = await fetch(TRENDS_RSS, {
      next: { revalidate: 3600 }, // 1시간 캐시
    });

    if (!response.ok) {
      console.error(`Google Trends RSS fetch failed: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // XML에서 <title> 태그 추출 (간단한 파싱)
    const titleMatches = xml.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g);

    if (!titleMatches) {
      // CDATA가 없는 경우
      const simpleTitles = xml.match(/<title>([^<]+)<\/title>/g);
      if (!simpleTitles) return [];

      return simpleTitles
        .map(t => t.replace(/<\/?title>/g, "").trim())
        .filter(t => t && t !== "Daily Search Trends" && t !== "Google 트렌드")
        .map(title => ({ title }));
    }

    return titleMatches
      .map(t => t.replace(/<title><!\[CDATA\[/, "").replace(/\]\]><\/title>/, "").trim())
      .filter(t => t && t !== "Daily Search Trends" && t !== "Google 트렌드")
      .map(title => ({ title }));

  } catch (error) {
    console.error("Failed to fetch Google Trends:", error);
    return [];
  }
}

/**
 * 트렌드 주제가 "경험담 기반 질문"에 적합한지 필터링합니다.
 *
 * 제외 대상:
 * - 단순 제품 출시 (예: 아이폰16 출시)
 * - 스포츠 경기 결과
 * - 연예인 뉴스
 * - 날씨/재난
 *
 * 적합 대상:
 * - 커리어/직장 관련
 * - 창업/비즈니스
 * - 라이프스타일 변화
 * - 기술/개발 트렌드
 */
export function filterExperienceTopics(topics: TrendingTopic[]): TrendingTopic[] {
  // 제외 키워드
  const EXCLUDE_PATTERNS = [
    /경기.*결과/,
    /vs\s/i,
    /출시일/,
    /예고편/,
    /트레일러/,
    /날씨/,
    /지진/,
    /태풍/,
    /스코어/,
    /승리/,
    /패배/,
  ];

  // 포함 우선 키워드 (경험담 가능성 높음)
  const INCLUDE_PATTERNS = [
    /창업/,
    /이직/,
    /퇴사/,
    /투자/,
    /재테크/,
    /부업/,
    /프리랜서/,
    /개발자/,
    /커리어/,
    /번아웃/,
    /워라밸/,
    /육아/,
    /결혼/,
    /이혼/,
    /자취/,
    /독립/,
  ];

  return topics.filter(topic => {
    const title = topic.title;

    // 제외 패턴에 해당하면 제외
    if (EXCLUDE_PATTERNS.some(p => p.test(title))) {
      return false;
    }

    // 포함 패턴에 해당하면 우선 포함
    if (INCLUDE_PATTERNS.some(p => p.test(title))) {
      return true;
    }

    // 그 외는 일단 포함 (AI가 질문 생성 시 판단)
    return true;
  });
}

/**
 * 트렌드 수집 + 필터링 + 결과 반환
 */
export async function getFilteredTrends(geo: string = "KR", limit: number = 20): Promise<string[]> {
  const topics = await fetchTrendingTopics(geo);
  const filtered = filterExperienceTopics(topics);
  return filtered.slice(0, limit).map(t => t.title);
}
