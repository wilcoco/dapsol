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

type ActiveTab = "feed" | "ask" | "map" | "profile";

export default function HomePage() {
  const { data: session, status, update: updateSession } = useSession();
  const [activeQASet, setActiveQASet] = useState<QASetWithMessages | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("feed");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [humanAnswerMode, setHumanAnswerMode] = useState(false);
  const [clusterFocusId, setClusterFocusId] = useState<string | null>(null);

  // URL parameter support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section === "feed" || section === "territory" || section === "section1" || section === "conversation") {
      setActiveTab("feed");
    } else if (section === "ask" || section === "pioneer" || section === "answer") {
      setActiveTab("ask");
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
      setActiveTab("ask");
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
      setActiveTab("ask");
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

  // Not logged in — landing (Julie Zhuo: 3 equal CTAs + live feed)
  if (!session) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="flex flex-col items-center min-h-[calc(100vh-3.5rem)] p-4 overflow-y-auto">
          {/* Hero */}
          <div className="text-center space-y-4 max-w-2xl pt-12 pb-6">
            <h1 className="text-4xl font-bold tracking-tight">
              🌍 집단지성
            </h1>
            <p className="text-xl text-foreground font-medium">
              혼자 쓰고 버리던 AI 답변,<br className="sm:hidden" /> 여기선 모두의 지식이 됩니다
            </p>
          </div>

          {/* 3 Equal Action Cards (Julie Zhuo principle) */}
          <div className="grid grid-cols-3 gap-3 max-w-lg w-full mb-8">
            <Link
              href="/login"
              className="p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 text-center space-y-2 hover:shadow-lg hover:scale-105 transition-all"
            >
              <div className="text-2xl">📝</div>
              <h3 className="font-semibold text-sm">질문하기</h3>
              <p className="text-[10px] text-muted-foreground leading-snug">AI에게<br />질문하세요</p>
            </Link>
            <Link
              href="/login"
              className="p-4 rounded-xl border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 text-center space-y-2 hover:shadow-lg hover:scale-105 transition-all"
            >
              <div className="text-2xl">📈</div>
              <h3 className="font-semibold text-sm">투자하기</h3>
              <p className="text-[10px] text-muted-foreground leading-snug">좋은 Q&A에<br />투자하세요</p>
            </Link>
            <Link
              href="/login"
              className="p-4 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 text-center space-y-2 hover:shadow-lg hover:scale-105 transition-all"
            >
              <div className="text-2xl">🤖→👤</div>
              <h3 className="font-semibold text-sm">답변하기</h3>
              <p className="text-[10px] text-muted-foreground leading-snug">AI의 질문에<br />답하세요</p>
            </Link>
          </div>

          <Button size="lg" asChild className="mb-8">
            <Link href="/login">탐험 시작하기</Link>
          </Button>

          {/* Live feed preview (visible without login) */}
          <div className="w-full max-w-3xl">
            <LandingActivityFeed />
            <LandingTrending />
          </div>
        </main>
      </div>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: string }[] = [
    { key: "feed", label: "피드", icon: "🏠" },
    { key: "ask", label: "묻기", icon: "✨" },
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
              {tab.key === "ask" && activeQASet && (
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
        {/* 🏠 피드: 검색 + 트렌딩 + 지식네트워크 (발견) */}
        <div className={activeTab === "feed" ? "block h-full" : "hidden"}>
          <div className="h-full relative">
            <div className={activeQASet ? "hidden" : "block h-full"}>
              <Section1QuestionInput
                onNewQuestion={(q) => { handleNewQuestion(q); setActiveTab("ask"); }}
                onSelectSharedQA={(id) => { handleSelectSharedQA(id); setActiveTab("ask"); }}
                onAnswerGap={(gapId, desc) => { handleAnswerGap(gapId, desc); setActiveTab("ask"); }}
                onNavigateToMap={() => setActiveTab("map")}
                onNavigateToCluster={(clusterId) => {
                  setClusterFocusId(clusterId);
                  setActiveTab("map");
                }}
              />
            </div>
            {activeQASet && (
              <div className="block h-full">
                <Section2Workspace
                  qaSet={activeQASet}
                  initialQuestion={pendingQuestion}
                  onInitialQuestionSent={() => setPendingQuestion(null)}
                  onQASetUpdated={handleQASetUpdated}
                  onBack={() => { handleBackToSearch(); setActiveTab("feed"); }}
                  humanAnswerMode={humanAnswerMode}
                  onHumanAnswerDone={() => setHumanAnswerMode(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* ✨ 묻기: AI에게 질문 + Q&A 워크스페이스 (핵심 행동) */}
        <div className={activeTab === "ask" ? "block h-full" : "hidden"}>
          {activeQASet ? (
            <Section2Workspace
              qaSet={activeQASet}
              initialQuestion={pendingQuestion}
              onInitialQuestionSent={() => setPendingQuestion(null)}
              onQASetUpdated={handleQASetUpdated}
              onBack={handleBackToSearch}
              humanAnswerMode={humanAnswerMode}
              onHumanAnswerDone={() => setHumanAnswerMode(false)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6">
              <div className="max-w-lg w-full text-center space-y-6">
                <div className="text-5xl">✨</div>
                <h2 className="text-2xl font-bold">AI에게 물어보세요</h2>
                <p className="text-muted-foreground">
                  무엇이든 질문하면 AI가 답변하고,<br />
                  커뮤니티가 검증하고 투자합니다
                </p>
                <div className="flex gap-2 max-w-md mx-auto">
                  <input
                    type="text"
                    placeholder="궁금한 것을 입력하세요..."
                    className="flex-1 h-12 px-4 text-base rounded-xl border-2 focus:outline-none focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                        handleNewQuestion((e.target as HTMLInputElement).value.trim());
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {["PP 수축마크 해결법", "도장 불량 원인", "금형 보전 주기"].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => handleNewQuestion(ex)}
                      className="text-xs px-3 py-1.5 rounded-full border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🗺️ 지도: 3-level 줌 지식 그래프 */}
        <div className={activeTab === "map" ? "block h-full" : "hidden"}>
          <NavigableKnowledgeMap
            initialFocusId={activeQASet?.id}
            initialClusterFocusId={clusterFocusId}
            onSelectQASet={handleSelectSharedQA}
            isActive={activeTab === "map"}
          />
        </div>

        {/* 👤 나: 대시보드 + 기여 요청(AI→인간 갭) */}
        <div className={activeTab === "profile" ? "block h-full overflow-y-auto" : "hidden"}>
          <MyDashboard
            onSelectQASet={(qaSetId) => { handleSelectSharedQA(qaSetId); setActiveTab("ask"); }}
            onGoToSearch={() => { setActiveTab("feed"); handleBackToSearch(); }}
            onGoToAnswer={() => setActiveTab("ask")}
          />
          <div className="border-t">
            <AnswerGaps
              onAnswerGap={(gapId, description) => {
                handleAnswerGap(gapId, description);
                setActiveTab("ask");
              }}
            />
          </div>
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

// ── Landing page components (non-logged-in) ──

function LandingActivityFeed() {
  const [feed, setFeed] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/activity-feed?limit=5")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.feed) setFeed(d.feed); })
      .catch(() => {});
  }, []);

  if (feed.length === 0) return null;

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    return `${Math.floor(mins / 60)}시간 전`;
  };

  const icons: Record<string, string> = { share: "📝", invest: "📈", hunt: "📉", milestone: "🏆" };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">📡 지금 이 순간</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {feed.map((item: any) => (
          <div key={item.id} className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-left max-w-[260px]">
            <span className="text-base">{icons[item.action] ?? "📌"}</span>
            <div className="min-w-0">
              <p className="text-xs truncate">{item.message}</p>
              <p className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LandingTrending() {
  const [qas, setQas] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/qa-sets?shared=true&sort=trending&limit=5")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.qaSets) setQas(d.qaSets); })
      .catch(() => {});
  }, []);

  if (qas.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold">🔥 지금 인기 Q&A</span>
        <span className="text-xs text-muted-foreground">읽기만 가능 · 투자는 로그인 후</span>
      </div>
      <div className="divide-y divide-border/50">
        {qas.map((qa: any) => (
          <div key={qa.id} className="py-3">
            <p className="text-sm font-medium">{qa.title ?? "제목 없음"}</p>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
              <span>{qa.creator?.name ?? "익명"}</span>
              <span>📈 {qa.totalInvested ?? 0}</span>
              <span>{qa.investorCount ?? 0}명 투자 중</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
