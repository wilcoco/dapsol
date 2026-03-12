"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DiffView } from "@/components/shared/diff-view";
import { QASetWithMessages } from "@/types/qa-set";

interface ForkDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qaSet: QASetWithMessages;
  onForkCreated: (forked: QASetWithMessages) => void;
}

export function ForkDiffDialog({
  open,
  onOpenChange,
  qaSet,
  onForkCreated,
}: ForkDiffDialogProps) {
  const [isForking, setIsForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFork = async () => {
    setIsForking(true);
    setError(null);
    try {
      const res = await fetch(`/api/qa-sets/${qaSet.id}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "포크 실패");
        return;
      }
      const forked = await res.json();
      onForkCreated(forked);
      onOpenChange(false);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsForking(false);
    }
  };

  // Messages with diffs (improved assistant messages)
  const improvedMessages = qaSet.messages.filter(
    (msg) => msg.role === "assistant" && msg.isImproved && msg.originalContent
  );

  const assistantMessages = qaSet.messages.filter((m) => m.role === "assistant");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🍴 포크 & Diff 보기
          </DialogTitle>
          <DialogDescription>
            이 Q&A를 포크하여 내 작업공간으로 가져옵니다. 개선된 메시지의 변경사항을 확인하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 px-3 bg-muted/40 rounded-lg text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{qaSet.title ?? "제목 없음"}</p>
            <p className="text-xs text-muted-foreground">
              {assistantMessages.length}개 응답 · {improvedMessages.length}개 개선됨
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant="outline" className="text-xs">
              💬 {qaSet.messages.length}개 메시지
            </Badge>
            {improvedMessages.length > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                ✏️ {improvedMessages.length}개 개선
              </Badge>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 mt-2">
          <div className="space-y-3 pr-4">
            {improvedMessages.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-2xl mb-2">📄</p>
                <p className="text-sm">개선된 내용이 없습니다.</p>
                <p className="mt-1 text-xs">포크 후 AI 응답을 직접 편집할 수 있습니다.</p>
              </div>
            ) : (
              improvedMessages.map((msg) => (
                <div key={msg.id} className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b flex items-center justify-between">
                    <span>메시지 #{msg.orderIndex + 1} · AI 응답</span>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800 inline-block" />
                        추가
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-200 dark:bg-red-800 inline-block" />
                        삭제
                      </span>
                    </div>
                  </div>
                  <div className="p-3 max-h-48 overflow-auto">
                    <DiffView
                      original={msg.originalContent!}
                      current={msg.content}
                    />
                  </div>
                  {msg.improvementNote && (
                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-t text-xs text-amber-700 dark:text-amber-400">
                      💡 개선 사유: {msg.improvementNote}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={handleFork} disabled={isForking}>
            {isForking ? "포크 생성 중..." : "🍴 내 작업공간으로 포크"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
