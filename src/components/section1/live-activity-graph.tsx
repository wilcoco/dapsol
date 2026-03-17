"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KNOWLEDGE_RELATION_COLORS } from "@/lib/constants";

// ─── Types ───

interface GraphNode {
  id: string;
  type: "question" | "answer" | "invest" | "hunt" | "opinion";
  label: string;
  sublabel?: string;
  qaSetId: string;
  amount?: number;
  relationSimple?: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "qa" | "followup" | "invest" | "hunt" | "opinion" | "knowledge" | "fork";
  label?: string;
  relationType?: string;
  isAIGenerated?: boolean;
  isUserConfirmed?: boolean;
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  r: number;
}

interface LiveActivityGraphProps {
  onSelectQASet: (qaSetId: string) => void;
  onNavigateToMap?: () => void;
}

// ─── Node visual config ───

const NODE_STYLES: Record<string, { fill: string; stroke: string; shape: "circle" | "diamond" | "rect"; baseR: number }> = {
  question: { fill: "#3b82f6", stroke: "#2563eb", shape: "circle", baseR: 14 },
  answer:   { fill: "#22c55e", stroke: "#16a34a", shape: "circle", baseR: 13 },
  invest:   { fill: "#f59e0b", stroke: "#d97706", shape: "diamond", baseR: 8 },
  hunt:     { fill: "#ef4444", stroke: "#dc2626", shape: "diamond", baseR: 8 },
  opinion:  { fill: "#8b5cf6", stroke: "#7c3aed", shape: "rect", baseR: 10 },
};

// ─── Edge visual config ───

const EDGE_STYLES: Record<string, { color: string; dash?: string; width: number; label: string }> = {
  qa:        { color: "#6b7280", width: 1.5, label: "" },
  followup:  { color: "#3b82f6", width: 1.5, dash: "4 2", label: "" },
  invest:    { color: "#f59e0b", width: 1, dash: "2 2", label: "" },
  hunt:      { color: "#ef4444", width: 1, dash: "2 2", label: "" },
  opinion:   { color: "#8b5cf6", width: 1, dash: "3 2", label: "" },
  knowledge: { color: "#94a3b8", width: 1.5, dash: "6 3", label: "" },
  fork:      { color: "#14b8a6", width: 1.5, label: "" },
};

// ─── Layout ───

function computeLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Group by qaSetId for clustering
  const qaGroups = new Map<string, GraphNode[]>();
  const otherNodes: GraphNode[] = [];
  for (const n of nodes) {
    if (n.type === "question" || n.type === "answer") {
      const g = qaGroups.get(n.qaSetId) || [];
      g.push(n);
      qaGroups.set(n.qaSetId, g);
    } else {
      otherNodes.push(n);
    }
  }

  const layout: LayoutNode[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const nodePositions = new Map<string, { x: number; y: number }>();

  // Place QASet groups in spiral
  let groupIdx = 0;
  const groupCount = qaGroups.size;

  qaGroups.forEach((msgs, _qaSetId) => {
    // Group center position (spiral)
    let gx: number, gy: number;
    if (groupCount === 1) {
      gx = cx;
      gy = cy;
    } else {
      const angle = (groupIdx / groupCount) * Math.PI * 2 - Math.PI / 2;
      const dist = Math.min(55 + groupIdx * 22, Math.min(width, height) * 0.38);
      gx = cx + Math.cos(angle) * dist;
      gy = cy + Math.sin(angle) * dist;
    }

    // Place messages in zigzag within group
    msgs.forEach((msg, mi) => {
      const style = NODE_STYLES[msg.type] ?? NODE_STYLES.question;
      const isQ = msg.type === "question";
      const offsetX = isQ ? -18 : 18;
      const offsetY = mi * 28 - (msgs.length - 1) * 14;
      const x = Math.max(style.baseR + 2, Math.min(width - style.baseR - 2, gx + offsetX));
      const y = Math.max(style.baseR + 8, Math.min(height - style.baseR - 14, gy + offsetY));

      const ln: LayoutNode = { ...msg, x, y, r: style.baseR };
      layout.push(ln);
      nodePositions.set(msg.id, { x, y });
    });

    groupIdx++;
  });

  // Place invest/hunt/opinion near their linked QASet node
  for (const n of otherNodes) {
    const style = NODE_STYLES[n.type] ?? NODE_STYLES.opinion;
    // Find edge connecting this node
    const linkedEdge = edges.find((e) => e.source === n.id || e.target === n.id);
    const linkedId = linkedEdge
      ? (linkedEdge.source === n.id ? linkedEdge.target : linkedEdge.source)
      : null;
    const linkedPos = linkedId ? nodePositions.get(linkedId) : null;

    let x: number, y: number;
    if (linkedPos) {
      // Offset from linked node
      const angle = Math.random() * Math.PI * 2;
      const dist = 22 + Math.random() * 12;
      x = linkedPos.x + Math.cos(angle) * dist;
      y = linkedPos.y + Math.sin(angle) * dist;
    } else {
      x = cx + (Math.random() - 0.5) * width * 0.6;
      y = cy + (Math.random() - 0.5) * height * 0.6;
    }

    x = Math.max(style.baseR + 2, Math.min(width - style.baseR - 2, x));
    y = Math.max(style.baseR + 8, Math.min(height - style.baseR - 14, y));

    layout.push({ ...n, x, y, r: style.baseR });
    nodePositions.set(n.id, { x, y });
  }

  return layout;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// ─── Node Shape Renderers ───

function NodeShape({ node }: { node: LayoutNode }) {
  const style = NODE_STYLES[node.type] ?? NODE_STYLES.question;

  if (style.shape === "diamond") {
    const r = node.r;
    const points = `${node.x},${node.y - r} ${node.x + r},${node.y} ${node.x},${node.y + r} ${node.x - r},${node.y}`;
    return (
      <polygon
        points={points}
        fill={style.fill}
        fillOpacity={0.25}
        stroke={style.stroke}
        strokeWidth={1.2}
        strokeOpacity={0.7}
      />
    );
  }

  if (style.shape === "rect") {
    return (
      <rect
        x={node.x - node.r}
        y={node.y - node.r * 0.7}
        width={node.r * 2}
        height={node.r * 1.4}
        rx={3}
        fill={style.fill}
        fillOpacity={0.25}
        stroke={style.stroke}
        strokeWidth={1.2}
        strokeOpacity={0.7}
      />
    );
  }

  // circle (default)
  return (
    <circle
      cx={node.x}
      cy={node.y}
      r={node.r}
      fill={style.fill}
      fillOpacity={0.2}
      stroke={style.stroke}
      strokeWidth={1.5}
      strokeOpacity={0.6}
    />
  );
}

// ─── Component ───

export function LiveActivityGraph({ onSelectQASet, onNavigateToMap }: LiveActivityGraphProps) {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ node: LayoutNode; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const vw = isMobile ? 380 : 600;
  const vh = isMobile ? 200 : 300;

  // ─── Fetch ───
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch("/api/activity-graph", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then((data) => {
        setRawNodes(data.nodes ?? []);
        setEdges(data.edges ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, []);

  // ─── Layout ───
  const layoutNodes = useMemo(
    () => computeLayout(rawNodes, edges, vw, vh),
    [rawNodes, edges, vw, vh]
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layoutNodes) m.set(n.id, n);
    return m;
  }, [layoutNodes]);

  // ─── Tooltip ───
  const handleMouseEnter = useCallback(
    (node: LayoutNode, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ─── Counts ───
  const qaSetCount = useMemo(() => {
    const s = new Set<string>();
    for (const n of rawNodes) s.add(n.qaSetId);
    return s.size;
  }, [rawNodes]);

  // ─── Loading / Empty ───
  if (loading) {
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
        </div>
        <div className="rounded-xl bg-muted/30 animate-pulse" style={{ height: isMobile ? 200 : 280 }} />
      </div>
    );
  }

  if (layoutNodes.length === 0) {
    return (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
        </div>
        <div className="rounded-xl border bg-card/50 overflow-hidden">
          <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-auto" style={{ maxHeight: 200 }}>
            <circle cx={vw / 2} cy={vh / 2} r={8} fill="#3b82f6" fillOpacity={0.3}>
              <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
              <animate attributeName="fillOpacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x={vw / 2} y={vh / 2 + 28} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "11px" }}>
              공유된 Q&A가 생기면 지식 네트워크가 시작됩니다
            </text>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🌐 지식 네트워크</span>
          <span className="text-xs text-muted-foreground">
            {qaSetCount}개 Q&A · {layoutNodes.length}개 노드
          </span>
        </div>
        {onNavigateToMap && (
          <button onClick={onNavigateToMap} className="text-xs text-primary hover:underline">
            전체 지도 →
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-1.5 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 질문</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> 답변</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rotate-45 bg-amber-500 inline-block" style={{ borderRadius: 1 }} /> 투자</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rotate-45 bg-red-500 inline-block" style={{ borderRadius: 1 }} /> 반대</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block" /> 의견</span>
        <span className="flex items-center gap-1">
          <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 2" /></svg>
          AI 제안
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#94a3b8" strokeWidth="2" /></svg>
          확정됨
        </span>
      </div>

      <div className="relative rounded-xl border bg-card/50 overflow-hidden">
        <svg
          viewBox={`0 0 ${vw} ${vh}`}
          className="w-full h-auto"
          style={{ maxHeight: isMobile ? 200 : 300 }}
        >
          {/* ── Edges ── */}
          {edges.map((edge, i) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;

            const es = EDGE_STYLES[edge.type] ?? EDGE_STYLES.qa;

            // Knowledge edges use relation-specific colors
            let color = es.color;
            if (edge.type === "knowledge" && edge.relationType) {
              color = KNOWLEDGE_RELATION_COLORS[edge.relationType] ?? es.color;
            }

            // AI-generated but not confirmed = thinner dashed
            // User confirmed = solid thicker
            let dash = es.dash;
            let width = es.width;
            if (edge.type === "knowledge") {
              if (edge.isUserConfirmed) {
                dash = undefined; // solid = confirmed
                width = 2;
              } else if (edge.isAIGenerated) {
                dash = "4 2"; // dashed = AI suggestion
                width = 1;
              }
            }

            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;

            return (
              <g key={`edge-${i}`}>
                <line
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={color}
                  strokeWidth={width}
                  strokeOpacity={0.5}
                  strokeDasharray={dash}
                  style={{
                    strokeDashoffset: dash ? 200 : 0,
                    animation: dash ? `live-graph-edge-draw 0.6s ease-out ${i * 40 + layoutNodes.length * 60}ms forwards` : undefined,
                  }}
                />
                {/* Edge label for knowledge/followup/opinion */}
                {edge.label && (edge.type === "knowledge" || edge.type === "followup" || edge.type === "opinion") && (
                  <g>
                    <rect
                      x={midX - 16} y={midY - 6}
                      width={32} height={12} rx={3}
                      fill="var(--background, white)"
                      fillOpacity={0.85}
                      stroke={color}
                      strokeWidth={0.5}
                      strokeOpacity={0.4}
                    />
                    <text
                      x={midX} y={midY + 2.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={color}
                      style={{ fontSize: "7px", fontWeight: 500 }}
                    >
                      {truncate(edge.label, 4)}
                      {edge.type === "knowledge" && edge.isAIGenerated && !edge.isUserConfirmed && " ?"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Nodes ── */}
          {layoutNodes.map((node, i) => (
            <g
              key={node.id}
              style={{
                opacity: 0,
                transformOrigin: `${node.x}px ${node.y}px`,
                animation: `live-graph-enter 0.5s ease-out ${i * 60}ms forwards`,
                cursor: "pointer",
              }}
              onClick={() => onSelectQASet(node.qaSetId)}
              onMouseEnter={(e) => handleMouseEnter(node, e)}
              onMouseLeave={handleMouseLeave}
            >
              <NodeShape node={node} />

              {/* Inner label */}
              {(node.type === "question" || node.type === "answer") && (
                <text
                  x={node.x} y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground font-semibold"
                  style={{ fontSize: "9px" }}
                >
                  {node.type === "question" ? "Q" : "A"}
                </text>
              )}
              {(node.type === "invest" || node.type === "hunt") && node.amount && (
                <text
                  x={node.x} y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground"
                  style={{ fontSize: "6px", fontWeight: 600 }}
                >
                  {node.amount}
                </text>
              )}
              {node.type === "opinion" && (
                <text
                  x={node.x} y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground"
                  style={{ fontSize: "7px", fontWeight: 600 }}
                >
                  ✍
                </text>
              )}

              {/* Sub-label below (desktop only, Q/A nodes) */}
              {!isMobile && (node.type === "question" || node.type === "answer") && (
                <text
                  x={node.x} y={node.y + node.r + 9}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: "7px" }}
                >
                  {truncate(node.label, 6)}
                </text>
              )}
            </g>
          ))}
        </svg>

        {/* ── Tooltip ── */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-popover text-popover-foreground border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[220px]"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 300) - 230),
              top: Math.max(tooltip.y - 60, 4),
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                tooltip.node.type === "question" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                tooltip.node.type === "answer" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                tooltip.node.type === "invest" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" :
                tooltip.node.type === "hunt" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
              }`}>
                {tooltip.node.type === "question" ? "질문" :
                 tooltip.node.type === "answer" ? "답변" :
                 tooltip.node.type === "invest" ? "투자" :
                 tooltip.node.type === "hunt" ? "반대투자" : "의견"}
              </span>
              {tooltip.node.sublabel && (
                <span className="text-muted-foreground">{tooltip.node.sublabel}</span>
              )}
            </div>
            <div className="text-sm leading-snug">{tooltip.node.label}</div>
            {tooltip.node.relationSimple && (
              <div className="mt-1 text-[10px] text-primary">관계: {tooltip.node.relationSimple}</div>
            )}
            <div className="mt-1 text-[10px] text-muted-foreground">클릭하여 열기</div>
          </div>
        )}
      </div>
    </div>
  );
}
