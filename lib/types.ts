export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PromptNodeData = {
  model: string;
  messages: ChatMessage[];
  html: string | null;
  markdown?: string | null;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  loading?: boolean;
  error?: string | null;
};

export type StoredNode = {
  id: string;
  type: "prompt";
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: PromptNodeData;
};

export type CanvasMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

/** How `exportCanvas` arranges nodes in the generated file. */
export type ExportLayout = "stacked" | "canvas";

export const DEFAULT_MODEL = "moonshotai/kimi-k3";

export const DEFAULT_NODE_WIDTH = 720;
export const DEFAULT_NODE_HEIGHT = 440;
export const MIN_NODE_WIDTH = 360;
export const MIN_NODE_HEIGHT = 240;

export const DEFAULT_SIDEBAR_WIDTH = 240;
export const MIN_SIDEBAR_WIDTH = 160;

export const API_KEY_STORAGE_KEY = "proto:openrouter-key";
export const INSTRUCTIONS_STORAGE_KEY = "proto:instructions";
export const EXPORT_LAYOUT_STORAGE_KEY = "proto:export-layout";
