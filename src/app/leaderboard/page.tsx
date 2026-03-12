"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, RefreshCw } from "lucide-react";
import { HubIcon, AuthorityIcon } from "@/components/ui/score-icons";

type SortKey = "trustLevel" | "balance" | "qaSets" | "invested" | "hub" | "authority";

interface LeaderboardUser {
  id: string;
  name: string | null;
  image: string | null;
  balance: number;
  trustLevel: number;
  hubScore: number | null;
  authorityScore: number | null;
  sharedQASets: number;
  totalAmountInvested: number;
  totalRewardsReceived: number;
  _count: { qaSets: number; investments: number };
}

interface TopAuthority {
  id: string;
  title: string | null;
  authorityScore: number;
  qualityPool: number;
}

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: "hub",       label: "Hub 안목",    icon: "🎯" },
  { key: "authority", label: "Authority",   icon: "⚡" },
  { key: "trustLevel",label: "신뢰 레벨",   icon: "⭐" },
  { key: "balance",   label: "포인트 잔액", icon: "💎" },
  { key: "qaSets",    label: "Q&A 수",      icon: "📝" },
  { key: "invested",  label: "투자 금액",   icon: "💰" },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return (
    <span className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function sortValue(user: LeaderboardUser, sort: SortKey): number {
  if (sort === "hub")       return user.hubScore ?? 1.0;
  if (sort === "authority") return user.authorityScore ?? 0;
  if (sort === "trustLevel") return user.trustLevel;
  if (sort === "balance")   return user.balance;
  if (sort === "qaSets")    return user._count.qaSets;
  if (sort === "invested")  return user.totalAmountInvested;
  return 0;
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [topAuthorities, setTopAuthorities] = useState<TopAuthority[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [sort, setSort] = useState<SortKey>("hub");

  const fetchUsers = (s: SortKey) => {
    setLoading(true);
    fetch(`/api/leaderboard?sort=${s}`)
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  const fetchAuthorities = () => {
    fetch("/api/hits/recalculate")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setTopAuthorities(d.topAuthorities ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchUsers(sort);
    fetchAuthorities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchUsers(sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await fetch("/api/hits/recalculate", { method: "POST" });
      fetchUsers(sort);
      fetchAuthorities();
    } catch {
      // silently fail
    } finally {
      setIsRecalculating(false);
    }
  };

  const sorted = [...users].sort((a, b) => sortValue(b, sort) - sortValue(a, sort));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">🏆 리더보드</h1>
            <p className="text-sm text-muted-foreground mt-1">
              HITS 알고리즘 기반 투자 안목(Hub) & 콘텐츠 권위(Authority) 순위
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={isRecalculating || loading}
            className="shrink-0 gap-1.5"
          >
            {isRecalculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            HITS 재계산
          </Button>
        </div>

        {/* HITS explanation */}
        <Card className="bg-gradient-to-br from-amber-50 to-blue-50 dark:from-amber-950/20 dark:to-blue-950/20 border-amber-200/50 dark:border-amber-800/30 mb-6">
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1.5">
                <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><HubIcon size={16} /> Hub 점수 (투자 안목)</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  좋은 Q&A를 먼저 발굴해서 투자하면, 이후 투자자들로부터 보상을 받습니다.
                  이 보상 실적이 Hub 점수에 반영됩니다.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hub가 높으면 <strong>같은 금액으로 더 큰 실효 지분</strong>을 확보하여
                  보상에서 유리합니다. (실효 가중치 = √투자금 × Hub)
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><AuthorityIcon size={16} /> Authority 점수 (창작 권위)</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  내가 만든 Q&A에 다른 사람들이 투자하면 Authority가 올라갑니다.
                  내 콘텐츠가 커뮤니티에서 인정받고 있다는 지표입니다.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Authority가 높으면 품질 풀 해제 시 더 많은 보상을 받으며,
                  포크 Q&A에서 원본으로 더 높은 배분 비율을 확보합니다.
                </p>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground/60 leading-relaxed border-t border-amber-200/30 dark:border-amber-800/30 pt-2">
              📐 모든 점수는 <strong>로그 스케일</strong>로 계산됩니다 — 초반에는 빠르게 성장하지만, 높은 점수일수록 올리기 어렵습니다.
              이는 점수 조작을 비효율적으로 만들고, 꾸준한 양질의 활동만이 높은 점수를 유지할 수 있게 합니다.
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users section */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {SORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.key}
                  variant={sort === opt.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSort(opt.key)}
                  className="text-xs"
                >
                  {opt.icon} {opt.label}
                </Button>
              ))}
            </div>

            <Card>
              {loading ? (
                <CardContent className="p-4 space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </CardContent>
              ) : (
                <div className="divide-y">
                  {sorted.map((user, idx) => {
                    const rank = idx + 1;
                    const isMe = session?.user?.id === user.id;
                    const value = sortValue(user, sort);
                    const sortOpt = SORT_OPTIONS.find((o) => o.key === sort)!;

                    return (
                      <Link
                        key={user.id}
                        href={`/profile/${user.id}`}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors ${
                          isMe ? "bg-primary/5" : ""
                        }`}
                      >
                        {/* Rank */}
                        <div className="w-8 flex items-center justify-center shrink-0">
                          <RankBadge rank={rank} />
                        </div>

                        {/* Avatar */}
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
                          <AvatarFallback>{user.name?.charAt(0) ?? "U"}</AvatarFallback>
                        </Avatar>

                        {/* Name + badges */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate">{user.name ?? "익명"}</span>
                            {isMe && (
                              <Badge variant="outline" className="text-xs py-0">나</Badge>
                            )}
                            <Badge variant="secondary" className="text-xs py-0">
                              Lv.{user.trustLevel}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {user.hubScore != null && user.hubScore !== 1.0 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-0.5">
                                <HubIcon size={12} /> {user.hubScore.toFixed(2)}
                              </span>
                            )}
                            {(user.authorityScore ?? 0) > 0 && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-0.5">
                                <AuthorityIcon size={12} /> {(user.authorityScore ?? 0).toFixed(2)}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              📝 {user._count.qaSets}개 · 🌐 {user.sharedQASets}개 공유
                            </span>
                          </div>
                        </div>

                        {/* Main value */}
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-bold font-mono ${
                            sort === "hub"
                              ? "text-amber-700 dark:text-amber-400"
                              : sort === "authority"
                              ? "text-blue-700 dark:text-blue-400"
                              : ""
                          }`}>
                            {sortOpt.icon} {
                              sort === "hub" || sort === "authority"
                                ? (value as number).toFixed(2)
                                : (value as number).toLocaleString()
                            }
                          </p>
                          <p className="text-xs text-muted-foreground">{sortOpt.label}</p>
                        </div>
                      </Link>
                    );
                  })}

                  {sorted.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      아직 데이터가 없습니다.
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Top Authority sidebar */}
          <div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <AuthorityIcon size={14} /> Top Authority Q&A
                </CardTitle>
                <CardDescription className="text-xs">
                  가장 신뢰받는 콘텐츠
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {topAuthorities.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground space-y-1.5">
                    <div className="text-3xl">📚</div>
                    <p>투자 후 HITS 재계산 시<br/>Authority 순위가 표시됩니다</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topAuthorities.map((qa, i) => (
                      <Link
                        key={qa.id}
                        href={`/?qaSetId=${qa.id}`}
                        className="flex items-start gap-2 py-1.5 px-1 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <span className={`text-xs font-bold w-4 text-center mt-0.5 shrink-0 ${
                          i === 0 ? "text-yellow-500" :
                          i === 1 ? "text-gray-400" :
                          i === 2 ? "text-amber-600" :
                          "text-muted-foreground"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                            {qa.title ?? "제목 없음"}
                          </p>
                          {qa.qualityPool > 0 && (
                            <p className="text-[10px] text-blue-600 dark:text-blue-400">
                              🔒 {qa.qualityPool} 💎 품질풀
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] py-0 px-1 border-blue-300 text-blue-700 dark:text-blue-400 shrink-0"
                        >
                          <AuthorityIcon size={10} className="mr-0.5" />{qa.authorityScore.toFixed(1)}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
