"use client";

import { useState, useEffect, useMemo } from "react";

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

  // Calculate bubble positions in a packed layout
  const bubbleLayout = useMemo(() => {
    if (clusters.length === 0) return [];

    const maxQA = Math.max(...clusters.map((c) => c.qaCount), 1);
    const svgW = 320;
    const svgH = 140;
    const centerX = svgW / 2;
    const centerY = svgH / 2;

    return clusters.slice(0, 5).map((cluster, i) => {
      // Bubble size proportional to QA count (area-proportional per Tufte)
      const ratio = Math.max(cluster.qaCount / maxQA, 0.3);
      const r = 18 + ratio * 22; // radius: 18~40

      // Position in a circle around center
      const angle = (i / Math.min(clusters.length, 5)) * Math.PI * 2 - Math.PI / 2;
      const dist = clusters.length === 1 ? 0 : 45 + r * 0.3;
      const x = centerX + Math.cos(angle) * dist;
      const y = centerY + Math.sin(angle) * dist;

      // Color based on health: green (verified), yellow (growing), red (disputed)
      const hasGaps = cluster.gapCount > 0;
      const isSmall = cluster.qaCount < 3;
      const color = hasGaps ? "#eab308" : isSmall ? "#94a3b8" : "#22c55e";
      const colorDark = hasGaps ? "#ca8a04" : isSmall ? "#64748b" : "#16a34a";

      return { ...cluster, x, y, r, color, colorDark };
    });
  }, [clusters]);

  if (loading) {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">🗺️ 주제 클러스터</span>
        </div>
        <div className="h-[140px] rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (clusters.length === 0) return null;

  const totalQA = clusters.reduce((sum, c) => sum + c.qaCount, 0);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🗺️ 주제 클러스터</span>
          <span className="text-xs text-muted-foreground">{clusters.length}개 클러스터 · {totalQA}개 지식</span>
        </div>
        {onNavigateToMap && (
          <button
            onClick={onNavigateToMap}
            className="text-xs text-primary hover:underline"
          >
            전체 지도 →
          </button>
        )}
      </div>

      {/* Bubble diagram */}
      <div
        className="rounded-xl border bg-card/50 overflow-hidden cursor-pointer hover:bg-card/80 transition-colors"
        onClick={onNavigateToMap}
      >
        <svg viewBox="0 0 320 140" className="w-full h-auto" style={{ maxHeight: "160px" }}>
          {/* Connection lines between bubbles */}
          {bubbleLayout.map((b1, i) =>
            bubbleLayout.slice(i + 1).map((b2, j) => (
              <line
                key={`${b1.id}-${b2.id}`}
                x1={b1.x}
                y1={b1.y}
                x2={b2.x}
                y2={b2.y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
            ))
          )}

          {/* Bubbles */}
          {bubbleLayout.map((bubble) => (
            <g key={bubble.id}>
              {/* Glow effect for active clusters */}
              {bubble.qaCount >= 3 && (
                <circle
                  cx={bubble.x}
                  cy={bubble.y}
                  r={bubble.r + 3}
                  fill={bubble.color}
                  opacity={0.15}
                >
                  <animate
                    attributeName="opacity"
                    values="0.15;0.05;0.15"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={bubble.x}
                cy={bubble.y}
                r={bubble.r}
                fill={bubble.color}
                fillOpacity={0.2}
                stroke={bubble.color}
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />
              {/* Label */}
              <text
                x={bubble.x}
                y={bubble.y - 4}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-medium"
                style={{ fontSize: bubble.r > 30 ? "11px" : "9px" }}
              >
                {bubble.label.length > 6 ? bubble.label.slice(0, 6) + "…" : bubble.label}
              </text>
              {/* QA count */}
              <text
                x={bubble.x}
                y={bubble.y + 10}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: "8px" }}
              >
                {bubble.qaCount}개
                {bubble.gapCount > 0 && ` · ❓${bubble.gapCount}`}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
