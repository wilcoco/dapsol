"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { QASetWithMessages } from "@/types/qa-set";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qaSet: QASetWithMessages;
  onShared: () => void;
}

export function ShareDialog({ open, onOpenChange, qaSet, onShared }: ShareDialogProps) {
  const { data: session } = useSession();

  const balance = session?.user?.balance ?? 10000;
  const authority = Math.floor(session?.user?.authorityScore ?? 100);
  const maxInvestment = Math.min(authority, balance);

  const [investAmount, setInvestAmount] = useState(Math.min(authority, maxInvestment));
  const [creatorNote, setCreatorNote] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const handleShare = async () => {
    if (investAmount <= 0 || investAmount > maxInvestment) return;
    setIsSharing(true);

    try {
      const res = await fetch(`/api/qa-sets/${qaSet.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investAmount, creatorNote: creatorNote.trim() || undefined }),
      });

      if (res.ok) {
        try { localStorage.setItem("ci-onboarding-shared", "true"); } catch {}
        onShared();
        setShareSuccess(true);
        setTimeout(() => {
          setShareSuccess(false);
          onOpenChange(false);
        }, 2500);
      } else {
        const error = await res.json();
        alert(error.error || "공유에 실패했습니다.");
      }
    } catch (error) {
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        {shareSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="text-4xl">&#x2705;</div>
            <h3 className="text-lg font-semibold">Q&A가 공유되었습니다!</h3>
            <p className="text-sm text-muted-foreground">
              다른 사람들이 투자하면 수익 보상을 받을 수 있어요.
            </p>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>공유하기</DialogTitle>
          <DialogDescription>
            이 Q&A를 커뮤니티에 공유하고, 투자 포인트를 걸어 자신감을 표현하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Creator note */}
          <div>
            <label className="text-sm font-medium">
              나의 의견 <span className="text-muted-foreground font-normal">(선택)</span>
            </label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              AI 응답에 대한 보충 설명이나 공유 이유를 적어주세요.
            </p>
            <Textarea
              placeholder="예: AI 답변이 대체로 정확하지만, X 부분은 다르게 접근하는 게 좋습니다..."
              value={creatorNote}
              onChange={(e) => setCreatorNote(e.target.value)}
              className="min-h-[80px] max-h-40 resize-none text-sm"
              maxLength={2000}
            />
            {creatorNote.length > 0 && (
              <div className="text-xs text-muted-foreground text-right mt-1">
                {creatorNote.length} / 2000
              </div>
            )}
          </div>

          {/* Investment slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">초기 투자 포인트</label>
              <span className="text-xs text-muted-foreground">최대 {maxInvestment}P</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              높게 걸수록 검색에서 더 잘 보이고, 후속 투자 수익도 커집니다.
            </p>
            <Slider
              value={[investAmount]}
              onValueChange={(v) => setInvestAmount(v[0])}
              min={1}
              max={maxInvestment}
              step={1}
            />
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                value={investAmount}
                onChange={(e) =>
                  setInvestAmount(Math.min(maxInvestment, Math.max(1, parseInt(e.target.value) || 1)))
                }
                className="w-24 text-center"
              />
              <span className="text-sm text-muted-foreground">/ {maxInvestment}P</span>
            </div>
          </div>

          {/* Simple breakdown */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">공개 후 잔액:</span>
              <span className="font-mono">{balance - investAmount}P</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              다른 사람이 이 Q&A를 투자하면 포인트의 일부가 수익으로 돌아옵니다.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleShare} disabled={isSharing || investAmount <= 0}>
            {isSharing ? "처리 중..." : `${investAmount}P 걸고 공유하기`}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
