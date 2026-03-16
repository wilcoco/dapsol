"use client";

import { useState, useEffect } from "react";
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
import { HUNTING_REASON_TYPES } from "@/lib/constants";
import { getMaxInvestmentByLevel } from "@/lib/engine/trust-level";

interface HuntDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qaSet: QASetWithMessages;
  onHunted: () => void;
}

export function HuntDialog({ open, onOpenChange, qaSet, onHunted }: HuntDialogProps) {
  const { data: session, update: updateSession } = useSession();
  const [step, setStep] = useState<"reason" | "detail">("reason");
  const [huntingReason, setHuntingReason] = useState<string | null>(null);
  const [huntingEvidence, setHuntingEvidence] = useState("");
  const [huntAmount, setHuntAmount] = useState(10);
  const [comment, setComment] = useState("");
  const [isHunting, setIsHunting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const balance = session?.user?.balance ?? 1000;
  const myTrustLevel: number = session?.user?.trustLevel ?? 1;
  const maxByTrustLevel = getMaxInvestmentByLevel(myTrustLevel);
  const maxAmount = Math.min(balance, maxByTrustLevel);

  const hunterCount = qaSet.negativeCount ?? 0;

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("reason");
      setHuntingReason(null);
      setHuntingEvidence("");
      setHuntAmount(Math.min(10, maxAmount));
      setComment("");
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [open, maxAmount]);

  const handleHunt = async () => {
    if (!huntingReason || huntAmount <= 0 || huntAmount > maxAmount) return;
    setIsHunting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/qa-sets/${qaSet.id}/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: huntAmount,
          isNegative: true,
          comment: comment.trim() || undefined,
          huntingReason,
          huntingEvidence: huntingEvidence.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        await updateSession();

        if (data.isCollapsed) {
          setSuccessMessage("반대 투자 완료! 이 Q&A는 신뢰도 경고 상태가 됩니다.");
        } else {
          setSuccessMessage("반대 투자 등록 완료! 다른 반대 투자자가 동의하면 보상을 받습니다.");
        }

        setTimeout(() => {
          onHunted();
          onOpenChange(false);
          setSuccessMessage(null);
        }, 2500);
      } else {
        const error = await res.json();
        setErrorMessage(error.error || "반대 투자에 실패했습니다.");
      }
    } catch (error) {
      console.error("Hunt error:", error);
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsHunting(false);
    }
  };

  const selectedReasonInfo = HUNTING_REASON_TYPES.find(r => r.value === huntingReason);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {successMessage ? (
          <div className="py-8 text-center space-y-3">
            <div className="text-4xl">📉</div>
            <h3 className="text-lg font-semibold">{successMessage}</h3>
          </div>
        ) : step === "reason" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">📉 반대 투자하기</DialogTitle>
              <DialogDescription className="text-sm">
                AI 답변에서 발견한 문제를 선택하세요.
                정확한 반대 투자는 보상으로 돌아옵니다.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {HUNTING_REASON_TYPES.map((reason) => (
                <button
                  key={reason.value}
                  onClick={() => setHuntingReason(reason.value)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    huntingReason === reason.value
                      ? "border-red-400 bg-red-50 dark:bg-red-950/30"
                      : "border-border hover:border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{reason.icon}</span>
                    <span className="font-medium text-sm">{reason.label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{reason.labelEn}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-7">{reason.description}</p>
                </button>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                onClick={() => setStep("detail")}
                disabled={!huntingReason}
                className="bg-red-600 hover:bg-red-700"
              >
                다음
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">
                📉 {selectedReasonInfo?.icon} {selectedReasonInfo?.label} 반대 투자
              </DialogTitle>
              <DialogDescription className="text-sm">
                근거를 작성하고 반대 투자 포인트를 설정하세요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Evidence */}
              <div>
                <label className="text-sm font-medium">근거 작성</label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                  왜 이 답변에 문제가 있는지 구체적으로 설명해주세요.
                </p>
                <Textarea
                  placeholder="예: OO 라이브러리는 2024년에 deprecated 되었으며, 현재는 XX를 사용해야 합니다..."
                  value={huntingEvidence}
                  onChange={(e) => setHuntingEvidence(e.target.value.slice(0, 500))}
                  className="min-h-[80px] text-sm"
                  rows={3}
                />
                <div className="text-xs text-muted-foreground text-right mt-1">
                  {huntingEvidence.length}/500
                </div>
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">반대 투자 포인트</label>
                  <span className="text-xs text-muted-foreground">보유: {balance}P</span>
                </div>
                <Slider
                  value={[huntAmount]}
                  onValueChange={(v) => setHuntAmount(v[0])}
                  min={1}
                  max={maxAmount}
                  step={Math.max(1, Math.floor(maxAmount / 100))}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    value={huntAmount}
                    onChange={(e) => setHuntAmount(Math.min(maxAmount, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-20 text-center text-sm"
                  />
                  <span className="text-xs text-muted-foreground">P</span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 text-sm text-red-800 dark:text-red-300">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <span>
                    {hunterCount > 0
                      ? `현재 ${hunterCount}명이 반대 투자 중. 동의하는 반대 투자자가 많을수록 보상이 커집니다.`
                      : "첫 번째 반대 투자자가 됩니다. 다른 반대 투자자가 동의하면 선행 보상을 받습니다."
                    }
                  </span>
                </div>
              </div>

              {/* Optional comment */}
              <div>
                <label className="text-xs text-muted-foreground">한줄 코멘트 (선택)</label>
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 100))}
                  placeholder="이 Q&A에 대한 한마디..."
                  className="mt-1 text-sm"
                />
              </div>

              {errorMessage && (
                <div className="p-2 rounded bg-red-100 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-400">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("reason")}>
                뒤로
              </Button>
              <Button
                onClick={handleHunt}
                disabled={isHunting || huntAmount <= 0 || !huntingReason}
                className="bg-red-600 hover:bg-red-700"
              >
                {isHunting ? "처리 중..." : `📉 ${huntAmount}P 반대 투자하기`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
