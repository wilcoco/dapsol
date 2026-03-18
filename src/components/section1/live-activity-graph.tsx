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
  investorId?: string;
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
  /** When set, only show nodes belonging to these QASet IDs */
  filterQASetIds?: string[];
}

// ─── Node dimensions ───

const NODE_CONFIG: Record<string, {
  fill: string; stroke: string;
  shape: "rect" | "circle";
  w: number; h: number;
}> = {
  question: { fill: "#3b82f6", stroke: "#2563eb", shape: "rect", w: 140, h: 26 },
  answer:   { fill: "#22c55e", stroke: "#16a34a", shape: "rect", w: 140, h: 26 },
  invest:   { fill: "#f59e0b", stroke: "#d97706", shape: "circle", w: 26, h: 26 },
  hunt:     { fill: "#ef4444", stroke: "#dc2626", shape: "circle", w: 26, h: 26 },
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

// ─── Edge boundary intersection ───
// Returns the point on the node boundary closest to the target point

function getEdgeEndpoint(
  node: LayoutNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cfg = NODE_CONFIG[node.type] ?? NODE_CONFIG.question;
  const dx = targetX - node.x;
  const dy = targetY - node.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { x: node.x, y: node.y };

  if (cfg.shape === "circle") {
    const r = node.w / 2 + 1; // +1 for stroke clearance
    return {
      x: node.x + (dx / dist) * r,
      y: node.y + (dy / dist) * r,
    };
  }

  // Rect: find intersection with rectangle boundary
  const hw = node.w / 2 + 1;
  const hh = node.h / 2 + 1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Determine which edge of the rect the line exits through
  let t: number;
  if (absDx * hh > absDy * hw) {
    // Exits through left or right edge
    t = hw / absDx;
  } else {
    // Exits through top or bottom edge
    t = hh / absDy;
  }

  return {
    x: node.x + dx * t,
    y: node.y + dy * t,
  };
}

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
  const clusterIdMap = new Map<string, string>();
  for (const n of nodes) {
    if (n.clusterId && !clusterIdMap.has(n.qaSetId)) {
      clusterIdMap.set(n.qaSetId, n.clusterId);
    }
  }

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

  // Find hub
  let hubQASetId = "";
  let maxMsgs = 0;
  for (const [qsId, msgs] of qaGroups) {
    if (msgs.length > maxMsgs) {
      maxMsgs = msgs.length;
      hubQASetId = qsId;
    }
  }

  // Assign angular sectors
  const MIN_ANGLE = (40 * Math.PI) / 180;
  const allClusterIds = [...clusterGroups.keys()];
  if (unclusteredSets.length > 0) allClusterIds.push("__unclustered__");

  const sectorAngles: { id: string; startAngle: number; endAngle: number; qaSetIds: string[] }[] = [];
  if (allClusterIds.length === 0) {
    sectorAngles.push({ id: "__all__", startAngle: 0, endAngle: Math.PI * 2, qaSetIds: [...qaGroups.keys()] });
  } else {
    const clusterSizes: { id: string; count: number; qaSetIds: string[] }[] = [];
    for (const cid of allClusterIds) {
      const qaSetIds = cid === "__unclustered__" ? unclusteredSets : (clusterGroups.get(cid) ?? []);
      clusterSizes.push({ id: cid, count: qaSetIds.length, qaSetIds });
    }
    const totalAngle = Math.PI * 2;
    const totalCount = clusterSizes.reduce((s, c) => s + c.count, 0);
    let currentAngle = -Math.PI / 2;
    for (const cs of clusterSizes) {
      const proportion = cs.count / Math.max(totalCount, 1);
      const angle = Math.max(MIN_ANGLE, proportion * totalAngle);
      sectorAngles.push({
        id: cs.id,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        qaSetIds: cs.qaSetIds,
      });
      currentAngle += angle;
    }
    // Normalize
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

  const layout: LayoutNode[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();

  const baseRadius = Math.min(width, height) * 0.16;
  const ring1 = baseRadius;
  const ring2 = baseRadius * 1.8;
  const ring3 = baseRadius * 2.5;

  for (const sector of sectorAngles) {
    const setCount = sector.qaSetIds.length;
    if (setCount === 0) continue;

    const sectorMid = (sector.startAngle + sector.endAngle) / 2;
    const sectorSpan = sector.endAngle - sector.startAngle;

    for (let si = 0; si < setCount; si++) {
      const qaSetId = sector.qaSetIds[si];
      const msgs = qaGroups.get(qaSetId) ?? [];

      const angleOffset = setCount === 1
        ? 0
        : ((si / (setCount - 1)) - 0.5) * sectorSpan * 0.7;
      const angle = sectorMid + angleOffset;

      const isHub = qaSetId === hubQASetId;
      const ring = isHub ? ring1 : (si < Math.ceil(setCount / 2) ? ring2 : ring3);

      const groupX = cx + Math.cos(angle) * ring;
      const groupY = cy + Math.sin(angle) * ring;

      msgs.forEach((msg, mi) => {
        const cfg = NODE_CONFIG[msg.type] ?? NODE_CONFIG.question;
        const x = clamp(groupX, cfg.w / 2 + 4, width - cfg.w / 2 - 4);
        const y = clamp(groupY + mi * 32 - ((msgs.length - 1) * 16), cfg.h / 2 + 4, height - cfg.h / 2 - 4);
        layout.push({ ...msg, x, y, w: cfg.w, h: cfg.h });
        nodePositions.set(msg.id, { x, y });
      });
    }
  }

  // Satellite nodes
  // First pass: place authors
  let otherIdx = 0;
  const deferredNodes: GraphNode[] = [];
  for (const n of otherNodes) {
    if (n.type === "author") {
      const cfg = NODE_CONFIG.author;
      const linkedEdge = edges.find((e) => e.source === n.id || e.target === n.id);
      const linkedId = linkedEdge
        ? (linkedEdge.source === n.id ? linkedEdge.target : linkedEdge.source)
        : null;
      const linkedPos = linkedId ? nodePositions.get(linkedId) : null;

      let x: number, y: number;
      if (linkedPos) {
        const dx = linkedPos.x - cx;
        const dy = linkedPos.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        x = linkedPos.x - (dx / dist) * 40;
        y = linkedPos.y - (dy / dist) * 40;
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
    } else {
      deferredNodes.push(n);
    }
  }

  // Second pass: place invest/hunt/opinion nodes between their linked nodes
  for (const n of deferredNodes) {
    const cfg = NODE_CONFIG[n.type] ?? NODE_CONFIG.invest;

    let x: number, y: number;

    if ((n.type === "invest" || n.type === "hunt") && n.investorId) {
      // Position between investor (author) and target answer
      const investorPos = nodePositions.get(`author-${n.investorId}`);
      // Find the target answer this invest links to
      const targetEdge = edges.find((e) => e.source === n.id && e.type !== "invest" && e.type !== "hunt")
        ?? edges.find((e) => e.source === n.id);
      const targetPos = targetEdge ? nodePositions.get(targetEdge.target) : null;

      if (investorPos && targetPos) {
        // Place at midpoint between investor and answer
        x = (investorPos.x + targetPos.x) / 2 + (otherIdx % 3 - 1) * 12;
        y = (investorPos.y + targetPos.y) / 2 + (otherIdx % 3 - 1) * 10;
      } else if (investorPos) {
        const dx = investorPos.x - cx;
        const dy = investorPos.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        x = investorPos.x + (dx / dist) * 40;
        y = investorPos.y + (dy / dist) * 40;
      } else {
        // Fallback: near any linked node
        const linkedEdge = edges.find((e) => e.source === n.id || e.target === n.id);
        const linkedId = linkedEdge ? (linkedEdge.source === n.id ? linkedEdge.target : linkedEdge.source) : null;
        const linkedPos = linkedId ? nodePositions.get(linkedId) : null;
        if (linkedPos) {
          x = linkedPos.x + 50;
          y = linkedPos.y + (otherIdx % 3 - 1) * 18;
        } else {
          x = cx + (otherIdx - deferredNodes.length / 2) * 30;
          y = height - 30;
        }
      }
    } else {
      // Opinion and other nodes: near linked node
      const linkedEdge = edges.find((e) => e.source === n.id || e.target === n.id);
      const linkedId = linkedEdge
        ? (linkedEdge.source === n.id ? linkedEdge.target : linkedEdge.source)
        : null;
      const linkedPos = linkedId ? nodePositions.get(linkedId) : null;
      if (linkedPos) {
        const dx = linkedPos.x - cx;
        const dy = linkedPos.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        x = linkedPos.x + (dx / dist) * 50;
        y = linkedPos.y + (dy / dist) * 50 + (otherIdx % 3 - 1) * 18;
      } else {
        const angle = (otherIdx / Math.max(deferredNodes.length, 1)) * Math.PI * 2;
        x = cx + Math.cos(angle) * ring3;
        y = cy + Math.sin(angle) * ring3;
      }
    }

    x = clamp(x, cfg.w / 2 + 4, width - cfg.w / 2 - 4);
    y = clamp(y, cfg.h / 2 + 4, height - cfg.h / 2 - 4);
    layout.push({ ...n, x, y, w: cfg.w, h: cfg.h });
    nodePositions.set(n.id, { x, y });
    otherIdx++;
  }

  // ─── Collision resolution (iterative repulsion) ───
  const PAD = 14; // minimum gap between nodes (increased from 6)
  const ITERATIONS = 30;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let anyMoved = false;
    for (let a = 0; a < layout.length; a++) {
      for (let b = a + 1; b < layout.length; b++) {
        const na = layout[a];
        const nb = layout[b];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;

        // Required separation (half-widths + half-heights + pad)
        const overlapX = (na.w + nb.w) / 2 + PAD - Math.abs(dx);
        const overlapY = (na.h + nb.h) / 2 + PAD - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis with less overlap
          anyMoved = true;
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 0.5;
            const signX = dx >= 0 ? 1 : -1;
            na.x -= signX * push;
            nb.x += signX * push;
          } else {
            const push = overlapY / 2 + 0.5;
            const signY = dy >= 0 ? 1 : -1;
            na.y -= signY * push;
            nb.y += signY * push;
          }

          // Clamp back into viewport
          na.x = clamp(na.x, na.w / 2 + 2, width - na.w / 2 - 2);
          na.y = clamp(na.y, na.h / 2 + 2, height - na.h / 2 - 2);
          nb.x = clamp(nb.x, nb.w / 2 + 2, width - nb.w / 2 - 2);
          nb.y = clamp(nb.y, nb.h / 2 + 2, height - nb.h / 2 - 2);
        }
      }
    }
    if (!anyMoved) break;
  }

  // Update nodePositions after collision resolution
  for (const n of layout) {
    nodePositions.set(n.id, { x: n.x, y: n.y });
  }

  // Build cluster halos
  const halos: ClusterHalo[] = [];
  const clusterInfoMap = new Map<string, ClusterInfo>();
  for (const c of clusters) clusterInfoMap.set(c.id, c);

  for (const sector of sectorAngles) {
    if (sector.id === "__all__" || sector.id === "__unclustered__") {
      const positions: { x: number; y: number }[] = [];
      for (const qsId of sector.qaSetIds) {
        for (const msg of (qaGroups.get(qsId) ?? [])) {
          const pos = nodePositions.get(msg.id);
          if (pos) positions.push(pos);
        }
      }
      if (positions.length > 0 && sector.id === "__unclustered__") {
        halos.push(computeHalo(positions, "__unclustered__", "기타", "#9ca3af"));
      }
      continue;
    }

    const info = clusterInfoMap.get(sector.id);
    if (!info) continue;

    const positions: { x: number; y: number }[] = [];
    for (const qsId of sector.qaSetIds) {
      for (const msg of (qaGroups.get(qsId) ?? [])) {
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
  return {
    id, name, color,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: Math.max((maxX - minX) / 2 + 40, 50),
    ry: Math.max((maxY - minY) / 2 + 30, 40),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// ─── BFS animation order ───
// Returns: nodeOrder map (nodeId → sequence), edgeOrder map (edgeIndex → sequence)
// Alternates: node appears → its edges appear → connected nodes appear → ...

function computeBfsOrder(
  nodes: LayoutNode[],
  edges: GraphEdge[],
): { nodeOrder: Map<string, number>; edgeOrder: Map<number, number> } {
  const nodeOrder = new Map<string, number>();
  const edgeOrder = new Map<number, number>();

  if (nodes.length === 0) return { nodeOrder, edgeOrder };

  // Build adjacency: nodeId → [{neighborId, edgeIndex}]
  const adj = new Map<string, { neighborId: string; edgeIdx: number }[]>();
  for (const n of nodes) adj.set(n.id, []);
  edges.forEach((e, i) => {
    adj.get(e.source)?.push({ neighborId: e.target, edgeIdx: i });
    adj.get(e.target)?.push({ neighborId: e.source, edgeIdx: i });
  });

  // Start from first question node (first in the data = most recent)
  const startNode = nodes.find((n) => n.type === "question") ?? nodes[0];
  let seq = 0;

  const queue: string[] = [startNode.id];
  nodeOrder.set(startNode.id, seq++);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) ?? [];
    for (const { neighborId, edgeIdx } of neighbors) {
      if (!edgeOrder.has(edgeIdx)) {
        edgeOrder.set(edgeIdx, seq++);
      }
      if (!nodeOrder.has(neighborId)) {
        nodeOrder.set(neighborId, seq++);
        queue.push(neighborId);
      }
    }
  }

  // Handle any disconnected nodes
  for (const n of nodes) {
    if (!nodeOrder.has(n.id)) {
      nodeOrder.set(n.id, seq++);
    }
  }

  return { nodeOrder, edgeOrder };
}

const BFS_STEP_MS = 120; // ms between each BFS step

// ─── Component ───

export function LiveActivityGraph({ onSelectQASet, onNavigateToMap, onNavigateToCluster, filterQASetIds }: LiveActivityGraphProps) {
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ node: LayoutNode; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Drag state
  const [dragOffsets, setDragOffsets] = useState<Map<string, { dx: number; dy: number }>>(new Map());
  const dragRef = useRef<{
    nodeId: string;
    startSvgX: number;
    startSvgY: number;
    origDx: number;
    origDy: number;
    moved: boolean;
  } | null>(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const vw = isMobile ? 440 : 900;
  const vh = isMobile ? 340 : 500;

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

  // Filter nodes/edges when filterQASetIds is provided
  const { filteredNodes, filteredEdges, filteredClusters } = useMemo(() => {
    if (!filterQASetIds || filterQASetIds.length === 0) {
      return { filteredNodes: rawNodes, filteredEdges: edges, filteredClusters: clusters };
    }
    const idSet = new Set(filterQASetIds);
    const fn = rawNodes.filter((n) => idSet.has(n.qaSetId));
    const nodeIdSet = new Set(fn.map((n) => n.id));
    const fe = edges.filter((e) => nodeIdSet.has(e.source) || nodeIdSet.has(e.target));
    const fc = clusters.filter((c) => c.nodeIds.some((nid) => nodeIdSet.has(nid)));
    return { filteredNodes: fn, filteredEdges: fe, filteredClusters: fc };
  }, [rawNodes, edges, clusters, filterQASetIds]);

  const { baseLayoutNodes, halos } = useMemo(() => {
    const result = computeRadialLayout(filteredNodes, filteredEdges, filteredClusters, vw, vh);
    return { baseLayoutNodes: result.layout, halos: result.halos };
  }, [filteredNodes, filteredEdges, filteredClusters, vw, vh]);

  // Apply drag offsets to get final positions
  const layoutNodes = useMemo(() => {
    if (dragOffsets.size === 0) return baseLayoutNodes;
    return baseLayoutNodes.map((n) => {
      const off = dragOffsets.get(n.id);
      if (!off) return n;
      return { ...n, x: n.x + off.dx, y: n.y + off.dy };
    });
  }, [baseLayoutNodes, dragOffsets]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layoutNodes) m.set(n.id, n);
    return m;
  }, [layoutNodes]);

  // BFS animation order
  const { nodeOrder, edgeOrder } = useMemo(
    () => computeBfsOrder(layoutNodes, edges),
    [layoutNodes, edges]
  );

  // ─── SVG coordinate helper ───
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // ─── Drag handlers ───
  const handlePointerDown = useCallback((nodeId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const svgPt = clientToSvg(e.clientX, e.clientY);
    const existing = dragOffsets.get(nodeId);
    dragRef.current = {
      nodeId,
      startSvgX: svgPt.x,
      startSvgY: svgPt.y,
      origDx: existing?.dx ?? 0,
      origDy: existing?.dy ?? 0,
      moved: false,
    };
    setTooltip(null);
  }, [clientToSvg, dragOffsets]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svgPt = clientToSvg(e.clientX, e.clientY);
    const dx = svgPt.x - drag.startSvgX;
    const dy = svgPt.y - drag.startSvgY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true;
    }
    if (drag.moved) {
      setDragOffsets((prev) => {
        const next = new Map(prev);
        next.set(drag.nodeId, { dx: drag.origDx + dx, dy: drag.origDy + dy });
        return next;
      });
    }
  }, [clientToSvg]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    // If didn't move, treat as click
    if (!drag.moved) {
      const node = nodeMap.get(drag.nodeId);
      if (node) onSelectQASet(node.qaSetId);
    }
  }, [nodeMap, onSelectQASet]);

  const handleMouseEnter = useCallback(
    (node: LayoutNode, e: React.MouseEvent) => {
      if (dragRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    []
  );
  const handleMouseLeave = useCallback(() => {
    if (!dragRef.current) setTooltip(null);
  }, []);

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
        {clusters.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color, opacity: 0.5 }} />
            {c.name}
          </span>
        ))}
      </div>

      <div className="relative rounded-xl border bg-card/50 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vw} ${vh}`}
          className="w-full h-auto"
          style={{ maxHeight: isMobile ? 340 : 500, touchAction: "none" }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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

          {/* ── Edges (with boundary intersection) ── */}
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

            // Compute edge endpoints at node boundaries
            const p1 = getEdgeEndpoint(src, tgt.x, tgt.y);
            const p2 = getEdgeEndpoint(tgt, src.x, src.y);

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            const eSeq = edgeOrder.get(i) ?? i;
            const eDelay = eSeq * BFS_STEP_MS;

            return (
              <g key={`e-${i}`} style={{ opacity: 0, animation: `live-graph-enter 0.4s ease-out ${eDelay}ms forwards` }}>
                <line
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={color} strokeWidth={strokeW} strokeOpacity={0.45}
                  strokeDasharray={dash}
                  style={{
                    strokeDashoffset: dash ? 200 : 0,
                    animation: dash
                      ? `live-graph-edge-draw 0.6s ease-out ${eDelay}ms forwards`
                      : undefined,
                  }}
                />
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

          {/* ── Nodes (draggable) ── */}
          {layoutNodes.map((node, i) => {
            const cfg = NODE_CONFIG[node.type] ?? NODE_CONFIG.question;
            const nSeq = nodeOrder.get(node.id) ?? i;
            const nDelay = nSeq * BFS_STEP_MS;

            // Importance-based pop scale: bigger pop for higher investment/amount
            const importance = node.amount
              ? Math.min(node.amount / 100, 2) // invest nodes: amount-based
              : (node.type === "question" || node.type === "answer") ? 0.5 : 0.2;
            const popScale = 1.1 + importance * 0.3; // range: 1.1 ~ 1.7
            const breatheScale = 1 + importance * 0.02; // range: 1.0 ~ 1.04
            const breatheDur = 3 + Math.random() * 2; // 3~5s, desynchronized

            return (
              <g
                key={node.id}
                style={{
                  opacity: 0,
                  transformOrigin: `${node.x}px ${node.y}px`,
                  ["--pop-scale" as string]: popScale,
                  ["--breathe-scale" as string]: breatheScale,
                  animation: `live-graph-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${nDelay}ms forwards, live-graph-breathe-node ${breatheDur}s ease-in-out ${nDelay + 600}ms infinite`,
                  cursor: dragRef.current?.nodeId === node.id ? "grabbing" : "grab",
                }}
                onPointerDown={(e) => handlePointerDown(node.id, e)}
                onMouseEnter={(e) => handleMouseEnter(node, e)}
                onMouseLeave={handleMouseLeave}
              >
                {/* ── Rect nodes ── */}
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

                {/* ── Circle nodes ── */}
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
                      style={{
                        fontSize: node.type === "author" ? "7px" : "8px",
                        fontWeight: 700,
                      }}
                    >
                      {node.type === "author"
                        ? truncate(node.label, 3)
                        : node.amount
                          ? `${node.amount}P`
                          : node.type === "invest" ? "💰" : "📉"
                      }
                    </text>
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
            <div className="mt-1 text-[10px] text-muted-foreground">드래그하여 이동 · 클릭하여 열기</div>
          </div>
        )}
      </div>
    </div>
  );
}
