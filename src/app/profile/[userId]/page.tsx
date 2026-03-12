"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { HubIcon, AuthorityIcon } from "@/components/ui/score-icons";

interface ProfileData {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    balance: number;
    trustLevel: number;
    hubScore: number | null;
    authorityScore: number | null;
    createdAt: string;
  };
  stats: {
    totalQASets: number;
    sharedQASets: number;
    totalInvestments: number;
    totalAmountInvested: number;
    totalRewardsReceived: number;
  };
  recentQASets: {
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
  }[];
  recentInvestments: {
    id: string;
    amount: number;
    isNegative?: boolean;
    createdAt: string;
    qaSet: { id: string; title: string | null; totalInvested: number; negativeInvested?: number; authorityScore: number };
  }[];
  rewardHistory: {
    id: string;
    amount: number;
    rewardType: string;
    createdAt: string;
    qaSet: { id: string; title: string | null };
  }[];
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TrustLevelBadge({ level }: { level: number }) {
  const levels = [
    { min: 1, label: "신규", color: "secondary" },
    { min: 2, label: "기여자", color: "default" },
    { min: 3, label: "전문가", color: "default" },
    { min: 5, label: "마스터", color: "default" },
  ];
  const current = [...levels].reverse().find((l) => level >= l.min) ?? levels[0];
  return (
    <Badge variant="outline" className="text-sm px-3 py-1">
      ⭐ Lv.{level} {current.label}
    </Badge>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const { data: session } = useSession();
  const userId = params.userId as string;
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/profile/${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => console.error("Profile fetch error:", e))
      .finally(() => setLoading(false));
  }, [userId]);

  const isOwnProfile = session?.user?.id === userId;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-muted-foreground">유저를 찾을 수 없습니다.</div>
        ) : (
          <div className="space-y-6">
            {/* Profile header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={data.user.image ?? ""} alt={data.user.name ?? ""} />
                    <AvatarFallback className="text-2xl">
                      {data.user.name?.charAt(0) ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-bold">{data.user.name ?? "익명"}</h1>
                      {isOwnProfile && (
                        <Badge variant="outline" className="text-xs">나</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <TrustLevelBadge level={data.user.trustLevel} />
                      <Badge variant="secondary" className="font-mono">
                        💎 {data.user.balance} 포인트
                      </Badge>
                      {data.user.hubScore != null && (
                        <Badge
                          variant="outline"
                          className="font-mono border-amber-300 text-amber-700 dark:text-amber-400"
                          title="Hub 점수 — 좋은 Q&A를 먼저 발굴하여 보상을 받을수록 상승"
                        >
                          <HubIcon size={13} className="mr-0.5" /> Hub {data.user.hubScore.toFixed(2)}
                        </Badge>
                      )}
                      {(data.user.authorityScore ?? 0) > 0 && (
                        <Badge
                          variant="outline"
                          className="font-mono border-blue-300 text-blue-700 dark:text-blue-400"
                          title="Authority 점수 — 내 Q&A에 다른 사람들이 투자할수록 상승"
                        >
                          <AuthorityIcon size={13} className="mr-0.5" /> Auth {(data.user.authorityScore as number).toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(data.user.createdAt).toLocaleDateString("ko-KR", {
                        year: "numeric", month: "long", day: "numeric",
                      })} 가입
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon="📝" label="총 Q&A" value={data.stats.totalQASets} />
              <StatCard icon="🌐" label="공유된 Q&A" value={data.stats.sharedQASets} />
              <StatCard icon="💎" label="총 투자 금액" value={`${data.stats.totalAmountInvested.toLocaleString()}`} />
              <StatCard icon="🎁" label="받은 보상" value={`${data.stats.totalRewardsReceived.toLocaleString()}`} />
            </div>

            {/* HITS score insight cards */}
            {(data.user.hubScore != null && data.user.hubScore !== 1.0) ||
             (data.user.authorityScore ?? 0) > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Hub insight */}
                {data.user.hubScore != null && data.user.hubScore !== 1.0 && (
                  <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <HubIcon size={28} className="text-amber-500 shrink-0" />
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                          Hub 점수: {data.user.hubScore.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {data.user.hubScore >= 10
                          ? "탁월한 투자 안목 — 가치 있는 Q&A를 일찍 발굴하고 있습니다."
                          : data.user.hubScore >= 5
                          ? "좋은 투자 안목 — 계속해서 더 많은 Q&A에 투자해보세요."
                          : "투자 안목 성장 중 — 좋은 Q&A를 발굴할수록 점수가 오릅니다."}
                      </p>
                      <div className="text-[10px] text-muted-foreground/70 leading-relaxed border-t border-amber-200/50 pt-2">
                        Hub는 투자 안목을 나타냅니다. 나중에 인기 있는 Q&A에 먼저 투자하면 후속 투자자들로부터
                        보상을 받고, 이 보상 실적이 Hub 점수에 반영됩니다. Hub가 높으면 같은 금액으로 더 큰 실효 지분을 확보합니다.
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Authority insight */}
                {(data.user.authorityScore ?? 0) > 0 && (
                  <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        <AuthorityIcon size={28} className="text-blue-500 shrink-0" />
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          Authority 점수: {(data.user.authorityScore as number).toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {(data.user.authorityScore as number) >= 200
                          ? "뛰어난 창작 권위 — 다른 투자자들이 당신의 Q&A를 신뢰합니다."
                          : (data.user.authorityScore as number) >= 130
                          ? "성장 중인 권위 — 더 많은 콘텐츠를 공유하고 투자를 유치해보세요."
                          : "초기 권위 — Q&A를 공유하고 다른 사람들의 투자를 받으면 상승합니다."}
                      </p>
                      <div className="text-[10px] text-muted-foreground/70 leading-relaxed border-t border-blue-200/50 pt-2">
                        Authority는 콘텐츠 창작자로서의 신뢰도입니다. 내가 만든 Q&A에 다른 사람들이 투자하면 상승합니다.
                        기본값은 100이며, 외부 투자가 쌓일수록 올라가지만 높은 점수일수록 올리기 어렵습니다 (로그 스케일).
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}

            {/* Recent Q&A Sets */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">최근 Q&A</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentQASets.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">아직 Q&A가 없습니다.</p>
                ) : (
                  <div className="divide-y">
                    {data.recentQASets.map((qa) => (
                      <Link
                        key={qa.id}
                        href={`/?qaSetId=${qa.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{qa.title ?? "제목 없음"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            💬 {qa._count.messages}개 · 👁️ {qa.viewCount} · 💎 {qa.totalInvested - (qa.negativeInvested ?? 0)} 순투자
                            {(qa.negativeInvested ?? 0) > 0 && (
                              <span className="text-red-500 ml-0.5">(-{qa.negativeInvested} 🔻{qa.negativeCount})</span>
                            )}
                            {qa.isShared && qa.authorityScore > 0 && (
                              <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-0.5">
                                · <AuthorityIcon size={11} /> {qa.authorityScore.toFixed(1)}
                              </span>
                            )}
                          </p>
                        </div>
                        {qa.isShared && (
                          <Badge variant="secondary" className="text-xs ml-2 shrink-0">공유됨</Badge>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Investments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">최근 투자</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.recentInvestments.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">아직 투자 내역이 없습니다.</p>
                ) : (
                  <div className="divide-y">
                    {data.recentInvestments.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/?qaSetId=${inv.qaSet.id}`}
                            className="text-sm font-medium truncate block hover:text-primary transition-colors"
                          >
                            {inv.qaSet.title ?? "제목 없음"}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {new Date(inv.createdAt).toLocaleDateString("ko-KR")}
                            </span>
                            {inv.qaSet.authorityScore > 0 ? (
                              <span className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                                <AuthorityIcon size={11} /> {inv.qaSet.authorityScore.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 inline-flex items-center gap-0.5"><AuthorityIcon size={11} /> —</span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`font-mono ml-2 shrink-0 ${inv.isNegative ? "border-red-300 text-red-600 dark:text-red-400" : ""}`}
                        >
                          {inv.isNegative ? "🔻" : "💎"} -{inv.amount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reward History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  🎁 보상 이력
                  <Badge variant="secondary" className="text-xs font-normal">
                    총 +{data.stats.totalRewardsReceived.toLocaleString()} 💎
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(data.rewardHistory ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">아직 받은 보상이 없습니다.</p>
                ) : (
                  <div className="divide-y">
                    {(data.rewardHistory ?? []).map((ev) => {
                      const typeLabel: Record<string, string> = {
                        proportional_distribution: "📈 선투자 보상",
                        hub_weighted_distribution: "📈 선투자 보상",
                        quality_pool_creator: "🏆 품질 풀 (제작자)",
                        quality_pool_investor: "🔓 품질 풀 해제",
                        uninvest_refund: "↩️ 철회 환급",
                        fork_royalty: "🔗 포크 로열티",
                        authority_ratio_royalty: "⚡ Authority 배분",
                      };
                      const typeDesc: Record<string, string> = {
                        proportional_distribution: "후속 투자자가 투자하여 발생한 보상",
                        hub_weighted_distribution: "후속 투자자가 투자하여 발생한 보상",
                        quality_pool_creator: "투자자 마일스톤 달성으로 품질 풀에서 해제",
                        quality_pool_investor: "투자자 마일스톤 달성으로 품질 풀에서 해제",
                        uninvest_refund: "투자 철회 시 환급 (20% 수수료 차감)",
                        fork_royalty: "확장된 Q&A에서 원본으로 배분",
                        authority_ratio_royalty: "Authority 비율 기반 배분",
                      };
                      const label = typeLabel[ev.rewardType] ?? `💎 ${ev.rewardType}`;
                      const desc = typeDesc[ev.rewardType] ?? "";
                      return (
                        <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">{label}</span>
                            </div>
                            <Link
                              href={`/?qaSetId=${ev.qaSet.id}`}
                              className="text-sm truncate block hover:text-primary transition-colors mt-0.5"
                            >
                              {ev.qaSet.title ?? "제목 없음"}
                            </Link>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(ev.createdAt).toLocaleDateString("ko-KR", {
                                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                              {desc && (
                                <span className="text-[10px] text-muted-foreground/60">{desc}</span>
                              )}
                            </div>
                          </div>
                          <Badge className="font-mono ml-2 shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                            +{ev.amount} 💎
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
