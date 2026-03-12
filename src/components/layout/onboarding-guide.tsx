"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORAGE_KEY_DISMISSED = "ci-onboarding-dismissed";
const STORAGE_KEY_STEP1 = "ci-onboarding-step1";
const STORAGE_KEY_STEP2 = "ci-onboarding-shared";
const STORAGE_KEY_STEP3 = "ci-onboarding-invested";

interface OnboardingGuideProps {
  hasAskedQuestion?: boolean;
  onUnlockExplore?: () => void;
}

export function OnboardingGuide({ hasAskedQuestion, onUnlockExplore }: OnboardingGuideProps) {
  const [dismissed, setDismissed] = useState(true);
  const [step1, setStep1] = useState(false);
  const [step2, setStep2] = useState(false);
  const [step3, setStep3] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY_DISMISSED) === "true");
    setStep1(localStorage.getItem(STORAGE_KEY_STEP1) === "true");
    setStep2(localStorage.getItem(STORAGE_KEY_STEP2) === "true");
    setStep3(localStorage.getItem(STORAGE_KEY_STEP3) === "true");
  }, []);

  // Track step1
  useEffect(() => {
    if (hasAskedQuestion && !step1) {
      localStorage.setItem(STORAGE_KEY_STEP1, "true");
      setStep1(true);
    }
  }, [hasAskedQuestion, step1]);

  // When step2 (shared) happens, unlock explore tab
  useEffect(() => {
    if (step2 && onUnlockExplore) {
      onUnlockExplore();
    }
  }, [step2, onUnlockExplore]);

  // Poll for step2/step3 changes from dialogs
  useEffect(() => {
    const interval = setInterval(() => {
      const s2 = localStorage.getItem(STORAGE_KEY_STEP2) === "true";
      const s3 = localStorage.getItem(STORAGE_KEY_STEP3) === "true";
      if (s2 !== step2) setStep2(s2);
      if (s3 !== step3) setStep3(s3);
    }, 2000);
    return () => clearInterval(interval);
  }, [step2, step3]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY_DISMISSED, "true");
    setDismissed(true);
  };

  if (dismissed) return null;

  const allDone = step1 && step2 && step3;

  // Current step context message
  const contextMessage = !step1
    ? "AI에게 첫 번째 질문을 해보세요"
    : !step2
      ? "대화가 끝나면 검토 모드에서 공유해보세요"
      : !step3
        ? "다른 사람의 Q&A를 찾아 추천해보세요"
        : "모든 기능을 경험했어요!";

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs md:bottom-4 bottom-20">
      <Card className="shadow-lg border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              {allDone ? "시작 완료!" : "시작 가이드"}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
            >
              X
            </Button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 justify-center">
            {[step1, step2, step3].map((done, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  done ? "bg-green-500" : "bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>

          <p className="text-sm text-center text-muted-foreground">
            {contextMessage}
          </p>

          <ul className="space-y-1.5 text-xs">
            <li className={`flex items-center gap-2 ${step1 ? "text-muted-foreground" : ""}`}>
              <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                step1 ? "border-green-500 bg-green-50 text-green-600" : "border-muted-foreground/30"
              }`}>
                {step1 ? "✓" : "1"}
              </span>
              <span className={step1 ? "line-through" : "font-medium"}>질문하기</span>
            </li>
            <li className={`flex items-center gap-2 ${step2 ? "text-muted-foreground" : ""}`}>
              <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                step2 ? "border-green-500 bg-green-50 text-green-600" : "border-muted-foreground/30"
              }`}>
                {step2 ? "✓" : "2"}
              </span>
              <span className={step2 ? "line-through" : step1 ? "font-medium" : ""}>공유하기</span>
            </li>
            <li className={`flex items-center gap-2 ${step3 ? "text-muted-foreground" : ""}`}>
              <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                step3 ? "border-green-500 bg-green-50 text-green-600" : "border-muted-foreground/30"
              }`}>
                {step3 ? "✓" : "3"}
              </span>
              <span className={step3 ? "line-through" : step2 ? "font-medium" : ""}>추천하기</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
