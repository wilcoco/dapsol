"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface AIQuestion {
  id: string;
  title: string;
  question: string;
  aiQuestionType: string | null;
  rewardMultiplier: number;
  answerCount: number;
  totalInvested: number;
  investorCount: number;
  cluster: { id: string; name: string } | null;
  createdAt: string;
  // QASet.summary에 저장된 "왜 이 질문을?"
  reason?: string;
}

interface AIQuestionsFeedProps {
  onAnswerQuestion: (qaSetId: string) => void;
  limit?: number;
}

export function AIQuestionsFeed({ onAnswerQuestion, limit = 5 }: AIQuestionsFeedProps) {
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/qa-sets/ai-questions?limit=${expanded ? 20 : limit}`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [limit, expanded]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-40" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return null;
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖→👤</span>
          <span className="text-sm font-semibold">AI가 알고 싶어요</span>
          <Badge variant="secondary" className="text-[10px]">
            첫 답변 {questions[0]?.rewardMultiplier ?? 3}배 보너스
          </Badge>
        </div>
        {questions.length > limit && !expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setExpanded(true)}
          >
            더보기
          </Button>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-2">
        {questions.slice(0, expanded ? 20 : limit).map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onAnswer={() => onAnswerQuestion(q.id)}
            timeAgo={timeAgo(q.createdAt)}
          />
        ))}
      </div>

      {expanded && questions.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setExpanded(false)}
        >
          접기
        </Button>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  onAnswer,
  timeAgo,
}: {
  question: AIQuestion;
  onAnswer: () => void;
  timeAgo: string;
}) {
  const [showReason, setShowReason] = useState(false);

  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors border-purple-200/50 dark:border-purple-800/30"
      onClick={onAnswer}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Question text */}
            <p className="text-sm font-medium leading-relaxed">
              {question.question || question.title}
            </p>

            {/* Meta info */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {question.cluster && (
                <Badge variant="outline" className="text-[10px]">
                  {question.cluster.name}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {timeAgo}
              </span>
              {question.answerCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ✍️ {question.answerCount}명 답변
                </span>
              )}
              {question.investorCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  📊 {question.investorCount}명 경작
                </span>
              )}
            </div>

            {/* Why this question? (collapsible) */}
            {question.reason && (
              <button
                className="mt-2 text-[10px] text-primary/70 hover:text-primary flex items-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReason(!showReason);
                }}
              >
                💡 왜 이 질문을?
              </button>
            )}
            {showReason && question.reason && (
              <p className="mt-1 text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                {question.reason}
              </p>
            )}
          </div>

          {/* Answer button */}
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 self-center border-purple-300 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/30"
            onClick={(e) => {
              e.stopPropagation();
              onAnswer();
            }}
          >
            답하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
