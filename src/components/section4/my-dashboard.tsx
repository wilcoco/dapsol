"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileData {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    balance: number;
    trustLevel: number;
    hubScore: number;
    authorityScore: number;
  };
  stats: {
    totalQASets: number;
    sharedQASets: number;
    totalInvestments: number;
    totalAmountInvested: number;
    totalRewardsReceived: number;
  };
  recentQASets: Array<{
    id: string;
    title: string | null;
    isShared: boolean;
    totalInvested: number;
    investorCount: number;
    negativeInvested: number;
    negativeCount: number;
    authorityScore: number;
    qualityPool: number;
    viewCount: number;
    createdAt: string;
    _count: { messages: number };
  }>;
  recentInvestments: Array<{
    id: string;
    amount: number;
    isPositive: boolean;
    createdAt: string;
    qaSet: {
      id: string;
      title: string | null;
      totalInvested: number;
      negativeInvested: number;
      authorityScore: number;
    };
  }>;
  rewardHistory: Array<{
    id: string;
    amount: number;
    type: string;
    qaSetId: string;
    createdAt: string;
    qaSet: { id: string; title: string | null };
  }>;
}

interface MyDashboardProps {
  onSelectQASet: (qaSetId: string) => void;
  onGoToSearch?: () => void;
  onGoToAnswer?: () => void;
}

export function MyDashboard({ onSelectQASet, onGoToSearch, onGoToAnswer }: MyDashboardProps) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`/api/profile/${session.user.id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setProfile(await res.json());
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const getInvestmentROI = (investmentQaSetId: string, investedAmount: number) => {
    if (!profile) return { earned: 0, roi: 0 };
    const earned = profile.rewardHistory
      .filter((r) => r.qaSetId === investmentQaSetId)
      .reduce((sum, r) => sum + r.amount, 0);
    const roi = investedAmount > 0 ? ((earned - investedAmount) / investedAmount) * 100 : 0;
    return { earned, roi };
  };

  if (!session?.user?.id) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        로그인이 필요합니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        데이터를 불러올 수 없습니다.
      </div>
    );
  }

  const { stats, recentQASets, recentInvestments } = profile;
  const hasNoQASets = stats.totalQASets === 0;
  const hasUnshared = stats.totalQASets > 0 && stats.sharedQASets === 0;
  const hasNoInvestments = stats.totalInvestments === 0;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto pb-24 md:pb-6">
      {/* Summary Stats with CTAs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">보유 포인트</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{profile.user.balance}P</div>
            {profile.user.balance > 0 && hasNoInvestments && (
              <p className="text-[11px] text-muted-foreground mt-1">
                좋은 Q&A를 투자해보세요
</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 Q&A</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalQASets}</div>
            {hasNoQASets ? (
              <p className="text-[11px] text-muted-foreground mt-1">아래에서 시작하세요</p>
            ) : hasUnshared ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                Q&A를 공유하면 투자를 받을 수 있어요
</p>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">{stats.sharedQASets}개 공유됨</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">투자한 Q&A</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvestments}</div>
            {hasNoInvestments ? (
              <p className="text-[11px] text-muted-foreground mt-1">좋은 Q&A에 투자해보세요</p>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">{stats.totalAmountInvested}P 사용</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">받은 보상</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalRewardsReceived}P</div>
            {stats.totalRewardsReceived === 0 && stats.totalInvestments > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                투자한 Q&A에 다른 사람이 투자하면 수익을 받아요
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Empty state with CTA */}
      {hasNoQASets && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-4xl">💬</div>
            <h3 className="font-medium text-lg">아직 활동이 없습니다</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              AI에게 질문하고, 좋은 대화는 공유하세요.<br />
              다른 사람이 투자하면 보상이 돌아옵니다.
            </p>
            <div className="flex gap-2 mt-2">
              <Button onClick={onGoToSearch}>
                질문하러 가기
              </Button>
              {onGoToAnswer && (
                <Button variant="outline" onClick={onGoToAnswer}>
                  🙋 AI 질문에 답하기
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Q&As */}
      {recentQASets.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">내 Q&A</h2>
          <div className="grid gap-3">
            {recentQASets.map((qa) => (
              <Card
                key={qa.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => onSelectQASet(qa.id)}
              >
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{qa.title || "제목 없음"}</span>
                      {qa.isShared ? (
                        <Badge variant="secondary" className="shrink-0">공개됨</Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-muted-foreground">미공개</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>메시지 {qa._count.messages}개</span>
                      {qa.totalInvested > 0 && <span>💰 {qa.totalInvested}P ({qa.investorCount}명)</span>}
                      {!qa.isShared && qa._count.messages >= 2 && (
                        <span className="text-primary font-medium">Q&A를 공유하면 투자를 받을 수 있어요</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(qa.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* My Recommendations */}
      {recentInvestments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">내 투자 목록</h2>
          <div className="grid gap-3">
            {recentInvestments.filter(inv => inv.isPositive).map((inv, idx) => {
              const { earned, roi } = getInvestmentROI(inv.qaSet.id, inv.amount);
              return (
                <Card
                  key={inv.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => onSelectQASet(inv.qaSet.id)}
                >
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate mb-1">{inv.qaSet.title || "제목 없음"}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>💰 {inv.amount}P 투자</span>
                        {earned > 0 && <span className="text-green-600">+{earned}P 보상</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-semibold ${roi > 0 ? "text-green-600" : roi < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {roi > 0 ? "+" : ""}{roi.toFixed(0)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">{idx === 0 ? "투자 대비 수익" : "수익률"}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty recommendations with CTA */}
      {!hasNoQASets && hasNoInvestments && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">내 투자 목록</h2>
          <Card className="border-dashed">
            <CardContent className="py-8 text-center space-y-2">
              <div className="text-3xl">💰</div>
              <p className="text-sm text-muted-foreground">
                다른 사람의 Q&A에 투자하면 여기에 표시됩니다.
              </p>
              <Button variant="outline" size="sm" onClick={onGoToSearch}>
                인기 Q&A 둘러보기
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
