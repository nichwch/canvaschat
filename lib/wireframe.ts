import { SKETCH_HEIGHT, SKETCH_WIDTH, type WireframeElement, type WireframeKind } from "./types";

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
export function defaultSize(kind: WireframeKind): { w: number; h: number } {
  switch (kind) {
    case "line":
    case "arrow":
      return { w: 120, h: 0 };
    case "text":
      return { w: 120, h: 24 };
    case "button":
      return { w: 96, h: 32 };
    case "input":
      return { w: 160, h: 32 };
    default:
      return { w: 120, h: 80 };
  }
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
      ctx.fillText(el.label ?? "text", x, y + h / 2);
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

/**
 * Rasterizes a wireframe to a PNG data URL, matching the SVG editor's look.
 * This is what gets attached to a chat when a wire-tab node is @-mentioned.
 */
export function wireframeToDataUrl(elements: WireframeElement[]): string | null {
  if (!elements.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = SKETCH_WIDTH;
  canvas.height = SKETCH_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
  ctx.strokeStyle = WIREFRAME_STROKE;
  ctx.lineWidth = 2;
  ctx.font = WIREFRAME_FONT;
  ctx.textBaseline = "middle";
  for (const el of elements) drawElement(ctx, el);
  return canvas.toDataURL("image/png");
}
