"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, TrendingUp, ExternalLink, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { QASetCardData, ScoreDetail } from "@/types/qa-set";
import { LiveActivityGraph } from "@/components/section1/live-activity-graph";
import { MyStatus } from "@/components/section1/my-status";

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

interface KnowledgeGap {
  id: string;
  gapType: string;
  description: string;
  severity: string;
  topicCluster: { id: string; name: string };
}

interface TagItem {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export function Section1QuestionInput({ onNewQuestion, onSelectSharedQA, onAnswerGap, onNavigateToMap }: Section1Props) {
  const { data: session } = useSession();
  const [question, setQuestion] = useState("");
  const [trendingQAs, setTrendingQAs] = useState<QASetCardData[]>([]);
  const [seedlingQAs, setSeedlingQAs] = useState<QASetCardData[]>([]);
  const [allTrendingQAs, setAllTrendingQAs] = useState<QASetCardData[]>([]);
  const [popularTags, setPopularTags] = useState<TagItem[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [showFrontierToast, setShowFrontierToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<KnowledgeGap[]>([]);
  const [cultivatingId, setCultivatingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all home data on mount
  useEffect(() => {
    // Trending QAs
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

    // Seedling QAs (new within 48h)
    fetch("/api/qa-sets?shared=true&sort=recent&limit=5")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          const now = Date.now();
          const h48 = 48 * 60 * 60 * 1000;
          const fresh = (d.qaSets ?? []).filter(
            (qa: any) => now - new Date(qa.createdAt).getTime() < h48
          );
          setSeedlingQAs(fresh.slice(0, 5));
        }
      })
      .catch(() => {});

    // AI questions (🤖→👤)
    fetch("/api/knowledge-gaps")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.gaps) setAiQuestions(d.gaps.slice(0, 3)); })
      .catch(() => {});

    // Tags for cluster filter
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setPopularTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // Tag filter
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

  const triggerFrontierToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowFrontierToast(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setToastVisible(true)));
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setShowFrontierToast(false), 400);
    }, 2000);
  };

  // Search
  const handleSearch = async (page = 1) => {
    if (!question.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/qa-sets/search?q=${encodeURIComponent(question.trim())}&page=${page}&limit=10`
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
        if (results.length === 0) triggerFrontierToast();
      }
    } catch {
      // silently fail
    } finally {
      setIsSearching(false);
    }
  };

  // Ask AI
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
      handleSearch(1);
    }
  };

  const handlePage = (p: number) => {
    if (!search) return;
    handleSearch(p);
    window.scrollTo({ top: 0 });
  };

  // Inline quick cultivate (10 points)
  const handleQuickCultivate = useCallback(async (e: React.MouseEvent, qaSetId: string) => {
    e.stopPropagation();
    if (!session?.user?.id || cultivatingId) return;
    setCultivatingId(qaSetId);
    try {
      const res = await fetch(`/api/qa-sets/${qaSetId}/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10, isNegative: false }),
      });
      if (res.ok) {
        const updateQA = (prev: QASetCardData[]) =>
          prev.map((qa) =>
            qa.id === qaSetId ? { ...qa, totalInvested: qa.totalInvested + 10 } : qa
          );
        setTrendingQAs(updateQA);
        setAllTrendingQAs(updateQA);
        setSeedlingQAs(updateQA);
      }
    } catch {
      // ignore
    } finally {
      setCultivatingId(null);
    }
  }, [session?.user?.id, cultivatingId]);

  const showTrending = !search;

  // Helper: check if investments are active (recent + high activity)
  const hasRecentActivity = (qa: QASetCardData) => {
    const diff = Date.now() - new Date(qa.createdAt).getTime();
    const isRecent = diff < 24 * 60 * 60 * 1000; // 24시간 이내
    return isRecent && qa.investorCount >= 3; // 최근 + 투자자 3명 이상
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative pb-14 md:pb-0">

      {/* ── Header: Search bar (검색 우선 — Enter로 바로 검색) ── */}
      <div className={`shrink-0 border-b bg-muted/20 transition-all duration-300 ${search ? "px-6 py-3" : "px-6 py-6"}`}>
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
            <Input
              ref={inputRef}
              placeholder="궁금한 것을 검색하세요..."
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (search && e.target.value.trim() !== search.query) setSearch(null);
              }}
              onKeyDown={handleKeyDown}
              className="text-lg h-14 pl-12 pr-28 rounded-2xl shadow-sm border-2 focus-visible:ring-0 focus-visible:border-primary"
              disabled={isSubmitting}
            />
            <Button
              onClick={() => handleSearch(1)}
              disabled={!question.trim() || isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 rounded-xl gap-1.5 text-sm px-4"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              검색
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5">

          {/* ══════ Search Results ══════ */}
          {search && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">&ldquo;{search.query}&rdquo;</span>{" "}
                  검색 결과 <span className="font-medium text-foreground">{search.total}건</span>
                  {search.totalPages > 1 && <span> · {search.page}/{search.totalPages} 페이지</span>}
                </p>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setSearch(null); inputRef.current?.focus(); }}
                >
                  ✕ 초기화
                </button>
              </div>

              {search.expandedTerms.length > 0 && (
                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/70">AI 확장:</span>
                  {search.expandedTerms.slice(0, 8).map((term, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                      +{term}
                    </span>
                  ))}
                </div>
              )}

              {search.results.length > 0 ? (
                <>
                  <div className="divide-y divide-border/50">
                    {search.results.map((qa, i) => (
                      <SearchResultItem
                        key={qa.id}
                        qa={qa}
                        index={i}
                        onClick={() => onSelectSharedQA(qa.id)}
                        onCultivate={handleQuickCultivate}
                        cultivatingId={cultivatingId}
                        isLoggedIn={!!session?.user?.id}
                        showActivityBadge={hasRecentActivity(qa)}
                      />
                    ))}
                  </div>
                  {search.totalPages > 1 && (
                    <Pagination search={search} onPage={handlePage} />
                  )}

                  {/* 검색 결과 하단: AI에게 묻기 유도 */}
                  <div className="mt-6 pt-4 border-t text-center space-y-2">
                    <p className="text-sm text-muted-foreground">원하는 답변이 없나요?</p>
                    <Button
                      onClick={handleAskAI}
                      disabled={isSubmitting}
                      variant="outline"
                      className="gap-2"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "✨"}
                      &ldquo;{search.query}&rdquo; AI에게 직접 묻기
                    </Button>
                  </div>
                </>
              ) : (
                /* 검색 결과 0건: AI 묻기 강조 */
                <div className="text-center py-10 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    &ldquo;{search.query}&rdquo;에 대한 기존 Q&A가 없습니다
                  </p>
                  <Button
                    onClick={handleAskAI}
                    disabled={isSubmitting}
                    size="lg"
                    className="gap-2 text-base"
                  >
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "✨"}
                    AI에게 직접 묻기
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    첫 번째 Q&A를 만들면 이후 투자자의 보상을 받을 수 있습니다
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════ Home Feed (Julie Zhuo layout) ══════ */}
          {showTrending && (
            <div>

              {/* ── Section 0: Live Activity Graph (노드+링크 순차 발현) ── */}
              <LiveActivityGraph
                onSelectQASet={onSelectSharedQA}
                onNavigateToMap={onNavigateToMap}
              />

              {/* ── Cluster Filter Chips ── */}
              {popularTags.length > 0 && (
                <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    onClick={() => setActiveTag(null)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
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
                      className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
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

              {/* ── 🤖→👤 전문가를 찾고 있는 질문 (Julie Zhuo: 서비스의 UNIQUE 섹션) ── */}
              {aiQuestions.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base font-bold">🤖→👤</span>
                    <span className="text-sm font-semibold">전문가를 찾고 있는 질문</span>
                    <span className="text-[10px] text-muted-foreground">경험이 있다면 기여해주세요</span>
                  </div>
                  <div className="space-y-2">
                    {aiQuestions.map((gap) => (
                      <button
                        key={gap.id}
                        onClick={() => onAnswerGap ? onAnswerGap(gap.id, gap.description) : setQuestion(gap.description)}
                        className="w-full text-left p-3.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg shrink-0 mt-0.5">
                            {gap.gapType === "uncertain_answer" ? "❓" : gap.gapType === "inconsistency" ? "⚡" : gap.gapType === "conflicting_claims" ? "⚔️" : "📎"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{gap.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-muted-foreground">{gap.topicCluster.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                gap.severity === "high"
                                  ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                  : gap.severity === "medium"
                                  ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400"
                                  : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                              }`}>
                                {gap.severity === "high" ? "긴급" : gap.severity === "medium" ? "보통" : "낮음"}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-primary font-medium shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                            답하기 →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 🌱 새로 공유된 Q&A (48시간 이내 — Seedling Area) ── */}
              {seedlingQAs.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">🌱</span>
                    <h3 className="text-sm font-semibold">새로 공유된 Q&A</h3>
                    <span className="text-[10px] text-muted-foreground">48시간 이내 · 첫 투자자가 되어보세요</span>
                  </div>
                  <div className="space-y-1">
                    {seedlingQAs.map((qa) => (
                      <div
                        key={qa.id}
                        className="group flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-950/20 transition-colors"
                        onClick={() => onSelectSharedQA(qa.id)}
                      >
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 font-medium shrink-0">🆕</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {qa.title ?? "제목 없음"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span>{qa.creator?.name ?? "익명"}</span>
                            {qa.investorCount === 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">초기 투자 보상 3배</span>
                            )}
                            {qa.tags && qa.tags.length > 0 && (
                              <span>· {qa.tags[0].tag.name}</span>
                            )}
                          </div>
                        </div>
                        {session?.user?.id && (
                          <button
                            onClick={(e) => handleQuickCultivate(e, qa.id)}
                            disabled={cultivatingId === qa.id}
                            className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="첫 투자자 되기"
                          >
                            {cultivatingId === qa.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "📈 첫 투자"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── E. 개인 상태 — "👤 나의 현황" (Yu-kai Chou Drive 1+5) ── */}
              <MyStatus />

              {/* ── 🔥 트렌딩 Q&A (인라인 투자 + 활발 표시) ── */}
              {trendingQAs.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold">트렌딩 Q&A</h3>
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
                        onCultivate={handleQuickCultivate}
                        cultivatingId={cultivatingId}
                        isLoggedIn={!!session?.user?.id}
                        showActivityBadge={hasRecentActivity(qa)}
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

      {/* ── FAB: 새 질문하기 (Julie Zhuo) ── */}
      {showTrending && (
        <button
          onClick={() => inputRef.current?.focus()}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          title="새 질문하기"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ── Frontier Toast ── */}
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
                <p className="font-bold text-base leading-tight">새로운 주제 발견!</p>
                <p className="text-sm text-white/90 leading-snug">
                  아직 아무도 답하지 않은 영역입니다.<br />
                  지금 Q&A를 만들면 <span className="font-semibold underline decoration-dotted">초기 투자 효과</span>로
                  이후 투자자 보상을 받을 수 있습니다.
                </p>
              </div>
            </div>
            <div className="mt-3 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{ animation: toastVisible ? "shrink 2s linear forwards" : "none" }}
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

// ── Pagination Component ──
function Pagination({ search, onPage }: { search: SearchState; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
      <Button variant="outline" size="sm" disabled={search.page <= 1} onClick={() => onPage(search.page - 1)} className="gap-1">
        <ChevronLeft className="h-3.5 w-3.5" /> 이전
      </Button>
      <div className="flex gap-1">
        {Array.from({ length: search.totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === search.totalPages || Math.abs(p - search.page) <= 1)
          .reduce<(number | "...")[]>((acc, p, idx, arr) => {
            if (idx > 0 && (arr[idx - 1] as number) + 1 < p) acc.push("...");
            acc.push(p);
            return acc;
          }, [])
          .map((p, idx) =>
            p === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm self-center">…</span>
            ) : (
              <Button key={p} variant={p === search.page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => onPage(p as number)}>
                {p}
              </Button>
            )
          )}
      </div>
      <Button variant="outline" size="sm" disabled={search.page >= search.totalPages} onClick={() => onPage(search.page + 1)} className="gap-1">
        다음 <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Q&A List Item (인라인 투자 + 활발 표시 + 신뢰도) ──
function SearchResultItem({
  qa,
  index,
  onClick,
  onCultivate,
  cultivatingId,
  isLoggedIn,
  showActivityBadge,
}: {
  qa: QASetCardData;
  index: number;
  onClick: () => void;
  onCultivate?: (e: React.MouseEvent, qaSetId: string) => void;
  cultivatingId?: string | null;
  isLoggedIn?: boolean;
  showActivityBadge?: boolean;
}) {
  const firstAnswer = qa.messages?.[0]?.content ?? qa.summary ?? null;
  const score = qa.scoreDetail;
  const isCultivating = cultivatingId === qa.id;

  // Trust progress: positive ratio based on investments
  const totalInv = qa.totalInvested ?? 0;
  const investorCount = qa.investorCount ?? 0;
  const trustPercent = totalInv > 0 ? Math.min(100, Math.round((totalInv / (totalInv + 50)) * 100)) : 0;

  return (
    <div
      className="group py-4 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors"
      onClick={onClick}
    >
      {/* Meta row */}
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
        <span className="text-xs text-muted-foreground ml-auto shrink-0 flex items-center gap-2">
          {showActivityBadge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 font-medium animate-pulse">
              활발
            </span>
          )}
          <span title="투자 포인트">📈 {totalInv}</span>
          <span title="투자한 사람">{investorCount}명 투자 중</span>
        </span>
      </div>

      {/* Title */}
      <h4 className="text-[15px] font-medium text-primary group-hover:underline leading-snug mb-1.5 flex items-start gap-1">
        <span className="flex-1">{qa.title ?? "제목 없음"}</span>
        <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
      </h4>

      {/* Creator opinion */}
      {qa.summary && (
        <p className="text-sm text-amber-700 dark:text-amber-400 line-clamp-2 leading-relaxed mb-0.5">
          💬 {qa.summary}
        </p>
      )}

      {/* Answer preview */}
      {firstAnswer && (
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
          {firstAnswer}
        </p>
      )}

      {/* Trust progress bar (2단계 반영) + inline cultivate */}
      <div className="flex items-center gap-3 mt-2.5">
        {/* Trust bar */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${trustPercent}%`,
                backgroundColor: trustPercent > 70 ? "#22c55e" : trustPercent > 40 ? "#eab308" : "#94a3b8",
              }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{trustPercent}%</span>
          {score && (
            <span className="text-[10px] text-muted-foreground" title="종합 점수">📊 {score.total}</span>
          )}
        </div>

        {/* Inline cultivate button */}
        {isLoggedIn && onCultivate && (
          <button
            onClick={(e) => onCultivate(e, qa.id)}
            disabled={isCultivating}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
            title="10포인트 투자하기"
          >
            {isCultivating ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "📈 투자"}
          </button>
        )}
      </div>

      {/* Tags */}
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
