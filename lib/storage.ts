import {
  API_KEY_STORAGE_KEY,
  EXPORT_LAYOUT_STORAGE_KEY,
  INSTRUCTIONS_STORAGE_KEY,
  type CanvasMeta,
  type ExportLayout,
  type StoredNode,
} from "./types";

const INDEX_KEY = "proto:canvases";
const LEGACY_NODES_KEY = "proto:canvas";

const nodesKey = (canvasId: string) => `proto:canvas:${canvasId}:nodes`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** One-time move of the single pre-multi-canvas board into the canvas index. */
function migrateLegacyCanvas() {
  const legacy = localStorage.getItem(LEGACY_NODES_KEY);
  if (legacy === null) return;

  const now = Date.now();
  const meta: CanvasMeta = { id: crypto.randomUUID(), name: "untitled", createdAt: now, updatedAt: now };
  localStorage.setItem(nodesKey(meta.id), legacy);
  localStorage.setItem(INDEX_KEY, JSON.stringify([meta, ...read<CanvasMeta[]>(INDEX_KEY, [])]));
  localStorage.removeItem(LEGACY_NODES_KEY);
}

export function listCanvases(): CanvasMeta[] {
  migrateLegacyCanvas();
  return read<CanvasMeta[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCanvas(id: string): CanvasMeta | null {
  return listCanvases().find((c) => c.id === id) ?? null;
}

function writeIndex(canvases: CanvasMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(canvases));
}

export function createCanvas(name = "untitled"): CanvasMeta {
  const now = Date.now();
  const meta: CanvasMeta = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
  writeIndex([meta, ...listCanvases()]);
  return meta;
}

export function renameCanvas(id: string, name: string) {
  writeIndex(listCanvases().map((c) => (c.id === id ? { ...c, name } : c)));
}

export function deleteCanvas(id: string) {
  localStorage.removeItem(nodesKey(id));
  writeIndex(listCanvases().filter((c) => c.id !== id));
}

/** Copies a canvas and every node on it, under fresh ids. */
export function forkCanvas(id: string): CanvasMeta | null {
  const source = getCanvas(id);
  if (!source) return null;

  const now = Date.now();
  const meta: CanvasMeta = {
    id: crypto.randomUUID(),
    name: `${source.name} (fork)`,
    createdAt: now,
    updatedAt: now,
  };
  const nodes = loadNodes(id).map((n) => ({ ...n, id: crypto.randomUUID() }));
  localStorage.setItem(nodesKey(meta.id), JSON.stringify(nodes));
  writeIndex([meta, ...listCanvases()]);
  return meta;
}

export function loadNodes(canvasId: string): StoredNode[] {
  return read<StoredNode[]>(nodesKey(canvasId), []);
}

export function saveNodes(canvasId: string, nodes: StoredNode[]) {
  localStorage.setItem(nodesKey(canvasId), JSON.stringify(nodes));
  writeIndex(listCanvases().map((c) => (c.id === canvasId ? { ...c, updatedAt: Date.now() } : c)));
}

/* Settings shared across every canvas. */

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function getInstructions(): string {
  return localStorage.getItem(INSTRUCTIONS_STORAGE_KEY) ?? "";
}

export function setInstructions(instructions: string) {
  localStorage.setItem(INSTRUCTIONS_STORAGE_KEY, instructions);
}

export function getExportLayout(): ExportLayout {
  return localStorage.getItem(EXPORT_LAYOUT_STORAGE_KEY) === "canvas" ? "canvas" : "stacked";
}

export function setExportLayout(layout: ExportLayout) {
  localStorage.setItem(EXPORT_LAYOUT_STORAGE_KEY, layout);
}
