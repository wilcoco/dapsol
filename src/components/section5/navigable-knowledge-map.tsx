"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

type ZoomLevel = "cluster" | "qaset";
type Direction = "center" | "right" | "up" | "down" | "left";

// ── Cluster-level (zoom out) ──

interface ClusterGap {
  id: string;
  description: string;
  gapType: string;
  severity: string;
  isResolved: boolean;
}

interface ClusterContributor {
  userId: string;
  name: string;
  topicAuthority: number;
  questionsAsked: number;
  insightsContributed: number;
}

interface ClusterNode {
  id: string;
  label: string;
  labelEn: string | null;
  description: string | null;
  qaCount: number;
  gapCount: number;
  gaps: ClusterGap[];
  contributors: ClusterContributor[];
  direction: string; // "center" | "up" | "down" | "left" | "right"
  x: number;
  y: number;
}

interface ClusterDirectionInfo {
  count: number;
  label: string;
}

interface ClusterResponse {
  focal: {
    id: string;
    name: string;
    nameEn: string | null;
    description: string | null;
    qaCount: number;
    gapCount: number;
  } | null;
  nodes: ClusterNode[];
  edges: ClusterEdge[];
  directions: {
    up: ClusterDirectionInfo;
    down: ClusterDirectionInfo;
    left: ClusterDirectionInfo;
    right: ClusterDirectionInfo;
  };
}

interface ClusterEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  color: string;
  weight: number;
}

// ── QASet-level (zoom in) ──

interface ExploreNode {
  id: string;
  type: "qaset" | "user";
  direction: Direction;
  data: {
    id?: string;
    title?: string | null;
    summary?: string | null;
    name?: string | null;
    creator?: { id: string; name: string | null };
    totalInvested?: number;
    investorCount?: number;
    negativeInvested?: number;
    tags?: string[];
    authorityScore?: number;
    hubScore?: number;
  };
}

interface ExploreEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

interface DirectionInfo {
  hasMore: boolean;
  count: number;
  label: string;
}

interface ExploreResponse {
  focal: {
    id: string;
    title: string | null;
    creator: { id: string; name: string | null };
    totalInvested: number;
    tags: string[];
    topicCluster: { id: string; name: string; nameEn: string | null } | null;
  } | null;
  nodes: ExploreNode[];
  edges: ExploreEdge[];
  directions: {
    right: DirectionInfo;
    up: DirectionInfo;
    down: DirectionInfo;
    left: DirectionInfo;
  };
}

interface PositionedExploreNode extends ExploreNode {
  x: number;
  y: number;
}

// ══════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════

const DIRECTION_COLORS: Record<Direction, string> = {
  center: "#6366f1",
  right: "#3b82f6",
  up: "#22c55e",
  down: "#f97316",
  left: "#ef4444",
};

const DIRECTION_BG: Record<Direction, string> = {
  center: "bg-indigo-50 dark:bg-indigo-950 border-indigo-400",
  right: "bg-blue-50 dark:bg-blue-950 border-blue-400",
  up: "bg-green-50 dark:bg-green-950 border-green-400",
  down: "bg-orange-50 dark:bg-orange-950 border-orange-400",
  left: "bg-red-50 dark:bg-red-950 border-red-400",
};

const USER_COLOR = "#8b5cf6";
const MIN_NODE_W = 140;
const MAX_NODE_W = 220;
const NODE_H = 80;
const CLUSTER_NODE_W = 200;
const CLUSTER_NODE_H = 100;

function getNodeWidth(totalInvested: number): number {
  const t = Math.min(1, totalInvested / 500);
  return MIN_NODE_W + (MAX_NODE_W - MIN_NODE_W) * t;
}

// ══════════════════════════════════════════════
// QASet-level layout
// ══════════════════════════════════════════════

function layoutExploreNodes(nodes: ExploreNode[], viewW: number, viewH: number): PositionedExploreNode[] {
  const cx = viewW / 2;
  const cy = viewH / 2;
  const byDir: Record<Direction, ExploreNode[]> = { center: [], right: [], up: [], down: [], left: [] };
  for (const n of nodes) byDir[n.direction]?.push(n);

  const positioned: PositionedExploreNode[] = [];

  for (const n of byDir.center) {
    positioned.push({ ...n, x: cx + (n.type === "user" ? -120 : 0), y: cy + (n.type === "user" ? 50 : 0) });
  }

  const place = (list: ExploreNode[], baseX: number, baseY: number, spreadAxis: "x" | "y", spacing: number, stagger: number) => {
    const qa = list.filter((n) => n.type === "qaset");
    qa.forEach((n, i) => {
      const spread = qa.length > 1 ? (i - (qa.length - 1) / 2) * spacing : 0;
      const x = spreadAxis === "y" ? baseX + (i % 2) * stagger : baseX + spread;
      const y = spreadAxis === "y" ? baseY + spread : baseY + (i % 2) * stagger;
      positioned.push({ ...n, x, y });
    });
  };

  place(byDir.right, cx + 300, cy, "y", 120, 120);
  place(byDir.up, cx, cy - 260, "x", 150, -100);
  place(byDir.down, cx, cy + 260, "x", 150, 100);
  place(byDir.left, cx - 300, cy, "y", 120, -120);

  // User nodes
  const placeUsers = (list: ExploreNode[], baseX: number, baseY: number) => {
    list.filter((n) => n.type === "user").forEach((n, i) => {
      positioned.push({ ...n, x: baseX + i * 60, y: baseY });
    });
  };
  placeUsers(byDir.right, cx + 420, cy - 80);
  placeUsers(byDir.up, cx + 120, cy - 360);
  placeUsers(byDir.down, cx + 120, cy + 400);
  placeUsers(byDir.left, cx - 420, cy - 80);

  return positioned;
}

// ══════════════════════════════════════════════
// Props
// ══════════════════════════════════════════════

interface NavigableKnowledgeMapProps {
  initialFocusId?: string | null;
  onSelectQASet: (qaSetId: string) => void;
  isActive: boolean;
}

// ══════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════

export function NavigableKnowledgeMap({
  initialFocusId,
  onSelectQASet,
  isActive,
}: NavigableKnowledgeMapProps) {
  // ── Zoom level ──
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("cluster");

  // ── Cluster-level state ──
  const [clusterData, setClusterData] = useState<ClusterResponse | null>(null);
  const [clusterNodes, setClusterNodes] = useState<ClusterNode[]>([]);
  const [clusterEdges, setClusterEdges] = useState<ClusterEdge[]>([]);
  const [clusterLoaded, setClusterLoaded] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [focalClusterId, setFocalClusterId] = useState<string | null>(null);
  const clusterLoadedRef = useRef<string | null>(null);

  // ── QASet-level state ──
  const [exploreData, setExploreData] = useState<ExploreResponse | null>(null);
  const [qaNodes, setQaNodes] = useState<PositionedExploreNode[]>([]);
  const [qaEdges, setQaEdges] = useState<ExploreEdge[]>([]);
  const [focalId, setFocalId] = useState<string | null>(initialFocusId ?? null);

  // ── Shared state ──
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fadeState, setFadeState] = useState<"visible" | "fading-out" | "fading-in">("visible");
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 });
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Interaction state ──
  const clusterNodesRef = useRef(clusterNodes);
  clusterNodesRef.current = clusterNodes;
  const qaNodesRef = useRef(qaNodes);
  qaNodesRef.current = qaNodes;
  const interactionRef = useRef<
    | { type: "drag"; nodeId: string; offsetX: number; offsetY: number; moved: boolean }
    | { type: "pan"; startX: number; startY: number; vbX: number; vbY: number }
    | null
  >(null);
  const [cursorStyle, setCursorStyle] = useState<"grab" | "grabbing">("grab");
  const [userTooltip, setUserTooltip] = useState<{ nodeId: string } | null>(null);
  const qaLoadedRef = useRef<string | null>(null);

  // ── Sync external focus ──
  useEffect(() => {
    if (initialFocusId && initialFocusId !== focalId) {
      qaLoadedRef.current = null;
      setExploreData(null);
      setFocalId(initialFocusId);
      // Auto switch to QASet view when an external focus is set
      setZoomLevel("qaset");
    }
  }, [initialFocusId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════
  // Fetch: Cluster level (focal + neighbors)
  // ══════════════════════════════════════════════

  useEffect(() => {
    if (!isActive || zoomLevel !== "cluster") return;
    const cacheKey = focalClusterId ?? "__default__";
    if (clusterLoadedRef.current === cacheKey && clusterData) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = focalClusterId
      ? `/api/graph/clusters?focusId=${focalClusterId}`
      : `/api/graph/clusters`;

    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setError(err?.error ?? `HTTP ${res.status}`);
          return;
        }
        const json: ClusterResponse = await res.json();
        setClusterData(json);
        setClusterNodes(json.nodes ?? []);
        setClusterEdges(json.edges ?? []);
        setClusterLoaded(true);
        clusterLoadedRef.current = cacheKey;

        if (json.focal?.id) {
          setSelectedClusterId(json.focal.id);
        }

        // Set viewbox to fit
        const w = containerRef.current?.clientWidth ?? 1200;
        const h = containerRef.current?.clientHeight ?? 800;
        setViewBox({ x: 0, y: 0, width: w, height: h });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setFadeState("fading-in");
          setTimeout(() => setFadeState("visible"), 300);
        }
      });

    return () => { cancelled = true; };
  }, [isActive, zoomLevel, focalClusterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════
  // Fetch: QASet level
  // ══════════════════════════════════════════════

  useEffect(() => {
    if (!isActive || zoomLevel !== "qaset") return;
    const queryId = focalId;
    const cacheKey = queryId ?? "__default__";
    if (qaLoadedRef.current === cacheKey && exploreData) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const url = queryId
      ? `/api/graph/explore?focusId=${queryId}`
      : `/api/graph/explore`;

    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setError(err?.error ?? `HTTP ${res.status}`);
          return;
        }
        const json: ExploreResponse = await res.json();
        setExploreData(json);
        setQaEdges(json.edges);
        const w = containerRef.current?.clientWidth ?? 1200;
        const h = containerRef.current?.clientHeight ?? 800;
        setQaNodes(layoutExploreNodes(json.nodes, w, h));
        setViewBox({ x: 0, y: 0, width: w, height: h });
        qaLoadedRef.current = cacheKey;

        // Track which cluster we're in (for zoom-out navigation)
        if (json.focal?.topicCluster?.id) {
          setSelectedClusterId(json.focal.topicCluster.id);
          setFocalClusterId(json.focal.topicCluster.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          setFadeState("fading-in");
          setTimeout(() => setFadeState("visible"), 300);
        }
      });

    return () => { cancelled = true; };
  }, [isActive, zoomLevel, focalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════
  // Navigation actions
  // ══════════════════════════════════════════════

  /** Navigate to a different focal cluster */
  const navigateToCluster = useCallback((clusterId: string) => {
    if (clusterId === focalClusterId) return;
    setFadeState("fading-out");
    setIsLoading(true);
    setTimeout(() => {
      clusterLoadedRef.current = null;
      setClusterData(null);
      setFocalClusterId(clusterId);
      setSelectedClusterId(clusterId);
      const w = containerRef.current?.clientWidth ?? 1200;
      const h = containerRef.current?.clientHeight ?? 800;
      setViewBox({ x: 0, y: 0, width: w, height: h });
    }, 200);
  }, [focalClusterId]);

  /** Navigate cluster by direction */
  const panClusterDirection = useCallback((dir: "up" | "down" | "left" | "right") => {
    const dirNodes = clusterNodes.filter(n => n.direction === dir);
    if (dirNodes.length === 0) return;
    navigateToCluster(dirNodes[0].id);
  }, [clusterNodes, navigateToCluster]);

  /** Zoom in: cluster → QASet view */
  const zoomIntoCluster = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId);
    setFocalClusterId(clusterId);
    setFadeState("fading-out");
    setIsLoading(true);
    setTimeout(() => {
      qaLoadedRef.current = null;
      setExploreData(null);
      setFocalId(null);
      setZoomLevel("qaset");

      // Fetch cluster's top QASet to use as focal
      fetch(`/api/clusters/${clusterId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.qaSets?.length > 0) {
            const topQA = data.qaSets[0];
            qaLoadedRef.current = null;
            setFocalId(topQA.id);
          }
        })
        .catch(() => {});
    }, 200);
  }, []);

  /** Zoom out: QASet → cluster view */
  const zoomOutToCluster = useCallback(() => {
    setFadeState("fading-out");
    setTimeout(() => {
      clusterLoadedRef.current = null;
      setClusterData(null);
      setZoomLevel("cluster");
      const w = containerRef.current?.clientWidth ?? 1200;
      const h = containerRef.current?.clientHeight ?? 800;
      setViewBox({ x: 0, y: 0, width: w, height: h });
    }, 200);
  }, []);

  /** Navigate to a QASet focal node */
  const navigateTo = useCallback(
    (qaSetId: string) => {
      if (qaSetId === focalId) return;
      setFadeState("fading-out");
      setIsLoading(true);
      setTimeout(() => {
        qaLoadedRef.current = null;
        setExploreData(null);
        setFocalId(qaSetId);
        const w = containerRef.current?.clientWidth ?? 1200;
        const h = containerRef.current?.clientHeight ?? 800;
        setViewBox({ x: 0, y: 0, width: w, height: h });
      }, 200);
    },
    [focalId]
  );

  /** Navigate to direction */
  const panToDirection = useCallback(
    (dir: "right" | "up" | "down" | "left") => {
      const dirNodes = qaNodes.filter((n) => n.type === "qaset" && n.direction === dir);
      if (dirNodes.length === 0) return;
      const qaId = dirNodes[0].data.id as string;
      if (qaId) navigateTo(qaId);
    },
    [qaNodes, navigateTo]
  );

  // ══════════════════════════════════════════════
  // SVG Interaction (shared between both views)
  // ══════════════════════════════════════════════

  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;
  const layerRef = useRef<HTMLDivElement>(null);

  // ── Convert client → SVG coords ──
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const el = layerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const vb = viewBoxRef.current;
    return {
      x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
      y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
    };
  }, []);

  // ── Hit test ──
  const hitTestNode = useCallback((svgX: number, svgY: number) => {
    const allNodes = zoomLevelRef.current === "cluster" ? clusterNodesRef.current : qaNodesRef.current;
    const w = zoomLevelRef.current === "cluster" ? CLUSTER_NODE_W : MAX_NODE_W;
    const h = zoomLevelRef.current === "cluster" ? CLUSTER_NODE_H : NODE_H;
    for (let i = allNodes.length - 1; i >= 0; i--) {
      const n = allNodes[i];
      if (svgX >= n.x - w / 2 && svgX <= n.x + w / 2 && svgY >= n.y - h / 2 && svgY <= n.y + h / 2) {
        return n;
      }
    }
    return null;
  }, []);

  // ── Interaction: pointerdown on layer, pointermove/up on DOCUMENT ──
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const pt = clientToSvg(e.clientX, e.clientY);
      const node = hitTestNode(pt.x, pt.y);
      if (node) {
        interactionRef.current = { type: "drag", nodeId: node.id, offsetX: pt.x - node.x, offsetY: pt.y - node.y, moved: false };
      } else {
        const vb = viewBoxRef.current;
        interactionRef.current = { type: "pan", startX: e.clientX, startY: e.clientY, vbX: vb.x, vbY: vb.y };
      }
      setCursorStyle("grabbing");
    };

    const onPointerMove = (e: PointerEvent) => {
      const action = interactionRef.current;
      if (!action) return;
      e.preventDefault();
      if (action.type === "drag") {
        action.moved = true;
        const pt = clientToSvg(e.clientX, e.clientY);
        if (zoomLevelRef.current === "cluster") {
          setClusterNodes(prev => prev.map(n => n.id === action.nodeId ? { ...n, x: pt.x - action.offsetX, y: pt.y - action.offsetY } : n));
        } else {
          setQaNodes(prev => prev.map(n => n.id === action.nodeId ? { ...n, x: pt.x - action.offsetX, y: pt.y - action.offsetY } : n));
        }
      } else {
        const rect = layer.getBoundingClientRect();
        const vb = viewBoxRef.current;
        const dx = ((e.clientX - action.startX) / rect.width) * vb.width;
        const dy = ((e.clientY - action.startY) / rect.height) * vb.height;
        setViewBox(prev => ({ ...prev, x: action.vbX - dx, y: action.vbY - dy }));
      }
    };

    const onPointerUp = () => {
      const action = interactionRef.current;
      if (action?.type === "drag" && !action.moved) {
        const allNodes = zoomLevelRef.current === "cluster" ? clusterNodesRef.current : qaNodesRef.current;
        const node = allNodes.find(n => n.id === action.nodeId);
        if (node && zoomLevelRef.current === "cluster") {
          setSelectedClusterId(node.id);
        } else if (node && node.direction === "center") {
          onSelectQASet((node as PositionedExploreNode).data.id as string);
        } else if (node) {
          navigateTo((node as PositionedExploreNode).data.id as string);
        }
      }
      interactionRef.current = null;
      setCursorStyle("grab");
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = viewBoxRef.current;
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const rect = layer.getBoundingClientRect();
      const mx = vb.x + ((e.clientX - rect.left) / rect.width) * vb.width;
      const my = vb.y + ((e.clientY - rect.top) / rect.height) * vb.height;
      setViewBox({
        x: mx - (mx - vb.x) * factor,
        y: my - (my - vb.y) * factor,
        width: vb.width * factor,
        height: vb.height * factor,
      });
    };

    layer.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    layer.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      layer.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      layer.removeEventListener("wheel", onWheel);
    };
  }, [isActive, clientToSvg, hitTestNode, onSelectQASet, navigateTo]);

  // ══════════════════════════════════════════════
  // Loading / error / empty states
  // ══════════════════════════════════════════════

  if (!isActive) return null;

  const isEmpty = zoomLevel === "cluster" ? clusterNodes.length === 0 : qaNodes.length === 0;
  const mapOverlay = (isLoading && !exploreData && !clusterData)
    ? { icon: "🌐", title: "지식 지도를 불러오는 중...", loading: true }
    : (isEmpty && !isLoading)
    ? { icon: "🌐", title: error ? `오류: ${error}` : "공유된 Q&A가 없습니다", loading: false }
    : null;

  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const allArrowColors = [...Object.values(DIRECTION_COLORS), USER_COLOR, "#94a3b8", "#6b7280", "#22c55e", "#f97316", "#3b82f6", "#ef4444"];
  const uniqueColors = [...new Set(allArrowColors)];

  // ══════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ── */}
      <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0 flex-wrap">
        {/* Zoom level toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => { if (zoomLevel !== "cluster") zoomOutToCluster(); }}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              zoomLevel === "cluster"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted text-muted-foreground"
            }`}
          >
            주제 영역
          </button>
          <button
            onClick={() => {
              if (zoomLevel !== "qaset") {
                if (selectedClusterId) {
                  zoomIntoCluster(selectedClusterId);
                } else {
                  setZoomLevel("qaset");
                }
              }
            }}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              zoomLevel === "qaset"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted text-muted-foreground"
            }`}
          >
            지식 단위
          </button>
        </div>

        {/* Context info */}
        {zoomLevel === "cluster" && clusterData?.focal && (
          <span className="text-xs font-semibold truncate max-w-[200px]">
            📍 {clusterData.focal.name}
          </span>
        )}
        {zoomLevel === "qaset" && exploreData?.focal && (
          <>
            <button
              onClick={zoomOutToCluster}
              className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
              title="주제 영역으로 돌아가기"
            >
              ← 줌 아웃
            </button>
            <span className="text-xs font-semibold truncate max-w-[200px]">
              📍 {exploreData.focal.title ?? "Untitled"}
            </span>
            {exploreData.focal.topicCluster && (
              <Badge variant="outline" className="text-[10px]">
                {exploreData.focal.topicCluster.name}
              </Badge>
            )}
          </>
        )}

        <div className="flex-1" />

        {/* Legend */}
        {zoomLevel === "cluster" ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#22c55e" }} /> 상위 (broader)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#f97316" }} /> 하위 (narrower)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#3b82f6" }} /> 관련 (related)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#ef4444" }} /> 대립 (conflicting)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: DIRECTION_COLORS.center }} /> 중심
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: DIRECTION_COLORS.right }} /> 관련
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: DIRECTION_COLORS.up }} /> 상위
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: DIRECTION_COLORS.down }} /> 하위
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: DIRECTION_COLORS.left }} /> 대립
            </span>
          </div>
        )}
      </div>

      {/* ── Direction buttons (Cluster level) ── */}
      {zoomLevel === "cluster" && clusterData?.directions && (
        <div className="px-4 py-1.5 border-b flex items-center justify-center gap-2 shrink-0">
          {([
            ["up", "↑ 상위", DIRECTION_COLORS.up],
            ["down", "↓ 하위", DIRECTION_COLORS.down],
            ["left", "← 대립", DIRECTION_COLORS.left],
            ["right", "관련 →", DIRECTION_COLORS.right],
          ] as const).map(([dir, label, color]) => {
            const info = clusterData.directions[dir];
            return (
              <button
                key={dir}
                onClick={() => panClusterDirection(dir)}
                disabled={info.count === 0}
                className="text-xs px-2 py-1 rounded border transition-colors disabled:opacity-30 hover:bg-muted"
                style={{ borderColor: info.count > 0 ? color : undefined }}
              >
                {label} ({info.count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── Direction buttons (QASet level) ── */}
      {zoomLevel === "qaset" && exploreData?.directions && (
        <div className="px-4 py-1.5 border-b flex items-center justify-center gap-2 shrink-0">
          {([
            ["up", "↑ 상위", DIRECTION_COLORS.up],
            ["down", "↓ 하위", DIRECTION_COLORS.down],
            ["left", "← 대립", DIRECTION_COLORS.left],
            ["right", "관련 →", DIRECTION_COLORS.right],
          ] as const).map(([dir, label, color]) => {
            const info = exploreData.directions[dir];
            return (
              <button
                key={dir}
                onClick={() => panToDirection(dir)}
                disabled={info.count === 0}
                className="text-xs px-2 py-1 rounded border transition-colors disabled:opacity-30 hover:bg-muted"
                style={{ borderColor: info.count > 0 ? color : undefined }}
              >
                {label} ({info.count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── SVG Canvas ── */}
      <div
        className="flex-1 relative overflow-hidden"
        ref={containerRef}
      >
        <svg
          ref={svgRef}
          className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
            fadeState === "fading-out" ? "opacity-0" : "opacity-100"
          }`}
          viewBox={vb}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "none" }}
        >
          <defs>
            {uniqueColors.map((color) => (
              <marker key={color} id={`nav-arrow-${color.replace("#", "")}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Background rect for pan */}
          <rect
            x={viewBox.x - 5000} y={viewBox.y - 5000}
            width={viewBox.width + 10000} height={viewBox.height + 10000}
            fill="transparent"
          />

          {/* ════════════════ CLUSTER VIEW ════════════════ */}
          {zoomLevel === "cluster" && (
            <>
              {/* Cluster edges */}
              {clusterEdges.map((edge) => {
                const src = clusterNodes.find((n) => n.id === edge.source);
                const tgt = clusterNodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2;
                const markerId = `nav-arrow-${edge.color.replace("#", "")}`;

                return (
                  <g key={edge.id}>
                    <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke={edge.color} strokeWidth={Math.max(1.5, Math.min(4, edge.weight))} markerEnd={`url(#${markerId})`} opacity={0.7} />
                    <g>
                      <rect x={midX - 24} y={midY - 10} width={48} height={20} rx={4} fill="white" stroke={edge.color} strokeWidth={1} opacity={0.95} />
                      <text x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={edge.color}>
                        {edge.label}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Cluster nodes */}
              {clusterNodes.map((node) => {
                const w = CLUSTER_NODE_W;
                const h = CLUSTER_NODE_H;
                const left = node.x - w / 2;
                const top = node.y - h / 2;
                const isCenter = node.direction === "center";
                const isSelected = node.id === selectedClusterId;
                const dirColor = DIRECTION_COLORS[(node.direction as Direction) ?? "center"] ?? "#6b7280";
                const bgClass = DIRECTION_BG[(node.direction as Direction) ?? "center"] ?? "";

                return (
                  <g key={node.id}>
                    <foreignObject x={left} y={top} width={w} height={h} style={{ overflow: "visible" }}>
                      <div
                        data-node-id={node.id}
                        onDoubleClick={() => {
                          if (isCenter) {
                            zoomIntoCluster(node.id);
                          } else {
                            navigateToCluster(node.id);
                          }
                        }}
                        onClick={() => setSelectedClusterId(node.id)}
                        className={`
                          w-full h-full px-3 py-2 rounded-xl border-2 shadow-sm
                          cursor-pointer select-none flex flex-col justify-between
                          hover:shadow-lg transition-all
                          ${bgClass}
                          ${isCenter ? "ring-2 ring-indigo-300 dark:ring-indigo-700 shadow-lg" : ""}
                          ${isSelected && !isCenter ? "ring-2 ring-primary shadow-md" : ""}
                        `}
                        style={{ borderColor: dirColor }}
                      >
                        <div>
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight">
                            {node.label}
                          </p>
                          {node.labelEn && (
                            <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                              {node.labelEn}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-500">
                            Q&A {node.qaCount}개
                          </span>
                          {node.gapCount > 0 && (
                            <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              갭 {node.gapCount}
                            </span>
                          )}
                          <span className="text-[9px] font-medium" style={{ color: dirColor }}>
                            {isCenter ? "더블클릭 → 줌인" : "더블클릭 → 이동"}
                          </span>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </>
          )}

          {/* ════════════════ QASET VIEW ════════════════ */}
          {zoomLevel === "qaset" && (
            <>
              {/* QA edges */}
              {qaEdges.map((edge) => {
                const src = qaNodes.find((n) => n.id === edge.source);
                const tgt = qaNodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const isCreatorEdge = edge.type === "created";
                const color = isCreatorEdge ? "#94a3b8" : DIRECTION_COLORS[tgt.direction] ?? "#6b7280";
                const markerId = `nav-arrow-${color.replace("#", "")}`;
                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2;

                return (
                  <g key={edge.id}>
                    <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke={color} strokeWidth={isCreatorEdge ? 1 : 1.5} strokeDasharray={isCreatorEdge ? "4,4" : "none"} markerEnd={`url(#${markerId})`} opacity={isCreatorEdge ? 0.4 : 0.7} />
                    {edge.label && !isCreatorEdge && (
                      <g>
                        <rect x={midX - 30} y={midY - 10} width={60} height={20} rx={4} fill="white" stroke={color} strokeWidth={1} opacity={0.92} />
                        <text x={midX} y={midY + 4} textAnchor="middle" fontSize={9} fontWeight={600} fill={color}>
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* QASet nodes */}
              {qaNodes.filter((n) => n.type === "qaset").map((node) => {
                const totalInvested = (node.data.totalInvested as number) ?? 0;
                const w = getNodeWidth(totalInvested);
                const h = NODE_H;
                const left = node.x - w / 2;
                const top = node.y - h / 2;
                const dirColor = DIRECTION_COLORS[node.direction];
                const bgClass = DIRECTION_BG[node.direction];
                const isCenter = node.direction === "center";
                const negativeInvested = (node.data.negativeInvested as number) ?? 0;
                const title = (node.data.title as string) ?? "Untitled";
                const creatorName = node.data.creator?.name ?? "익명";

                return (
                  <g key={node.id}>
                    <foreignObject x={left} y={top} width={w} height={h} style={{ overflow: "visible" }}>
                      <div
                        data-node-id={node.id}
                        onClick={() => {
                          const qaId = node.data.id as string;
                          if (qaId) {
                            if (isCenter) onSelectQASet(qaId);
                            else navigateTo(qaId);
                          }
                        }}
                        className={`
                          w-full h-full px-2 py-1.5 rounded-lg border-2 shadow-sm
                          cursor-pointer select-none flex flex-col justify-between
                          hover:shadow-md transition-shadow
                          ${bgClass}
                          ${isCenter ? "shadow-lg ring-2 ring-indigo-300 dark:ring-indigo-700" : ""}
                        `}
                        style={{ borderColor: dirColor }}
                      >
                        <p className="text-[11px] font-medium leading-tight text-gray-800 dark:text-gray-200 line-clamp-3">
                          {title.length > 50 ? title.slice(0, 50) + "…" : title}
                        </p>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-[55%]">
                            {creatorName}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {totalInvested > 0 && (
                              <span className="text-[8px] px-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-medium">
                                💎{totalInvested}
                              </span>
                            )}
                            {negativeInvested > 0 && (
                              <span className="text-[8px] px-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300 font-medium">
                                🔻
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}

              {/* User nodes */}
              {qaNodes.filter((n) => n.type === "user").map((node) => {
                const name = (node.data.name as string) ?? "?";
                const initial = name.charAt(0).toUpperCase();
                return (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r={20} fill={USER_COLOR} opacity={0.85} stroke="white" strokeWidth={2}
                      data-node-id={node.id}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setUserTooltip({ nodeId: node.id })}
                      onMouseLeave={() => setUserTooltip(null)}
                    />
                    <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="white" pointerEvents="none">
                      {initial}
                    </text>
                    {userTooltip?.nodeId === node.id && (
                      <foreignObject x={node.x + 25} y={node.y - 40} width={180} height={80} style={{ overflow: "visible", pointerEvents: "none" }}>
                        <div className="p-2 rounded-lg border bg-white dark:bg-gray-900 shadow-lg text-xs space-y-1 z-50">
                          <p className="font-semibold text-[11px] text-gray-800 dark:text-gray-200">{name}</p>
                          <div className="flex gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                            {node.data.authorityScore !== undefined && <span>권위: {node.data.authorityScore}</span>}
                            {node.data.hubScore !== undefined && <span>허브: {Math.round(node.data.hubScore as number)}</span>}
                          </div>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </>
          )}
        </svg>

        {/* Interaction layer: pointerdown here, move/up on document */}
        <div
          ref={layerRef}
          style={{
            position: "absolute",
            left: 0, top: 0,
            width: "100%", height: "100%",
            zIndex: 10,
            cursor: cursorStyle,
            userSelect: "none",
            WebkitUserSelect: "none",
            pointerEvents: "auto",
            touchAction: "none",
          }}
        />

        {/* Loading overlay */}
        {isLoading && (clusterData || exploreData) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-20">
            <div className="text-3xl animate-pulse">🌐</div>
          </div>
        )}

        {/* Empty/error overlay */}
        {mapOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center space-y-3 text-muted-foreground">
              <div className={`text-5xl ${mapOverlay.loading ? "animate-pulse" : ""}`}>{mapOverlay.icon}</div>
              <h3 className="text-lg font-medium">{mapOverlay.title}</h3>
              {!mapOverlay.loading && (
                <>
                  <p className="text-sm max-w-sm leading-relaxed">
                    {error ? "로그인 상태를 확인하거나 새로고침해 주세요." : "Q&A를 공유하면 지식 지도에 표시됩니다."}
                  </p>
                  <button
                    onClick={() => {
                      clusterLoadedRef.current = null;
                      setClusterData(null);
                      setClusterLoaded(false);
                      qaLoadedRef.current = null;
                      setError(null);
                    }}
                    className="text-xs px-3 py-1.5 rounded border hover:bg-muted transition-colors"
                  >
                    다시 시도
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Cluster detail panel (gaps + contributors) */}
        {zoomLevel === "cluster" && selectedClusterId && (() => {
          const sel = clusterNodes.find(n => n.id === selectedClusterId);
          if (!sel) return null;
          return (
            <div className="absolute right-2 top-2 w-72 max-h-[calc(100%-16px)] overflow-y-auto bg-white dark:bg-gray-900 border rounded-xl shadow-lg p-3 z-10 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{sel.label}</h3>
                  {sel.labelEn && <p className="text-[10px] text-gray-400">{sel.labelEn}</p>}
                </div>
                <button onClick={() => setSelectedClusterId(null)} className="text-gray-400 hover:text-gray-600 text-xs p-1">✕</button>
              </div>

              {sel.description && (
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">{sel.description}</p>
              )}

              <div className="flex gap-2 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Q&A {sel.qaCount}개</span>
                {sel.gapCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300">미해결 갭 {sel.gapCount}개</span>
                )}
              </div>

              {/* Knowledge gaps */}
              {sel.gaps.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">지식 갭 (AI가 인간에게 질문)</h4>
                  {sel.gaps.map(gap => (
                    <div key={gap.id} className="text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`px-1 rounded text-[9px] font-medium ${
                          gap.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            : gap.severity === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {gap.severity}
                        </span>
                        <span className="text-gray-400">{gap.gapType.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{gap.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Contributors */}
              {sel.contributors.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">주요 기여자</h4>
                  {sel.contributors.map(ct => (
                    <div key={ct.userId} className="flex items-center justify-between text-[10px] p-1.5 rounded border bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{ct.name}</span>
                      <div className="flex gap-1.5 text-gray-500 dark:text-gray-400">
                        <span>질문 {ct.questionsAsked}</span>
                        {ct.insightsContributed > 0 && <span>인사이트 {ct.insightsContributed}</span>}
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">권위 {Math.round(ct.topicAuthority)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => zoomIntoCluster(sel.id)}
                className="w-full text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
              >
                이 주제로 줌인
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
