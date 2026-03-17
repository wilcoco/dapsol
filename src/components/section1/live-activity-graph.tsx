"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KNOWLEDGE_RELATION_COLORS } from "@/lib/constants";

// ─── Types ───

interface GraphNode {
  id: string;
  type: "question" | "answer" | "invest" | "hunt" | "opinion" | "author";
  label: string;
  sublabel?: string;
  qaSetId: string;
  amount?: number;
  relationSimple?: string | null;
  clusterId?: string | null;
  clusterName?: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "qa" | "followup" | "invest" | "hunt" | "opinion" | "knowledge" | "fork" | "author";
  label?: string;
  relationType?: string;
  isAIGenerated?: boolean;
  isUserConfirmed?: boolean;
}

interface ClusterInfo {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ClusterHalo {
  id: string;
  name: string;
  color: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface LiveActivityGraphProps {
  onSelectQASet: (qaSetId: string) => void;
  onNavigateToMap?: () => void;
  onNavigateToCluster?: (clusterId: string) => void;
}

// ─── Node dimensions ───

const NODE_CONFIG: Record<string, {
  fill: string; stroke: string;
  shape: "rect" | "circle";
  w: number; h: number;
}> = {
  question: { fill: "#3b82f6", stroke: "#2563eb", shape: "rect", w: 140, h: 26 },
  answer:   { fill: "#22c55e", stroke: "#16a34a", shape: "rect", w: 140, h: 26 },
  invest:   { fill: "#f59e0b", stroke: "#d97706", shape: "circle", w: 20, h: 20 },
  hunt:     { fill: "#ef4444", stroke: "#dc2626", shape: "circle", w: 20, h: 20 },
  opinion:  { fill: "#8b5cf6", stroke: "#7c3aed", shape: "rect", w: 120, h: 22 },
  author:   { fill: "#6366f1", stroke: "#4f46e5", shape: "circle", w: 24, h: 24 },
};

// ─── Edge styles ───

const EDGE_STYLES: Record<string, { color: string; dash?: string; width: number }> = {
  qa:        { color: "#6b7280", width: 1.5 },
  followup:  { color: "#3b82f6", width: 1.5, dash: "4 2" },
  invest:    { color: "#f59e0b", width: 1, dash: "2 2" },
  hunt:      { color: "#ef4444", width: 1, dash: "2 2" },
  opinion:   { color: "#8b5cf6", width: 1, dash: "3 2" },
  knowledge: { color: "#94a3b8", width: 1.5, dash: "6 3" },
  fork:      { color: "#14b8a6", width: 1.5 },
  author:    { color: "#6366f1", width: 0.8, dash: "2 2" },
};

// ─── Radial Layout ───

function computeRadialLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusters: ClusterInfo[],
  width: number,
  height: number,
): { layout: LayoutNode[]; halos: ClusterHalo[] } {
  if (nodes.length === 0) return { layout: [], halos: [] };

  const cx = width / 2;
  const cy = height / 2;

  // Group Q/A messages by qaSetId
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

  // Group QASets by cluster
  const clusterIdMap = new Map<string, string>(); // qaSetId → clusterId
  for (const n of nodes) {
    if (n.clusterId && !clusterIdMap.has(n.qaSetId)) {
      clusterIdMap.set(n.qaSetId, n.clusterId);
    }
  }

  // Build cluster groups: clusterId → qaSetId[]
  const clusterGroups = new Map<string, string[]>();
  const unclusteredSets: string[] = [];
  for (const qaSetId of qaGroups.keys()) {
    const cid = clusterIdMap.get(qaSetId);
    if (cid) {
      const g = clusterGroups.get(cid) || [];
      g.push(qaSetId);
      clusterGroups.set(cid, g);
    } else {
      unclusteredSets.push(qaSetId);
    }
  }

  // Find hub: QASet with most nodes (proxy for activity)
  let hubQASetId = "";
  let maxMsgs = 0;
  for (const [qsId, msgs] of qaGroups) {
    if (msgs.length > maxMsgs) {
      maxMsgs = msgs.length;
      hubQASetId = qsId;
    }
  }

  // Assign angular sectors to clusters
  const totalSets = qaGroups.size;
  const MIN_ANGLE = (40 * Math.PI) / 180; // 40 degrees min per cluster
  const allClusterIds = [...clusterGroups.keys()];
  if (unclusteredSets.length > 0) allClusterIds.push("__unclustered__");

  const sectorAngles: { id: string; startAngle: number; endAngle: number; qaSetIds: string[] }[] = [];
  if (allClusterIds.length === 0) {
    // No clusters at all, place everything in a full circle
    sectorAngles.push({ id: "__all__", startAngle: 0, endAngle: Math.PI * 2, qaSetIds: [...qaGroups.keys()] });
  } else {
    const totalAngle = Math.PI * 2;
    let remainingAngle = totalAngle;
    const clusterSizes: { id: string; count: number; qaSetIds: string[] }[] = [];
    for (const cid of allClusterIds) {
      const qaSetIds = cid === "__unclustered__" ? unclusteredSets : (clusterGroups.get(cid) ?? []);
      clusterSizes.push({ id: cid, count: qaSetIds.length, qaSetIds });
    }
    // Calculate proportional angles with minimum
    const totalCount = clusterSizes.reduce((s, c) => s + c.count, 0);
    let currentAngle = -Math.PI / 2; // start from top
    for (const cs of clusterSizes) {
      const proportion = cs.count / Math.max(totalCount, 1);
      let angle = Math.max(MIN_ANGLE, proportion * totalAngle);
      if (currentAngle + angle > Math.PI * 2 - Math.PI / 2) {
        angle = Math.PI * 2 - Math.PI / 2 - currentAngle + Math.PI * 2; // wrap
      }
      sectorAngles.push({
        id: cs.id,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        qaSetIds: cs.qaSetIds,
      });
      currentAngle += angle;
    }
    // Normalize to fill exactly 2π
    if (sectorAngles.length > 0) {
      const total = sectorAngles.reduce((s, sa) => s + (sa.endAngle - sa.startAngle), 0);
      const scale = totalAngle / total;
      let accum = -Math.PI / 2;
      for (const sa of sectorAngles) {
        const size = (sa.endAngle - sa.startAngle) * scale;
        sa.startAngle = accum;
        sa.endAngle = accum + size;
        accum += size;
      }
    }
  }

  const layout: LayoutNode[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();

  // Radii for concentric rings
  const baseRadius = Math.min(width, height) * 0.16;
  const ring1 = baseRadius;
  const ring2 = baseRadius * 1.8;
  const ring3 = baseRadius * 2.5;

  // Place QASet groups within their cluster sectors
  for (const sector of sectorAngles) {
    const setCount = sector.qaSetIds.length;
    if (setCount === 0) continue;

    const sectorMid = (sector.startAngle + sector.endAngle) / 2;
    const sectorSpan = sector.endAngle - sector.startAngle;

    for (let si = 0; si < setCount; si++) {
      const qaSetId = sector.qaSetIds[si];
      const msgs = qaGroups.get(qaSetId) ?? [];

      // Angle within sector
      const angleOffset = setCount === 1
        ? 0
        : ((si / (setCount - 1)) - 0.5) * sectorSpan * 0.7;
      const angle = sectorMid + angleOffset;

      // Ring: hub at ring1, others at ring2/ring3
      const isHub = qaSetId === hubQASetId;
      const ring = isHub ? ring1 : (si < Math.ceil(setCount / 2) ? ring2 : ring3);

      // Base position for this QASet
      const groupX = cx + Math.cos(angle) * ring;
      const groupY = cy + Math.sin(angle) * ring;

      // Place messages as vertical chain
      msgs.forEach((msg, mi) => {
        const cfg = NODE_CONFIG[msg.type] ?? NODE_CONFIG.question;
        const x = clamp(groupX, cfg.w / 2 + 4, width - cfg.w / 2 - 4);
        const y = clamp(groupY + mi * 32 - ((msgs.length - 1) * 16), cfg.h / 2 + 4, height - cfg.h / 2 - 4);
        layout.push({ ...msg, x, y, w: cfg.w, h: cfg.h });
        nodePositions.set(msg.id, { x, y });
      });
    }
  }

  // Place satellite nodes (invest, hunt, opinion, author) near their linked nodes
  let otherIdx = 0;
  for (const n of otherNodes) {
    const cfg = NODE_CONFIG[n.type] ?? NODE_CONFIG.invest;
    const linkedEdge = edges.find((e) => e.source === n.id || e.target === n.id);
    const linkedId = linkedEdge
      ? (linkedEdge.source === n.id ? linkedEdge.target : linkedEdge.source)
      : null;
    const linkedPos = linkedId ? nodePositions.get(linkedId) : null;

    let x: number, y: number;
    if (linkedPos) {
      // Push outward from center
      const dx = linkedPos.x - cx;
      const dy = linkedPos.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pushDist = n.type === "author" ? -40 : 50;
      const ySpread = (otherIdx % 3 - 1) * 18;
      x = linkedPos.x + (dx / dist) * pushDist;
      y = linkedPos.y + (dy / dist) * pushDist + ySpread;
    } else {
      const angle = (otherIdx / Math.max(otherNodes.length, 1)) * Math.PI * 2;
      x = cx + Math.cos(angle) * ring3;
      y = cy + Math.sin(angle) * ring3;
    }

    x = clamp(x, cfg.w / 2 + 4, width - cfg.w / 2 - 4);
    y = clamp(y, cfg.h / 2 + 4, height - cfg.h / 2 - 4);

    layout.push({ ...n, x, y, w: cfg.w, h: cfg.h });
    nodePositions.set(n.id, { x, y });
    otherIdx++;
  }

  // Build cluster halos
  const halos: ClusterHalo[] = [];
  const clusterInfoMap = new Map<string, ClusterInfo>();
  for (const c of clusters) clusterInfoMap.set(c.id, c);

  for (const sector of sectorAngles) {
    if (sector.id === "__all__" || sector.id === "__unclustered__") {
      // Build unclustered halo
      const unclusteredPositions: { x: number; y: number }[] = [];
      for (const qsId of sector.qaSetIds) {
        const msgs = qaGroups.get(qsId) ?? [];
        for (const msg of msgs) {
          const pos = nodePositions.get(msg.id);
          if (pos) unclusteredPositions.push(pos);
        }
      }
      if (unclusteredPositions.length > 0 && sector.id === "__unclustered__") {
        const halo = computeHalo(unclusteredPositions, "__unclustered__", "기타", "#9ca3af");
        halos.push(halo);
      }
      continue;
    }

    const info = clusterInfoMap.get(sector.id);
    if (!info) continue;

    const positions: { x: number; y: number }[] = [];
    for (const qsId of sector.qaSetIds) {
      const msgs = qaGroups.get(qsId) ?? [];
      for (const msg of msgs) {
        const pos = nodePositions.get(msg.id);
        if (pos) positions.push(pos);
      }
    }
    if (positions.length > 0) {
      halos.push(computeHalo(positions, info.id, info.name, info.color));
    }
  }

  return { layout, halos };
}

function computeHalo(
  positions: { x: number; y: number }[],
  id: string, name: string, color: string,
): ClusterHalo {
  const xs = positions.map(p => p.x);
  const ys = positions.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const haloCx = (minX + maxX) / 2;
  const haloCy = (minY + maxY) / 2;
  const haloRx = Math.max((maxX - minX) / 2 + 40, 50);
  const haloRy = Math.max((maxY - minY) / 2 + 30, 40);
  return { id, name, color, cx: haloCx, cy: haloCy, rx: haloRx, ry: haloRy };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// ─── Component ───

export function LiveActivityGraph({ onSelectQASet, onNavigateToMap, onNavigateToCluster }: LiveActivityGraphProps) {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ node: LayoutNode; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const vw = isMobile ? 400 : 800;
  const vh = isMobile ? 300 : 420;

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch("/api/activity-graph", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [], clusters: [] }))
      .then((data) => {
        setRawNodes(data.nodes ?? []);
        setEdges(data.edges ?? []);
        setClusters(data.clusters ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, []);

  const { layoutNodes, halos } = useMemo(() => {
    const result = computeRadialLayout(rawNodes, edges, clusters, vw, vh);
    return { layoutNodes: result.layout, halos: result.halos };
  }, [rawNodes, edges, clusters, vw, vh]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layoutNodes) m.set(n.id, n);
    return m;
  }, [layoutNodes]);

  const handleMouseEnter = useCallback(
    (node: LayoutNode, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

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
        <div className="rounded-xl bg-muted/30 animate-pulse" style={{ height: isMobile ? 200 : 300 }} />
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
            지식 지도에서 탐색 →
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2.5 mb-1.5 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-2.5 rounded-sm border border-blue-400 bg-blue-500/20" /> 질문
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-2.5 rounded-sm border border-green-400 bg-green-500/20" /> 답변
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500/30 border border-amber-400" /> 투자
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-400" /> 반대
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-2.5 rounded-sm border border-purple-400 bg-purple-500/20" /> 의견
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500/30 border border-indigo-400" /> 작성자
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 2" /></svg>
          AI제안
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#94a3b8" strokeWidth="2" /></svg>
          확정
        </span>
        {/* Cluster legend */}
        {clusters.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color, opacity: 0.5 }} />
            {c.name}
          </span>
        ))}
      </div>

      <div className="relative rounded-xl border bg-card/50 overflow-hidden">
        <svg
          viewBox={`0 0 ${vw} ${vh}`}
          className="w-full h-auto"
          style={{ maxHeight: isMobile ? 300 : 420 }}
        >
          {/* ── Cluster Halos ── */}
          {halos.map((halo, i) => (
            <g
              key={`halo-${halo.id}`}
              style={{
                animation: `cluster-halo-appear 0.6s ease-out ${i * 100}ms both`,
                cursor: halo.id !== "__unclustered__" ? "pointer" : "default",
              }}
              onClick={() => {
                if (halo.id !== "__unclustered__" && onNavigateToCluster) {
                  onNavigateToCluster(halo.id);
                }
              }}
            >
              <ellipse
                cx={halo.cx} cy={halo.cy}
                rx={halo.rx} ry={halo.ry}
                fill={halo.color} fillOpacity={0.06}
                stroke={halo.color} strokeWidth={1} strokeOpacity={0.18}
                strokeDasharray={halo.id === "__unclustered__" ? "4 3" : undefined}
              />
              <text
                x={halo.cx} y={halo.cy - halo.ry + 12}
                textAnchor="middle"
                fill={halo.color} fillOpacity={0.6}
                style={{ fontSize: "9px", fontWeight: 600 }}
              >
                {halo.name}
                {halo.id !== "__unclustered__" ? " ↗" : ""}
              </text>
            </g>
          ))}

          {/* ── Edges ── */}
          {edges.map((edge, i) => {
            const src = nodeMap.get(edge.source);
            const tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;

            const es = EDGE_STYLES[edge.type] ?? EDGE_STYLES.qa;
            let color = es.color;
            if (edge.type === "knowledge" && edge.relationType) {
              color = KNOWLEDGE_RELATION_COLORS[edge.relationType] ?? es.color;
            }

            let dash = es.dash;
            let strokeW = es.width;
            if (edge.type === "knowledge") {
              if (edge.isUserConfirmed) {
                dash = undefined;
                strokeW = 2;
              } else if (edge.isAIGenerated) {
                dash = "4 2";
                strokeW = 1;
              }
            }

            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;

            return (
              <g key={`e-${i}`}>
                <line
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={color} strokeWidth={strokeW} strokeOpacity={0.45}
                  strokeDasharray={dash}
                  style={{
                    strokeDashoffset: dash ? 200 : 0,
                    animation: dash
                      ? `live-graph-edge-draw 0.6s ease-out ${i * 30 + layoutNodes.length * 50}ms forwards`
                      : undefined,
                  }}
                />
                {/* Edge label */}
                {edge.label && (edge.type === "knowledge" || edge.type === "followup" || edge.type === "opinion") && (
                  <g>
                    <rect
                      x={midX - 20} y={midY - 6}
                      width={40} height={12} rx={3}
                      fill="var(--background, white)" fillOpacity={0.9}
                      stroke={color} strokeWidth={0.5} strokeOpacity={0.4}
                    />
                    <text
                      x={midX} y={midY + 2.5}
                      textAnchor="middle" dominantBaseline="central"
                      fill={color} style={{ fontSize: "7px", fontWeight: 500 }}
                    >
                      {truncate(edge.label, 5)}
                      {edge.type === "knowledge" && edge.isAIGenerated && !edge.isUserConfirmed && " ?"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Nodes ── */}
          {layoutNodes.map((node, i) => {
            const cfg = NODE_CONFIG[node.type] ?? NODE_CONFIG.question;

            return (
              <g
                key={node.id}
                style={{
                  opacity: 0,
                  transformOrigin: `${node.x}px ${node.y}px`,
                  animation: `live-graph-enter 0.5s ease-out ${i * 50}ms forwards`,
                  cursor: "pointer",
                }}
                onClick={() => onSelectQASet(node.qaSetId)}
                onMouseEnter={(e) => handleMouseEnter(node, e)}
                onMouseLeave={handleMouseLeave}
              >
                {/* ── Rect nodes: question, answer, opinion ── */}
                {cfg.shape === "rect" && (
                  <>
                    <rect
                      x={node.x - node.w / 2}
                      y={node.y - node.h / 2}
                      width={node.w}
                      height={node.h}
                      rx={4}
                      fill={cfg.fill}
                      fillOpacity={0.12}
                      stroke={cfg.stroke}
                      strokeWidth={1.2}
                      strokeOpacity={0.5}
                    />
                    {/* Type badge */}
                    <rect
                      x={node.x - node.w / 2 + 2}
                      y={node.y - node.h / 2 + 2}
                      width={node.type === "opinion" ? 14 : 10}
                      height={node.h - 4}
                      rx={2}
                      fill={cfg.fill}
                      fillOpacity={0.3}
                    />
                    <text
                      x={node.x - node.w / 2 + (node.type === "opinion" ? 9 : 7)}
                      y={node.y + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={cfg.stroke}
                      style={{ fontSize: "8px", fontWeight: 700 }}
                    >
                      {node.type === "question" ? "Q" : node.type === "answer" ? "A" : "✍"}
                    </text>
                    {/* Content text */}
                    <text
                      x={node.x - node.w / 2 + (node.type === "opinion" ? 18 : 14)}
                      y={node.y + 1}
                      dominantBaseline="central"
                      className="fill-foreground"
                      style={{ fontSize: "8px" }}
                    >
                      {truncate(node.label, isMobile ? 12 : 18)}
                    </text>
                  </>
                )}

                {/* ── Circle nodes: invest, hunt, author ── */}
                {cfg.shape === "circle" && (
                  <>
                    <circle
                      cx={node.x} cy={node.y}
                      r={node.w / 2}
                      fill={cfg.fill}
                      fillOpacity={0.2}
                      stroke={cfg.stroke}
                      strokeWidth={1.2}
                      strokeOpacity={0.6}
                    />
                    <text
                      x={node.x} y={node.y + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-foreground"
                      style={{ fontSize: node.type === "author" ? "7px" : "6px", fontWeight: 600 }}
                    >
                      {node.type === "author"
                        ? truncate(node.label, 3)
                        : node.amount
                          ? `${node.amount}`
                          : node.type === "invest" ? "💰" : "📉"
                      }
                    </text>
                    {/* Label below circle (desktop) */}
                    {!isMobile && (
                      <text
                        x={node.x} y={node.y + node.w / 2 + 8}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        style={{ fontSize: "6px" }}
                      >
                        {node.type === "author"
                          ? node.label
                          : node.type === "invest" ? `${node.amount}P`
                          : node.type === "hunt" ? `${node.amount}P` : ""
                        }
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Tooltip ── */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none bg-popover text-popover-foreground border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[240px]"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 250),
              top: Math.max(tooltip.y - 70, 4),
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                tooltip.node.type === "question" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" :
                tooltip.node.type === "answer" ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" :
                tooltip.node.type === "invest" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" :
                tooltip.node.type === "hunt" ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" :
                tooltip.node.type === "author" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" :
                "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
              }`}>
                {{ question: "질문", answer: "답변", invest: "투자", hunt: "반대투자", opinion: "의견", author: "작성자" }[tooltip.node.type]}
              </span>
              {tooltip.node.sublabel && (
                <span className="text-muted-foreground">{tooltip.node.sublabel}</span>
              )}
            </div>
            <div className="text-sm leading-snug">{tooltip.node.label}</div>
            {tooltip.node.clusterName && (
              <div className="mt-1 text-[10px] text-muted-foreground">주제: {tooltip.node.clusterName}</div>
            )}
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
