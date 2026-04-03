"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Sparkles, TrendingUp, MessageSquare } from "lucide-react";
import Link from "next/link";

interface TrendPreview {
  geo: string;
  topics: string[];
  count: number;
}

interface GeneratedQuestion {
  id: string;
  topic: string;
  question: string;
  reason?: string;
}

interface AIQuestion {
  id: string;
  title: string;
  question: string;
  reason?: string;
  answerCount: number;
  investorCount: number;
  createdAt: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [trends, setTrends] = useState<TrendPreview | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [customTopics, setCustomTopics] = useState("");
  const [count, setCount] = useState(5);

  // 기존 AI 질문 로드
  useEffect(() => {
    fetch("/api/qa-sets/ai-questions?limit=20")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.questions) setQuestions(d.questions);
      })
      .catch(() => {})
      .finally(() => setLoadingQuestions(false));
  }, [generated]);

  // 트렌드 미리보기
  const fetchTrends = async () => {
    setLoadingTrends(true);
    try {
      const res = await fetch("/api/admin/generate-ai-questions?geo=KR");
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingTrends(false);
    }
  };

  // AI 질문 생성
  const generateQuestions = async () => {
    setGenerating(true);
    setGenerated([]);
    try {
      const body: { count: number; topics?: string[] } = { count };
      if (customTopics.trim()) {
        body.topics = customTopics.split(",").map((t) => t.trim()).filter(Boolean);
      }

      const res = await fetch("/api/admin/generate-ai-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setGenerated(data.generated ?? []);
      }
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <p className="mb-4">관리자 페이지에 접근하려면 로그인이 필요합니다.</p>
            <Button asChild>
              <Link href="/login">로그인</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-bold">🌍</Link>
            <span className="text-lg font-semibold">관리자</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* 트렌드 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Google Trends (한국)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Button onClick={fetchTrends} disabled={loadingTrends} variant="outline">
                {loadingTrends ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                트렌드 불러오기
              </Button>
            </div>

            {trends && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {trends.count}개 트렌드 발견
                </p>
                <div className="flex flex-wrap gap-2">
                  {trends.topics.map((topic, i) => (
                    <Badge key={i} variant="secondary">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 질문 생성 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI 질문 생성
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">생성 개수</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 5)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  커스텀 주제 (쉼표 구분, 비우면 트렌드 사용)
                </label>
                <Input
                  placeholder="창업, 이직, 재테크..."
                  value={customTopics}
                  onChange={(e) => setCustomTopics(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={generateQuestions} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  질문 생성
                </>
              )}
            </Button>

            {/* 생성 결과 */}
            {generated.length > 0 && (
              <div className="mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-3">
                  {generated.length}개 질문 생성됨
                </p>
                <div className="space-y-2">
                  {generated.map((q) => (
                    <div key={q.id} className="p-3 rounded bg-background border">
                      <p className="text-sm font-medium">{q.question}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        주제: {q.topic}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 기존 AI 질문 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              생성된 AI 질문 목록
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingQuestions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : questions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                아직 생성된 AI 질문이 없습니다.
              </p>
            ) : (
              <div className="divide-y">
                {questions.map((q) => (
                  <div key={q.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{q.question || q.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{timeAgo(q.createdAt)}</span>
                        <span>·</span>
                        <span>✍️ {q.answerCount}명 답변</span>
                        <span>·</span>
                        <span>📊 {q.investorCount}명 경작</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/?qaSetId=${q.id}`}>보기</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
