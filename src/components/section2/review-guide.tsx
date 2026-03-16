"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, Send } from "lucide-react";
import type { QASetWithMessages } from "@/types/qa-set";

interface ReviewSummary {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  investReason: string;
  counterReason: string;
  opinionPrompt: string;
  questionPrompt: string;
  investorCount: number;
  negativeCount: number;
  totalInvested: number;
}

interface ReviewGuideProps {
  qaSet: QASetWithMessages;
  isOwner: boolean;
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
  { value: "clarification", label: "명확화", icon: "🔍" },
  { value: "extension", label: "확장", icon: "➕" },
];

export function ReviewGuide({
  qaSet,
  isOwner,
  onInvest,
  onCounterInvest,
  onShareQA,
  onOpinionSubmitted,
  onAskFollowUp,
}: ReviewGuideProps) {
  const { data: session } = useSession();
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Investment explanation toggles
  const [showInvestInfo, setShowInvestInfo] = useState(false);
  const [showCounterInfo, setShowCounterInfo] = useState(false);

  // Opinion state
  const [opinionText, setOpinionText] = useState("");
  const [opinionRelation, setOpinionRelation] = useState("evidence");
  const [submittingOpinion, setSubmittingOpinion] = useState(false);
  const [opinionDone, setOpinionDone] = useState(false);

  // Follow-up question state
  const [followUpText, setFollowUpText] = useState("");

  // Show for any Q&A with at least 1 Q&A exchange (2 messages)
  const hasMessages = (qaSet.messages ?? []).length >= 2;
  const shouldShow = hasMessages;

  // Fetch review summary
  useEffect(() => {
    if (!qaSet.id || !shouldShow) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setReview(null);
    setOpinionDone(false);
    setOpinionText("");
    setFollowUpText("");

    fetch("/api/review-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qaSetId: qaSet.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && !d.error) setReview(d);
        else if (!cancelled) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [qaSet.id, shouldShow]);

  const handleSubmitOpinion = useCallback(async () => {
    if (!opinionText.trim() || submittingOpinion) return;
    setSubmittingOpinion(true);

    try {
      const opRes = await fetch("/api/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: opinionText.trim() }),
      });
      if (!opRes.ok) throw new Error("의견 저장 실패");
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

  if (!shouldShow) return null;

  // Loading
  if (loading) {
    return (
      <div className="border-t bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-950/30 dark:to-blue-950/20 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>AI가 이 Q&A를 분석하고 있습니다...</span>
        </div>
      </div>
    );
  }

  if (error || !review) return null;

  // Collapsed: mini action bar
  if (collapsed) {
    return (
      <div className="border-t bg-muted/20 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3" /> 리뷰 열기
          </button>
          <div className="flex gap-1.5 ml-auto">
            {!isOwner && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onInvest}>💰 투자</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200" onClick={onCounterInvest}>📉 반대</Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-950/30 dark:to-blue-950/20">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🤖</span>
            <span className="text-xs font-semibold text-muted-foreground">AI 리뷰</span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <ChevronUp className="h-3 w-3" /> 접기
          </button>
        </div>

        {/* ── Summary + Tags ── */}
        <p className="text-sm leading-relaxed">{review.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          {review.strengths.map((s, i) => (
            <Badge key={`s-${i}`} variant="outline" className="text-xs border-green-300 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">
              ✓ {s}
            </Badge>
          ))}
          {review.weaknesses.map((w, i) => (
            <Badge key={`w-${i}`} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
              ⚠ {w}
            </Badge>
          ))}
        </div>

        {/* ── 투자 / 반대 투자 (타인 QA일 때만) ── */}
        {!isOwner && (
          <div className="grid grid-cols-2 gap-2">
            {/* 투자 */}
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">💰</span>
                <span className="text-sm font-medium">도움이 됐다면</span>
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={onInvest}>
                투자하기
              </Button>
              <button
                onClick={() => setShowInvestInfo((v) => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showInvestInfo ? "접기 ▲" : "투자하면 어떻게 되나요? ▼"}
              </button>
              {showInvestInfo && (
                <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
                  <p>{review.investReason}</p>
                  <p>현재 {review.investorCount}명이 {review.totalInvested}P 투자 중</p>
                  <p>일찍 투자할수록 후속 투자자 보상의 더 많은 몫을 받습니다</p>
                </div>
              )}
            </div>

            {/* 반대 투자 */}
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📉</span>
                <span className="text-sm font-medium">문제가 있다면</span>
              </div>
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={onCounterInvest}>
                반대 투자
              </Button>
              <button
                onClick={() => setShowCounterInfo((v) => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCounterInfo ? "접기 ▲" : "반대 투자란? ▼"}
              </button>
              {showCounterInfo && (
                <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t">
                  <p>{review.counterReason}</p>
                  <p>근거와 함께 반대 투자하면, 동의하는 사람이 늘 때 보상을 받습니다</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 공유 유도 (본인 QA, 아직 미공유일 때) ── */}
        {isOwner && !qaSet.isShared && (
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">이 Q&A를 공유하면 다른 사람이 투자하고 의견을 남길 수 있습니다</p>
              <p className="text-xs text-muted-foreground mt-0.5">투자를 받으면 포인트 수익이 돌아옵니다</p>
            </div>
            <Button size="sm" onClick={onShareQA}>공유하기</Button>
          </div>
        )}

        {/* ── 의견 입력 (항상 보임) ── */}
        <div className="rounded-lg border bg-card p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">✍️</span>
            <span className="text-sm font-medium">보충 의견이 있다면</span>
            {opinionDone && (
              <Badge variant="outline" className="text-xs border-green-300 text-green-600">등록됨 ✓</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {review.opinionPrompt} — 의견은 지식 지도에 별도 노드로 연결됩니다.
          </p>

          {/* Relation type chips */}
          <div className="flex flex-wrap gap-1">
            {OPINION_RELATIONS.map((rel) => (
              <button
                key={rel.value}
                onClick={() => setOpinionRelation(rel.value)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  opinionRelation === rel.value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {rel.icon} {rel.label}
              </button>
            ))}
          </div>

          {/* Input + submit */}
          <div className="flex gap-2">
            <Textarea
              placeholder="이 Q&A에 대한 의견을 작성하세요..."
              value={opinionText}
              onChange={(e) => setOpinionText(e.target.value.slice(0, 1000))}
              className="min-h-[60px] text-sm resize-none flex-1"
              rows={2}
            />
            <Button
              size="sm"
              disabled={!opinionText.trim() || submittingOpinion}
              onClick={handleSubmitOpinion}
              className="self-end shrink-0"
            >
              {submittingOpinion ? <Loader2 className="h-4 w-4 animate-spin" /> : "등록"}
            </Button>
          </div>
        </div>

        {/* ── 추가 질문 입력 (항상 보임) ── */}
        <div className="rounded-lg border bg-card p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <span className="text-sm font-medium">추가 질문이 있다면</span>
          </div>

          {/* AI suggested question */}
          {review.questionPrompt && (
            <button
              onClick={() => {
                setFollowUpText(review.questionPrompt);
              }}
              className="w-full text-left text-xs px-3 py-2 rounded-md border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <span className="text-muted-foreground">AI 추천:</span>{" "}
              <span className="text-primary font-medium">{review.questionPrompt}</span>
            </button>
          )}

          {/* Input + send */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="추가 질문을 입력하세요..."
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendFollowUp();
                }
              }}
              className="flex-1 h-10 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              disabled={!followUpText.trim()}
              onClick={handleSendFollowUp}
              className="shrink-0 self-end gap-1"
            >
              <Send className="h-3.5 w-3.5" /> 질문
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            이 Q&A를 기반으로 AI에게 연쇄 질문합니다. 내 대화로 자동 생성됩니다.
          </p>
        </div>

      </div>
    </div>
  );
}
