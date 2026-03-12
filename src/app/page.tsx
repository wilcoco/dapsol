"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { Section1QuestionInput } from "@/components/section1/question-input";
import { Section2Workspace } from "@/components/section2/qa-workspace";
import { NavigableKnowledgeMap } from "@/components/section5/navigable-knowledge-map";
import { MyDashboard } from "@/components/section4/my-dashboard";
import { AnswerGaps } from "@/components/section4/answer-gaps";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { QASetWithMessages } from "@/types/qa-set";

type ActiveTab = "conversation" | "answer" | "explore" | "activity";

const UNLOCKED_TABS_KEY = "ci-unlocked-tabs";

function getUnlockedTabs(): Set<string> {
  try {
    const raw = localStorage.getItem(UNLOCKED_TABS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set(["conversation", "activity"]);
}

function saveUnlockedTabs(tabs: Set<string>) {
  try {
    localStorage.setItem(UNLOCKED_TABS_KEY, JSON.stringify([...tabs]));
  } catch {}
}

export default function HomePage() {
  const { data: session, status, update: updateSession } = useSession();
  const [activeQASet, setActiveQASet] = useState<QASetWithMessages | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("conversation");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [unlockedTabs, setUnlockedTabs] = useState<Set<string>>(new Set(["conversation", "activity"]));
  const [showLockedTooltip, setShowLockedTooltip] = useState(false);
  const [showUnlockCelebration, setShowUnlockCelebration] = useState(false);
  const [humanAnswerMode, setHumanAnswerMode] = useState(false);

  // Load unlocked tabs from localStorage
  useEffect(() => {
    setUnlockedTabs(getUnlockedTabs());
  }, []);

  // Check if explore should be unlocked
  useEffect(() => {
    try {
      const hasShared = localStorage.getItem("ci-onboarding-shared") === "true";
      if (hasShared && !unlockedTabs.has("explore")) {
        const next = new Set(unlockedTabs);
        next.add("explore");
        setUnlockedTabs(next);
        saveUnlockedTabs(next);
      }
    } catch {}
  }, [unlockedTabs]);

  // URL parameter support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section === "section1" || section === "section2" || section === "conversation") {
      setActiveTab("conversation");
    } else if (section === "answer") {
      setActiveTab("answer");
    } else if (section === "section3" || section === "section5" || section === "explore") {
      setActiveTab("explore");
    } else if (section === "section4" || section === "activity") {
      setActiveTab("activity");
    }
    const qaSetId = params.get("qaSetId");
    if (qaSetId) handleSelectSharedQA(qaSetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh session every 30s
  useEffect(() => {
    if (!session?.user?.id) return;
    const timer = setInterval(() => { updateSession(); }, 30_000);
    return () => clearInterval(timer);
  }, [session?.user?.id, updateSession]);

  const unlockTab = useCallback((tab: string) => {
    setUnlockedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      saveUnlockedTabs(next);
      return next;
    });
  }, []);

  const handleNewQuestion = useCallback(async (question: string) => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/qa-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: question }),
      });
      const qaSet = await res.json();
      setActiveQASet(qaSet);
      setPendingQuestion(question);
    } catch (error) {
      console.error("Failed to create QA set:", error);
    }
  }, [session]);

  const handleSelectSharedQA = useCallback(async (qaSetId: string) => {
    try {
      const res = await fetch(`/api/qa-sets/${qaSetId}`);
      const qaSet = await res.json();
      setActiveQASet(qaSet);
      setPendingQuestion(null);
      setActiveTab("conversation");
    } catch (error) {
      console.error("Failed to load QA set:", error);
    }
  }, []);

  const handleBackToSearch = useCallback(() => {
    setActiveQASet(null);
    setPendingQuestion(null);
    setHumanAnswerMode(false);
  }, []);

  // 인간 답변 모드: 지식 갭에 직접 답변
  const handleAnswerGap = useCallback(async (_gapId: string, description: string) => {
    if (!session?.user?.id) return;
    try {
      // 1. QASet 생성 (갭 설명이 제목) + 첫 메시지(질문)도 함께
      const res = await fetch("/api/qa-sets/with-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: description, question: description }),
      });
      const qaSet = await res.json();

      setActiveQASet(qaSet);
      setPendingQuestion(null);
      setHumanAnswerMode(true);
    } catch (error) {
      console.error("Failed to start human answer:", error);
    }
  }, [session]);

  const handleLockedTabClick = useCallback(() => {
    setShowLockedTooltip(true);
    setTimeout(() => setShowLockedTooltip(false), 2500);
  }, []);

  // When share happens from workspace, unlock explore
  const handleQASetUpdated = useCallback((qaSet: QASetWithMessages) => {
    setActiveQASet(qaSet);
    if (qaSet.isShared) {
      const wasLocked = !getUnlockedTabs().has("explore");
      try { localStorage.setItem("ci-onboarding-shared", "true"); } catch {}
      unlockTab("explore");
      if (wasLocked) {
        setShowUnlockCelebration(true);
        setTimeout(() => setShowUnlockCelebration(false), 4000);
      }
    }
  }, [unlockTab]);

  // Loading
  if (status === "loading" && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-4xl">🧠</div>
      </div>
    );
  }


  // Not logged in
  if (!session) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] gap-6 p-4 overflow-y-auto">
          <div className="text-center space-y-4 max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight">
              🧠 업무 지식
            </h1>
            <p className="text-xl text-foreground font-medium">
              혼자 쓰고 버리던 AI 답변,<br className="sm:hidden" /> 여기선 모두의 지식이 됩니다
            </p>
            <p className="text-base text-muted-foreground">
              AI에게 물어보고, 좋은 답변은 추천하세요. 추천이 쌓이면 보상이 돌아옵니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button size="lg" asChild>
                <Link href="/login">시작하기</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mt-8">
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">💬</div>
              <h3 className="font-semibold">질문하기</h3>
              <p className="text-sm text-muted-foreground">AI에게 질문하고<br />대화로 답을 깊게 탐구하세요</p>
            </div>
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">👍</div>
              <h3 className="font-semibold">추천하기</h3>
              <p className="text-sm text-muted-foreground">좋은 Q&A를 발견하면 추천하세요<br />일찍 추천할수록 보상이 커집니다</p>
            </div>
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">🔍</div>
              <h3 className="font-semibold">탐색하기</h3>
              <p className="text-sm text-muted-foreground">지식이 쌓이면<br />관계를 시각화하고 탐색하세요</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: string }[] = [
    { key: "conversation", label: "질문하기", icon: "💬" },
    { key: "answer", label: "답변하기", icon: "🙋" },
    { key: "explore", label: "탐색", icon: "🔍" },
    { key: "activity", label: "내 활동", icon: "📊" },
  ];

  const isExploreLocked = !unlockedTabs.has("explore");

  // Dynamic tooltip message based on user state
  const lockedTooltipMessage = activeQASet && !activeQASet.isShared
    ? "이 대화를 공유하면 탐색 탭이 열립니다"
    : activeQASet
      ? "대화 탭에서 Q&A를 공유해보세요"
      : "먼저 질문을 하고 Q&A를 공유해보세요";

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      {/* Desktop top tabs */}
      <div className="border-b px-4 hidden md:block">
        <nav className="flex gap-1 relative">
          {tabs.map(tab => {
            const isLocked = tab.key === "explore" && isExploreLocked;
            return (
              <button
                key={tab.key}
                onClick={() => isLocked ? handleLockedTabClick() : setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
                  isLocked
                    ? "border-transparent text-muted-foreground/40 cursor-default"
                    : activeTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon} {tab.label}
                {isLocked && <span className="ml-1 text-[10px]">🔒</span>}
                {tab.key === "conversation" && activeQASet && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs max-w-[120px] truncate">
                    {activeQASet.title ?? "진행 중"}
                  </span>
                )}
              </button>
            );
          })}
          {/* Locked tooltip */}
          {showLockedTooltip && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="bg-foreground text-background text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                {lockedTooltipMessage}
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Main content — both search and workspace stay mounted (hidden) to preserve state */}
      <main className="flex-1 overflow-hidden">
        {/* Tab 1: Conversation — search and workspace both mounted */}
        <div className={activeTab === "conversation" ? "block h-full" : "hidden"}>
          <div className="h-full relative">
            {/* Search layer — always mounted, hidden when workspace is active */}
            <div className={activeQASet ? "hidden" : "block h-full"}>
              <Section1QuestionInput
                onNewQuestion={handleNewQuestion}
                onSelectSharedQA={handleSelectSharedQA}
                onAnswerGap={handleAnswerGap}
              />
            </div>
            {/* Workspace layer — always mounted when qaSet exists */}
            {activeQASet && (
              <div className="block h-full">
                <Section2Workspace
                  qaSet={activeQASet}
                  initialQuestion={pendingQuestion}
                  onInitialQuestionSent={() => setPendingQuestion(null)}
                  onQASetUpdated={handleQASetUpdated}
                  onBack={handleBackToSearch}
                  humanAnswerMode={humanAnswerMode}
                  onHumanAnswerDone={() => setHumanAnswerMode(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tab 2: Answer — AI가 묻는 질문에 인간이 답변 */}
        <div className={activeTab === "answer" ? "block h-full" : "hidden"}>
          <AnswerGaps
            onAnswerGap={(gapId, description) => {
              handleAnswerGap(gapId, description);
              setActiveTab("conversation");
            }}
          />
        </div>

        {/* Tab 3: Explore */}
        <div className={activeTab === "explore" && !isExploreLocked ? "block h-full" : "hidden"}>
          <NavigableKnowledgeMap
            initialFocusId={activeQASet?.id}
            onSelectQASet={handleSelectSharedQA}
            isActive={activeTab === "explore"}
          />
        </div>

        {/* Tab 3: Activity */}
        <div className={activeTab === "activity" ? "block h-full" : "hidden"}>
          <MyDashboard
            onSelectQASet={(qaSetId) => handleSelectSharedQA(qaSetId)}
            onGoToSearch={() => { setActiveTab("conversation"); handleBackToSearch(); }}
            onGoToAnswer={() => setActiveTab("answer")}
          />
        </div>
      </main>

      {/* Mobile bottom tab bar — always visible */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background z-50">
        <nav className="flex relative">
          {tabs.map(tab => {
            const isLocked = tab.key === "explore" && isExploreLocked;
            return (
              <button
                key={tab.key}
                onClick={() => isLocked ? handleLockedTabClick() : setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  isLocked
                    ? "text-muted-foreground/30"
                    : activeTab === tab.key
                      ? "text-primary"
                      : "text-muted-foreground"
                }`}
              >
                <span className="text-lg">{tab.icon}{isLocked ? "🔒" : ""}</span>
                <span className="mt-0.5">{tab.label}</span>
              </button>
            );
          })}
          {/* Mobile locked tooltip */}
          {showLockedTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="bg-foreground text-background text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                {lockedTooltipMessage}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Explore unlock celebration toast */}
      {showUnlockCelebration && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl shadow-2xl px-6 py-4 max-w-sm">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <p className="font-bold text-sm">탐색 탭이 열렸습니다!</p>
                <p className="text-xs text-white/90 mt-0.5">다른 사람의 Q&A를 지식 지도에서 둘러보세요</p>
              </div>
            </div>
            <button
              onClick={() => { setShowUnlockCelebration(false); setActiveTab("explore"); }}
              className="mt-2 w-full text-center text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg py-1.5 transition-colors"
            >
              탐색하러 가기 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
