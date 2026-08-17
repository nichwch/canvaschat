"use client";

import { useRef } from "react";
import {
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  type WireframeElement,
  type WireframeKind,
} from "@/lib/types";
import {
  WIREFRAME_KINDS,
  WIREFRAME_MUTED,
  WIREFRAME_STROKE,
  defaultLabel,
  defaultSize,
  hasLabel,
  isLinear,
} from "@/lib/wireframe";

/** "select" manipulates existing elements; every other tool places one. */
export type WireframeTool = "select" | WireframeKind;

const SELECTION_COLOR = "#3b82f6";
const HANDLE_SIZE = 10;
/** Drags shorter than this place an element at its default size instead. */
const MIN_DRAG = 8;

type Point = { x: number; y: number };

type DragState = {
  mode: "create" | "move" | "resize" | "line-start" | "line-end";
  id: string;
  start: Point;
  origin: { x: number; y: number; w: number; h: number };
};

/** Maps a pointer event into wireframe coordinates, absorbing the canvas zoom. */
function svgPoint(svg: SVGSVGElement, event: React.PointerEvent): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return { x: point.x, y: point.y };
}

function arrowHeadPath(x: number, y: number, angle: number): string {
  const size = 10;
  const left = `${x - size * Math.cos(angle - Math.PI / 6)} ${y - size * Math.sin(angle - Math.PI / 6)}`;
  const right = `${x - size * Math.cos(angle + Math.PI / 6)} ${y - size * Math.sin(angle + Math.PI / 6)}`;
  return `M ${left} L ${x} ${y} L ${right}`;
}

function ElementShape({ el }: { el: WireframeElement }) {
  const { x, y, w, h } = el;
  const stroke = { stroke: WIREFRAME_STROKE, strokeWidth: 2 };
  const font = { fontSize: 16, fontFamily: "sans-serif" };

  switch (el.kind) {
    case "box":
      return <rect x={x} y={y} width={w} height={h} fill="white" {...stroke} />;
    case "ellipse":
      return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="white" {...stroke} />;
    case "line":
    case "arrow":
      return (
        <>
          <line x1={x} y1={y} x2={x + w} y2={y + h} {...stroke} />
          {el.kind === "arrow" && (
            <path d={arrowHeadPath(x + w, y + h, Math.atan2(h, w))} fill="none" {...stroke} />
          )}
          {/* Fat invisible twin so thin lines are clickable. */}
          <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="transparent" strokeWidth={12} />
        </>
      );
    case "text":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="transparent" />
          <text x={x} y={y + h / 2} dominantBaseline="central" fill={WIREFRAME_STROKE} {...font}>
            {el.label ?? "text"}
          </text>
        </>
      );
    case "button":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6} fill="white" {...stroke} />
          <text
            x={x + w / 2}
            y={y + h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={WIREFRAME_STROKE}
            {...font}
          >
            {el.label ?? "button"}
          </text>
        </>
      );
    case "input":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="white" {...stroke} />
          <text x={x + 8} y={y + h / 2} dominantBaseline="central" fill={WIREFRAME_MUTED} {...font}>
            {el.label ?? "input"}
          </text>
        </>
      );
    case "image":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="white" {...stroke} />
          <line x1={x} y1={y} x2={x + w} y2={y + h} {...stroke} />
          <line x1={x + w} y1={y} x2={x} y2={y + h} {...stroke} />
        </>
      );
  }
}

/** Normalized bounding box; linear elements may have negative w/h. */
function bbox(el: WireframeElement) {
  return {
    x: Math.min(el.x, el.x + el.w),
    y: Math.min(el.y, el.y + el.h),
    w: Math.abs(el.w),
    h: Math.abs(el.h),
  };
}

/**
 * The main-panel wireframe editor for a node's wire tab: drag out shapes with
 * the active tool, then move, resize, and relabel them with select. Elements
 * persist to the node's `wireframe` data.
 */
export function WireframePane({
  elements,
  tool,
  selectedId,
  onToolChange,
  onSelect,
  onChange,
}: {
  elements: WireframeElement[];
  tool: WireframeTool;
  selectedId: string | null;
  onToolChange: (tool: WireframeTool) => void;
  onSelect: (id: string | null) => void;
  onChange: (elements: WireframeElement[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selected = elements.find((el) => el.id === selectedId) ?? null;

  function patch(id: string, changes: Partial<WireframeElement>) {
    onChange(elements.map((el) => (el.id === id ? { ...el, ...changes } : el)));
  }

  function beginDrag(event: React.PointerEvent, state: DragState) {
    const svg = svgRef.current!;
    svg.setPointerCapture(event.pointerId);
    svg.focus();
    dragRef.current = state;
  }

  function onBackgroundPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    if (tool === "select") {
      onSelect(null);
      return;
    }
    const point = svgPoint(svgRef.current!, event);
    const id = crypto.randomUUID();
    const label = defaultLabel(tool);
    onChange([
      ...elements,
      { id, kind: tool, x: point.x, y: point.y, w: 0, h: 0, ...(label ? { label } : {}) },
    ]);
    beginDrag(event, {
      mode: "create",
      id,
      start: point,
      origin: { x: point.x, y: point.y, w: 0, h: 0 },
    });
  }

  function onElementPointerDown(event: React.PointerEvent, el: WireframeElement) {
    if (tool !== "select" || event.button !== 0) return;
    event.stopPropagation();
    onSelect(el.id);
    beginDrag(event, {
      mode: "move",
      id: el.id,
      start: svgPoint(svgRef.current!, event),
      origin: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  }

  function onHandlePointerDown(event: React.PointerEvent, el: WireframeElement, mode: DragState["mode"]) {
    if (event.button !== 0) return;
    event.stopPropagation();
    beginDrag(event, {
      mode,
      id: el.id,
      start: svgPoint(svgRef.current!, event),
      origin: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const el = elements.find((e) => e.id === drag.id);
    if (!el) return;
    const point = svgPoint(svgRef.current!, event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const { origin } = drag;

    switch (drag.mode) {
      case "create":
        if (isLinear(el.kind)) {
          patch(el.id, { w: dx, h: dy });
        } else {
          patch(el.id, {
            x: Math.min(drag.start.x, point.x),
            y: Math.min(drag.start.y, point.y),
            w: Math.abs(dx),
            h: Math.abs(dy),
          });
        }
        return;
      case "move":
        patch(el.id, { x: origin.x + dx, y: origin.y + dy });
        return;
      case "resize":
        patch(el.id, { w: Math.max(MIN_DRAG, origin.w + dx), h: Math.max(MIN_DRAG, origin.h + dy) });
        return;
      case "line-start":
        patch(el.id, { x: origin.x + dx, y: origin.y + dy, w: origin.w - dx, h: origin.h - dy });
        return;
      case "line-end":
        patch(el.id, { w: origin.w + dx, h: origin.h + dy });
        return;
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.mode !== "create") return;
    const el = elements.find((e) => e.id === drag.id);
    if (!el) return;
    const tiny = isLinear(el.kind) ? Math.hypot(el.w, el.h) < MIN_DRAG : el.w < MIN_DRAG || el.h < MIN_DRAG;
    if (tiny) patch(el.id, defaultSize(el.kind));
    onSelect(el.id);
    onToolChange("select");
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      onChange(elements.filter((el) => el.id !== selectedId));
      onSelect(null);
    }
  }

  const selectedBox = selected ? bbox(selected) : null;

  return (
    <div className="relative h-full w-full bg-neutral-100">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="nodrag h-full w-full touch-none outline-none"
        style={{ cursor: tool === "select" ? "default" : "crosshair" }}
        tabIndex={0}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <rect x={0} y={0} width={SKETCH_WIDTH} height={SKETCH_HEIGHT} fill="white" />
        {elements.map((el) => (
          <g
            key={el.id}
            style={{ pointerEvents: tool === "select" ? "auto" : "none", cursor: "move" }}
            onPointerDown={(event) => onElementPointerDown(event, el)}
          >
            <ElementShape el={el} />
          </g>
        ))}
        {selected && selectedBox && (
          <>
            <rect
              x={selectedBox.x - 4}
              y={selectedBox.y - 4}
              width={selectedBox.w + 8}
              height={selectedBox.h + 8}
              fill="none"
              stroke={SELECTION_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            {isLinear(selected.kind) ? (
              <>
                <rect
                  x={selected.x - HANDLE_SIZE / 2}
                  y={selected.y - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  fill="white"
                  stroke={SELECTION_COLOR}
                  style={{ cursor: "move" }}
                  onPointerDown={(event) => onHandlePointerDown(event, selected, "line-start")}
                />
                <rect
                  x={selected.x + selected.w - HANDLE_SIZE / 2}
                  y={selected.y + selected.h - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  fill="white"
                  stroke={SELECTION_COLOR}
                  style={{ cursor: "move" }}
                  onPointerDown={(event) => onHandlePointerDown(event, selected, "line-end")}
                />
              </>
            ) : (
              <rect
                x={selected.x + selected.w - HANDLE_SIZE / 2}
                y={selected.y + selected.h - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                fill="white"
                stroke={SELECTION_COLOR}
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(event) => onHandlePointerDown(event, selected, "resize")}
              />
            )}
          </>
        )}
      </svg>
      {!elements.length && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-400">
          pick a tool in the sidebar, then click or drag here
        </p>
      )}
    </div>
  );
}

/** The sidebar for the wire tab: tool palette plus controls for the selection. */
export function WireframeToolbar({
  elements,
  tool,
  selectedId,
  onToolChange,
  onSelect,
  onChange,
}: {
  elements: WireframeElement[];
  tool: WireframeTool;
  selectedId: string | null;
  onToolChange: (tool: WireframeTool) => void;
  onSelect: (id: string | null) => void;
  onChange: (elements: WireframeElement[]) => void;
}) {
  const selected = elements.find((el) => el.id === selectedId) ?? null;

  function relabel(label: string) {
    if (!selected) return;
    onChange(elements.map((el) => (el.id === selected.id ? { ...el, label } : el)));
  }

  function removeSelected() {
    onChange(elements.filter((el) => el.id !== selectedId));
    onSelect(null);
  }

  function clearAll() {
    onChange([]);
    onSelect(null);
  }

  const tools: WireframeTool[] = ["select", ...WIREFRAME_KINDS];

  return (
    <div className="nodrag nowheel min-h-0 flex-1 cursor-auto space-y-4 overflow-y-auto p-3">
      <div>
        <p className="mb-1 text-neutral-400">tool</p>
        <div className="grid grid-cols-2 gap-1">
          {tools.map((t) => (
            <button
              key={t}
              className={`border px-2 py-0.5 text-left ${
                tool === t
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-300 text-neutral-400 hover:text-neutral-900"
              }`}
              onClick={() => onToolChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <div>
          <p className="mb-1 text-neutral-400">selected: {selected.kind}</p>
          {hasLabel(selected.kind) && (
            <input
              className="mb-2 w-full border border-neutral-300 px-1.5 py-0.5 outline-none focus:border-neutral-900"
              value={selected.label ?? ""}
              onChange={(e) => relabel(e.target.value)}
              placeholder="label"
              spellCheck={false}
            />
          )}
          <button className="text-neutral-500 underline hover:text-red-600" onClick={removeSelected}>
            delete
          </button>
        </div>
      )}
      {elements.length > 0 && (
        <button className="text-neutral-500 underline hover:text-red-600" onClick={clearAll}>
          clear all
        </button>
      )}
    </div>
  );
}
