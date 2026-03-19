"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ChevronRight } from "lucide-react";
import type { QASetWithMessages } from "@/types/qa-set";

interface ReviewGuideProps {
  qaSet: QASetWithMessages;
  isOwner: boolean;
  userId?: string;
  isHumanAnswer?: boolean;
  onInvest: () => void;
  onCounterInvest: () => void;
  onShareQA: () => void;
  onOpinionSubmitted: () => void;
  onAskFollowUp: (question: string) => void;
}

const OPINION_RELATIONS = [
  { value: "evidence", label: "근거 보충", icon: "📎" },
  { value: "counterargument", label: "반박", icon: "⚡" },
  { value: "application", label: "경험 공유", icon: "💡" },
  { value: "extension", label: "확장", icon: "➕" },
];

// AI 답변의 알려진 오류 유형 (학술 분류 기반)
const AI_ERROR_TYPES = [
  { value: "factual_error", label: "사실 오류", icon: "❌", desc: "틀린 사실이나 존재하지 않는 정보", color: "red" },
  { value: "outdated_info", label: "오래된 정보", icon: "📅", desc: "현재 기준에 맞지 않는 과거 정보", color: "amber" },
  { value: "hallucination", label: "환각(날조)", icon: "👻", desc: "그럴듯하지만 완전히 만들어낸 내용", color: "purple" },
  { value: "oversimplification", label: "과도한 단순화", icon: "📐", desc: "복잡한 현실을 지나치게 단순화", color: "blue" },
  { value: "missing_context", label: "맥락 누락", icon: "🔍", desc: "중요한 조건이나 예외를 빠뜨림", color: "orange" },
  { value: "confident_uncertainty", label: "불확실한데 확신", icon: "🎭", desc: "모르는 것을 아는 것처럼 답변", color: "pink" },
];

// ─── Progress Stepper ───
function JourneyStepper({ step }: { step: number }) {
  const steps = [
    { label: "질문", icon: "?" },
    { label: "답변", icon: "A" },
    { label: "판단", icon: "🔍" },
    { label: "공유", icon: "📢" },
    { label: "투자", icon: "💰" },
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
          <span className="text-sm">💰</span>
          <span className="text-base font-bold tabular-nums">{totalInvested}</span>
          <span>P · {investorCount}명</span>
        </div>
      )}
      {negativeCount > 0 && (
        <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full font-medium">
          <span className="text-sm">📉</span>
          <span className="text-base font-bold tabular-nums">{negativeInvested}</span>
          <span>P · {negativeCount}명</span>
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

// ─── AI Error Type Selector ───
function AIErrorFeedback({
  qaSetId,
  onSubmitted,
}: {
  qaSetId: string;
  onSubmitted: () => void;
}) {
  const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const toggle = (value: string) => {
    setSelectedErrors((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSubmit = async () => {
    if (selectedErrors.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const labels = selectedErrors
        .map((v) => AI_ERROR_TYPES.find((t) => t.value === v)?.label)
        .filter(Boolean);
      const content = `[AI 오류 신고] ${labels.join(", ")}${detail.trim() ? `\n\n${detail.trim()}` : ""}`;

      const opRes = await fetch("/api/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!opRes.ok) throw new Error("fail");
      const opinion = await opRes.json();
      await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceOpinionId: opinion.id,
          targetQASetId: qaSetId,
          relationType: "counterargument",
        }),
      });
      setDone(true);
      onSubmitted();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3 text-center">
        <span className="text-sm text-green-700 dark:text-green-400">✅ 오류 신고가 등록되었습니다</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-base">🔎</span>
        <span className="text-sm font-medium">AI 답변 오류 신고</span>
        <span className="text-[10px] text-muted-foreground">해당하는 항목을 선택하세요</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {AI_ERROR_TYPES.map((err) => {
          const selected = selectedErrors.includes(err.value);
          return (
            <button
              key={err.value}
              onClick={() => toggle(err.value)}
              className={`text-left p-2 rounded-lg border transition-all text-[11px] ${
                selected
                  ? "border-red-400 bg-red-50 dark:bg-red-950/30 ring-1 ring-red-400"
                  : "border-border hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/10"
              }`}
            >
              <div className="flex items-center gap-1">
                <span>{err.icon}</span>
                <span className="font-medium">{err.label}</span>
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{err.desc}</p>
            </button>
          );
        })}
      </div>
      {selectedErrors.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="구체적 내용 (선택)..."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="flex-1 h-8 px-2.5 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            disabled={submitting}
            onClick={handleSubmit}
            className="shrink-0 h-8 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "🔎"} 신고
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
  isHumanAnswer,
  onInvest,
  onCounterInvest,
  onShareQA,
  onOpinionSubmitted,
  onAskFollowUp,
}: ReviewGuideProps) {
  const [opinionText, setOpinionText] = useState("");
  const [opinionRelation, setOpinionRelation] = useState("evidence");
  const [submittingOpinion, setSubmittingOpinion] = useState(false);
  const [opinionDone, setOpinionDone] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [expandOpinion, setExpandOpinion] = useState(false);

  const investorCount = qaSet.investorCount ?? 0;
  const totalInvested = qaSet.totalInvested ?? 0;
  const negativeCount = qaSet.negativeCount ?? 0;
  const negativeInvested = qaSet.negativeInvested ?? 0;
  const myInvestment = (qaSet.investments ?? []).find(
    (inv) => inv.userId === userId && !inv.isNegative
  );

  const handleSubmitOpinion = useCallback(async () => {
    if (!opinionText.trim() || submittingOpinion) return;
    setSubmittingOpinion(true);
    try {
      const opRes = await fetch("/api/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: opinionText.trim() }),
      });
      if (!opRes.ok) throw new Error("fail");
      const opinion = await opRes.json();
      await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceOpinionId: opinion.id,
          targetQASetId: qaSet.id,
          relationType: opinionRelation,
        }),
      });
      setOpinionDone(true);
      setOpinionText("");
      setExpandOpinion(false);
      onOpinionSubmitted();
    } catch (err) {
      console.error("Opinion submit error:", err);
    } finally {
      setSubmittingOpinion(false);
    }
  }, [opinionText, opinionRelation, qaSet.id, submittingOpinion, onOpinionSubmitted]);

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
                    이제 공유하면 다른 사람들이 투자하고, 의견을 달 수 있습니다
                  </p>
                </div>
              </div>
              <Button onClick={onShareQA} className="w-full gap-2 h-10 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                📢 공유하고 투자 받기
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

          {/* AI 답변 평가 — 반대투자로 표현 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 만족 → 공유로 이어짐 */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-blue-500/5 p-4 space-y-2 group hover:shadow-md transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📢</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">이 답변이 유용하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  공유하면 다른 사람이 투자할 수 있고, 투자 보상을 받습니다
                </p>
                <Button size="sm" className="w-full gap-1.5 mt-2.5 shadow-sm" onClick={onShareQA}>
                  📢 공유하고 투자 받기
                </Button>
              </div>
            </div>

            {/* 불만족 → 반대투자(AI 답변 평가) */}
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20 p-4 space-y-2 group hover:shadow-md hover:shadow-red-100 dark:hover:shadow-red-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📉</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">답변이 부정확하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  반대 투자로 AI 답변의 문제점을 기록하세요
                </p>
                <Button size="sm" variant="outline" className="w-full gap-1.5 mt-2.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onCounterInvest}>
                  📉 반대 투자
                </Button>
              </div>
            </div>
          </div>

          {/* AI 오류 신고 */}
          <AIErrorFeedback qaSetId={qaSet.id} onSubmitted={onOpinionSubmitted} />

          {/* 의견 + 추가질문 — 공유 전에도 항상 접근 가능 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 의견 */}
            <div
              className="rounded-xl border p-3 transition-all cursor-pointer hover:border-primary/30"
              onClick={() => !expandOpinion && setExpandOpinion(true)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">✍️</span>
                  <span className="text-sm font-medium">내 의견</span>
                </div>
                {opinionDone && (
                  <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">등록됨 ✓</Badge>
                )}
              </div>
              {!expandOpinion && (
                <p className="text-[11px] text-muted-foreground mt-1">경험, 반박, 보충 근거 추가</p>
              )}
              {expandOpinion && (
                <div className="mt-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1.5 flex-wrap">
                    {OPINION_RELATIONS.map((rel) => (
                      <button
                        key={rel.value}
                        onClick={() => setOpinionRelation(rel.value)}
                        className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                          opinionRelation === rel.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {rel.icon} {rel.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="의견을 작성하세요..."
                      value={opinionText}
                      onChange={(e) => setOpinionText(e.target.value.slice(0, 1000))}
                      className="min-h-[48px] text-sm resize-none flex-1"
                      rows={2}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      disabled={!opinionText.trim() || submittingOpinion}
                      onClick={handleSubmitOpinion}
                      className="self-end shrink-0 gap-1"
                    >
                      {submittingOpinion ? <Loader2 className="h-3 w-3 animate-spin" /> : "✍️"} 등록
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 추가 질문 — 항상 보임 */}
            <FollowUpInput
              followUpText={followUpText}
              setFollowUpText={setFollowUpText}
              onSend={handleSendFollowUp}
            />
          </div>
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

        {/* 투자 현황 */}
        <InvestStats
          investorCount={investorCount}
          totalInvested={totalInvested}
          negativeCount={negativeCount}
          negativeInvested={negativeInvested}
        />

        {/* ── 투자 행동 ── */}
        {isOwner ? (
          !myInvestment ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-5">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💰</span>
                  <div>
                    <h3 className="text-base font-semibold">작성자 투자로 신뢰를 보여주세요</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      직접 포인트를 거는 작성자의 Q&A는 다른 사람의 투자를 더 많이 유도합니다
                    </p>
                  </div>
                </div>
                <Button onClick={onInvest} className="w-full gap-2 h-10 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white shadow-sm">
                  💰 내 Q&A에 투자하기
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <span className="text-sm font-medium">내 투자: {myInvestment.amount}P</span>
                </div>
                {investorCount > 1 && (
                  <span className="text-xs text-muted-foreground">
                    + {investorCount - 1}명이 추가 투자
                  </span>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* 투자 */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 space-y-2 group hover:shadow-md hover:shadow-green-100 dark:hover:shadow-green-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">💰</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">정확하고 유용하다면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {investorCount === 0
                    ? "첫 번째 투자자가 되세요 — 초기 투자자일수록 보상이 큽니다"
                    : `${investorCount}명이 신뢰함 · 일찍 투자할수록 더 많은 보상`
                  }
                </p>
                <Button size="sm" className="w-full gap-1.5 mt-2.5 bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={onInvest}>
                  💰 투자하기
                </Button>
              </div>
            </div>

            {/* 반대 투자 */}
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50/50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/20 p-4 space-y-2 group hover:shadow-md hover:shadow-red-100 dark:hover:shadow-red-950/20 transition-all">
              <div className="absolute -bottom-4 -right-4 text-6xl opacity-10 group-hover:opacity-20 transition-opacity">📉</div>
              <div className="relative">
                <h3 className="text-sm font-semibold">틀리거나 오래된 정보라면</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  근거와 함께 반대 투자 — 동의자가 늘면 보상을 받습니다
                  {negativeCount > 0 && <span className="font-medium"> · 현재 {negativeCount}명 동의</span>}
                </p>
                <Button size="sm" variant="outline" className="w-full gap-1.5 mt-2.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onCounterInvest}>
                  📉 반대 투자
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── AI 오류 신고 ── */}
        <AIErrorFeedback qaSetId={qaSet.id} onSubmitted={onOpinionSubmitted} />

        {/* ── 의견 + 추가질문 (항상 2컬럼, 독립 접근) ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* 의견 */}
          <div
            className="rounded-xl border p-3 transition-all cursor-pointer hover:border-primary/30"
            onClick={() => !expandOpinion && setExpandOpinion(true)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">✍️</span>
                <span className="text-sm font-medium">내 의견 추가</span>
              </div>
              {opinionDone && (
                <Badge variant="outline" className="text-[10px] border-green-300 text-green-600">등록됨 ✓</Badge>
              )}
            </div>
            {!expandOpinion && (
              <p className="text-[11px] text-muted-foreground mt-1">
                경험, 반박, 보충 근거를 지식맵에 연결
              </p>
            )}
            {expandOpinion && (
              <div className="mt-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-1.5 flex-wrap">
                  {OPINION_RELATIONS.map((rel) => (
                    <button
                      key={rel.value}
                      onClick={() => setOpinionRelation(rel.value)}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                        opinionRelation === rel.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {rel.icon} {rel.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="의견을 작성하세요..."
                    value={opinionText}
                    onChange={(e) => setOpinionText(e.target.value.slice(0, 1000))}
                    className="min-h-[48px] text-sm resize-none flex-1"
                    rows={2}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    disabled={!opinionText.trim() || submittingOpinion}
                    onClick={handleSubmitOpinion}
                    className="self-end shrink-0 gap-1"
                  >
                    {submittingOpinion ? <Loader2 className="h-3 w-3 animate-spin" /> : "✍️"} 등록
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 추가 질문 — 항상 보임 (의견 펼쳐도 독립) */}
          <FollowUpInput
            followUpText={followUpText}
            setFollowUpText={setFollowUpText}
            onSend={handleSendFollowUp}
          />
        </div>
      </div>
    </div>
  );
}
