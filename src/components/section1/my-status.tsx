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

  const user = session.user as { balance?: number; trustLevel?: number; hubScore?: number; authorityScore?: number };
  const balance = user.balance ?? 0;
  const trustLevel = user.trustLevel ?? 1;
  const hubScore = user.hubScore ?? 100;
  const authorityScore = user.authorityScore ?? 100;

  // Simple contribution estimate based on authority score
  // Authority > 100 means user has contributed meaningfully
  const contributionPercent = Math.max(0, ((authorityScore - 100) / 50) * 100).toFixed(1);
  const harvestROI = hubScore > 100 ? `+${Math.round((hubScore - 100) / 100 * 100)}%` : "—";

  return (
    <div className="mb-3">
      <div className="rounded-lg border bg-card/50 p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums">{balance.toLocaleString()}👣</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Lv.{trustLevel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span>📊 {contributionPercent}%</span>
            <span>📈 {harvestROI}</span>
            <span>⭐ {authorityScore}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
