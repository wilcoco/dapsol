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

const ACTION_ICON: Record<string, string> = {
  share: "⛏️",
  invest: "🌾",
  hunt: "🏹",
  milestone: "🏆",
  burn: "🔥",
};

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
          <span className="text-sm font-semibold">📡 지금 일어나고 있는 일</span>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-48 rounded-lg bg-muted/50 animate-pulse shrink-0" />
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

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">📡 지금 일어나고 있는 일</span>
        <span className="text-xs text-muted-foreground">실시간 활동</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {feed.map((item) => (
          <button
            key={item.id}
            onClick={() => item.qaSetId && onSelectQASet?.(item.qaSetId)}
            disabled={!item.qaSetId}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left max-w-[280px] disabled:opacity-70 disabled:cursor-default"
          >
            <span className="text-base shrink-0">{ACTION_ICON[item.action] ?? "📌"}</span>
            <div className="min-w-0">
              <p className="text-xs truncate">{item.message}</p>
              <p className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
