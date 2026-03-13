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

type ActiveTab = "territory" | "pioneer" | "map" | "profile";

export default function HomePage() {
  const { data: session, status, update: updateSession } = useSession();
  const [activeQASet, setActiveQASet] = useState<QASetWithMessages | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("territory");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [humanAnswerMode, setHumanAnswerMode] = useState(false);

  // URL parameter support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section === "territory" || section === "section1" || section === "conversation") {
      setActiveTab("territory");
    } else if (section === "pioneer" || section === "answer") {
      setActiveTab("pioneer");
    } else if (section === "map" || section === "explore" || section === "section3" || section === "section5") {
      setActiveTab("map");
    } else if (section === "profile" || section === "activity" || section === "section4") {
      setActiveTab("profile");
    }
    const qaSetId = params.get("qaSetId");
    if (qaSetId) handleSelectSharedQA(qaSetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh session periodically (with cache, this is lightweight)
  useEffect(() => {
    if (!session?.user?.id) return;
    const timer = setInterval(() => { updateSession(); }, 60_000);
    return () => clearInterval(timer);
  }, [session?.user?.id, updateSession]);

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
      setActiveTab("territory");
    } catch (error) {
      console.error("Failed to load QA set:", error);
    }
  }, []);

  const handleBackToSearch = useCallback(() => {
    setActiveQASet(null);
    setPendingQuestion(null);
    setHumanAnswerMode(false);
  }, []);

  const handleAnswerGap = useCallback(async (_gapId: string, description: string) => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/qa-sets/with-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: description, question: description }),
      });
      const qaSet = await res.json();
      setActiveQASet(qaSet);
      setPendingQuestion(null);
      setHumanAnswerMode(true);
      setActiveTab("territory");
    } catch (error) {
      console.error("Failed to start human answer:", error);
    }
  }, [session]);

  const handleQASetUpdated = useCallback((qaSet: QASetWithMessages) => {
    setActiveQASet(qaSet);
  }, []);

  // Loading
  if (status === "loading" && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-4xl">🌍</div>
      </div>
    );
  }

  // Not logged in — landing
  if (!session) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] gap-6 p-4 overflow-y-auto">
          <div className="text-center space-y-4 max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight">
              🌍 집단지성
            </h1>
            <p className="text-xl text-foreground font-medium">
              혼자 쓰고 버리던 AI 답변,<br className="sm:hidden" /> 여기선 모두의 지식이 됩니다
            </p>
            <p className="text-base text-muted-foreground">
              새 영토를 개척하고, 좋은 지식을 경작하세요. 일찍 발굴할수록 보상이 커집니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button size="lg" asChild>
                <Link href="/login">탐험 시작하기</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mt-8">
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">⛏️</div>
              <h3 className="font-semibold">개척하기</h3>
              <p className="text-sm text-muted-foreground">AI에게 질문하고<br />새로운 지식의 영토를 개척하세요</p>
            </div>
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">🌾</div>
              <h3 className="font-semibold">경작하기</h3>
              <p className="text-sm text-muted-foreground">좋은 Q&A를 발견하면 경작하세요<br />일찍 경작할수록 보상이 커집니다</p>
            </div>
            <div className="p-5 rounded-xl border bg-card text-center space-y-2">
              <div className="text-3xl">🗺️</div>
              <h3 className="font-semibold">탐험하기</h3>
              <p className="text-sm text-muted-foreground">지식이 모여 마을이 되고<br />마을이 모여 문명이 됩니다</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: string }[] = [
    { key: "territory", label: "영토", icon: "🏠" },
    { key: "pioneer", label: "개척", icon: "✨" },
    { key: "map", label: "지도", icon: "🗺️" },
    { key: "profile", label: "나", icon: "👤" },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      {/* Desktop top tabs */}
      <div className="border-b px-4 hidden md:block">
        <nav className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon} {tab.label}
              {tab.key === "territory" && activeQASet && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs max-w-[120px] truncate">
                  {activeQASet.title ?? "진행 중"}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {/* 🏠 영토: 검색 + Q&A 워크스페이스 */}
        <div className={activeTab === "territory" ? "block h-full" : "hidden"}>
          <div className="h-full relative">
            <div className={activeQASet ? "hidden" : "block h-full"}>
              <Section1QuestionInput
                onNewQuestion={handleNewQuestion}
                onSelectSharedQA={handleSelectSharedQA}
                onAnswerGap={handleAnswerGap}
                onNavigateToMap={() => setActiveTab("map")}
              />
            </div>
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

        {/* ✨ 개척: 🤖→👤 AI가 인간에게 질문하는 갭 목록 */}
        <div className={activeTab === "pioneer" ? "block h-full" : "hidden"}>
          <AnswerGaps
            onAnswerGap={(gapId, description) => {
              handleAnswerGap(gapId, description);
            }}
          />
        </div>

        {/* 🗺️ 지도: 3-level 줌 지식 그래프 */}
        <div className={activeTab === "map" ? "block h-full" : "hidden"}>
          <NavigableKnowledgeMap
            initialFocusId={activeQASet?.id}
            onSelectQASet={handleSelectSharedQA}
            isActive={activeTab === "map"}
          />
        </div>

        {/* 👤 나: 대시보드 */}
        <div className={activeTab === "profile" ? "block h-full" : "hidden"}>
          <MyDashboard
            onSelectQASet={(qaSetId) => handleSelectSharedQA(qaSetId)}
            onGoToSearch={() => { setActiveTab("territory"); handleBackToSearch(); }}
            onGoToAnswer={() => setActiveTab("pioneer")}
          />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background z-50">
        <nav className="flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                activeTab === tab.key
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="mt-0.5">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
