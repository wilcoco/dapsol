"use client";

import { useState, useEffect } from "react";

interface ClusterSummary {
  id: string;
  label: string;
  qaCount: number;
  gapCount: number;
}

interface MiniMapProps {
  onNavigateToMap?: () => void;
}

export function MiniMap({ onNavigateToMap }: MiniMapProps) {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clusters?limit=6")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.clusters) {
          setClusters(
            d.clusters.map((c: any) => ({
              id: c.id,
              label: c.name ?? c.label ?? "주제",
              qaCount: c._count?.qaSets ?? c.qaCount ?? 0,
              gapCount: c._count?.knowledgeGaps ?? c.gapCount ?? 0,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">🗺️ 지식 영토</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (clusters.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🗺️ 지식 영토</span>
          <span className="text-xs text-muted-foreground">{clusters.length}개 마을</span>
        </div>
        {onNavigateToMap && (
          <button
            onClick={onNavigateToMap}
            className="text-xs text-primary hover:underline"
          >
            전체 지도 보기 →
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {clusters.map((cluster) => (
          <button
            key={cluster.id}
            onClick={onNavigateToMap}
            className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
          >
            <p className="text-sm font-medium truncate">{cluster.label}</p>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>📄 {cluster.qaCount}</span>
              {cluster.gapCount > 0 && (
                <span className="text-amber-600">❓ {cluster.gapCount}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
