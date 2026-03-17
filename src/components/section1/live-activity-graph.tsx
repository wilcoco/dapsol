"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KNOWLEDGE_RELATION_COLORS } from "@/lib/constants";

interface ActivityNode {
  id: string;
  title: string;
  creatorName: string;
  totalInvested: number;
  investorCount: number;
  negativeCount: number;
  lastAction: string;
  lastActivityAt: string;
  parentId: string | null;
  tags: string[];
}

interface ActivityEdge {
  source: string;
  target: string;
  type: "fork" | "relation";
  relationType?: string;
}

interface LiveActivityGraphProps {
  onSelectQASet: (qaSetId: string) => void;
  onNavigateToMap?: () => void;
}

interface LayoutNode extends ActivityNode {
  x: number;
  y: number;
  r: number;
  activeEffect: string | null;
}

// ─── Spiral Layout ───
function computeSpiralLayout(nodes: ActivityNode[], width: number, height: number): LayoutNode[] {
  if (nodes.length === 0) return [];

  const sorted = [...nodes].sort((a, b) => b.totalInvested - a.totalInvested);
  const cx = width / 2;
  const cy = height / 2;

  return sorted.map((node, i) => {
    const r = Math.min(12 + Math.sqrt(node.totalInvested) * 0.8, 40);

    let x: number, y: number;
    if (i === 0) {
      x = cx;
      y = cy;
    } else {
      // Archimedean spiral
      const angle = i * 0.8 + Math.PI / 4;
      const dist = 30 + i * 14;
      x = cx + Math.cos(angle) * dist;
      y = cy + Math.sin(angle) * dist;
    }

    // Clamp to viewBox bounds
    x = Math.max(r + 5, Math.min(width - r - 5, x));
    y = Math.max(r + 12, Math.min(height - r - 16, y));

    return { ...node, x, y, r, activeEffect: null };
  });
}

// ─── Truncate ───
function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export function LiveActivityGraph({ onSelectQASet, onNavigateToMap }: LiveActivityGraphProps) {
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [edges, setEdges] = useState<ActivityEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ node: LayoutNode; x: number; y: number } | null>(null);
  const [initialAnimDone, setInitialAnimDone] = useState(false);
  const seenActivityIds = useRef(new Set<string>());
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Responsive viewBox
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const vw = isMobile ? 360 : 520;
  const vh = isMobile ? 180 : 240;
  const maxNodes = isMobile ? 20 : 30;

  // ─── Initial fetch ───
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch("/api/activity-graph", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then((data) => {
        const layoutNodes = computeSpiralLayout(
          (data.nodes as ActivityNode[]).slice(0, maxNodes),
          vw,
          vh
        );
        setNodes(layoutNodes);
        setEdges(data.edges ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [vw, vh, maxNodes]);

  // Mark initial animation complete
  useEffect(() => {
    if (nodes.length > 0 && !initialAnimDone) {
      const timer = setTimeout(() => setInitialAnimDone(true), nodes.length * 80 + 600);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, initialAnimDone]);

  // ─── Polling for live events ───
  useEffect(() => {
    if (!initialAnimDone) return;

    const poll = async () => {
      try {
        const res = await fetch("/api/activity-feed?limit=5");
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.feed) return;

        for (const item of data.feed) {
          if (seenActivityIds.current.has(item.id)) continue;
          seenActivityIds.current.add(item.id);

          if (!item.qaSetId) continue;

          // Apply effect to matching node
          setNodes((prev) =>
            prev.map((n) =>
              n.id === item.qaSetId
                ? { ...n, activeEffect: item.action }
                : n
            )
          );

          // Clear effect after 2s
          setTimeout(() => {
            setNodes((prev) =>
              prev.map((n) =>
                n.id === item.qaSetId && n.activeEffect === item.action
                  ? { ...n, activeEffect: null }
                  : n
              )
            );
          }, 2000);
        }
      } catch {}
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [initialAnimDone]);

  // ─── Tooltip ───
  const handleMouseEnter = useCallback(
    (node: LayoutNode, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        node,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ─── Node positions map for edges ───
  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // ─── Loading / Empty ───
  if (loading) {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
        </div>
        <div className="h-[200px] rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
        </div>
        <div className="rounded-xl border bg-card/50 overflow-hidden">
          <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-auto" style={{ maxHeight: "200px" }}>
            {/* Pulsing center dot */}
            <circle cx={vw / 2} cy={vh / 2} r={8} fill="#3b82f6" fillOpacity={0.3}>
              <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
              <animate attributeName="fillOpacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
            <text
              x={vw / 2}
              y={vh / 2 + 28}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              첫 Q&A를 공유하면 여기에 나타납니다
            </text>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5" ref={containerRef}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
          <span className="text-xs text-muted-foreground">
            {nodes.length}개 Q&A 활동 중
          </span>
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

      <div className="relative rounded-xl border bg-card/50 overflow-hidden">
        <svg
          viewBox={`0 0 ${vw} ${vh}`}
          className="w-full h-auto"
          style={{ maxHeight: isMobile ? "180px" : "240px" }}
        >
          {/* ── Edges ── */}
          {edges.map((edge, i) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;

            const color =
              edge.type === "fork"
                ? "#14b8a6"
                : KNOWLEDGE_RELATION_COLORS[edge.relationType ?? ""] ?? "#94a3b8";
            const isDashed = edge.type === "relation";

            return (
              <line
                key={`edge-${i}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.5}
                strokeDasharray={isDashed ? "6 3" : undefined}
                style={{
                  strokeDashoffset: 200,
                  animation: `live-graph-edge-draw 0.6s ease-out ${i * 60 + nodes.length * 80}ms forwards`,
                }}
              />
            );
          })}

          {/* ── Nodes ── */}
          {nodes.map((node, i) => {
            const effectAnim =
              node.activeEffect === "invest"
                ? "live-graph-pulse-green 1s ease-out"
                : node.activeEffect === "hunt"
                  ? "live-graph-pulse-red 0.8s ease-out"
                  : node.activeEffect === "milestone"
                    ? "live-graph-milestone 1.2s ease-out"
                    : undefined;

            const fillColor =
              node.negativeCount > node.investorCount
                ? "#ef4444"
                : node.totalInvested >= 100
                  ? "#22c55e"
                  : node.totalInvested >= 30
                    ? "#3b82f6"
                    : "#94a3b8";

            return (
              <g
                key={node.id}
                style={{
                  opacity: 0,
                  transformOrigin: `${node.x}px ${node.y}px`,
                  animation: `live-graph-enter 0.5s ease-out ${i * 80}ms forwards`,
                  cursor: "pointer",
                }}
                onClick={() => onSelectQASet(node.id)}
                onMouseEnter={(e) => handleMouseEnter(node, e)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Breathing glow for active nodes */}
                {node.totalInvested >= 30 && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 4}
                    fill={fillColor}
                    style={{ animation: "live-graph-breathe 3s ease-in-out infinite" }}
                  />
                )}

                {/* Live event pulse ring */}
                {effectAnim && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill="none"
                    style={{ animation: effectAnim }}
                  />
                )}

                {/* Main circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={fillColor}
                  fillOpacity={0.2}
                  stroke={fillColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                />

                {/* Investor count inside */}
                {node.investorCount > 0 && (
                  <text
                    x={node.x}
                    y={node.y + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-foreground font-medium"
                    style={{ fontSize: node.r > 25 ? "10px" : "8px" }}
                  >
                    {node.investorCount}명
                  </text>
                )}

                {/* Title below node */}
                {!isMobile && (
                  <text
                    x={node.x}
                    y={node.y + node.r + 11}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: "8px" }}
                  >
                    {truncate(node.title, 8)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Tooltip (HTML, outside SVG) ── */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-popover text-popover-foreground border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[200px]"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 300) - 210),
              top: tooltip.y - 10,
            }}
          >
            <div className="font-medium text-sm mb-1">{tooltip.node.title}</div>
            <div className="text-muted-foreground mb-1">by {tooltip.node.creatorName}</div>
            <div className="flex items-center gap-2">
              {tooltip.node.investorCount > 0 && (
                <span className="text-green-600">
                  💰 {tooltip.node.totalInvested}P · {tooltip.node.investorCount}명
                </span>
              )}
              {tooltip.node.negativeCount > 0 && (
                <span className="text-red-500">
                  📉 {tooltip.node.negativeCount}명
                </span>
              )}
            </div>
            {tooltip.node.tags.length > 0 && (
              <div className="mt-1 flex gap-1 flex-wrap">
                {tooltip.node.tags.map((t) => (
                  <span key={t} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{t}</span>
                ))}
              </div>
            )}
            <div className="mt-1 text-[10px] text-muted-foreground">클릭하여 열기</div>
          </div>
        )}
      </div>
    </div>
  );
}
