"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, TrendingUp, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { QASetCardData, ScoreDetail } from "@/types/qa-set";
// import { LiveActivityGraph } from "@/components/section1/live-activity-graph"; // 임시 비활성화
import { MyStatus } from "@/components/section1/my-status";

interface Section1Props {
  onNewQuestion: (question: string) => void;
  onSelectSharedQA: (qaSetId: string) => void;
  onAnswerGap?: (gapId: string, description: string) => void;
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

export function Section1QuestionInput({ onNewQuestion, onSelectSharedQA, onAnswerGap }: Section1Props) {
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
  const [aiGeneratedQs, setAiGeneratedQs] = useState<Array<{
    id: string; title: string; question: string;
    aiQuestionType: string; rewardMultiplier: number;
    answerCount: number; cluster: { id: string; name: string } | null;
  }>>([]);
  const [aiApprovedOpinions, setAiApprovedOpinions] = useState<Array<{
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; name: string | null; image: string | null };
    aiInvestment: number;
    totalInvested: number;
    investorCount: number;
    qaSet: { id: string; title: string | null; isShared: boolean; aiAnswer: string | null } | null;
  }>>([]);
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
            (qa: { createdAt: string }) => now - new Date(qa.createdAt).getTime() < h48
          );
          setSeedlingQAs(fresh.slice(0, 5));
        }
      })
      .catch(() => {});

    // AI knowledge gaps (🤖→👤)
    fetch("/api/knowledge-gaps")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.gaps) setAiQuestions(d.gaps.slice(0, 3)); })
      .catch(() => {});

    // AI-generated questions (🤖 AI가 묻고 있습니다)
    fetch("/api/qa-sets/ai-questions?limit=5")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.questions) setAiGeneratedQs(d.questions); })
      .catch(() => {});

    // Tags for cluster filter
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setPopularTags(d.tags ?? []))
      .catch(() => {});

    // AI-approved opinions (AI가 인정한 정보)
    fetch("/api/opinions/ai-approved?limit=5")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.opinions) setAiApprovedOpinions(d.opinions); })
      .catch(() => {});
  }, []);

  // Tag filter
  useEffect(() => {
    if (!activeTag) {
      setTrendingQAs(allTrendingQAs.slice(0, 10));
    } else {
      const filtered = allTrendingQAs.filter((qa) =>
        qa.tags?.some(({ tag }) => (tag as { slug?: string; name: string }).slug === activeTag || tag.name === activeTag)
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

      {/* ── Header: Search bar (컴팩트) ── */}
      <div className={`shrink-0 border-b bg-muted/20 transition-all duration-300 ${search ? "px-4 py-2" : "px-4 py-4"}`}>
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              ref={inputRef}
              placeholder="AI 답변 검색..."
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (search && e.target.value.trim() !== search.query) setSearch(null);
              }}
              onKeyDown={handleKeyDown}
              className="text-base h-11 pl-10 pr-20 rounded-xl shadow-sm border focus-visible:ring-0 focus-visible:border-primary"
              disabled={isSubmitting}
            />
            <Button
              onClick={() => handleSearch(1)}
              disabled={!question.trim() || isSearching}
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 rounded-lg gap-1 text-xs px-3"
            >
              {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              검색
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content Area (컴팩트) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 py-2">

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

                  {/* 검색 결과 하단: 새 길 만들기 (컴팩트) */}
                  <div className="mt-4 pt-3 border-t text-center">
                    <Button
                      onClick={handleAskAI}
                      disabled={isSubmitting}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                    >
                      {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "🏔️"}
                      새 길 만들기
                    </Button>
                  </div>
                </>
              ) : (
                /* 검색 결과 0건: 개척자 화면 (컴팩트) */
                <div className="text-center py-6 space-y-4">
                  <div className="space-y-1">
                    <div className="text-3xl">🏔️</div>
                    <h3 className="text-base font-bold">아직 아무도 걷지 않은 눈</h3>
                    <p className="text-xs text-muted-foreground">
                      &ldquo;{search.query}&rdquo;에 대한 길이 없습니다
                    </p>
                  </div>

                  <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-200/50 dark:border-amber-800/30 max-w-xs mx-auto">
                    <div className="flex items-center justify-center gap-4 text-xs">
                      <div className="text-center">
                        <span className="text-green-600 font-bold block">+10</span>
                        <span className="text-muted-foreground">개척</span>
                      </div>
                      <div className="text-center">
                        <span className="text-green-600 font-bold block">+5</span>
                        <span className="text-muted-foreground">AI답변</span>
                      </div>
                      <div className="text-center">
                        <span className="text-amber-600 block">👣</span>
                        <span className="text-muted-foreground">후속보상</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleAskAI}
                    disabled={isSubmitting}
                    className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "🏔️"}
                    첫 발자국 남기기
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    당신의 발자국이 뒤에 오는 사람의 길이 됩니다
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════ Home Feed (Julie Zhuo layout) ══════ */}
          {showTrending && (
            <div>

              {/* ── Cluster Filter Chips (컴팩트) ── */}
              {popularTags.length > 0 && (
                <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    onClick={() => setActiveTag(null)}
                    className={`shrink-0 text-[10px] px-2 py-1 rounded-full border transition-colors ${
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
                      className={`shrink-0 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        activeTag === tag.name
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {tag.name}
                      <span className="ml-0.5 opacity-60">{tag.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── 🌱 새로 열린 길 (48시간 이내, 컴팩트) ── */}
              {seedlingQAs.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">🌱</span>
                    <h3 className="text-xs font-semibold">새로 열린 길</h3>
                    <span className="text-[9px] text-muted-foreground">48h 이내</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                    {seedlingQAs.map((qa) => (
                      <div
                        key={qa.id}
                        className="shrink-0 w-[200px] p-2.5 rounded-lg border bg-green-50/30 dark:bg-green-950/10 border-green-200/50 dark:border-green-800/30 cursor-pointer hover:border-green-400 dark:hover:border-green-600 transition-colors"
                        onClick={() => onSelectSharedQA(qa.id)}
                      >
                        <p className="text-xs font-medium line-clamp-2 leading-snug mb-1">
                          {qa.title ?? "제목 없음"}
                        </p>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span>{qa.creator?.name ?? "익명"}</span>
                          {qa.investorCount === 0 ? (
                            <span className="text-amber-600 dark:text-amber-400">첫 발자국 가능</span>
                          ) : (
                            <span>👣 {qa.investorCount}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── E. 개인 상태 — "👤 나의 현황" (Yu-kai Chou Drive 1+5) ── */}
              <MyStatus />

              {/* ── 🎯 AI가 인정한 정보 (Q→A→수정 구조) ── */}
              {aiApprovedOpinions.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">🎯</span>
                    <h3 className="text-xs font-semibold">AI가 인정한 정보</h3>
                  </div>
                  <div className="space-y-2">
                    {aiApprovedOpinions.map((opinion) => (
                      <div
                        key={opinion.id}
                        className="p-2.5 rounded-lg border border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10 hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer"
                        onClick={() => opinion.qaSet && onSelectSharedQA(opinion.qaSet.id)}
                      >
                        {/* Q: 질문 */}
                        {opinion.qaSet?.title && (
                          <div className="flex items-start gap-1.5 mb-1.5">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-[8px]">👤</span>
                            <p className="text-[11px] text-foreground line-clamp-1 flex-1">{opinion.qaSet.title}</p>
                          </div>
                        )}
                        {/* A: AI 답변 */}
                        {opinion.qaSet?.aiAnswer && (
                          <div className="flex items-start gap-1.5 mb-1.5">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[8px]">🤖</span>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 flex-1">{opinion.qaSet.aiAnswer}</p>
                          </div>
                        )}
                        {/* 수정: 사용자 빈틈 채우기 */}
                        <div className="flex items-start gap-1.5">
                          {opinion.user.image ? (
                            <img src={opinion.user.image} alt="" className="shrink-0 w-4 h-4 rounded-full" />
                          ) : (
                            <span className="shrink-0 w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-[8px]">✏️</span>
                          )}
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-1 flex-1 font-medium">{opinion.content}</p>
                        </div>
                        {/* 메타 */}
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-1.5 pl-5">
                          <span>{opinion.user.name ?? "익명"}</span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">AI 👣{opinion.aiInvestment}</span>
                          {opinion.investorCount > 1 && <span>+{opinion.investorCount - 1}명 동의</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 🔥 인기 있는 길 (컴팩트) ── */}
              {trendingQAs.length > 0 ? (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                    <h3 className="text-xs font-semibold">인기 있는 길</h3>
                    <span className="text-[9px] text-muted-foreground">
                      {activeTag ? `#${activeTag}` : ""}
                    </span>
                    {activeTag && (
                      <button
                        onClick={() => setActiveTag(null)}
                        className="text-[9px] text-muted-foreground hover:text-foreground ml-auto"
                      >
                        ✕
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
                  <p className="font-medium">&quot;{activeTag}&quot; 태그가 달린 길이 없습니다</p>
                  <button onClick={() => setActiveTag(null)} className="text-xs text-primary hover:underline">
                    전체 보기
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground space-y-3">
                  <div className="text-3xl">👣</div>
                  <p className="font-medium text-sm">검증된 답변을 검색하세요</p>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-sm mx-auto">
                    {["코드 리뷰", "마케팅 전략", "팀 회고", "데이터 분석", "프로젝트 관리"].map((example) => (
                      <button
                        key={example}
                        onClick={() => { setQuestion(example); inputRef.current?.focus(); }}
                        className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 💡 추천 주제 + 🤖 지식 갭 (합쳐서 컴팩트하게) ── */}
              {(aiGeneratedQs.length > 0 || aiQuestions.length > 0) && (
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs">💡</span>
                    <span className="text-[10px] text-muted-foreground">추천</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {aiGeneratedQs.slice(0, 3).map((q) => (
                      <button
                        key={q.id}
                        onClick={() => onSelectSharedQA(q.id)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-muted-foreground/20 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                      >
                        {q.title?.slice(0, 20)}{q.title && q.title.length > 20 ? "…" : ""}
                      </button>
                    ))}
                    {aiQuestions.slice(0, 2).map((gap) => (
                      <button
                        key={gap.id}
                        onClick={() => onAnswerGap ? onAnswerGap(gap.id, gap.description) : setQuestion(gap.description)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-amber-300/50 dark:border-amber-700/50 text-amber-700 dark:text-amber-400 hover:border-amber-400 transition-colors"
                      >
                        🤖 {gap.description.slice(0, 20)}{gap.description.length > 20 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── FAB: 새 질문하기 (컴팩트) ── */}
      {showTrending && (
        <button
          onClick={() => inputRef.current?.focus()}
          className="fixed bottom-16 right-3 md:bottom-4 md:right-4 z-40 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          title="새 질문하기"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      {/* ── Frontier Toast (컴팩트) ── */}
      {showFrontierToast && (
        <div
          className={`
            pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 z-50
            transition-all duration-300 ease-out
            ${toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
          `}
        >
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg px-4 py-2.5 text-sm">
            <span className="mr-1.5">🚀</span>
            <span className="font-medium">새 길 개척 가능!</span>
            <span className="opacity-80 ml-1">+10👣</span>
          </div>
        </div>
      )}

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

// ── Q&A List Item (Q→A→수정 구조) ──
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
  const aiAnswer = qa.messages?.[0]?.content ?? null;
  const userCorrection = qa.summary ?? null; // 사용자 의견/수정
  const isCultivating = cultivatingId === qa.id;
  const totalInv = qa.totalInvested ?? 0;
  const investorCount = qa.investorCount ?? 0;

  return (
    <div
      className="group py-2.5 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors"
      onClick={onClick}
    >
      {/* Q: 질문 */}
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-[8px]">👤</span>
        <h4 className="text-[12px] font-medium text-foreground group-hover:text-primary leading-snug line-clamp-1 flex-1">
          {qa.title ?? "제목 없음"}
        </h4>
        {/* Quick cultivate */}
        {isLoggedIn && onCultivate && (
          <button
            onClick={(e) => onCultivate(e, qa.id)}
            disabled={isCultivating}
            className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-green-300/50 dark:border-green-700/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
          >
            {isCultivating ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : "👣"}
          </button>
        )}
      </div>

      {/* A: AI 답변 */}
      {aiAnswer && (
        <div className="flex items-start gap-1.5 mt-1">
          <span className="shrink-0 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[8px]">🤖</span>
          <p className="text-[10px] text-muted-foreground line-clamp-1 flex-1">{aiAnswer}</p>
        </div>
      )}

      {/* 수정: 사용자 의견 */}
      {userCorrection && (
        <div className="flex items-start gap-1.5 mt-1">
          <span className="shrink-0 w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-[8px]">✏️</span>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 line-clamp-1 flex-1">{userCorrection}</p>
        </div>
      )}

      {/* 메타 */}
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-1 pl-5">
        <span>{qa.creator?.name ?? "익명"}</span>
        <span>·</span>
        <span>👣 {totalInv}</span>
        <span>·</span>
        <span>{investorCount}명</span>
        {showActivityBadge && (
          <span className="px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 font-medium">활발</span>
        )}
      </div>
    </div>
  );
}
