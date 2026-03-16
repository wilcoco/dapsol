"use client";

import { useSession } from "next-auth/react";

const TRUST_TITLES: Record<number, string> = {
  1: "초보자",
  2: "기여자",
  3: "전문가",
  4: "장로",
  5: "원로",
};

export function MyStatus() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const user = session.user as any;
  const balance = user.balance ?? 0;
  const trustLevel = user.trustLevel ?? 1;
  const hubScore = user.hubScore ?? 100;
  const authorityScore = user.authorityScore ?? 100;
  const title = TRUST_TITLES[trustLevel] ?? "초보자";

  // Simple contribution estimate based on authority score
  // Authority > 100 means user has contributed meaningfully
  const contributionPercent = Math.max(0, ((authorityScore - 100) / 50) * 100).toFixed(1);
  const harvestROI = hubScore > 100 ? `+${Math.round((hubScore - 100) / 100 * 100)}%` : "—";

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">👤 나의 현황</span>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <span className="text-base font-bold tabular-nums">{balance.toLocaleString()}P</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Lv.{trustLevel} {title}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">📊 기여도</p>
            <p className="text-sm font-semibold tabular-nums">{contributionPercent}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">📈 수익률</p>
            <p className="text-sm font-semibold tabular-nums">{harvestROI}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-0.5">⭐ 신뢰</p>
            <p className="text-sm font-semibold tabular-nums">{authorityScore}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
