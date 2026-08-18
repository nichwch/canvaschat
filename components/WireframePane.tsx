"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { type WireframeElement, type WireframeKind } from "@/lib/types";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  WIREFRAME_MUTED,
  WIREFRAME_STROKE,
  defaultLabel,
  defaultSize,
  hasLabel,
  isLinear,
  wireframeBounds,
} from "@/lib/wireframe";
import {
  ArrowToolIcon,
  BoxToolIcon,
  ButtonToolIcon,
  EllipseToolIcon,
  ImageToolIcon,
  InputToolIcon,
  LineToolIcon,
  SelectToolIcon,
  TextToolIcon,
} from "./icons";

/** "select" manipulates existing elements; every other tool places one. */
export type WireframeTool = "select" | WireframeKind;

const SELECTION_COLOR = "#3b82f6";
const HANDLE_SIZE = 10;
/** Drags shorter than this place an element at its default size instead. */
const MIN_DRAG = 8;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const GRID_SPACING = 24;
const FIT_PADDING = 48;

type Point = { x: number; y: number };

/** Pan/zoom of the infinite surface: screen = world * zoom + (x, y). */
type ViewState = { x: number; y: number; zoom: number };

type DragState =
  | {
      mode: "create" | "move" | "resize" | "line-start" | "line-end";
      id: string;
      /** World coordinates. */
      start: Point;
      origin: { x: number; y: number; w: number; h: number };
    }
  | {
      /** Panning works in screen coordinates so it is zoom-independent. */
      mode: "pan";
      start: Point;
      origin: { x: number; y: number };
    };

/** Maps a pointer event to the svg's own coordinates, absorbing the canvas zoom. */
function svgPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return { x: point.x, y: point.y };
}

function toWorld(point: Point, view: ViewState): Point {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

function arrowHeadPath(x: number, y: number, angle: number): string {
  const size = 10;
  const left = `${x - size * Math.cos(angle - Math.PI / 6)} ${y - size * Math.sin(angle - Math.PI / 6)}`;
  const right = `${x - size * Math.cos(angle + Math.PI / 6)} ${y - size * Math.sin(angle + Math.PI / 6)}`;
  return `M ${left} L ${x} ${y} L ${right}`;
}

function ElementShape({ el, hitWidth }: { el: WireframeElement; hitWidth: number }) {
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
          {/* Fat invisible twin so thin lines are clickable at any zoom. */}
          <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="transparent" strokeWidth={hitWidth} />
        </>
      );
    case "text":
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill="transparent" />
          <text
            x={x}
            y={y + h / 2}
            dominantBaseline="central"
            fill={WIREFRAME_STROKE}
            fontSize={el.fontSize ?? DEFAULT_FONT_SIZE}
            fontFamily="sans-serif"
          >
            {el.label || "text"}
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
 * The main-panel wireframe editor for a node's wire tab: an infinite surface —
 * scroll to zoom, drag empty space (or middle-drag) to pan. Drag out shapes
 * with the active tool, then move, resize, and relabel them with select; text
 * elements are typed directly on the canvas. Elements persist to the node's
 * `wireframe` data.
 */
export function WireframePane({
  elements,
  tool,
  selectedId,
  fontSize,
  onToolChange,
  onSelect,
  onChange,
}: {
  elements: WireframeElement[];
  tool: WireframeTool;
  selectedId: string | null;
  /** Applied to newly placed text elements. */
  fontSize: number;
  onToolChange: (tool: WireframeTool) => void;
  onSelect: (id: string | null) => void;
  onChange: (elements: WireframeElement[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const gridId = useId();
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = elements.find((el) => el.id === selectedId) ?? null;
  const editing = elements.find((el) => el.id === editingId && el.kind === "text") ?? null;

  function fitToContent() {
    const svg = svgRef.current;
    const bounds = wireframeBounds(elements);
    if (!svg || !bounds) {
      setView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const zoom = clampZoom(
      Math.min(
        svg.clientWidth / (bounds.w + FIT_PADDING * 2),
        svg.clientHeight / (bounds.h + FIT_PADDING * 2),
        1
      )
    );
    setView({
      x: (svg.clientWidth - bounds.w * zoom) / 2 - bounds.x * zoom,
      y: (svg.clientHeight - bounds.h * zoom) / 2 - bounds.y * zoom,
      zoom,
    });
  }

  // Start on whatever was drawn before, wherever on the infinite surface it lives.
  useEffect(() => {
    fitToContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function patch(id: string, changes: Partial<WireframeElement>) {
    onChange(elements.map((el) => (el.id === id ? { ...el, ...changes } : el)));
  }

  function beginDrag(event: React.PointerEvent, state: DragState) {
    const svg = svgRef.current!;
    svg.setPointerCapture(event.pointerId);
    svg.focus();
    dragRef.current = state;
  }

  function beginPan(event: React.PointerEvent) {
    beginDrag(event, {
      mode: "pan",
      start: svgPoint(svgRef.current!, event),
      origin: { x: view.x, y: view.y },
    });
  }

  function onWheel(event: React.WheelEvent) {
    const cursor = svgPoint(svgRef.current!, event);
    setView((current) => {
      const zoom = clampZoom(current.zoom * Math.exp(-event.deltaY * 0.0015));
      const world = toWorld(cursor, current);
      return { x: cursor.x - world.x * zoom, y: cursor.y - world.y * zoom, zoom };
    });
  }

  function onBackgroundPointerDown(event: React.PointerEvent) {
    if (event.button === 1) {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (tool === "select") {
      onSelect(null);
      beginPan(event);
      return;
    }
    const point = toWorld(svgPoint(svgRef.current!, event), view);
    const id = crypto.randomUUID();
    const label = tool === "text" ? "" : defaultLabel(tool);
    onChange([
      ...elements,
      {
        id,
        kind: tool,
        x: point.x,
        y: point.y,
        w: 0,
        h: 0,
        ...(label !== undefined ? { label } : {}),
        ...(tool === "text" ? { fontSize } : {}),
      },
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
      start: toWorld(svgPoint(svgRef.current!, event), view),
      origin: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  }

  function onElementDoubleClick(el: WireframeElement) {
    if (tool !== "select" || el.kind !== "text") return;
    onSelect(el.id);
    setEditingId(el.id);
  }

  function onHandlePointerDown(
    event: React.PointerEvent,
    el: WireframeElement,
    mode: "resize" | "line-start" | "line-end"
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    beginDrag(event, {
      mode,
      id: el.id,
      start: toWorld(svgPoint(svgRef.current!, event), view),
      origin: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "pan") {
      const point = svgPoint(svgRef.current!, event);
      setView((current) => ({
        ...current,
        x: drag.origin.x + (point.x - drag.start.x),
        y: drag.origin.y + (point.y - drag.start.y),
      }));
      return;
    }

    const el = elements.find((e) => e.id === drag.id);
    if (!el) return;
    const point = toWorld(svgPoint(svgRef.current!, event), view);
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
    if (tiny) patch(el.id, defaultSize(el.kind, fontSize));
    onSelect(el.id);
    onToolChange("select");
    if (el.kind === "text") setEditingId(el.id);
  }

  function finishEditing() {
    const el = elements.find((e) => e.id === editingId);
    setEditingId(null);
    // Text that ends up empty was abandoned; leaving invisible elements around
    // would make them impossible to select again.
    if (el && el.kind === "text" && !(el.label ?? "").trim()) {
      onChange(elements.filter((e) => e.id !== el.id));
      if (selectedId === el.id) onSelect(null);
    }
  }

  function onEditInput(el: WireframeElement, label: string) {
    const size = el.fontSize ?? DEFAULT_FONT_SIZE;
    patch(el.id, { label, w: Math.max(el.w, label.length * size * 0.62 + 8) });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !editingId) {
      event.preventDefault();
      onChange(elements.filter((el) => el.id !== selectedId));
      onSelect(null);
    }
  }

  const selectedBox = selected ? bbox(selected) : null;
  const handleSize = HANDLE_SIZE / view.zoom;
  const editingSize = editing ? (editing.fontSize ?? DEFAULT_FONT_SIZE) : DEFAULT_FONT_SIZE;
  const gridTile = GRID_SPACING * view.zoom;

  return (
    <div className="relative h-full w-full bg-white">
      <svg
        ref={svgRef}
        className="nodrag nowheel h-full w-full touch-none outline-none"
        style={{ cursor: tool === "select" ? "default" : "crosshair" }}
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <defs>
          <pattern
            id={gridId}
            width={gridTile}
            height={gridTile}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y})`}
          >
            <circle cx={gridTile / 2} cy={gridTile / 2} r={1} fill="#e5e5e5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {elements.map((el) =>
            el.id === editingId && el.kind === "text" ? null : (
              <g
                key={el.id}
                style={{ pointerEvents: tool === "select" ? "auto" : "none", cursor: "move" }}
                onPointerDown={(event) => onElementPointerDown(event, el)}
                onDoubleClick={() => onElementDoubleClick(el)}
              >
                <ElementShape el={el} hitWidth={12 / view.zoom} />
              </g>
            )
          )}
          {selected && selectedBox && selected.id !== editingId && (
            <>
              <rect
                x={selectedBox.x - 4}
                y={selectedBox.y - 4}
                width={selectedBox.w + 8}
                height={selectedBox.h + 8}
                fill="none"
                stroke={SELECTION_COLOR}
                strokeWidth={1 / view.zoom}
                strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}
                pointerEvents="none"
              />
              {isLinear(selected.kind) ? (
                <>
                  <rect
                    x={selected.x - handleSize / 2}
                    y={selected.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="white"
                    stroke={SELECTION_COLOR}
                    strokeWidth={1 / view.zoom}
                    style={{ cursor: "move" }}
                    onPointerDown={(event) => onHandlePointerDown(event, selected, "line-start")}
                  />
                  <rect
                    x={selected.x + selected.w - handleSize / 2}
                    y={selected.y + selected.h - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="white"
                    stroke={SELECTION_COLOR}
                    strokeWidth={1 / view.zoom}
                    style={{ cursor: "move" }}
                    onPointerDown={(event) => onHandlePointerDown(event, selected, "line-end")}
                  />
                </>
              ) : (
                <rect
                  x={selected.x + selected.w - handleSize / 2}
                  y={selected.y + selected.h - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="white"
                  stroke={SELECTION_COLOR}
                  strokeWidth={1 / view.zoom}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(event) => onHandlePointerDown(event, selected, "resize")}
                />
              )}
            </>
          )}
          {editing && (
            <foreignObject
              x={editing.x}
              y={editing.y}
              width={Math.max(editing.w, editingSize * 4)}
              height={Math.max(editing.h, editingSize * 1.6)}
            >
              <input
                ref={(node) => node?.focus()}
                className="nodrag h-full w-full bg-transparent outline-none"
                style={{ font: `${editingSize}px sans-serif`, color: WIREFRAME_STROKE }}
                value={editing.label ?? ""}
                placeholder="type…"
                spellCheck={false}
                onChange={(event) => onEditInput(editing, event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter" || event.key === "Escape") finishEditing();
                }}
                onBlur={finishEditing}
              />
            </foreignObject>
          )}
        </g>
      </svg>
      {elements.length > 0 && (
        <button
          className="nodrag absolute right-2 bottom-2 border border-neutral-300 bg-white px-2 py-0.5 text-neutral-500 hover:text-neutral-900"
          onClick={fitToContent}
          title="fit view to elements"
        >
          fit
        </button>
      )}
      {!elements.length && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-neutral-400">
          pick a tool in the sidebar, then click or drag here
          <br />
          scroll to zoom · drag empty space to pan
        </p>
      )}
    </div>
  );
}

const TOOL_META: { id: WireframeTool; title: string; icon: ReactNode }[] = [
  { id: "select", title: "select / move / pan", icon: <SelectToolIcon /> },
  { id: "box", title: "box", icon: <BoxToolIcon /> },
  { id: "ellipse", title: "ellipse", icon: <EllipseToolIcon /> },
  { id: "line", title: "line", icon: <LineToolIcon /> },
  { id: "arrow", title: "arrow", icon: <ArrowToolIcon /> },
  { id: "text", title: "text — type directly on the canvas", icon: <TextToolIcon /> },
  { id: "button", title: "button", icon: <ButtonToolIcon /> },
  { id: "input", title: "input", icon: <InputToolIcon /> },
  { id: "image", title: "image placeholder", icon: <ImageToolIcon /> },
];

/** The sidebar for the wire tab: tool palette plus controls for the selection. */
export function WireframeToolbar({
  elements,
  tool,
  selectedId,
  fontSize,
  onToolChange,
  onSelect,
  onChange,
  onFontSizeChange,
}: {
  elements: WireframeElement[];
  tool: WireframeTool;
  selectedId: string | null;
  fontSize: number;
  onToolChange: (tool: WireframeTool) => void;
  onSelect: (id: string | null) => void;
  onChange: (elements: WireframeElement[]) => void;
  onFontSizeChange: (size: number) => void;
}) {
  const selected = elements.find((el) => el.id === selectedId) ?? null;
  const showFontSizes = tool === "text" || selected?.kind === "text";
  const activeFontSize =
    selected?.kind === "text" ? (selected.fontSize ?? DEFAULT_FONT_SIZE) : fontSize;

  function relabel(label: string) {
    if (!selected) return;
    onChange(elements.map((el) => (el.id === selected.id ? { ...el, label } : el)));
  }

  function applyFontSize(size: number) {
    onFontSizeChange(size);
    if (selected?.kind === "text") {
      onChange(
        elements.map((el) =>
          el.id === selected.id
            ? { ...el, fontSize: size, h: Math.max(el.h, Math.round(size * 1.5)) }
            : el
        )
      );
    }
  }

  function removeSelected() {
    onChange(elements.filter((el) => el.id !== selectedId));
    onSelect(null);
  }

  function clearAll() {
    onChange([]);
    onSelect(null);
  }

  return (
    <div className="nodrag nowheel min-h-0 flex-1 cursor-auto space-y-4 overflow-y-auto p-3">
      <div>
        <p className="mb-1 text-neutral-400">tool</p>
        <div className="flex flex-wrap gap-1">
          {TOOL_META.map((meta) => (
            <button
              key={meta.id}
              className={`flex h-7 w-7 items-center justify-center border ${
                tool === meta.id
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-300 text-neutral-400 hover:text-neutral-900"
              }`}
              onClick={() => onToolChange(meta.id)}
              title={meta.title}
              aria-label={meta.title}
            >
              {meta.icon}
            </button>
          ))}
        </div>
      </div>
      {showFontSizes && (
        <div>
          <p className="mb-1 text-neutral-400">text size</p>
          <div className="flex flex-wrap gap-1">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                className={`border px-1.5 py-0.5 ${
                  activeFontSize === size
                    ? "border-neutral-900 text-neutral-900"
                    : "border-neutral-300 text-neutral-400 hover:text-neutral-900"
                }`}
                onClick={() => applyFontSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
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
