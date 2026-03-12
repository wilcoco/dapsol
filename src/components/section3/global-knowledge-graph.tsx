"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";

interface GlobalNode {
  id: string;
  label: string;
  x: number;
  y: number;
  data: {
    qaSetId: string;
    title: string;
    summary: string | null;
    creatorName: string | null;
    totalInvested: number;
    investorCount: number;
    negativeInvested: number;
    messageCount: number;
    sizeHint: number; // 0..1
  };
}

interface GlobalEdge {
  id: string;
  source: string;
  target: string;
  edgeType: "fork" | "relation";
  label: string | null;
  color: string;
}

interface GlobalKnowledgeGraphProps {
  onSelectQASet: (qaSetId: string) => void;
  isActive?: boolean;
}

const MIN_W = 150;
const MIN_H = 60;
const MAX_W = 220;
const MAX_H = 80;

function getNodeSize(sizeHint: number) {
  const w = MIN_W + (MAX_W - MIN_W) * sizeHint;
  const h = MIN_H + (MAX_H - MIN_H) * sizeHint;
  return { w, h };
}

function getNodeBorderColor(data: GlobalNode["data"]): string {
  if (data.negativeInvested > data.totalInvested) return "#ef4444"; // red
  if (data.totalInvested >= 100) return "#22c55e"; // green
  if (data.totalInvested >= 30) return "#3b82f6"; // blue
  return "#94a3b8"; // gray
}

export function GlobalKnowledgeGraph({ onSelectQASet, isActive = false }: GlobalKnowledgeGraphProps) {
  const [nodes, setNodes] = useState<GlobalNode[]>([]);
  const [edges, setEdges] = useState<GlobalEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ nodeId: string } | null>(null);

  // Drag state for individual nodes
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Pan state for background dragging
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    if (loadedRef.current && nodes.length > 0) return;

    let cancelled = false;
    setIsLoading(true);

    async function load() {
      try {
        const res = await fetch("/api/graph/global");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setNodes(data.nodes ?? []);
          setEdges(data.edges ?? []);
          loadedRef.current = true;
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isActive]);

  // Node dragging
  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      setDragNode(nodeId);
      setDragOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
    }
  }, [nodes]);

  // Background panning
  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on background (not on nodes)
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect") {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragNode) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragNode ? { ...n, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } : n
        )
      );
    } else if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }
  }, [dragNode, dragOffset, isPanning]);

  const handleMouseUp = useCallback(() => {
    setDragNode(null);
    setIsPanning(false);
  }, []);

  // Reload when toggling to active
  const handleRefresh = useCallback(() => {
    loadedRef.current = false;
    setIsLoading(true);
    fetch("/api/graph/global")
      .then((res) => res.json())
      .then((data) => {
        setNodes(data.nodes ?? []);
        setEdges(data.edges ?? []);
        loadedRef.current = true;
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + MAX_W + 80), 900);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + MAX_H + 80), 600);

  // Loading
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🌐</div>
          <p className="text-sm">전체 지식 지도 로딩 중...</p>
        </div>
      </div>
    );
  }

  // Empty
  if (nodes.length === 0 && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="text-5xl">🌐</div>
          <h3 className="text-lg font-medium">공유된 Q&A가 없습니다</h3>
          <p className="text-sm max-w-sm leading-relaxed">
            Q&A를 공유하면 전체 지식 지도에 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">
          🌐 전체 지식 지도
        </span>
        <button
          onClick={handleRefresh}
          className="text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
        >
          새로고침
        </button>
        <div className="flex-1" />
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded border-2 border-green-500 bg-green-50" />
            고투자
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded border-2 border-gray-400 bg-gray-50" />
            일반
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded border-2 border-red-500 bg-red-50" />
            부정적
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-5 border-t-2 border-teal-500" />
            확장(포크)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-5 border-t border-dashed border-gray-400" />
            관계
          </span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {nodes.length} Q&A · {edges.length} 링크
        </Badge>
      </div>

      {/* Graph canvas */}
      <div
        className="flex-1 overflow-auto bg-muted/10"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <svg
          width={maxX}
          height={maxY}
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            {["#94a3b8","#3b82f6","#8b5cf6","#f97316","#22c55e","#ef4444","#14b8a6","#6b7280","#f59e0b","#06b6d4","#6366f1","#dc2626"].map((color) => (
              <marker
                key={color}
                id={`global-arrow-${color.replace("#", "")}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L8,3 z" fill={color} />
              </marker>
            ))}
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y})`}>
            {/* Edges */}
            {edges.map((edge) => {
              const src = nodes.find((n) => n.id === edge.source);
              const tgt = nodes.find((n) => n.id === edge.target);
              if (!src || !tgt) return null;

              const srcSize = getNodeSize(src.data.sizeHint);
              const tgtSize = getNodeSize(tgt.data.sizeHint);

              const x1 = src.x;
              const y1 = src.y + srcSize.h / 2;
              const x2 = tgt.x;
              const y2 = tgt.y - tgtSize.h / 2;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const markerId = `global-arrow-${edge.color.replace("#", "")}`;
              const isFork = edge.edgeType === "fork";

              return (
                <g key={edge.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={edge.color}
                    strokeWidth={isFork ? 2 : 1.5}
                    strokeDasharray={isFork ? "none" : "6,4"}
                    markerEnd={`url(#${markerId})`}
                    opacity={0.8}
                  />
                  {edge.label && (
                    <g>
                      <rect
                        x={midX - 28}
                        y={midY - 10}
                        width={56}
                        height={20}
                        rx={4}
                        ry={4}
                        fill="white"
                        stroke={edge.color}
                        strokeWidth={1}
                        opacity={0.92}
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill={edge.color}
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const { w, h } = getNodeSize(node.data.sizeHint);
              const left = node.x - w / 2;
              const top = node.y - h / 2;
              const borderColor = getNodeBorderColor(node.data);
              const isNegative = node.data.negativeInvested > node.data.totalInvested;

              return (
                <g key={node.id}>
                  <foreignObject
                    x={left}
                    y={top}
                    width={w}
                    height={h}
                    style={{ overflow: "visible" }}
                  >
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                      onClick={() => onSelectQASet(node.data.qaSetId)}
                      onMouseEnter={() => setTooltip({ nodeId: node.id })}
                      onMouseLeave={() => setTooltip(null)}
                      className={`
                        w-full h-full px-2.5 py-1.5 rounded-lg border-2 shadow-sm
                        cursor-pointer select-none flex flex-col justify-between
                        bg-white dark:bg-gray-900 hover:shadow-md transition-shadow
                        ${isNegative ? "bg-red-50 dark:bg-red-950" : ""}
                      `}
                      style={{ borderColor }}
                    >
                      {/* Title */}
                      <p className="text-[11px] font-medium leading-tight text-gray-800 dark:text-gray-200 line-clamp-2">
                        {node.label}
                      </p>
                      {/* Footer: creator + investment */}
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-[60%]">
                          {node.data.creatorName ?? "익명"}
                        </span>
                        <div className="flex items-center gap-1">
                          {node.data.totalInvested > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium">
                              +{node.data.totalInvested}
                            </span>
                          )}
                          {node.data.negativeInvested > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 font-medium">
                              -{node.data.negativeInvested}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </foreignObject>

                  {/* Tooltip */}
                  {tooltip?.nodeId === node.id && (
                    <foreignObject
                      x={left + w + 8}
                      y={top}
                      width={240}
                      height={140}
                      style={{ overflow: "visible", pointerEvents: "none" }}
                    >
                      <div className="p-2.5 rounded-lg border bg-white dark:bg-gray-900 shadow-lg text-xs space-y-1.5 z-50">
                        <p className="font-semibold text-[11px] text-gray-800 dark:text-gray-200 line-clamp-2">
                          {node.data.title}
                        </p>
                        {node.data.summary && (
                          <p className="text-gray-600 dark:text-gray-400 line-clamp-3 text-[10px]">
                            {node.data.summary}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400 pt-0.5">
                          <span>작성자: {node.data.creatorName ?? "익명"}</span>
                          <span>메시지: {node.data.messageCount}개</span>
                          <span>투자자: {node.data.investorCount}명</span>
                          <span>투자액: +{node.data.totalInvested}</span>
                          {node.data.negativeInvested > 0 && (
                            <span className="text-red-500">반대: -{node.data.negativeInvested}</span>
                          )}
                        </div>
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
