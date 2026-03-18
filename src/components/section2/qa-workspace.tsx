"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QASetWithMessages } from "@/types/qa-set";
import { MessageCard } from "./message-card";
import { ShareDialog } from "./share-dialog";
import { InvestDialog } from "./invest-dialog";
import { HuntDialog } from "./hunt-dialog";
import { UNINVEST_WINDOW_HOURS } from "@/lib/engine/uninvestment";
import { ParentComparePanel } from "./parent-compare-panel";
import { InvestorComments } from "./investor-comments";
import { ReviewGuide } from "./review-guide";
import { ArrowLeft } from "lucide-react";

interface Section2Props {
  qaSet: QASetWithMessages | null;
  initialQuestion: string | null;
  onInitialQuestionSent: () => void;
  onQASetUpdated: (qaSet: QASetWithMessages) => void;
  onBack?: () => void;
  humanAnswerMode?: boolean;
  onHumanAnswerDone?: () => void;
}

export function Section2Workspace({
  qaSet,
  initialQuestion,
  onInitialQuestionSent,
  onQASetUpdated,
  onBack,
  humanAnswerMode,
  onHumanAnswerDone,
}: Section2Props) {
  const { data: session } = useSession();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showInvestDialog, setShowInvestDialog] = useState(false);
  const [showHuntDialog, setShowHuntDialog] = useState(false);
  const [showInvestors, setShowInvestors] = useState(false);
  const [showParentCompare, setShowParentCompare] = useState(false);
  const [uninvestingId, setUninvestingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [dismissedShareHint, setDismissedShareHint] = useState(false);
  const [dismissedRecommendHint, setDismissedRecommendHint] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [qaSet?.messages, streamingContent, pendingUserMessage]);

  // Reset hints when qaSet changes
  useEffect(() => {
    setShowReviewPanel(false);
    setDismissedShareHint(false);
    setDismissedRecommendHint(false);
  }, [qaSet?.id]);

  const sendMessage = useCallback(async (messageText: string, currentQASet: QASetWithMessages) => {
    if (!messageText.trim() || isStreaming) return;

    setIsStreaming(true);
    setStreamingContent("");
    setPendingUserMessage(messageText.trim());
    setErrorMessage(null);

    try {
      let targetQASet = currentQASet;
      const isOwner = currentQASet.creatorId === session?.user?.id;

      if (currentQASet.isShared && !isOwner) {
        const extRes = await fetch(`/api/qa-sets/${currentQASet.id}/extend`, { method: "POST" });
        if (!extRes.ok) throw new Error("확장 Q&A 생성에 실패했습니다.");
        targetQASet = await extRes.json();
        onQASetUpdated(targetQASet);
      }

      const messages = [
        ...(targetQASet.messages ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: messageText.trim() },
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qaSetId: targetQASet.id, messages }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Chat request failed (${res.status}): ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
        setStreamingContent(fullContent);
      }

      const refreshRes = await fetch(`/api/qa-sets/${targetQASet.id}`);
      if (refreshRes.ok) onQASetUpdated(await refreshRes.json());
    } catch (error) {
      console.error("Chat error:", error);
      setErrorMessage(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setPendingUserMessage(null);
    }
  }, [isStreaming, onQASetUpdated, session?.user?.id]);

  // Auto-send initial question
  useEffect(() => {
    if (!initialQuestion || !qaSet) return;
    const key = `${qaSet.id}::${initialQuestion}`;
    if (sentRef.current === key) return;
    sentRef.current = key;
    onInitialQuestionSent();
    sendMessage(initialQuestion, qaSet);
  }, [initialQuestion, qaSet, sendMessage, onInitialQuestionSent]);

  const handleSendMessage = () => {
    if (!input.trim() || !qaSet || isStreaming) return;
    const text = input.trim();
    setInput("");
    sendMessage(text, qaSet);
  };

  const handleSubmitHumanAnswer = async () => {
    if (!input.trim() || !qaSet || isStreaming) return;
    const text = input.trim();
    setInput("");
    setIsStreaming(true);
    setPendingUserMessage(null);

    try {
      const res = await fetch(`/api/qa-sets/${qaSet.id}/human-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) throw new Error("답변 저장에 실패했습니다.");

      const updated = await res.json();
      onQASetUpdated(updated);
      onHumanAnswerDone?.();
    } catch (error) {
      console.error("Human answer error:", error);
      setErrorMessage(error instanceof Error ? error.message : "답변 저장 중 오류가 발생했습니다.");
    } finally {
      setIsStreaming(false);
    }
  };

  if (!qaSet) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="text-5xl">💬</div>
          <h3 className="text-lg font-medium">질문을 시작해보세요</h3>
          <p className="text-sm max-w-sm">
            위 검색창에서 질문을 입력하거나,<br />
            공유된 Q&A를 선택하면 대화가 시작됩니다.
          </p>
        </div>
      </div>
    );
  }

  const isOwner = qaSet.creatorId === session?.user?.id;
  const isSharedNotOwner = qaSet.isShared && !isOwner;
  const messages = qaSet.messages ?? [];
  const hasMessages = messages.length > 0;
  const recommendCount = qaSet.investorCount ?? 0;
  const totalRecommended = qaSet.totalInvested ?? 0;

  // Show inline share hint after 4+ messages (2 Q&A exchanges), owner, not shared
  const shouldShowShareHint = isOwner && !qaSet.isShared && messages.length >= 4 && !dismissedShareHint && !isStreaming;
  // Show recommend hint for shared Q&A not owned
  const shouldShowRecommendHint = isSharedNotOwner && !dismissedRecommendHint && messages.length >= 2;

  const handleUninvest = async (investmentId: string) => {
    if (!confirm("투자를 철회하시겠습니까? 원금의 20%가 차감됩니다.")) return;
    setUninvestingId(investmentId);
    try {
      const res = await fetch(`/api/investments/${investmentId}/uninvest`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}`);
        const refreshRes = await fetch(`/api/qa-sets/${qaSet.id}`);
        if (refreshRes.ok) onQASetUpdated(await refreshRes.json());
      } else {
        alert(data.error || "철회에 실패했습니다.");
      }
    } catch {
      alert("철회 중 오류가 발생했습니다.");
    } finally {
      setUninvestingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden pb-14 md:pb-0">
      {/* Header — always clean, action buttons inline */}
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {onBack && (
            <Button variant="ghost" size="sm" className="shrink-0 -ml-2 gap-1" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs text-muted-foreground hidden sm:inline">검색</span>
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="font-medium text-sm truncate">{qaSet.title ?? "새 대화"}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {qaSet.parentQASetId && (
                <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-300">확장</Badge>
              )}
              {qaSet.isShared && (
                <Badge variant="secondary" className="text-[10px]">공개됨</Badge>
              )}
              {qaSet.isShared && (
                <button
                  onClick={() => setShowInvestors(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  💰 {totalRecommended}P · {recommendCount}명 투자
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {qaSet.parentQASetId && (
            <Button variant="ghost" size="sm" onClick={() => setShowParentCompare(true)} className="text-xs">
              원본과 비교
            </Button>
          )}
          {/* Review panel toggle for shared Q&A — shows knowledge card, comments */}
          {qaSet.isShared && qaSet.knowledgeCard && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReviewPanel(v => !v)}
              className="text-xs"
            >
              {showReviewPanel ? "닫기" : "상세 보기"}
            </Button>
          )}
        </div>
      </div>

      {/* Stat bar for shared Q&A */}
      {qaSet.isShared && (
        <div className="px-4 py-1.5 border-b bg-muted/20 flex items-center gap-4 text-xs text-muted-foreground">
          <span>💰 {totalRecommended}P 투자됨</span>
          <span>{recommendCount}명 투자</span>
          <span>메시지 {messages.length}개</span>
          {(qaSet.negativeCount ?? 0) > 0 && (
            <span className="text-red-500">📉 {qaSet.negativeInvested ?? 0}P · {qaSet.negativeCount}명 반대 투자</span>
          )}
        </div>
      )}

      {/* Investor list (toggle) */}
      {showInvestors && qaSet.isShared && (qaSet.investments ?? []).length > 0 && (
        <div className="border-b bg-muted/20 px-4 py-2 space-y-1.5 text-xs">
          <div className="font-medium text-muted-foreground mb-1">투자자</div>
          {(qaSet.investments ?? []).filter(inv => !inv.isNegative).map((inv) => {
            const isMine = inv.userId === session?.user?.id;
            const investedAt = new Date(inv.createdAt);
            const ageHours = (Date.now() - investedAt.getTime()) / (1000 * 60 * 60);
            const canUninvest = isMine && ageHours <= UNINVEST_WINDOW_HOURS;
            return (
              <div
                key={inv.id}
                className={`flex items-center justify-between gap-2 py-1 px-2 rounded ${isMine ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {inv.user.image && <img src={inv.user.image} alt="" className="w-4 h-4 rounded-full shrink-0" />}
                  <span className={isMine ? "font-medium" : ""}>{inv.user.name ?? "익명"}{isMine ? " (나)" : ""}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-muted-foreground">{inv.amount}P</span>
                  {canUninvest && (
                    <button
                      onClick={() => handleUninvest(inv.id)}
                      disabled={uninvestingId === inv.id}
                      className="text-[10px] text-red-500 hover:text-red-700 border border-red-300 rounded px-1.5 py-0.5"
                    >
                      {uninvestingId === inv.id ? "..." : "철회"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review panel — knowledge card, creator note, comments */}
      {showReviewPanel && qaSet.isShared && (
        <div className="border-b bg-muted/10 px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
          {qaSet.summary && (
            <div className="flex items-start gap-2">
              <span>💬</span>
              <div>
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400">{qaSet.creator?.name ?? "창작자"}의 의견</div>
                <div className="text-sm text-foreground/90 mt-0.5">{qaSet.summary}</div>
              </div>
            </div>
          )}
          {qaSet.knowledgeCard && (() => {
            try {
              const card = JSON.parse(qaSet.knowledgeCard);
              return (
                <div className="flex items-start gap-2">
                  <span>📋</span>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-blue-700 dark:text-blue-400">지식 카드</div>
                    <p className="text-sm font-medium">{card.coreClaim}</p>
                    {card.evidence?.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {card.evidence.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                      </div>
                    )}
                    {card.limitations?.length > 0 && (
                      <div className="text-xs text-orange-600 dark:text-orange-400">
                        {card.limitations.map((l: string, i: number) => <div key={i}>⚠ {l}</div>)}
                      </div>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${
                      card.confidence === "high" ? "border-green-300 text-green-700" :
                      card.confidence === "medium" ? "border-amber-300 text-amber-700" :
                      "border-red-300 text-red-700"
                    }`}>
                      신뢰도: {card.confidence === "high" ? "높음" : card.confidence === "medium" ? "보통" : "낮음"}
                    </Badge>
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
          <InvestorComments qaSetId={qaSet.id} />
        </div>
      )}

      {/* Auto-extend notice removed — ReviewGuide handles this */}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto p-4 space-y-4">
          {messages.map((message, idx) => (
            <div key={message.id}>
              {qaSet.parentMessageCount > 0 && idx === qaSet.parentMessageCount && (
                <div className="flex items-center gap-3 py-2 my-2">
                  <div className="flex-1 border-t border-dashed border-teal-300 dark:border-teal-700" />
                  <div className="shrink-0 text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-3 py-1 rounded-full border border-teal-200 dark:border-teal-800">
                    ↑ 원래 대화 · <span className="font-medium">↓ 여기서부터 내 대화</span>
                  </div>
                  <div className="flex-1 border-t border-dashed border-teal-300 dark:border-teal-700" />
                </div>
              )}
              <MessageCard
                message={message}
                isOwner={isOwner}
                qaSetId={qaSet.id}
                creatorName={qaSet.creator?.name}
                onMessageImproved={async () => {
                  const res = await fetch(`/api/qa-sets/${qaSet.id}`);
                  if (res.ok) onQASetUpdated(await res.json());
                }}
              />
            </div>
          ))}

          {/* Streaming user message */}
          {isStreaming && pendingUserMessage && (
            <Card className="bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">👤</span>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-muted-foreground mb-1">{session?.user?.name ?? "사용자"}</div>
                    <div className="text-sm whitespace-pre-wrap">{pendingUserMessage}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {errorMessage && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">⚠️</span>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-destructive mb-1">오류</div>
                    <div className="text-sm text-destructive/80">{errorMessage}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Streaming AI response */}
          {isStreaming && (
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">🤖</span>
                  <div className="flex-1 text-sm whitespace-pre-wrap">
                    {streamingContent
                      ? streamingContent.replace(/\[\[REL:\{[\s\S]*?\}\]\]/, "").trim()
                      : <span className="animate-pulse text-muted-foreground">생각하는 중...</span>
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ 행동 가이드 — 답변(AI 또는 인간)이 있을 때만 표시 ═══ */}
          {hasMessages && !isStreaming && messages.some(m => m.role === "assistant") && (
            <ReviewGuide
              qaSet={qaSet}
              isOwner={isOwner}
              userId={session?.user?.id}
              isHumanAnswer={humanAnswerMode}
              onInvest={() => setShowInvestDialog(true)}
              onCounterInvest={() => setShowHuntDialog(true)}
              onShareQA={() => setShowShareDialog(true)}
              onOpinionSubmitted={async () => {
                const res = await fetch(`/api/qa-sets/${qaSet.id}`);
                if (res.ok) onQASetUpdated(await res.json());
              }}
              onAskFollowUp={(question) => {
                sendMessage(question, qaSet);
              }}
            />
          )}
        </div>
      </div>

      {/* Input area — 대화 진행용 (humanAnswer 모드 또는 본인 QA 추가질문) */}
      {(isOwner || humanAnswerMode) && (
        <div className="border-t p-4">
          {humanAnswerMode && messages.length <= 1 && (
            <div className="max-w-3xl mx-auto mb-3 p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">✍️ 내 경험과 지식으로 직접 답변해주세요</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">답변 후 Q&A를 공유하면 다른 사람이 투자할 수 있고, 보상이 돌아옵니다.</p>
            </div>
          )}
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              placeholder={
                humanAnswerMode && messages.length <= 1
                  ? "이 주제에 대한 내 답변을 작성하세요..."
                  : "추가 질문을 입력하세요..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (humanAnswerMode && messages.length <= 1) {
                    handleSubmitHumanAnswer();
                  } else {
                    handleSendMessage();
                  }
                }
              }}
              className={`resize-none ${humanAnswerMode && messages.length <= 1 ? "min-h-[120px]" : "min-h-[44px] max-h-32"}`}
              rows={humanAnswerMode && messages.length <= 1 ? 4 : 1}
              disabled={isStreaming}
            />
            <Button
              onClick={humanAnswerMode && messages.length <= 1 ? handleSubmitHumanAnswer : handleSendMessage}
              disabled={!input.trim() || isStreaming}
              size="sm"
              className="self-end"
            >
              {humanAnswerMode && messages.length <= 1 ? "답변 등록" : "전송"}
            </Button>
          </div>
        </div>
      )}

      {/* Panels & Dialogs */}
      {qaSet.parentQASetId && (
        <ParentComparePanel
          open={showParentCompare}
          onClose={() => setShowParentCompare(false)}
          parentQASetId={qaSet.parentQASetId}
          currentTitle={qaSet.title}
          currentMessages={messages as any}
        />
      )}
      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        qaSet={qaSet}
        onShared={async () => {
          const res = await fetch(`/api/qa-sets/${qaSet.id}`);
          if (res.ok) onQASetUpdated(await res.json());
        }}
      />
      <InvestDialog
        open={showInvestDialog}
        onOpenChange={setShowInvestDialog}
        qaSet={qaSet}
        onInvested={async () => {
          const res = await fetch(`/api/qa-sets/${qaSet.id}`);
          if (res.ok) onQASetUpdated(await res.json());
        }}
      />
      <HuntDialog
        open={showHuntDialog}
        onOpenChange={setShowHuntDialog}
        qaSet={qaSet}
        onHunted={async () => {
          const res = await fetch(`/api/qa-sets/${qaSet.id}`);
          if (res.ok) onQASetUpdated(await res.json());
        }}
      />
    </div>
  );
}
