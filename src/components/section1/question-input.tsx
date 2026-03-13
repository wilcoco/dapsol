"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, TrendingUp, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { QASetCardData, ScoreDetail } from "@/types/qa-set";
import { KnowledgeBounties } from "@/components/section1/knowledge-bounties";
import { ActivityFeed } from "@/components/section1/activity-feed";
import { MiniMap } from "@/components/section1/mini-map";

interface Section1Props {
  onNewQuestion: (question: string) => void;
  onSelectSharedQA: (qaSetId: string) => void;
  onAnswerGap?: (gapId: string, description: string) => void;
  onNavigateToMap?: () => void;
}

interface SearchState {
  results: QASetCardData[];
  total: number;
  page: number;
  totalPages: number;
  query: string;
  expandedTerms: string[];
}

interface TagItem {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export function Section1QuestionInput({ onNewQuestion, onSelectSharedQA, onAnswerGap, onNavigateToMap }: Section1Props) {
  const [question, setQuestion] = useState("");
  const [trendingQAs, setTrendingQAs] = useState<QASetCardData[]>([]);
  const [allTrendingQAs, setAllTrendingQAs] = useState<QASetCardData[]>([]);
  const [popularTags, setPopularTags] = useState<TagItem[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [relevanceWeight, setRelevanceWeight] = useState(70); // 0~100
  const [showFrontierToast, setShowFrontierToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 트렌딩 + 태그 로드 (마운트 시 1회)
  useEffect(() => {
    fetch("/api/qa-sets?shared=true&sort=trending&limit=20")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          const qas = d.qaSets ?? [];
          setAllTrendingQAs(qas);
          setTrendingQAs(qas.slice(0, 10));
        }
      })
      .catch(() => {});
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setPopularTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // 태그 필터 적용
  useEffect(() => {
    if (!activeTag) {
      setTrendingQAs(allTrendingQAs.slice(0, 10));
    } else {
      const filtered = allTrendingQAs.filter((qa) =>
        qa.tags?.some(({ tag }) => (tag as any).slug === activeTag || tag.name === activeTag)
      );
      setTrendingQAs(filtered);
    }
  }, [activeTag, allTrendingQAs]);

  // 신 개척지 토스트: mount 후 fade-in, 2초 후 fade-out
  const triggerFrontierToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowFrontierToast(true);
    // 다음 프레임에 visible 처리 (transition 트리거)
    requestAnimationFrame(() => requestAnimationFrame(() => setToastVisible(true)));
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setShowFrontierToast(false), 400); // fade-out 후 unmount
    }, 2000);
  };

  // 지식 검색 — 기존 QA 검색
  const handleSearchPioneers = async (page = 1) => {
    if (!question.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const rw = (relevanceWeight / 100).toFixed(2);
      const res = await fetch(
        `/api/qa-sets/search?q=${encodeURIComponent(question.trim())}&page=${page}&limit=10&relevanceWeight=${rw}`
      );
      if (res.ok) {
        const data = await res.json();
        const results = data.results ?? [];
        setSearch({
          results,
          total: data.total ?? 0,
          page: data.page ?? 1,
          totalPages: data.totalPages ?? 0,
          query: question.trim(),
          expandedTerms: data.expandedTerms ?? [],
        });
        // 결과 없을 때만 신 개척지 토스트
        if (results.length === 0) triggerFrontierToast();
      }
    } catch {
      // silently fail
    } finally {
      setIsSearching(false);
    }
  };

  // AI에게 직접 묻기
  const handleAskAI = async () => {
    if (!question.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onNewQuestion(question.trim());
    setQuestion("");
    setSearch(null);
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearchPioneers(1);
    }
  };

  // 검색 결과 페이지 이동
  const handlePage = (p: number) => {
    if (!search) return;
    handleSearchPioneers(p);
    // 스크롤 상단
    window.scrollTo({ top: 0 });
  };

  const handleBountyClick = (gapDescription: string) => {
    setQuestion(gapDescription);
    inputRef.current?.focus();
  };

  const showTrending = !search;

  return (
    <div className="flex flex-col h-full overflow-hidden relative pb-14 md:pb-0">

      {/* ── 입력창 ── */}
      <div className={`shrink-0 border-b bg-muted/20 transition-all duration-300 ${search ? "px-6 py-4" : "px-6 py-10"}`}>
        <div className="max-w-2xl mx-auto space-y-4">

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
            <Input
              ref={inputRef}
              placeholder="궁금한 것을 입력하세요..."
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (search && e.target.value.trim() !== search.query) setSearch(null);
              }}
              onKeyDown={handleKeyDown}
              className="text-lg h-14 pl-12 pr-4 rounded-2xl shadow-sm border-2 focus-visible:ring-0 focus-visible:border-primary"
              disabled={isSubmitting}
            />
          </div>

          {/* 버튼 2개: 같은 크기 */}
          <div className="flex gap-2.5">
            <Button
              onClick={() => handleSearchPioneers(1)}
              disabled={!question.trim() || isSearching}
              variant="outline"
              className="flex-1 h-12 rounded-xl gap-2 text-sm font-medium"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>🔍</span>
              )}
              지식 검색
            </Button>
            <Button
              onClick={handleAskAI}
              disabled={!question.trim() || isSubmitting}
              className="flex-1 h-12 rounded-xl gap-2 text-sm font-medium"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "✨"}
              AI에게 묻기
            </Button>
          </div>

          {/* 관련성 가중치 슬라이더 */}
          <div className="flex items-center gap-3 px-2">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">🌾 경작순</span>
            <input
              type="range"
              min={0}
              max={100}
              value={relevanceWeight}
              onChange={(e) => setRelevanceWeight(parseInt(e.target.value))}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
              title={`관련성 ${relevanceWeight}% / 경작 ${100 - relevanceWeight}%`}
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">🎯 관련성순</span>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums w-8 text-right">{relevanceWeight}%</span>
          </div>
        </div>
      </div>

      {/* ── 결과 영역 ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5">

          {/* ── 검색 결과 ── */}
          {search && (
            <div>
              {/* 결과 헤더 */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      &ldquo;{search.query}&rdquo;
                    </span>{" "}
                    검색 결과{" "}
                    <span className="font-medium text-foreground">{search.total}건</span>
                    {search.totalPages > 1 && (
                      <span> · {search.page}/{search.totalPages} 페이지</span>
                    )}
                  </p>
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setSearch(null); inputRef.current?.focus(); }}
                >
                  ✕ 초기화
                </button>
              </div>

              {/* 확장 쿼리 표시 */}
              {search.expandedTerms.length > 0 && (
                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/70">AI 확장:</span>
                  {search.expandedTerms.slice(0, 8).map((term, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                    >
                      +{term}
                    </span>
                  ))}
                  {search.expandedTerms.length > 8 && (
                    <span className="text-[10px] text-muted-foreground/50">
                      +{search.expandedTerms.length - 8}
                    </span>
                  )}
                </div>
              )}

              {search.results.length > 0 ? (
                <>
                  {/* 결과 리스트 */}
                  <div className="divide-y divide-border/50">
                    {search.results.map((qa, i) => (
                      <SearchResultItem
                        key={qa.id}
                        qa={qa}
                        index={i}
                        onClick={() => onSelectSharedQA(qa.id)}
                        relevanceWeight={relevanceWeight}
                      />
                    ))}
                  </div>

                  {/* 페이지네이션 */}
                  {search.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={search.page <= 1}
                        onClick={() => handlePage(search.page - 1)}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        이전
                      </Button>

                      {/* 페이지 번호 */}
                      <div className="flex gap-1">
                        {Array.from({ length: search.totalPages }, (_, i) => i + 1)
                          .filter((p) =>
                            p === 1 ||
                            p === search.totalPages ||
                            Math.abs(p - search.page) <= 1
                          )
                          .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                            if (idx > 0 && (arr[idx - 1] as number) + 1 < p) acc.push("...");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, idx) =>
                            p === "..." ? (
                              <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm self-center">…</span>
                            ) : (
                              <Button
                                key={p}
                                variant={p === search.page ? "default" : "outline"}
                                size="sm"
                                className="w-8 h-8 p-0 text-xs"
                                onClick={() => handlePage(p as number)}
                              >
                                {p}
                              </Button>
                            )
                          )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={search.page >= search.totalPages}
                        onClick={() => handlePage(search.page + 1)}
                        className="gap-1"
                      >
                        다음
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                /* 결과 없음 */
                <div className="text-center py-12 space-y-3">
                  <div className="text-5xl">🗺️</div>
                  <p className="font-semibold text-lg">
                    &ldquo;{search.query}&rdquo; — 아직 아무도 없습니다
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    이 주제의 첫 번째 Q&A를 만들어보세요.<br />
                    지금 AI에게 물어 Q&A를 만들면 선점 효과를 누릴 수 있습니다.
                  </p>
                </div>
              )}

              {/* AI에게 묻기는 상단 버튼으로 이동 */}
            </div>
          )}

          {/* ── 트렌딩 (검색 전 기본 화면) ── */}
          {showTrending && (
            <div>
              <ActivityFeed onSelectQASet={onSelectSharedQA} />
              <MiniMap onNavigateToMap={onNavigateToMap} />
              <KnowledgeBounties onStartQuestion={handleBountyClick} onAnswerGap={onAnswerGap} />
              {/* 태그 필터 pill */}
              {popularTags.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-muted-foreground shrink-0">🏷️ 태그:</span>
                  <button
                    onClick={() => setActiveTag(null)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      activeTag === null
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    전체
                  </button>
                  {popularTags.slice(0, 8).map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        activeTag === tag.name
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {tag.name}
                      <span className="ml-1 opacity-60">{tag.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {trendingQAs.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold">인기 Q&A</h3>
                    <span className="text-xs text-muted-foreground">
                      {activeTag ? `"${activeTag}" 태그` : "커뮤니티가 만든 지식"}
                    </span>
                    {activeTag && (
                      <button
                        onClick={() => setActiveTag(null)}
                        className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                      >
                        ✕ 필터 해제
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-border/50">
                    {trendingQAs.map((qa, i) => (
                      <SearchResultItem
                        key={qa.id}
                        qa={qa}
                        index={i}
                        onClick={() => onSelectSharedQA(qa.id)}
                      />
                    ))}
                  </div>
                </>
              ) : activeTag ? (
                <div className="text-center py-10 text-muted-foreground space-y-2">
                  <div className="text-4xl">🏷️</div>
                  <p className="font-medium">"{activeTag}" 태그가 달린 Q&A가 없습니다</p>
                  <button onClick={() => setActiveTag(null)} className="text-xs text-primary hover:underline">
                    전체 보기
                  </button>
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground space-y-4">
                  <div className="text-5xl">💬</div>
                  <p className="font-medium text-base">궁금한 것을 검색해보세요</p>
                  <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto leading-relaxed">
                    이미 공유된 Q&A가 있다면 바로 활용하고,<br />
                    없다면 AI에게 물어 새 지식을 쌓으세요.
                  </p>
                  {/* Example question chips for cold start */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto pt-2">
                    {["효과적인 코드 리뷰 방법", "마케팅 전략 수립", "팀 회고 진행법", "데이터 분석 기초", "프로젝트 관리 팁"].map((example) => (
                      <button
                        key={example}
                        onClick={() => { setQuestion(example); inputRef.current?.focus(); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── 신 개척지 토스트 ── */}
      {showFrontierToast && (
        <div
          className={`
            pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 z-50
            transition-all duration-400 ease-out
            ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
        >
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl shadow-2xl px-6 py-4 max-w-sm w-[calc(100vw-3rem)]">
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🚀</span>
              <div className="space-y-0.5">
                <p className="font-bold text-base leading-tight">신 개척지 발견!</p>
                <p className="text-sm text-white/90 leading-snug">
                  아직 아무도 답하지 않은 영역입니다.<br />
                  지금 Q&A를 만들면 <span className="font-semibold underline decoration-dotted">선점 효과</span>로
                  이후 경작자 보상을 받을 수 있습니다.
                </p>
              </div>
            </div>
            {/* 2초 진행바 */}
            <div className="mt-3 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  animation: toastVisible ? "shrink 2s linear forwards" : "none",
                }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}

// ── 구글 스타일 검색 결과 아이템 ──
function SearchResultItem({
  qa,
  index,
  onClick,
  relevanceWeight,
}: {
  qa: QASetCardData;
  index: number;
  onClick: () => void;
  relevanceWeight?: number;
}) {
  const firstAnswer = qa.messages?.[0]?.content ?? qa.summary ?? null;
  const score = qa.scoreDetail;

  return (
    <div
      className="group py-4 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors"
      onClick={onClick}
    >
      {/* 메타 */}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-primary">Q</span>
        </div>
        <span className="text-xs text-green-700 dark:text-green-400 truncate">
          {qa.creator?.name ?? "익명"}
          {qa.tags && qa.tags.length > 0 && (
            <> · {qa.tags.slice(0, 2).map(({ tag }) => tag.name).join(" · ")}</>
          )}
        </span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0 flex items-center gap-2.5">
          <span title="경작 포인트">🌾 {qa.totalInvested}</span>
          <span title="경작한 사람">{qa.investorCount}명 경작</span>
        </span>
      </div>

      {/* 질문 제목 (전체) */}
      <h4 className="text-[15px] font-medium text-primary group-hover:underline leading-snug mb-1.5 flex items-start gap-1">
        <span className="flex-1">{qa.title ?? "제목 없음"}</span>
        <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
      </h4>

      {/* 창작자 의견 */}
      {qa.summary && (
        <p className="text-sm text-amber-700 dark:text-amber-400 line-clamp-2 leading-relaxed mb-0.5">
          💬 {qa.summary}
        </p>
      )}

      {/* 답변 미리보기 (4줄) */}
      {firstAnswer && (
        <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
          {firstAnswer}
        </p>
      )}

      {/* 점수 상세 (검색 결과에서만 표시) */}
      {score && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums" title="종합 점수">
            📊 {score.total}점
          </span>
          <span className="flex items-center gap-1" title={`관련성 점수 (가중치 ${relevanceWeight ?? 70}%)`}>
            🎯 관련성 {score.relevance}
            <span className="text-muted-foreground/50">
              ({score.text > 0 ? `텍스트${score.text}` : ""}{score.text > 0 && score.vector > 0 ? "+" : ""}{score.vector > 0 ? `벡터${score.vector}` : ""})
            </span>
          </span>
          <span title={`경작 점수 (가중치 ${100 - (relevanceWeight ?? 70)}%)`}>
            🌾 경작 {score.invest}
          </span>
        </div>
      )}

      {/* 태그 */}
      {qa.tags && qa.tags.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {qa.tags.slice(0, 4).map(({ tag }) => (
            <Badge key={tag.name} variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-normal">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
