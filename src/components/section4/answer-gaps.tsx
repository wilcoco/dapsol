"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface KnowledgeGap {
  id: string;
  gapType: string;
  description: string;
  severity: string;
  _isRelevant?: boolean;
  topicCluster: {
    id: string;
    name: string;
  };
}

interface AnswerGapsProps {
  onAnswerGap: (gapId: string, description: string) => void;
}

const TYPE_INFO: Record<string, { icon: string; label: string }> = {
  uncertain_answer: { icon: "❓", label: "불확실한 답변" },
  inconsistency: { icon: "⚡", label: "불일치" },
  missing_evidence: { icon: "📎", label: "근거 부족" },
  conflicting_claims: { icon: "⚔️", label: "의견 충돌" },
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "긴급", className: "border-red-300 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/30" },
  medium: { label: "보통", className: "border-yellow-300 text-yellow-700 bg-yellow-50 dark:border-yellow-800 dark:text-yellow-400 dark:bg-yellow-950/30" },
  low: { label: "낮음", className: "border-green-300 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-400 dark:bg-green-950/30" },
};

export function AnswerGaps({ onAnswerGap }: AnswerGapsProps) {
  const { data: session } = useSession();
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGaps = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-gaps?personalized=true&limit=20");
      if (res.ok) {
        const data = await res.json();
        setGaps(data.gaps ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGaps(); }, [fetchGaps]);

  if (!session?.user?.id) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        로그인이 필요합니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const relevantGaps = gaps.filter(g => g._isRelevant);
  const otherGaps = gaps.filter(g => !g._isRelevant);

  return (
    <div className="h-full overflow-y-auto pb-14 md:pb-6">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold">🤖→👤 AI가 묻고 있는 질문</h1>
          <p className="text-sm text-muted-foreground mt-1">
            기존 Q&A에서 AI가 발견한 지식 갭입니다. 인간의 경험과 지식으로 답변해주세요.
          </p>
        </div>

        {gaps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-3">
              <div className="text-4xl">✅</div>
              <h3 className="font-medium text-lg">현재 미해결 질문이 없습니다</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                커뮤니티의 Q&A가 쌓이면 AI가 새로운 질문을 발견합니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Personalized section */}
            {relevantGaps.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">🎯 내 전문 분야의 질문</span>
                  <span className="text-xs text-muted-foreground">
                    과거 활동 기반 맞춤 추천
                  </span>
                </div>
                <div className="space-y-3">
                  {relevantGaps.map(gap => (
                    <GapCard key={gap.id} gap={gap} onAnswer={onAnswerGap} highlighted />
                  ))}
                </div>
              </div>
            )}

            {/* All gaps */}
            <div className="space-y-3">
              {relevantGaps.length > 0 && (
                <h3 className="text-sm font-semibold">전체 질문</h3>
              )}
              <div className="space-y-3">
                {(relevantGaps.length > 0 ? otherGaps : gaps).map(gap => (
                  <GapCard key={gap.id} gap={gap} onAnswer={onAnswerGap} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GapCard({
  gap,
  onAnswer,
  highlighted,
}: {
  gap: KnowledgeGap;
  onAnswer: (gapId: string, description: string) => void;
  highlighted?: boolean;
}) {
  const typeInfo = TYPE_INFO[gap.gapType] ?? { icon: "❓", label: gap.gapType };
  const severity = SEVERITY_CONFIG[gap.severity] ?? SEVERITY_CONFIG.medium;

  return (
    <Card
      className={`cursor-pointer hover:bg-accent/50 transition-colors ${highlighted ? "border-primary/30 bg-primary/5" : ""}`}
      onClick={() => onAnswer(gap.id, gap.description)}
    >
      <CardContent className="py-4 flex items-start gap-4">
        <span className="text-2xl shrink-0 mt-0.5">{typeInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${severity.className}`}>
              {severity.label}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {gap.topicCluster.name}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {typeInfo.label}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed">{gap.description}</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 self-center">
          답하기
        </Button>
      </CardContent>
    </Card>
  );
}
