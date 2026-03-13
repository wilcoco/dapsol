"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, TrendingUp, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { QASetCardData, ScoreDetail } from "@/types/qa-set";

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

export function Section1QuestionInput({ onNewQuestion, onSelectSharedQA, onAnswerGap, onNavigateToMap }: Section1Props) {
  const { data: session } = useSession();
  const [question, setQuestion] = useState("");
  const [trendingQAs, setTrendingQAs] = useState<QASetCardData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [showFrontierToast, setShowFrontierToast] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<KnowledgeGap[]>([]);
  const [cultivatingId, setCultivatingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending QAs + AI questions on mount
  useEffect(() => {
    fetch("/api/qa-sets?shared=true&sort=trending&limit=10")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTrendingQAs(d.qaSets ?? []); })
      .catch(() => {});

    fetch("/api/knowledge-gaps")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.gaps) setAiQuestions(d.gaps.slice(0, 3)); })
      .catch(() => {});
  }, []);

  const triggerFrontierToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowFrontierToast(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setToastVisible(true)));
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setShowFrontierToast(false), 400);
    }, 2000);
  };

  // Search existing QA
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

  // Ask AI directly
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

  // Inline quick cultivate (invest 10 points)
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
        // Update the local count
        setTrendingQAs((prev) =>
          prev.map((qa) =>
            qa.id === qaSetId
              ? { ...qa, totalInvested: qa.totalInvested + 10 }
              : qa
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setCultivatingId(null);
    }
  }, [session?.user?.id, cultivatingId]);

  const showTrending = !search;

  return (
    <div className="flex flex-col h-full overflow-hidden relative pb-14 md:pb-0">

      {/* ── Input Area ── */}
      <div className={`shrink-0 border-b bg-muted/20 transition-all duration-300 ${search ? "px-6 py-4" : "px-6 py-8"}`}>
        <div className="max-w-2xl mx-auto space-y-3">
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

          {/* Two buttons: Search + Ask AI */}
          <div className="flex gap-2.5">
            <Button
              onClick={() => handleSearch(1)}
              disabled={!question.trim() || isSearching}
              variant="outline"
              className="flex-1 h-12 rounded-xl gap-2 text-sm font-medium"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🔍</span>}
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
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-5">

          {/* ── Search Results ── */}
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
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                    >
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
                      />
                    ))}
                  </div>

                  {search.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                      <Button variant="outline" size="sm" disabled={search.page <= 1} onClick={() => handlePage(search.page - 1)} className="gap-1">
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
                              <Button key={p} variant={p === search.page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => handlePage(p as number)}>
                                {p}
                              </Button>
                            )
                          )}
                      </div>
                      <Button variant="outline" size="sm" disabled={search.page >= search.totalPages} onClick={() => handlePage(search.page + 1)} className="gap-1">
                        다음 <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 space-y-3">
                  <div className="text-5xl">🗺️</div>
                  <p className="font-semibold text-lg">&ldquo;{search.query}&rdquo; — 아직 아무도 없습니다</p>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    이 주제의 첫 번째 Q&A를 만들어보세요.<br />
                    지금 AI에게 물어 Q&A를 만들면 선점 효과를 누릴 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Home (before search) ── */}
          {showTrending && (
            <div>

              {/* 🤖→👤 AI가 인간에게 묻는 질문 */}
              {aiQuestions.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base font-bold">🤖→👤</span>
                    <span className="text-sm font-semibold">AI가 인간에게 묻고 있어요</span>
                  </div>
                  <div className="space-y-2">
                    {aiQuestions.map((gap) => (
                      <button
                        key={gap.id}
                        onClick={() => onAnswerGap ? onAnswerGap(gap.id, gap.description) : setQuestion(gap.description)}
                        className="w-full text-left p-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10 transition-all group"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg shrink-0 mt-0.5">
                            {gap.gapType === "uncertain_answer" ? "❓" : gap.gapType === "inconsistency" ? "⚡" : gap.gapType === "conflicting_claims" ? "⚔️" : "📎"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{gap.description}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground">{gap.topicCluster.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
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

              {/* Trending Q&A with inline cultivate */}
              {trendingQAs.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold">인기 Q&A</h3>
                    <span className="text-xs text-muted-foreground">커뮤니티가 만든 지식</span>
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
                      />
                    ))}
                  </div>
                </>
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
                <p className="font-bold text-base leading-tight">신 개척지 발견!</p>
                <p className="text-sm text-white/90 leading-snug">
                  아직 아무도 답하지 않은 영역입니다.<br />
                  지금 Q&A를 만들면 <span className="font-semibold underline decoration-dotted">선점 효과</span>로
                  이후 경작자 보상을 받을 수 있습니다.
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

// ── Q&A List Item with inline cultivate button ──
function SearchResultItem({
  qa,
  index,
  onClick,
  relevanceWeight,
  onCultivate,
  cultivatingId,
  isLoggedIn,
}: {
  qa: QASetCardData;
  index: number;
  onClick: () => void;
  relevanceWeight?: number;
  onCultivate?: (e: React.MouseEvent, qaSetId: string) => void;
  cultivatingId?: string | null;
  isLoggedIn?: boolean;
}) {
  const firstAnswer = qa.messages?.[0]?.content ?? qa.summary ?? null;
  const score = qa.scoreDetail;
  const isCultivating = cultivatingId === qa.id;

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
          <span title="경작 포인트">🌾 {qa.totalInvested}</span>
          <span title="경작한 사람">{qa.investorCount}명</span>
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

      {/* Bottom row: scores + inline cultivate button */}
      <div className="flex items-center gap-2 mt-2">
        {score && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-1">
            <span className="font-medium text-foreground tabular-nums" title="종합 점수">📊 {score.total}점</span>
            <span title="관련성">🎯 {score.relevance}</span>
            <span title="경작">🌾 {score.invest}</span>
          </div>
        )}

        {/* Inline cultivate button */}
        {isLoggedIn && onCultivate && (
          <button
            onClick={(e) => onCultivate(e, qa.id)}
            disabled={isCultivating}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
            title="10포인트 경작하기"
          >
            {isCultivating ? (
              <Loader2 className="h-3 w-3 animate-spin inline" />
            ) : (
              "🌾 경작"
            )}
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
