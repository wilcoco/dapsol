"use client";

import { useState, useEffect } from "react";

interface FeedItem {
  id: string;
  action: string;
  userName: string;
  qaSetTitle: string | null;
  qaSetId: string | null;
  amount: number | null;
  createdAt: string;
  message: string;
}

const ACTION_CONFIG: Record<string, { icon: string; gradient: string }> = {
  share: { icon: "⛏️", gradient: "from-blue-500/20 to-blue-600/10 border-blue-200 dark:border-blue-800" },
  invest: { icon: "🌾", gradient: "from-green-500/20 to-green-600/10 border-green-200 dark:border-green-800" },
  hunt: { icon: "🏹", gradient: "from-red-500/20 to-red-600/10 border-red-200 dark:border-red-800" },
  milestone: { icon: "🏆", gradient: "from-yellow-500/20 to-yellow-600/10 border-yellow-200 dark:border-yellow-800" },
  burn: { icon: "🔥", gradient: "from-orange-500/20 to-orange-600/10 border-orange-200 dark:border-orange-800" },
};

const DEFAULT_CONFIG = { icon: "📌", gradient: "from-muted/50 to-muted/30 border-border" };

interface ActivityFeedProps {
  onSelectQASet?: (qaSetId: string) => void;
}

export function ActivityFeed({ onSelectQASet }: ActivityFeedProps) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity-feed?limit=8")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.feed) setFeed(d.feed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">📡 지금 이 순간</span>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 w-48 rounded-xl bg-muted/50 animate-pulse shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (feed.length === 0) return null;

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  };

  // Format progressive text: "N명 경작 중" style
  const progressiveMessage = (item: FeedItem) => {
    if (item.action === "invest" && item.amount) {
      return `${item.userName}님이 ${item.amount}🌾 경작 중`;
    }
    if (item.action === "hunt" && item.amount) {
      return `${item.userName}님이 반박 중 🏹`;
    }
    return item.message;
  };

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">📡 지금 이 순간</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs text-muted-foreground">실시간</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {feed.map((item) => {
          const config = ACTION_CONFIG[item.action] ?? DEFAULT_CONFIG;
          return (
            <button
              key={item.id}
              onClick={() => item.qaSetId && onSelectQASet?.(item.qaSetId)}
              disabled={!item.qaSetId}
              className={`shrink-0 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border bg-gradient-to-br ${config.gradient} hover:shadow-md transition-all text-left max-w-[260px] disabled:opacity-70 disabled:cursor-default`}
            >
              <span className="text-xl shrink-0 mt-0.5">{config.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate leading-snug">{progressiveMessage(item)}</p>
                {item.qaSetTitle && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">"{item.qaSetTitle}"</p>
                )}
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(item.createdAt)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
