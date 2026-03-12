"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ClusterSummary {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  synthesisText: string | null;
  synthesizedAt: string | null;
  _count: { qaSets: number; knowledgeGaps: number };
  createdAt: string;
  updatedAt: string;
}

interface ClusterDetail {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  synthesisText: string | null;
  synthesizedAt: string | null;
  qaSets: {
    id: string;
    title: string | null;
    summary: string | null;
    knowledgeCard: string | null;
    totalInvested: number;
    investorCount: number;
    creator: { id: string; name: string | null; image: string | null };
    _count: { messages: number };
    createdAt: string;
  }[];
  evolutionEvents: {
    id: string;
    eventType: string;
    description: string;
    createdAt: string;
    userId: string;
    qaSetId: string;
  }[];
  knowledgeGaps: {
    id: string;
    gapType: string;
    description: string;
    severity: string;
    isResolved: boolean;
  }[];
  contributions: {
    id: string;
    userId: string;
    questionsAsked: number;
    answersImproved: number;
    insightsContributed: number;
    rebuttalsProvided: number;
    evidenceAdded: number;
    topicAuthority: number;
    user: { id: string; name: string | null; image: string | null };
  }[];
}

interface TopicExplorerProps {
  onSelectQASet: (qaSetId: string) => void;
  isActive: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  initial_question: "질문",
  new_perspective: "새 관점",
  rebuttal: "반박",
  evidence: "근거 추가",
  synthesis: "종합",
  refinement: "개선",
};

const GAP_TYPE_LABELS: Record<string, string> = {
  uncertain_answer: "불확실한 답변",
  inconsistency: "불일치",
  missing_evidence: "근거 부족",
  conflicting_claims: "상충하는 주장",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function TopicExplorer({ onSelectQASet, isActive }: TopicExplorerProps) {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [reclustering, setReclustering] = useState(false);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clusters");
      if (!res.ok) return;
      const data = await res.json();
      setClusters(data.clusters ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) fetchClusters();
  }, [isActive, fetchClusters]);

  const openCluster = async (id: string) => {
    setDetailLoading(true);
    setSelectedCluster(null);
    try {
      const res = await fetch(`/api/clusters/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedCluster(data);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedCluster) return;
    setRegenerating(true);
    try {
      await fetch(`/api/clusters/${selectedCluster.id}`, { method: "POST" });
      await openCluster(selectedCluster.id);
    } catch {
      // ignore
    } finally {
      setRegenerating(false);
    }
  };

  const handleRecluster = async () => {
    setReclustering(true);
    try {
      await fetch("/api/clusters/generate", { method: "POST" });
      await fetchClusters();
      setSelectedCluster(null);
    } catch {
      // ignore
    } finally {
      setReclustering(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  // Detail view
  if (selectedCluster || detailLoading) {
    return (
      <div className="h-full overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelectedCluster(null)}>
            ← 목록
          </Button>
          {detailLoading && <span className="text-sm text-muted-foreground">불러오는 중...</span>}
        </div>

        {detailLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : selectedCluster ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{selectedCluster.name}</h2>
                {selectedCluster.nameEn && (
                  <p className="text-sm text-muted-foreground">{selectedCluster.nameEn}</p>
                )}
                {selectedCluster.description && (
                  <p className="text-sm mt-1">{selectedCluster.description}</p>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? "분석 중..." : "종합 재생성"}
              </Button>
            </div>

            {/* Synthesis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">종합 분석</CardTitle>
                {selectedCluster.synthesizedAt && (
                  <CardDescription>
                    마지막 분석: {formatDate(selectedCluster.synthesizedAt)}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {selectedCluster.synthesisText ? (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedCluster.synthesisText}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    아직 종합 분석이 생성되지 않았습니다. &quot;종합 재생성&quot; 버튼을 눌러주세요.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Member QASets */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Q&A 목록 ({selectedCluster.qaSets.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {selectedCluster.qaSets.map((qa) => (
                    <button
                      key={qa.id}
                      onClick={() => onSelectQASet(qa.id)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {qa.title ?? "제목 없음"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {qa.creator.name ?? "익명"} · 메시지 {qa._count.messages}개
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {qa.totalInvested > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {qa.totalInvested} TP
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Knowledge Gaps */}
            {selectedCluster.knowledgeGaps.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    지식 격차 ({selectedCluster.knowledgeGaps.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedCluster.knowledgeGaps.map((gap) => (
                      <div
                        key={gap.id}
                        className="p-3 rounded-lg border space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              SEVERITY_COLORS[gap.severity] ?? SEVERITY_COLORS.medium
                            }`}
                          >
                            {gap.severity}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {GAP_TYPE_LABELS[gap.gapType] ?? gap.gapType}
                          </Badge>
                        </div>
                        <p className="text-sm">{gap.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Evolution Timeline */}
            {selectedCluster.evolutionEvents.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    지식 진화 타임라인 ({selectedCluster.evolutionEvents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative pl-4 border-l-2 border-muted space-y-3">
                    {selectedCluster.evolutionEvents.map((event) => (
                      <div key={event.id} className="relative">
                        <div className="absolute -left-[calc(1rem+5px)] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(event.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Contributors */}
            {selectedCluster.contributions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">주요 기여자</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedCluster.contributions.map((c, i) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded-lg border"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground w-5">
                            {i + 1}.
                          </span>
                          {c.user.image ? (
                            <img
                              src={c.user.image}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-muted" />
                          )}
                          <span className="text-sm font-medium">
                            {c.user.name ?? "익명"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {c.questionsAsked > 0 && <span>질문 {c.questionsAsked}</span>}
                          {c.answersImproved > 0 && <span>개선 {c.answersImproved}</span>}
                          {c.insightsContributed > 0 && <span>인사이트 {c.insightsContributed}</span>}
                          {c.rebuttalsProvided > 0 && <span>반박 {c.rebuttalsProvided}</span>}
                          {c.evidenceAdded > 0 && <span>근거 {c.evidenceAdded}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    );
  }

  // Cluster list view
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">주제 탐색기</h2>
          <p className="text-sm text-muted-foreground">
            공유된 Q&A가 자동으로 주제별로 분류됩니다
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecluster}
          disabled={reclustering}
        >
          {reclustering ? "클러스터링 중..." : "전체 재분류"}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="font-semibold text-lg">아직 주제 클러스터가 없습니다</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Q&A를 공유하면 자동으로 주제별로 분류됩니다.
            또는 &quot;전체 재분류&quot; 버튼으로 기존 Q&A를 클러스터링할 수 있습니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((cluster) => (
            <Card
              key={cluster.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openCluster(cluster.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{cluster.name}</CardTitle>
                {cluster.nameEn && (
                  <CardDescription>{cluster.nameEn}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {cluster.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {cluster.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    Q&A {cluster._count.qaSets}개
                  </Badge>
                  {cluster._count.knowledgeGaps > 0 && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300">
                      격차 {cluster._count.knowledgeGaps}
                    </Badge>
                  )}
                  {cluster.synthesizedAt && (
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      종합 완료
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
