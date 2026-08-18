import type { WireframeElement, WireframeKind } from "./types";

export const WIREFRAME_KINDS: WireframeKind[] = [
  "box",
  "ellipse",
  "line",
  "arrow",
  "text",
  "button",
  "input",
  "image",
];

export const WIREFRAME_STROKE = "#525252";
export const WIREFRAME_MUTED = "#a3a3a3";
export const WIREFRAME_FONT = "16px sans-serif";

export const DEFAULT_FONT_SIZE = 16;
export const FONT_SIZES = [12, 16, 24, 32, 48];

export function hasLabel(kind: WireframeKind): boolean {
  return kind === "text" || kind === "button" || kind === "input";
}

export function isLinear(kind: WireframeKind): boolean {
  return kind === "line" || kind === "arrow";
}

export function defaultLabel(kind: WireframeKind): string | undefined {
  return hasLabel(kind) ? kind : undefined;
}

/** Used when a click places an element without dragging out a size. */
export function defaultSize(kind: WireframeKind, fontSize = DEFAULT_FONT_SIZE): { w: number; h: number } {
  switch (kind) {
    case "line":
    case "arrow":
      return { w: 120, h: 0 };
    case "text":
      return { w: Math.max(120, fontSize * 6), h: Math.round(fontSize * 1.5) };
    case "button":
      return { w: 96, h: 32 };
    case "input":
      return { w: 160, h: 32 };
    default:
      return { w: 120, h: 80 };
  }
}

/** Rough width a text label paints at, so bounds cover overflow past the box. */
function labelExtent(el: WireframeElement): { w: number; h: number } {
  const fontSize = el.fontSize ?? DEFAULT_FONT_SIZE;
  return {
    w: Math.max(el.w, (el.label ?? "").length * fontSize * 0.62),
    h: Math.max(el.h, fontSize * 1.4),
  };
}

/** Normalized bounds of all elements; the canvas is infinite so nothing clamps this. */
export function wireframeBounds(
  elements: WireframeElement[]
): { x: number; y: number; w: number; h: number } | null {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const { w, h } = el.kind === "text" ? labelExtent(el) : el;
    minX = Math.min(minX, el.x, el.x + w);
    minY = Math.min(minY, el.y, el.y + h);
    maxX = Math.max(maxX, el.x, el.x + w);
    maxY = Math.max(maxY, el.y, el.y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawElement(ctx: CanvasRenderingContext2D, el: WireframeElement) {
  const { x, y, w, h } = el;
  switch (el.kind) {
    case "box":
      ctx.strokeRect(x, y, w, h);
      return;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case "line":
    case "arrow":
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      if (el.kind === "arrow") drawArrowHead(ctx, x + w, y + h, Math.atan2(h, w));
      return;
    case "text":
      ctx.fillStyle = WIREFRAME_STROKE;
      ctx.textAlign = "left";
      ctx.font = `${el.fontSize ?? DEFAULT_FONT_SIZE}px sans-serif`;
      ctx.fillText(el.label || "text", x, y + h / 2);
      ctx.font = WIREFRAME_FONT;
      return;
    case "button":
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.stroke();
      ctx.fillStyle = WIREFRAME_STROKE;
      ctx.textAlign = "center";
      ctx.fillText(el.label ?? "button", x + w / 2, y + h / 2);
      return;
    case "input":
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = WIREFRAME_MUTED;
      ctx.textAlign = "left";
      ctx.fillText(el.label ?? "input", x + 8, y + h / 2);
      return;
    case "image":
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      return;
  }
}

const RASTER_PADDING = 32;
const MAX_RASTER_WIDTH = 1600;
const MAX_RASTER_HEIGHT = 1200;

/**
 * Rasterizes a wireframe to a PNG data URL, matching the SVG editor's look.
 * The canvas is infinite, so the image covers the elements' bounds plus
 * padding, downscaled to a size a model can take as an attachment. This is
 * what gets attached to a chat when a wire-tab node is @-mentioned.
 */
export function wireframeToDataUrl(elements: WireframeElement[]): string | null {
  const bounds = wireframeBounds(elements);
  if (!bounds) return null;
  const width = bounds.w + RASTER_PADDING * 2;
  const height = bounds.h + RASTER_PADDING * 2;
  const scale = Math.min(1, MAX_RASTER_WIDTH / width, MAX_RASTER_HEIGHT / height);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(RASTER_PADDING - bounds.x, RASTER_PADDING - bounds.y);
  ctx.strokeStyle = WIREFRAME_STROKE;
  ctx.lineWidth = 2;
  ctx.font = WIREFRAME_FONT;
  ctx.textBaseline = "middle";
  for (const el of elements) drawElement(ctx, el);
  return canvas.toDataURL("image/png");
}
