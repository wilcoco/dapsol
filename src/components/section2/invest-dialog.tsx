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
import { getMaxInvestmentByLevel } from "@/lib/engine/trust-level";

interface InvestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qaSet: QASetWithMessages;
  onInvested: () => void;
  initialMode?: "positive" | "negative";
}

export function InvestDialog({ open, onOpenChange, qaSet, onInvested }: InvestDialogProps) {
  const { data: session, update: updateSession } = useSession();
  const [investAmount, setInvestAmount] = useState(50);
  const [comment, setComment] = useState("");
  const [isInvesting, setIsInvesting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const balance = session?.user?.balance ?? 1000;
  const myTrustLevel: number = session?.user?.trustLevel ?? 1;
  const maxByTrustLevel = getMaxInvestmentByLevel(myTrustLevel);
  const maxInvestment = Math.min(balance, maxByTrustLevel);

  const investorCount = qaSet.investorCount ?? 0;

  // Reset on open
  useEffect(() => {
    if (open) {
      setInvestAmount(Math.min(50, maxInvestment));
      setComment("");
      setSuccessMessage(null);
    }
  }, [open, maxInvestment]);

  const presets = [10, 50, 100, 200].filter(v => v <= maxInvestment);

  const handleInvest = async () => {
    if (investAmount <= 0 || investAmount > maxInvestment) return;
    setIsInvesting(true);

    try {
      const res = await fetch(`/api/qa-sets/${qaSet.id}/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: investAmount, isNegative: false, comment: comment.trim() || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        await updateSession();
        try { localStorage.setItem("ci-onboarding-invested", "true"); } catch {}

        if (data.trustLevelUp) {
          setSuccessMessage(`투자 완료! 신뢰 레벨이 Lv.${data.trustLevelUp.newLevel}로 올랐습니다!`);
        } else if (data.poolRelease) {
          setSuccessMessage(`투자 완료! 마일스톤 달성으로 보너스 ${data.poolRelease.releasedAmount}P가 배분됩니다!`);
        } else {
          setSuccessMessage("투자 완료!");
        }

        setTimeout(() => {
          onInvested();
          onOpenChange(false);
          setSuccessMessage(null);
        }, 2000);
      } else {
        const error = await res.json();
        alert(error.error || error.message || "투자에 실패했습니다.");
      }
    } catch (error) {
      console.error("Invest error:", error);
    } finally {
      setIsInvesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {successMessage ? (
          <div className="py-8 text-center space-y-3">
            <div className="text-4xl">&#x2705;</div>
            <h3 className="text-lg font-semibold">{successMessage}</h3>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="text-base">💰 투자하기</DialogTitle>
          <DialogDescription className="text-sm">
            이 Q&A가 가치 있다면 포인트로 투자하세요.
            다른 사람도 투자하면 수익 보상을 받습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">투자 포인트</label>
              <span className="text-xs text-muted-foreground">보유: {balance}P</span>
            </div>
            <Slider
              value={[investAmount]}
              onValueChange={(v) => setInvestAmount(v[0])}
              min={1}
              max={maxInvestment}
              step={Math.max(1, Math.floor(maxInvestment / 100))}
            />
            <div className="flex items-center gap-2 mt-2">
              <Input
                type="number"
                value={investAmount}
                onChange={(e) => setInvestAmount(Math.min(maxInvestment, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-20 text-center text-sm"
              />
              <span className="text-xs text-muted-foreground">P</span>
              <div className="flex-1" />
              {presets.map(v => (
                <Button
                  key={v}
                  variant={investAmount === v ? "default" : "outline"}
                  size="sm"
                  className="text-xs px-2 h-7"
                  onClick={() => setInvestAmount(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          </div>

          {/* Balance feedback */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>투자 후 잔액: <span className={`font-medium ${balance - investAmount < 100 ? "text-orange-500" : "text-foreground"}`}>{balance - investAmount}P</span></span>
            <span>({Math.round((investAmount / balance) * 100)}% 사용)</span>
          </div>

          {/* Simple explanation */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-base">💡</span>
              <span>현재 {investorCount}명이 투자 중이에요. 일찍 투자할수록 더 많은 수익을 받아요.</span>
            </div>
          </div>

          {/* Optional comment */}
          <div>
            <label className="text-xs text-muted-foreground">한줄 코멘트 (선택)</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 100))}
              placeholder="이 Q&A에 대한 한마디..."
              className="mt-1 min-h-[36px] max-h-16 resize-none text-sm"
              rows={1}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleInvest} disabled={isInvesting || investAmount <= 0}>
            {isInvesting ? "처리 중..." : `💰 ${investAmount}P 투자하기`}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
