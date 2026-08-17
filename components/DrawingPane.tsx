"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { SKETCH_HEIGHT, SKETCH_WIDTH } from "@/lib/types";

export type DrawingTool = "brush" | "eraser";

export type DrawingSettings = {
  color: string;
  size: number;
  tool: DrawingTool;
};

export type DrawingPaneHandle = {
  undo: () => void;
  clear: () => void;
};

export const DRAWING_COLORS = [
  "#171717",
  "#737373",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

export const BRUSH_SIZES = [2, 4, 8, 16];

export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  color: DRAWING_COLORS[0],
  size: 4,
  tool: "brush",
};

/** The eraser is just a fat white brush — the surface is flattened onto white. */
const ERASER_SCALE = 4;
const MAX_UNDO = 20;

/** Repaints the canvas from a stored data URL (or to blank white for null). */
function paint(canvas: HTMLCanvasElement | null, src: string | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
  if (!src) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0);
  img.src = src;
}

/**
 * Maps a pointer event to canvas coordinates. The canvas is displayed with
 * object-fit: contain, so the content box must be worked out from the aspect
 * ratio; this also absorbs the React Flow zoom transform.
 */
function canvasPoint(canvas: HTMLCanvasElement, event: React.PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / SKETCH_WIDTH, rect.height / SKETCH_HEIGHT);
  const left = rect.left + (rect.width - SKETCH_WIDTH * scale) / 2;
  const top = rect.top + (rect.height - SKETCH_HEIGHT * scale) / 2;
  return { x: (event.clientX - left) / scale, y: (event.clientY - top) / scale };
}

/**
 * The main-panel drawing surface for a node's draw tab. Strokes commit to the
 * node's `drawing` data URL on pointer-up; undo/clear are driven from the
 * sidebar toolbar through `handleRef`.
 */
export function DrawingPane({
  drawing,
  settings,
  onCommit,
  handleRef,
}: {
  drawing: string | null;
  settings: DrawingSettings;
  onCommit: (drawing: string | null) => void;
  handleRef: Ref<DrawingPaneHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The drawing value this pane last wrote or loaded, to detect external changes. */
  const committedRef = useRef<string | null | undefined>(undefined);
  const undoRef = useRef<(string | null)[]>([]);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (drawing === committedRef.current) return;
    committedRef.current = drawing;
    paint(canvasRef.current, drawing);
  }, [drawing]);

  useImperativeHandle(handleRef, () => ({
    undo() {
      const previous = undoRef.current.pop();
      if (previous === undefined) return;
      committedRef.current = previous;
      paint(canvasRef.current, previous);
      onCommit(previous);
    },
    clear() {
      if (committedRef.current === null) return;
      undoRef.current = [...undoRef.current, committedRef.current ?? null].slice(-MAX_UNDO);
      committedRef.current = null;
      paint(canvasRef.current, null);
      onCommit(null);
    },
  }));

  function strokeStyle() {
    const eraser = settings.tool === "eraser";
    return {
      color: eraser ? "#fff" : settings.color,
      width: eraser ? settings.size * ERASER_SCALE : settings.size,
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(event.pointerId);
    undoRef.current = [...undoRef.current, committedRef.current ?? null].slice(-MAX_UNDO);

    const point = canvasPoint(canvas, event);
    lastPointRef.current = point;
    // A dot right away, so single clicks leave a mark.
    const { color, width } = strokeStyle();
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onPointerMove(event: React.PointerEvent) {
    const last = lastPointRef.current;
    if (!last) return;
    const canvas = canvasRef.current!;
    const point = canvasPoint(canvas, event);
    const { color, width } = strokeStyle();
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function onPointerUp() {
    if (!lastPointRef.current) return;
    lastPointRef.current = null;
    const url = canvasRef.current!.toDataURL("image/png");
    committedRef.current = url;
    onCommit(url);
  }

  return (
    <div className="h-full w-full bg-neutral-100">
      <canvas
        ref={canvasRef}
        width={SKETCH_WIDTH}
        height={SKETCH_HEIGHT}
        className="nodrag h-full w-full cursor-crosshair touch-none"
        style={{ objectFit: "contain" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

/** The sidebar for the draw tab: color, brush size, brush/eraser, undo/clear. */
export function DrawingToolbar({
  settings,
  onChange,
  onUndo,
  onClear,
}: {
  settings: DrawingSettings;
  onChange: (settings: DrawingSettings) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="nodrag nowheel min-h-0 flex-1 cursor-auto space-y-4 overflow-y-auto p-3">
      <div>
        <p className="mb-1 text-neutral-400">color</p>
        <div className="flex flex-wrap gap-1">
          {DRAWING_COLORS.map((color) => (
            <button
              key={color}
              className={`h-6 w-6 border ${
                settings.color === color && settings.tool === "brush"
                  ? "border-neutral-900 ring-1 ring-neutral-900"
                  : "border-neutral-300"
              }`}
              style={{ background: color }}
              onClick={() => onChange({ ...settings, color, tool: "brush" })}
              title={color}
              aria-label={`color ${color}`}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-neutral-400">size</p>
        <div className="flex gap-1">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              className={`flex h-7 w-7 items-center justify-center border ${
                settings.size === size
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-300 text-neutral-400 hover:text-neutral-900"
              }`}
              onClick={() => onChange({ ...settings, size })}
              title={`${size}px`}
              aria-label={`brush size ${size}px`}
            >
              <span className="rounded-full bg-current" style={{ width: size, height: size }} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-neutral-400">tool</p>
        <div className="flex gap-1">
          {(["brush", "eraser"] as const).map((tool) => (
            <button
              key={tool}
              className={`border px-2 py-0.5 ${
                settings.tool === tool
                  ? "border-neutral-900 text-neutral-900"
                  : "border-neutral-300 text-neutral-400 hover:text-neutral-900"
              }`}
              onClick={() => onChange({ ...settings, tool })}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button className="text-neutral-500 underline hover:text-neutral-900" onClick={onUndo}>
          undo
        </button>
        <button className="text-neutral-500 underline hover:text-red-600" onClick={onClear}>
          clear
        </button>
      </div>
    </div>
  );
}
