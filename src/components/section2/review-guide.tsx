"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send } from "lucide-react";
import type { QASetWithMessages } from "@/types/qa-set";

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
  const [opinionText, setOpinionText] = useState("");
  const [opinionRelation, setOpinionRelation] = useState("evidence");
  const [submittingOpinion, setSubmittingOpinion] = useState(false);
  const [opinionDone, setOpinionDone] = useState(false);
  const [followUpText, setFollowUpText] = useState("");

  const investorCount = qaSet.investorCount ?? 0;
  const totalInvested = qaSet.totalInvested ?? 0;
  const negativeCount = qaSet.negativeCount ?? 0;

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

  return (
    <div className="border-t">
      <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">

        {/* ── 행동 카드 한 줄 ── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* 타인 QA: 투자 / 반대 투자 */}
          {!isOwner && qaSet.isShared && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={onInvest}>
                💰 투자
                {investorCount > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">{totalInvested}P · {investorCount}명</span>
                )}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={onCounterInvest}>
                📉 반대 투자
                {negativeCount > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">{negativeCount}명</span>
                )}
              </Button>
            </>
          )}

          {/* 본인 미공유 QA: 공유 */}
          {isOwner && !qaSet.isShared && (
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={onShareQA}>
              공유하기
              <span className="text-[10px] opacity-70 ml-0.5">투자 받기</span>
            </Button>
          )}

          {/* 구분선 */}
          <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

          {/* 의견 추가 라벨 */}
          <span className="text-xs text-muted-foreground">또는</span>
        </div>

        {/* ── 의견 입력 ── */}
        <div className="flex gap-2 items-start">
          <div className="flex flex-wrap gap-1 shrink-0 pt-1.5">
            {OPINION_RELATIONS.map((rel) => (
              <button
                key={rel.value}
                onClick={() => setOpinionRelation(rel.value)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  opinionRelation === rel.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:border-border"
                }`}
                title={rel.label}
              >
                {rel.icon}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="이 답변에 보충할 의견이 있다면 여기에..."
            value={opinionText}
            onChange={(e) => setOpinionText(e.target.value.slice(0, 1000))}
            className="min-h-[40px] text-sm resize-none flex-1"
            rows={1}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!opinionText.trim() || submittingOpinion}
            onClick={handleSubmitOpinion}
            className="shrink-0 self-start mt-0.5 h-8 text-xs"
          >
            {submittingOpinion ? <Loader2 className="h-3 w-3 animate-spin" /> : "✍️ 의견"}
          </Button>
          {opinionDone && (
            <Badge variant="outline" className="text-[10px] border-green-300 text-green-600 self-center shrink-0">✓</Badge>
          )}
        </div>

        {/* ── 추가 질문 입력 ── */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="추가 질문이 있다면 여기에..."
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendFollowUp();
              }
            }}
            className="flex-1 h-8 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            disabled={!followUpText.trim()}
            onClick={handleSendFollowUp}
            className="shrink-0 h-8 text-xs gap-1"
          >
            <Send className="h-3 w-3" /> 질문
          </Button>
        </div>

      </div>
    </div>
  );
}
