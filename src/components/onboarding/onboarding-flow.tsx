"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

type Step = "interests" | "question" | "answer" | "celebration";

interface OnboardingQuestion {
  question: string;
  tags: string[];
}

interface OnboardingFlowProps {
  onComplete: () => void;
}

const INTEREST_OPTIONS = [
  { id: "개발", icon: "💻", label: "개발" },
  { id: "마케팅", icon: "📢", label: "마케팅" },
  { id: "디자인", icon: "🎨", label: "디자인" },
  { id: "경영/전략", icon: "📊", label: "경영/전략" },
  { id: "데이터", icon: "📈", label: "데이터" },
  { id: "HR", icon: "👥", label: "HR/인사" },
  { id: "영업", icon: "🤝", label: "영업" },
  { id: "기획", icon: "📋", label: "기획/PM" },
];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { data: session, update: updateSession } = useSession();
  const [step, setStep] = useState<Step>("interests");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [otherAnswers, setOtherAnswers] = useState<{ creatorName: string; preview: string }[]>([]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const fetchQuestions = useCallback(async (interests: string[]) => {
    const params = interests.length > 0 ? `?interests=${interests.join(",")}` : "";
    const res = await fetch(`/api/onboarding${params}`);
    if (res.ok) {
      const data = await res.json();
      setQuestions(data.questions ?? []);
    }
  }, []);

  const handleInterestsDone = async () => {
    await fetchQuestions(selectedInterests);
    setStep("question");
  };

  const handleSkipInterests = async () => {
    await fetchQuestions([]);
    setStep("question");
  };

  const handleSelectQuestion = () => {
    setAnswer("");
    setStep("answer");
  };

  const handleNextQuestion = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questions[currentQuestionIdx]?.question,
          answer: answer.trim(),
          interests: selectedInterests,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setBonusAmount(data.bonusAmount ?? 50);
        setOtherAnswers(data.otherAnswers ?? []);
        await updateSession();
        setStep("celebration");
      }
    } catch (error) {
      console.error("Onboarding submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipAll = async () => {
    await fetch("/api/onboarding", { method: "PATCH" });
    await updateSession();
    onComplete();
  };

  const currentQuestion = questions[currentQuestionIdx];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-lg">

        {/* Step 0: 관심 분야 선택 */}
        {step === "interests" && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
              <div className="text-4xl">🧠</div>
              <h1 className="text-2xl font-bold">
                {session?.user?.name ?? ""}님, 환영합니다!
              </h1>
              <p className="text-muted-foreground">
                관심 분야를 선택하면 맞춤 질문을 드립니다
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {INTEREST_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => toggleInterest(opt.id)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    selectedInterests.includes(opt.id)
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="text-2xl mb-1">{opt.icon}</div>
                  <div className="text-sm font-medium">{opt.label}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleInterestsDone}
                className="w-full h-12"
                disabled={selectedInterests.length === 0}
              >
                {selectedInterests.length > 0
                  ? `${selectedInterests.length}개 선택 완료`
                  : "분야를 선택해주세요"}
              </Button>
              <button
                onClick={handleSkipInterests}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                건너뛰기
              </button>
            </div>
          </div>
        )}

        {/* Step 1: 질문 카드 */}
        {step === "question" && currentQuestion && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
              <div className="text-3xl">🙋</div>
              <h2 className="text-lg font-bold">AI가 묻고 싶은 질문</h2>
              <p className="text-sm text-muted-foreground">
                이 질문에 답할 수 있나요?
              </p>
            </div>

            <Card className="border-2 border-primary/20">
              <CardContent className="py-8 px-6 text-center">
                <p className="text-lg font-medium leading-relaxed">
                  {currentQuestion.question}
                </p>
                <div className="flex gap-1.5 justify-center mt-4">
                  {currentQuestion.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={handleSelectQuestion}
                className="flex-1 h-12"
              >
                답하기
              </Button>
              <Button
                variant="outline"
                onClick={handleNextQuestion}
                disabled={currentQuestionIdx >= questions.length - 1}
                className="flex-1 h-12"
              >
                다른 질문
              </Button>
            </div>

            <button
              onClick={handleSkipAll}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
            >
              나중에 할게요
            </button>
          </div>
        )}

        {/* Step 2: 답변 작성 */}
        {step === "answer" && currentQuestion && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold">내 경험을 공유해주세요</h2>
              <p className="text-sm text-muted-foreground">
                2~3문장이면 충분합니다
              </p>
            </div>

            <Card className="bg-muted/30">
              <CardContent className="py-4 px-5">
                <p className="text-sm font-medium">{currentQuestion.question}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Textarea
                placeholder="내 경험과 생각을 적어주세요..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="min-h-[150px] text-base"
                rows={6}
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{answer.length}자</span>
                {answer.length > 0 && answer.length < 20 && (
                  <span className="text-amber-600">조금 더 구체적으로 써주시면 좋아요</span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleSubmitAnswer}
                disabled={!answer.trim() || answer.trim().length < 10 || isSubmitting}
                className="flex-1 h-12"
              >
                {isSubmitting ? "등록 중..." : "답변 등록"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("question")}
                className="h-12"
              >
                뒤로
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 셀레브레이션 */}
        {step === "celebration" && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-3">
              <div className="text-6xl animate-bounce">🎉</div>
              <h2 className="text-2xl font-bold">첫 답변 완료!</h2>
              <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-4 py-2 rounded-full text-sm font-medium">
                +{bonusAmount}P 보너스 지급됨
              </div>
              <p className="text-sm text-muted-foreground">
                {bonusAmount}P로 다른 사람의 Q&A를 경작할 수 있습니다
              </p>
            </div>

            {/* 다른 사람의 답변 (소셜 증거) */}
            {otherAnswers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">같은 질문에 다른 분들은...</p>
                {otherAnswers.map((oa, i) => (
                  <Card key={i} className="bg-muted/20">
                    <CardContent className="py-3 px-4">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {oa.creatorName}
                      </div>
                      <p className="text-sm">{oa.preview}...</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* 이렇게 동작하는 플랫폼입니다 설명 */}
            <Card className="bg-muted/10">
              <CardContent className="py-4 px-5 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">이 플랫폼에서는...</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span>💬</span><span>AI에게 질문하고 답변을 받을 수 있어요</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🌱</span><span>좋은 Q&A를 경작하면 일찍 발견한 수확을 받아요</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🏹</span><span>AI 답변의 오류를 사냥하면 보상을 받아요</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🙋</span><span>AI가 묻는 질문에 답하면 지식이 축적돼요</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={onComplete} className="w-full h-12">
              시작하기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
