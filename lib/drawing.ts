import { SKETCH_HEIGHT, SKETCH_WIDTH, type DrawStroke } from "./types";

/** Pan/zoom of the infinite draw surface: screen = world * zoom + (x, y). */
export type DrawView = { x: number; y: number; zoom: number };
export type Bounds = { x: number; y: number; w: number; h: number };

export const MIN_DRAW_ZOOM = 0.15;
export const MAX_DRAW_ZOOM = 6;

/** Breathing room around the content when fitting the view or rasterizing. */
const FIT_PADDING = 32;
const RASTER_PADDING = 24;
/** Rasterized sketches are read by a model, not printed — cap the long edge. */
const MAX_RASTER_DIMENSION = 1400;

/** A legacy fixed-canvas sketch occupies exactly this rect at the origin. */
export const BASE_RECT: Bounds = { x: 0, y: 0, w: SKETCH_WIDTH, h: SKETCH_HEIGHT };

export function clampDrawZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_DRAW_ZOOM), MAX_DRAW_ZOOM);
}

/** Extent of everything drawn, stroke widths included, or null when empty. */
export function drawingBounds(strokes: DrawStroke[], hasBase: boolean): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const reach = stroke.width / 2;
    for (let i = 0; i < stroke.points.length; i += 2) {
      minX = Math.min(minX, stroke.points[i] - reach);
      maxX = Math.max(maxX, stroke.points[i] + reach);
      minY = Math.min(minY, stroke.points[i + 1] - reach);
      maxY = Math.max(maxY, stroke.points[i + 1] + reach);
    }
  }

  if (hasBase) {
    minX = Math.min(minX, BASE_RECT.x);
    minY = Math.min(minY, BASE_RECT.y);
    maxX = Math.max(maxX, BASE_RECT.x + BASE_RECT.w);
    maxY = Math.max(maxY, BASE_RECT.y + BASE_RECT.h);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Centers `bounds` in a viewport of the given size, never zooming past 1:1. */
export function fitView(bounds: Bounds | null, width: number, height: number): DrawView {
  if (!bounds || !width || !height) return { x: 0, y: 0, zoom: 1 };
  const zoom = clampDrawZoom(
    Math.min(width / (bounds.w + FIT_PADDING * 2), height / (bounds.h + FIT_PADDING * 2), 1)
  );
  return {
    x: (width - bounds.w * zoom) / 2 - bounds.x * zoom,
    y: (height - bounds.h * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

/** Paints one stroke in world coordinates; the caller sets the transform. */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: DrawStroke) {
  const { points, color, width } = stroke;
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // A single point is a dot, so a click still leaves a mark.
  if (points.length === 2) {
    ctx.beginPath();
    ctx.arc(points[0], points[1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
}

export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: DrawStroke[]) {
  for (const stroke of strokes) paintStroke(ctx, stroke);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not decode sketch"));
    img.src = src;
  });
}

/**
 * Flattens the infinite surface into a PNG cropped to its content, which is
 * what @mentions, previews, and exports consume. Returns null for an empty
 * surface so downstream code can treat "nothing drawn" as absent.
 */
export async function rasterizeDrawing(
  strokes: DrawStroke[],
  base: string | null
): Promise<string | null> {
  const bounds = drawingBounds(strokes, Boolean(base));
  if (!bounds) return null;

  const width = bounds.w + RASTER_PADDING * 2;
  const height = bounds.h + RASTER_PADDING * 2;
  const scale = Math.min(1, MAX_RASTER_DIMENSION / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale + RASTER_PADDING * scale, -bounds.y * scale + RASTER_PADDING * scale);

  if (base) {
    try {
      ctx.drawImage(await loadImage(base), BASE_RECT.x, BASE_RECT.y, BASE_RECT.w, BASE_RECT.h);
    } catch {
      // A corrupt backdrop shouldn't lose the strokes drawn on top of it.
    }
  }
  paintStrokes(ctx, strokes);

  return canvas.toDataURL("image/png");
}
