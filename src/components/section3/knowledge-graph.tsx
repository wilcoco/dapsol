"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { QASetWithMessages } from "@/types/qa-set";

interface MsgNode {
  id: string;
  type: "question" | "answer";
  isFocus: boolean;
  isParent: boolean;
  isChild: boolean;
  label: string;
  x: number;
  y: number;
  data: {
    messageId: string;
    qaSetId: string;
    qaSetTitle: string | null;
    creatorName: string | null;
    content: string;
    role: string;
    relationSimple: string | null;
    relationQ1Q2: string | null;
    relationA1Q2: string | null;
    relationStance: string | null;
  };
}

interface MsgEdge {
  id: string;
  source: string;
  target: string;
  edgeType: "qa" | "followup" | "cross" | "fork";
  label: string | null;
  color: string;
}

interface Section3Props {
  qaSet: QASetWithMessages | null;
  onSelectQASet: (qaSetId: string) => void;
  isActive?: boolean;
}

const NODE_W = 240;
const NODE_H = 90;

export function Section3Graph({ qaSet, onSelectQASet, isActive = false }: Section3Props) {
  const [nodes, setNodes] = useState<MsgNode[]>([]);
  const [edges, setEdges] = useState<MsgEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltip, setTooltip] = useState<MsgNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 });
  const viewBoxRef = useRef(viewBox);
  viewBoxRef.current = viewBox;
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Interaction ref — survives across renders, no stale closure issues
  const dragState = useRef<
    | { type: "drag"; nodeId: string; offsetX: number; offsetY: number; moved: boolean }
    | { type: "pan"; startX: number; startY: number; vbX: number; vbY: number }
    | null
  >(null);
  const [cursorStyle, setCursorStyle] = useState<"grab" | "grabbing">("grab");

  const lastLoadedRef = useRef<string | null>(null);

  // ── Data fetching ──
  useEffect(() => {
    if (!qaSet) { setNodes([]); setEdges([]); lastLoadedRef.current = null; return; }
    if (!isActive) return;
    const cacheKey = `${qaSet.id}:${qaSet.messages?.length ?? 0}`;
    if (lastLoadedRef.current === cacheKey && nodes.length > 0) return;
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/graph?qaSetId=${qaSet.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) { setNodes(data.nodes ?? []); setEdges(data.edges ?? []); lastLoadedRef.current = cacheKey; } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [qaSet?.id, qaSet?.messages?.length, isActive]);

  // Fit viewBox
  useEffect(() => {
    if (nodes.length === 0) return;
    const pad = 60;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    setViewBox({
      x: Math.min(...xs) - NODE_W / 2 - pad,
      y: Math.min(...ys) - NODE_H / 2 - pad,
      width: Math.max(Math.max(...xs) - Math.min(...xs) + NODE_W + pad * 2, 600),
      height: Math.max(Math.max(...ys) - Math.min(...ys) + NODE_H + pad * 2, 400),
    });
  }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──
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

  const hitTest = useCallback((svgX: number, svgY: number): MsgNode | null => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (svgX >= n.x - NODE_W / 2 && svgX <= n.x + NODE_W / 2 &&
          svgY >= n.y - NODE_H / 2 && svgY <= n.y + NODE_H / 2) {
        return n;
      }
    }
    return null;
  }, []);

  // ══════════════════════════════════════════════════════════
  // Interaction: pointerdown on layer, pointermove/up on document
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const pt = clientToSvg(e.clientX, e.clientY);
      const node = hitTest(pt.x, pt.y);

      if (node) {
        dragState.current = {
          type: "drag", nodeId: node.id,
          offsetX: pt.x - node.x, offsetY: pt.y - node.y,
          moved: false,
        };
      } else {
        const vb = viewBoxRef.current;
        dragState.current = {
          type: "pan",
          startX: e.clientX, startY: e.clientY,
          vbX: vb.x, vbY: vb.y,
        };
      }
      setCursorStyle("grabbing");
    };

    const onPointerMove = (e: PointerEvent) => {
      // Tooltip when not dragging
      if (!dragState.current) {
        const pt = clientToSvg(e.clientX, e.clientY);
        const node = hitTest(pt.x, pt.y);
        if (node) {
          setTooltip(node);
          setTooltipPos({ x: e.clientX, y: e.clientY });
        } else {
          setTooltip(null);
        }
        return;
      }

      e.preventDefault();
      const action = dragState.current;

      if (action.type === "drag") {
        action.moved = true;
        const pt = clientToSvg(e.clientX, e.clientY);
        setNodes(prev => prev.map(n =>
          n.id === action.nodeId
            ? { ...n, x: pt.x - action.offsetX, y: pt.y - action.offsetY }
            : n
        ));
      } else {
        const layerRect = layer.getBoundingClientRect();
        const vb = viewBoxRef.current;
        const dx = ((e.clientX - action.startX) / layerRect.width) * vb.width;
        const dy = ((e.clientY - action.startY) / layerRect.height) * vb.height;
        setViewBox(prev => ({ ...prev, x: action.vbX - dx, y: action.vbY - dy }));
      }
    };

    const onPointerUp = () => {
      const action = dragState.current;
      if (action?.type === "drag" && !action.moved) {
        const node = nodesRef.current.find(n => n.id === action.nodeId);
        if (node) onSelectQASet(node.data.qaSetId);
      }
      dragState.current = null;
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

    // pointerdown on layer, move/up on DOCUMENT
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
  }, [clientToSvg, hitTest, onSelectQASet]);

  // ── Overlay for empty/loading ──
  const overlayMessage = !qaSet
    ? { icon: "🔗", title: "지식 그래프", desc: "\"Q&A 작업\" 탭에서 Q&A를 열면\n해당 대화의 흐름과 연관 Q&A가\n여기에 그래프로 표시됩니다." }
    : isLoading
    ? { icon: "🔗", title: "그래프 로딩 중...", desc: "" }
    : nodes.length === 0
    ? { icon: "💬", title: "아직 대화가 없습니다", desc: "Q&A 작업 탭에서 AI와 대화를 시작하세요." }
    : null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]">
          📍 {qaSet?.title ?? "현재 Q&A"}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-100 border-2 border-blue-500" /> 현재 (Q)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-100 border-2 border-green-500" /> 현재 (A)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-50 border border-dashed border-blue-300" /> 원본/확장</span>
          <span className="flex items-center gap-1"><span className="inline-block w-5 border-t border-dashed border-gray-400" /> 관계</span>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">{nodes.length} 노드 · {edges.length} 링크</Badge>
      </div>

      {/* Graph area — position:relative container */}
      <div className="flex-1 relative overflow-hidden bg-muted/10" ref={containerRef}>
        {/* SVG: visual only, pointer-events:none */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "none" }}
        >
          <defs>
            {["#94a3b8","#3b82f6","#8b5cf6","#f97316","#22c55e","#ef4444","#14b8a6","#6b7280","#f59e0b","#06b6d4","#6366f1","#dc2626"].map(c => (
              <marker key={c} id={`arrow-${c.replace("#","")}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={c} />
              </marker>
            ))}
          </defs>
          {edges.map(edge => {
            const src = nodes.find(n => n.id === edge.source);
            const tgt = nodes.find(n => n.id === edge.target);
            if (!src || !tgt) return null;
            const y1 = src.y + NODE_H / 2, y2 = tgt.y - NODE_H / 2;
            const midX = (src.x + tgt.x) / 2, midY = (y1 + y2) / 2;
            return (
              <g key={edge.id}>
                <line x1={src.x} y1={y1} x2={tgt.x} y2={y2} stroke={edge.color}
                  strokeWidth={edge.edgeType === "cross" || edge.edgeType === "fork" ? 1.5 : 2}
                  strokeDasharray={edge.edgeType === "cross" ? "6,4" : edge.edgeType === "fork" ? "8,3" : "none"}
                  markerEnd={`url(#arrow-${edge.color.replace("#","")})`} opacity={0.85} />
                {edge.label && (
                  <g>
                    <rect x={midX - 28} y={midY - 10} width={56} height={20} rx={4} fill="white" stroke={edge.color} strokeWidth={1} opacity={0.92} />
                    <text x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={edge.color}>{edge.label}</text>
                  </g>
                )}
              </g>
            );
          })}
          {nodes.map(node => {
            const isQ = node.type === "question";
            const left = node.x - NODE_W / 2, top = node.y - NODE_H / 2;
            let stroke = "#94a3b8", fill = "#f8fafc", sw = 1.5, dash = "";
            if (node.isFocus) { stroke = isQ ? "#3b82f6" : "#22c55e"; fill = isQ ? "#dbeafe" : "#dcfce7"; sw = 2.5; }
            else if (node.isParent || node.isChild) { stroke = isQ ? "#93c5fd" : "#86efac"; fill = isQ ? "#eff6ff" : "#f0fdf4"; dash = "4,3"; }
            return (
              <g key={node.id}>
                <rect x={left} y={top} width={NODE_W} height={NODE_H} rx={8} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
                <text x={left + 8} y={top + 16} fontSize={11} fontWeight={700} fill={isQ ? "#1d4ed8" : "#15803d"}>{isQ ? "Q" : "A"}</text>
                {node.isFocus && <text x={left + 24} y={top + 16} fontSize={9} fill="#6366f1">현재</text>}
                {node.isParent && <text x={left + 24} y={top + 16} fontSize={9} fill="#6b7280">원본</text>}
                {node.isChild && <text x={left + 24} y={top + 16} fontSize={9} fill="#14b8a6">확장</text>}
                {node.data.relationSimple && <text x={left + NODE_W - 8} y={top + 16} fontSize={9} fill="#7c3aed" textAnchor="end">{node.data.relationSimple}</text>}
                <foreignObject x={left + 6} y={top + 22} width={NODE_W - 12} height={NODE_H - 28}>
                  <p style={{ fontSize: 10, lineHeight: "1.3", color: "#374151", margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const }}>
                    {node.label}
                  </p>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* Interaction layer: ON TOP of SVG, 100% width/height, pointer-events:auto */}
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

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 p-2 rounded-lg border bg-white dark:bg-gray-900 shadow-lg text-xs space-y-1 max-w-[220px]"
            style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 60, transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <div className="font-semibold text-[11px]">{tooltip.data.qaSetTitle ?? "Q&A"}</div>
            {tooltip.data.creatorName && <div className="text-[10px] text-muted-foreground">by {tooltip.data.creatorName}</div>}
            <p className="text-gray-600 dark:text-gray-400 line-clamp-4">{tooltip.data.content}</p>
          </div>
        )}

        {/* Empty/loading overlay */}
        {overlayMessage && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-30">
            <div className="text-center space-y-3 text-muted-foreground">
              <div className={`text-5xl ${isLoading ? "animate-pulse" : ""}`}>{overlayMessage.icon}</div>
              <h3 className="text-lg font-medium">{overlayMessage.title}</h3>
              {overlayMessage.desc && <p className="text-sm max-w-sm leading-relaxed whitespace-pre-line">{overlayMessage.desc}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
