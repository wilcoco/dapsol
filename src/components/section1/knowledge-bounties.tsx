"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface KnowledgeGap {
  id: string;
  gapType: string;
  description: string;
  severity: string;
  topicCluster: {
    id: string;
    name: string;
  };
}

interface KnowledgeBountiesProps {
  onStartQuestion: (question: string) => void;
  onAnswerGap?: (gapId: string, description: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  uncertain_answer: "\u2753",
  inconsistency: "\u26A1",
  missing_evidence: "\uD83D\uDCCE",
  conflicting_claims: "\u2694\uFE0F",
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  high: {
    label: "\uD83D\uDD34 \uB192\uC74C",
    className: "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
  },
  medium: {
    label: "\uD83D\uDFE1 \uBCF4\uD1B5",
    className: "border-yellow-300 text-yellow-700 dark:border-yellow-800 dark:text-yellow-400",
  },
  low: {
    label: "\uD83D\uDFE2 \uB0AE\uC74C",
    className: "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400",
  },
};

const INITIAL_VISIBLE = 3;

export function KnowledgeBounties({ onStartQuestion, onAnswerGap }: KnowledgeBountiesProps) {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/knowledge-gaps")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.gaps) setGaps(d.gaps);
      })
      .catch(() => {});
  }, []);

  if (gaps.length === 0) return null;

  const visibleGaps = expanded ? gaps : gaps.slice(0, INITIAL_VISIBLE);
  const hasMore = gaps.length > INITIAL_VISIBLE;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">{"\uD83C\uDFAF"} 인간의 지식이 필요한 영역</span>
        <span className="text-[10px] text-muted-foreground">
          이 주제에 경험이 있다면 기여해주세요
        </span>
      </div>
      <div className="space-y-2">
        {visibleGaps.map((gap) => {
          const typeIcon = TYPE_ICONS[gap.gapType] ?? "\u2753";
          const severity = SEVERITY_CONFIG[gap.severity] ?? SEVERITY_CONFIG.medium;

          return (
            <div
              key={gap.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onAnswerGap ? onAnswerGap(gap.id, gap.description) : onStartQuestion(gap.description)}
            >
              <span className="text-lg shrink-0">{typeIcon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant="outline" className={severity.className}>
                    {severity.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {gap.topicCluster.name}
                  </span>
                </div>
                <p className="text-sm">{gap.description}</p>
              </div>
              <span className="text-xs text-primary shrink-0 self-center">답하기 →</span>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
        >
          {expanded
            ? "접기"
            : `+${gaps.length - INITIAL_VISIBLE}개 더 보기`}
        </button>
      )}
    </div>
  );
}
