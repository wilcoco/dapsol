"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, Send, ChevronRight } from "lucide-react";
import type { QASetWithMessages } from "@/types/qa-set";

interface ReviewGuideProps {
  qaSet: QASetWithMessages;
  isOwner: boolean;
  userId?: string;
  userBalance?: number;
  isHumanAnswer?: boolean;
  onInvest: () => void;
  onCounterInvest: () => void;
  onShareQA: () => void;
  onOpinionSubmitted: () => void;
  onAskFollowUp: (question: string) => void;
}

// AI 빈틈 유형 (사냥 메타포어)
const AI_GAP_TYPES = [
  { value: "wrong_info", label: "틀린 정보", icon: "🎯", desc: "AI가 잘못 알고 있음" },
  { value: "outdated", label: "최신 아님", icon: "⏰", desc: "내가 더 최신 정보 앎" },
  { value: "made_up", label: "없는 얘기", icon: "🚫", desc: "AI가 지어냄" },
  { value: "reality_differs", label: "현실은 다름", icon: "📍", desc: "실제로 해보면 다름" },
  { value: "missing_key", label: "중요한 게 빠짐", icon: "🔑", desc: "핵심을 놓침" },
  { value: "ai_doesnt_know", label: "AI도 모름", icon: "🤷", desc: "이건 사람만 앎" },
  { value: "local_info", label: "로컬 정보", icon: "🏠", desc: "우리 동네/현장은 다름" },
  { value: "experience", label: "경험담", icon: "💬", desc: "실제로 해본 사람만 앎" },
  { value: "other", label: "기타", icon: "✏️", desc: "직접 입력" },
];

// ─── Progress Stepper ───
function JourneyStepper({ step }: { step: number }) {
  const steps = [
    { label: "질문", icon: "?" },
    { label: "답변", icon: "A" },
    { label: "판단", icon: "🔍" },
    { label: "길 열기", icon: "📢" },
    { label: "걸어가기", icon: "👣" },
  ];

  return (
    <div className="flex items-center gap-0.5 px-1">
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <div key={s.label} className="flex items-center">
            <div
              className={`
                flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all
                ${done
                  ? "bg-primary/15 text-primary"
                  : current
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 animate-pulse"
                    : "bg-muted/50 text-muted-foreground/50"
                }
              `}
            >
              <span className="text-xs">{done ? "✓" : s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className={`h-3 w-3 mx-0.5 ${i < step ? "text-primary/40" : "text-muted-foreground/20"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats Display ───
function InvestStats({
  investorCount,
  totalInvested,
  negativeCount,
  negativeInvested,
}: {
  investorCount: number;
  totalInvested: number;
  negativeCount: number;
  negativeInvested: number;
}) {
  if (investorCount === 0 && negativeCount === 0) return null;
  return (
    <div className="flex items-center gap-3 text-xs">
      {investorCount > 0 && (
        <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full font-medium">
          <span className="text-sm">👣</span>
          <span className="text-base font-bold tabular-nums">{totalInvested}</span>
          <span>👣 · {investorCount}명</span>
        </div>
      )}
      {negativeCount > 0 && (
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full font-medium">
          <span className="text-sm">📉</span>
          <span className="text-base font-bold tabular-nums">{negativeInvested}</span>
          <span>👣 · {negativeCount}명</span>
        </div>
      )}
    </div>
  );
}

// ─── Follow-Up Input (항상 보이는 추가 질문) ───
function FollowUpInput({
  followUpText,
  setFollowUpText,
  onSend,
}: {
  followUpText: string;
  setFollowUpText: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">🔗</span>
        <span className="text-sm font-medium">추가 질문</span>
        <span className="text-[11px] text-muted-foreground">— AI에게 더 물어보기</span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="궁금한 점을 입력하세요..."
          value={followUpText}
          onChange={(e) => setFollowUpText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          className="flex-1 h-8 px-2.5 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" disabled={!followUpText.trim()} onClick={onSend} className="shrink-0 h-8 px-2.5 gap-1 text-xs">
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── AI 평가 결과 타입 ───
interface AIEvaluation {
  isValid: boolean;
  accuracy: number;
  significance: number;
  reasoning: string;
  suggestedReward: number;
  aiComment: string;
}

// ─── 의견 타입 ───
interface Opinion {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; image: string | null };
  totalInvested: number;
  investorCount: number;
  aiInvestment?: number;
  myInvestment?: number;
}

// ─── 기존 의견 목록 ───
function OpinionsList({
  qaSetId,
  userId,
  userBalance = 0,
  onRefresh,
}: {
  qaSetId: string;
  userId?: string;
  userBalance?: number;
  onRefresh?: () => void;
}) {
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [investing, setInvesting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opinions?qaSetId=${qaSetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.opinions) setOpinions(d.opinions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [qaSetId]);

  const handleInvest = async (opinionId: string) => {
    if (!userId || investing) return;
    setInvesting(opinionId);
    try {
      const res = await fetch(`/api/opinions/${opinionId}/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10 }),
      });
      if (res.ok) {
        setOpinions((prev) =>
          prev.map((op) =>
            op.id === opinionId
              ? { ...op, totalInvested: op.totalInvested + 10, investorCount: op.investorCount + 1, myInvestment: 10 }
              : op
          )
        );
        onRefresh?.();
      }
    } catch {
      // ignore
    } finally {
      setInvesting(null);
    }
  };

  if (loading) return null;
  if (opinions.length === 0) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>💬</span>
        <span>다른 사람들의 빈틈 채우기</span>
        <Badge variant="secondary" className="text-[10px]">{opinions.length}</Badge>
      </div>
      <div className="space-y-2">
        {opinions.map((op) => (
          <div
            key={op.id}
            className="p-2.5 rounded-lg bg-background border text-sm space-y-1.5"
          >
            <p className="text-foreground/90 line-clamp-3">{op.content}</p>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>{op.user.name ?? "익명"}</span>
                {op.aiInvestment && op.aiInvestment > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 border-0 text-[9px] px-1.5">
                    🤖 AI 인정
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span>👣 {op.totalInvested} · {op.investorCount}명</span>
                {userId && op.user.id !== userId && !op.myInvestment && userBalance >= 10 && (
                  <button
                    onClick={() => handleInvest(op.id)}
                    disabled={investing === op.id}
                    className="px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-medium"
                  >
                    {investing === op.id ? "..." : "+10👣 동의"}
                  </button>
                )}
                {op.myInvestment && (
                  <span className="text-green-600 dark:text-green-400">✓ 동의함</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 빈틈 채우기 (AI Gap Filler) ───
function GapFiller({
  qaSetId,
  onSubmitted,
  onShareQA,
  userBalance = 100,
  originalQuestion = "",
  originalAnswer = "",
  userId,
}: {
  qaSetId: string;
  onSubmitted: () => void;
  onShareQA?: () => void;
  userBalance?: number;
  originalQuestion?: string;
  originalAnswer?: string;
  userId?: string;
}) {
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [customGapType, setCustomGapType] = useState("");
  const [content, setContent] = useState("");
  const [confidence, setConfidence] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [done, setDone] = useState(false);
  const [resultReward, setResultReward] = useState(0);
  const [aiEvaluation, setAiEvaluation] = useState<AIEvaluation | null>(null);
  const [aiInvestment, setAiInvestment] = useState(0);
  const [existingOpinions, setExistingOpinions] = useState<Opinion[]>([]);
  const [investing, setInvesting] = useState<string | null>(null);

  const maxConfidence = Math.min(userBalance, 100);

  // 기존 빈틈 채우기 로드
  useEffect(() => {
    fetch(`/api/opinions?qaSetId=${qaSetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.opinions) setExistingOpinions(d.opinions);
      })
      .catch(() => {});
  }, [qaSetId]);

  // 의견에 투자
  const handleInvestOpinion = async (opinionId: string) => {
    if (!userId || investing) return;
    setInvesting(opinionId);
    try {
      const res = await fetch(`/api/opinions/${opinionId}/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10 }),
      });
      if (res.ok) {
        setExistingOpinions((prev) =>
          prev.map((op) =>
            op.id === opinionId
              ? { ...op, totalInvested: op.totalInvested + 10, investorCount: op.investorCount + 1, myInvestment: 10 }
              : op
          )
        );
        onSubmitted();
      }
    } catch {
      // ignore
    } finally {
      setInvesting(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedGap || submitting) return;
    if (selectedGap === "other" && !customGapType.trim()) return;
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const gapLabel = selectedGap === "other"
        ? customGapType.trim()
        : AI_GAP_TYPES.find((t) => t.value === selectedGap)?.label;
      const gapIcon = AI_GAP_TYPES.find((t) => t.value === selectedGap)?.icon ?? "💎";

      const fullContent = `${gapIcon} [${gapLabel}] ${content.trim()}`;

      // 1. 빈틈 채우기 의견 생성 + 기본 보상 + 확신 투자
      const opRes = await fetch("/api/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fullContent,
          targetQASetId: qaSetId,
          relationType: "extension",
          isGapFill: true,
          confidenceAmount: confidence,
        }),
      });
      if (!opRes.ok) throw new Error("fail");
      const result = await opRes.json();
      setResultReward(result.reward?.amount ?? 25);

      // 2. AI 평가 요청
      setEvaluating(true);
      const evalRes = await fetch("/api/opinions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalQuestion,
          originalAnswer,
          gapType: selectedGap,
          userCorrection: content.trim(),
          opinionId: result.id,
          qaSetId,
        }),
      });

      if (evalRes.ok) {
        const evalResult = await evalRes.json();
        setAiEvaluation(evalResult.evaluation);
        setAiInvestment(evalResult.systemInvestment?.amount ?? 0);
      }

      setDone(true);
      onSubmitted();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
      setEvaluating(false);
    }
  };

  // 완료 화면: AI 평가 결과 + 공유 유도
  if (done) {
    const totalReward = resultReward + aiInvestment;

    return (
      <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-orange-950/30 p-5 space-y-4">
        {/* AI 평가 결과 */}
        {aiEvaluation && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span className="text-sm font-semibold">AI 평가</span>
              {aiEvaluation.isValid && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 border-0 text-[10px]">
                  인정됨
                </Badge>
              )}
            </div>

            <div className="p-3 rounded-xl bg-white/50 dark:bg-black/20 border border-amber-200/50 dark:border-amber-700/50">
              <p className="text-sm text-foreground/90 italic">&ldquo;{aiEvaluation.aiComment}&rdquo;</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{aiEvaluation.accuracy}</div>
                <div className="text-muted-foreground">정확도</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-center">
                <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{aiEvaluation.significance}</div>
                <div className="text-muted-foreground">기여도</div>
              </div>
            </div>
          </div>
        )}

        {/* 보상 요약 */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">🏆 획득 보상</span>
            <span className="text-lg font-bold text-green-600 dark:text-green-400">+{totalReward} 👣</span>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>기본 보상</span>
              <span>+{resultReward} 👣</span>
            </div>
            {aiInvestment > 0 && (
              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                <span>🤖 AI 투자</span>
                <span>+{aiInvestment} 👣</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>내 확신 투자</span>
              <span className="text-amber-600">-{confidence} 👣</span>
            </div>
          </div>
        </div>

        {/* 공유 유도 */}
        {aiEvaluation?.isValid && onShareQA && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/30 space-y-2">
            <p className="text-sm font-medium text-center">
              💎 AI가 인정한 좋은 정보네요!
            </p>
            <p className="text-xs text-muted-foreground text-center">
              공유하면 다른 사람들이 동의 투자할 수 있어요
            </p>
            <Button
              onClick={onShareQA}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
              size="sm"
            >
              📢 공유하고 더 많은 보상 받기
            </Button>
          </div>
        )}

        {/* 공유 안 함 옵션 */}
        {!aiEvaluation?.isValid && (
          <p className="text-xs text-center text-muted-foreground">
            다른 사람이 동의 투자하면 추가 보상을 받을 수 있어요
          </p>
        )}

        {/* 다른 빈틈도 채우기 버튼 */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => {
            setDone(false);
            setSelectedGap(null);
            setContent("");
            setConfidence(10);
            setAiEvaluation(null);
            setAiInvestment(0);
          }}
        >
          💎 다른 빈틈도 채우기
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-blue-50/50 to-indigo-50/50 dark:from-primary/10 dark:via-blue-950/20 dark:to-indigo-950/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">💎</span>
          <div>
            <h3 className="text-sm font-semibold">AI가 놓친 부분이 있나요?</h3>
            <p className="text-[11px] text-muted-foreground">당신의 지식으로 채우면 보상 2배</p>
          </div>
        </div>
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 border-0">
          +25 👣
        </Badge>
      </div>

      {/* 기존 빈틈 채우기 (있으면 표시) */}
      {existingOpinions.length > 0 && (
        <div className="p-3 rounded-xl bg-muted/50 border space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>💬</span>
            <span>이미 채워진 빈틈 {existingOpinions.length}개</span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {existingOpinions.map((op) => (
              <div key={op.id} className="p-2 rounded-lg bg-background border text-xs space-y-1">
                <p className="text-foreground/90 line-clamp-2">{op.content}</p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>{op.user.name ?? "익명"}</span>
                    {op.aiInvestment && op.aiInvestment > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 border-0 text-[9px] px-1">
                        🤖 인정
                      </Badge>
                    )}
                    <span>👣{op.totalInvested}</span>
                  </div>
                  {userId && op.user.id !== userId && !op.myInvestment && userBalance >= 10 && (
                    <button
                      onClick={() => handleInvestOpinion(op.id)}
                      disabled={investing === op.id}
                      className="px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                    >
                      {investing === op.id ? "..." : "+10👣"}
                    </button>
                  )}
                  {op.myInvestment && <span className="text-green-600">✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gap Type Selection */}
      <div className="flex flex-wrap gap-1.5">
        {AI_GAP_TYPES.map((gap) => (
          <button
            key={gap.value}
            onClick={() => setSelectedGap(selectedGap === gap.value ? null : gap.value)}
            className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-all ${
              selectedGap === gap.value
                ? "border-primary bg-primary text-primary-foreground font-medium"
                : "border-border bg-background hover:border-primary/50 hover:bg-primary/5"
            }`}
            title={gap.desc}
          >
            {gap.icon} {gap.label}
          </button>
        ))}
      </div>

      {/* Custom Gap Type Input (when "기타" selected) */}
      {selectedGap === "other" && (
        <input
          type="text"
          placeholder="빈틈 유형을 직접 입력하세요..."
          value={customGapType}
          onChange={(e) => setCustomGapType(e.target.value)}
          className="w-full h-9 px-3 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
      )}

      {/* Content Input + Confidence Slider (shown when gap type selected) */}
      {selectedGap && (
        <div className="space-y-3">
          <Textarea
            placeholder={
              selectedGap === "local_info" ? "이 동네/현장에서는 실제로..." :
              selectedGap === "experience" ? "직접 해보니까..." :
              selectedGap === "outdated" ? "최근에 바뀌어서 지금은..." :
              selectedGap === "reality_differs" ? "실제로는 이렇습니다..." :
              "AI가 놓친 부분을 채워주세요..."
            }
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 2000))}
            className="min-h-[80px] text-sm resize-none"
            rows={3}
          />
          <span className="text-[10px] text-muted-foreground">{content.length}/2000</span>

          {/* Confidence Slider */}
          {content.trim() && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50/50 to-yellow-50/50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200/50 dark:border-amber-800/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📊</span>
                  <span className="text-xs font-medium">내 확신도</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{confidence}</span>
                  <span className="text-xs text-muted-foreground">👣</span>
                </div>
              </div>

              <Slider
                value={[confidence]}
                onValueChange={(v) => setConfidence(v[0])}
                min={5}
                max={maxConfidence}
                step={5}
                className="w-full"
              />

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>5 👣</span>
                <span className="text-amber-600 dark:text-amber-400">
                  확신이 높을수록, 동의 받으면 더 큰 보상
                </span>
                <span>{maxConfidence} 👣</span>
              </div>
            </div>
          )}

          <Button
            size="sm"
            disabled={!content.trim() || submitting || evaluating || (selectedGap === "other" && !customGapType.trim())}
            onClick={handleSubmit}
            className="w-full gap-2 h-10 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium"
          >
            {submitting && !evaluating && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                제출 중...
              </>
            )}
            {evaluating && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                🤖 AI 평가 중...
              </>
            )}
            {!submitting && !evaluating && (
              <>
                💎 빈틈 채우기 + {confidence}👣 투자
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ReviewGuide({
  qaSet,
  isOwner,
  userId,
  userBalance = 30,
  isHumanAnswer,
  onInvest,
  onCounterInvest,
  onShareQA,
  onOpinionSubmitted,
  onAskFollowUp,
}: ReviewGuideProps) {
  const [followUpText, setFollowUpText] = useState("");

  const investorCount = qaSet.investorCount ?? 0;
  const totalInvested = qaSet.totalInvested ?? 0;
  const negativeCount = qaSet.negativeCount ?? 0;
  const negativeInvested = qaSet.negativeInvested ?? 0;
  const myInvestment = (qaSet.investments ?? []).find(
    (inv) => inv.userId === userId && !inv.isNegative
  );

  const handleSendFollowUp = () => {
    if (!followUpText.trim()) return;
    onAskFollowUp(followUpText.trim());
    setFollowUpText("");
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시나리오 H: 내가 직접 답변한 경우 (humanAnswerMode)
  // 자기 답변을 자기가 평가하는 건 이상 → 공유 + 추가질문만
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isHumanAnswer && isOwner && !qaSet.isShared) {
    return (
      <div className="mt-6 mb-2">
        <div className="max-w-3xl mx-auto space-y-3">
          <JourneyStepper step={2} />

          {/* 답변 완료 축하 + 공유 유도 */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✅</span>
                <div>
                  <h3 className="text-base font-semibold">답변이 등록되었습니다!</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    이제 길을 열면 다른 사람들이 발자국을 남기고, 의견을 달 수 있습니다
                  </p>
                </div>
              </div>
              <Button onClick={onShareQA} className="w-full gap-2 h-10 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                📢 길 열고 발자국 받기
              </Button>
            </div>
          </div>

          {/* 추가 질문 */}
          <FollowUpInput
            followUpText={followUpText}
            setFollowUpText={setFollowUpText}
            onSend={handleSendFollowUp}
          />
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시나리오 A: 본인 QA, 미공유 (AI 답변)
  // 핵심 변경: 공유 전에도 판단(반대투자) + 의견 + 추가질문 가능
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (isOwner && !qaSet.isShared) {
    return (
      <div className="mt-6 mb-2">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Progress: 질문 → 답변 → [판단] 단계 */}
          <JourneyStepper step={2} />

          {/* AI 답변 평가 — 반대 발자국으로 표현 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 만족 → 길 열기로 이어짐 */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-blue-500/5 p-4 space-y-2 group hover:shadow-md transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📢</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">이 답변이 유용하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  길을 열면 다른 사람이 발자국을 남길 수 있고, 보상을 받습니다
                </p>
                <Button size="sm" className="w-full gap-1.5 mt-2.5 shadow-sm" onClick={onShareQA}>
                  📢 길 열고 발자국 받기
                </Button>
              </div>
            </div>

            {/* 불만족 → 반대 발자국(AI 답변 평가) */}
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20 p-4 space-y-2 group hover:shadow-md hover:shadow-red-100 dark:hover:shadow-red-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📉</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">답변이 부정확하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  반대 발자국으로 AI 답변의 문제점을 기록하세요
                </p>
                <Button size="sm" variant="outline" className="w-full gap-1.5 mt-2.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onCounterInvest}>
                  📉 반대 발자국
                </Button>
              </div>
            </div>
          </div>

          {/* 💎 빈틈 채우기 (통합 모듈) */}
          <GapFiller
            qaSetId={qaSet.id}
            onSubmitted={onOpinionSubmitted}
            onShareQA={onShareQA}
            userBalance={userBalance}
            userId={userId}
            originalQuestion={qaSet.messages?.find(m => m.role === "user")?.content ?? qaSet.title ?? ""}
            originalAnswer={qaSet.messages?.filter(m => m.role === "assistant").map(m => m.content).join("\n") ?? ""}
          />

          {/* 💬 기존 의견 목록 */}
          <OpinionsList
            qaSetId={qaSet.id}
            userId={userId}
            userBalance={userBalance}
            onRefresh={onOpinionSubmitted}
          />

          {/* 추가 질문 */}
          <FollowUpInput
            followUpText={followUpText}
            setFollowUpText={setFollowUpText}
            onSend={handleSendFollowUp}
          />
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 시나리오 B: 공유된 QA (본인 또는 타인)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const journeyStep = !myInvestment && isOwner ? 4 : investorCount > 0 ? 4 : 3;

  return (
    <div className="mt-6 mb-2">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Progress */}
        <JourneyStepper step={journeyStep} />

        {/* 발자국 현황 */}
        <InvestStats
          investorCount={investorCount}
          totalInvested={totalInvested}
          negativeCount={negativeCount}
          negativeInvested={negativeInvested}
        />

        {/* ── 발자국 행동 ── */}
        {isOwner ? (
          !myInvestment ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">👣</span>
                  <div>
                    <h3 className="text-base font-semibold">작성자 발자국으로 신뢰를 보여주세요</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      직접 발자국을 남기는 작성자의 길은 다른 사람의 발자국을 더 많이 유도합니다
                    </p>
                  </div>
                </div>
                <Button onClick={onInvest} className="w-full gap-2 h-10 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white shadow-sm">
                  👣 내 길에 발자국 남기기
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <span className="text-sm font-medium">내 발자국: {myInvestment.amount}👣</span>
                </div>
                {investorCount > 1 && (
                  <span className="text-xs text-muted-foreground">
                    + {investorCount - 1}명이 추가로 걸어감
                  </span>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* 걸어가기 */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 space-y-2 group hover:shadow-md hover:shadow-green-100 dark:hover:shadow-green-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">👣</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">정확하고 유용하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {investorCount === 0
                    ? "첫 번째로 걸어가세요 — 먼저 걸어갈수록 보상이 큽니다"
                    : `${investorCount}명이 걸어감 · 일찍 걸어갈수록 더 많은 보상`
                  }
                </p>
                <Button size="sm" className="w-full gap-1.5 mt-2.5 bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={onInvest}>
                  👣 발자국 남기기
                </Button>
              </div>
            </div>

            {/* 반대 발자국 */}
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20 p-4 space-y-2 group hover:shadow-md hover:shadow-red-100 dark:hover:shadow-red-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📉</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">틀리거나 오래된 정보라면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  근거와 함께 반대 발자국 — 동의자가 늘면 보상을 받습니다
                  {negativeCount > 0 && <span className="font-medium"> · 현재 {negativeCount}명 동의</span>}
                </p>
                <Button size="sm" variant="outline" className="w-full gap-1.5 mt-2.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onCounterInvest}>
                  📉 반대 발자국
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 💎 빈틈 채우기 (통합 모듈) */}
        <GapFiller
          qaSetId={qaSet.id}
          onSubmitted={onOpinionSubmitted}
          onShareQA={onShareQA}
          userBalance={userBalance}
          userId={userId}
          originalQuestion={qaSet.messages?.find(m => m.role === "user")?.content ?? qaSet.title ?? ""}
          originalAnswer={qaSet.messages?.filter(m => m.role === "assistant").map(m => m.content).join("\n") ?? ""}
        />

        {/* 💬 기존 의견 목록 */}
        <OpinionsList
          qaSetId={qaSet.id}
          userId={userId}
          userBalance={userBalance}
          onRefresh={onOpinionSubmitted}
        />

        {/* 추가 질문 */}
        <FollowUpInput
          followUpText={followUpText}
          setFollowUpText={setFollowUpText}
          onSend={handleSendFollowUp}
        />
      </div>
    </div>
  );
}
