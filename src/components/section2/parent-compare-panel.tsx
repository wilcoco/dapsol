"use client";

/**
 * ParentComparePanel
 * 포크된 Q&A에서 부모 Q&A와 내 대화를 나란히 비교하는 슬라이드오버 패널.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MessageData } from "@/types/qa-set";

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  orderIndex: number;
}

interface QASummary {
  id: string;
  title: string | null;
  messages: MessageRow[];
}

interface ParentComparePanelProps {
  open: boolean;
  onClose: () => void;
  parentQASetId: string;
  currentTitle: string | null;
  currentMessages: MessageRow[] | MessageData[];
}

export function ParentComparePanel({
  open,
  onClose,
  parentQASetId,
  currentTitle,
  currentMessages,
}: ParentComparePanelProps) {
  const [parent, setParent] = useState<QASummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !parentQASetId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/qa-sets/${parentQASetId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setParent({ id: d.id, title: d.title, messages: d.messages ?? [] }))
      .finally(() => setLoading(false));
  }, [open, parentQASetId]);

  if (!open) return null;

  // 양쪽 메시지를 pair로 매핑 (같은 orderIndex 기준)
  const maxLen = Math.max(
    (parent?.messages ?? []).length,
    currentMessages.length
  );

  const pairs = Array.from({ length: maxLen }, (_, i) => ({
    parent: parent?.messages[i] ?? null,
    current: currentMessages[i] ?? null,
  }));

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-4xl bg-background shadow-2xl flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">원본과 내 대화 비교</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕ 닫기</Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-2 gap-px bg-border shrink-0">
          <div className="bg-background px-4 py-2 text-xs font-medium text-muted-foreground truncate">
            원래 대화: {parent?.title ?? "원본 Q&A"}
          </div>
          <div className="bg-background px-4 py-2 text-xs font-medium text-muted-foreground truncate">
            내 대화: {currentTitle ?? "내 확장 대화"}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground animate-pulse">
              불러오는 중...
            </div>
          ) : (
            <div className="divide-y">
              {pairs.map((pair, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-px bg-border min-h-[80px]">
                  {/* Parent message */}
                  <MessageCell msg={pair.parent} side="parent" />
                  {/* Current message */}
                  <MessageCell msg={pair.current} side="current" isDiff={pair.parent?.content !== pair.current?.content} />
                </div>
              ))}
              {pairs.length === 0 && (
                <div className="col-span-2 text-center py-12 text-muted-foreground">
                  비교할 메시지가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageCell({
  msg,
  side,
  isDiff,
}: {
  msg: MessageRow | null;
  side: "parent" | "current";
  isDiff?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!msg) {
    return (
      <div className="bg-muted/20 px-4 py-3 flex items-center justify-center">
        <span className="text-xs text-muted-foreground/40 italic">없음</span>
      </div>
    );
  }

  const isUser = msg.role === "user";
  const preview = msg.content.slice(0, 200);
  const hasMore = msg.content.length > 200;
  const displayed = expanded ? msg.content : preview;

  return (
    <div
      className={`px-4 py-3 text-xs leading-relaxed bg-background ${
        isDiff && side === "current" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`font-medium ${isUser ? "text-primary" : "text-emerald-700 dark:text-emerald-400"}`}>
          {isUser ? "👤 질문" : "🤖 답변"}
        </span>
        {isDiff && side === "current" && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-300 text-blue-600">
            변경됨
          </Badge>
        )}
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">{displayed}</p>
      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-primary hover:underline mt-1"
        >
          {expanded ? "접기 ▲" : `더 보기 (${msg.content.length - 200}자 더) ▼`}
        </button>
      )}
    </div>
  );
}
