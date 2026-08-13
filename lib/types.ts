/** OpenAI-style function call, as OpenRouter returns it. */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "user"; content: string; images?: string[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
      /** Provider reasoning blocks; some models require them back mid-run. */
      reasoning_details?: Record<string, unknown>[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/** A superseded document, snapshotted whenever a generation replaces `html`. */
export type DocVersion = {
  html: string;
  ts: number;
};

/** How hard the model may think before acting; "off" disables reasoning. */
export type ReasoningEffort = "off" | "low" | "medium" | "high";

export const REASONING_EFFORTS: ReasoningEffort[] = ["off", "low", "medium", "high"];
export const DEFAULT_REASONING: ReasoningEffort = "low";

/** Token totals for a node's most recent agent run, updated live per step. */
export type RunUsage = {
  promptTokens: number;
  completionTokens: number;
  steps: number;
};

/** Which editor a node's sidebar is showing, and so what its preview renders. */
export type NodeTab = "chat" | "html" | "md";

export type PromptNodeData = {
  model: string;
  messages: ChatMessage[];
  html: string | null;
  markdown?: string | null;
  /** Referenced from other nodes' chats as @name. */
  name?: string;
  versions?: DocVersion[];
  usage?: RunUsage;
  reasoning?: ReasoningEffort;
  tab?: NodeTab;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  chatInputHeight?: number;
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

export const DEFAULT_CHAT_INPUT_HEIGHT = 80;
export const MIN_CHAT_INPUT_HEIGHT = 48;

export const MAX_VERSIONS = 20;
export const MAX_AGENT_STEPS = 10;

/** Only the header drags the node, so text elsewhere stays selectable. */
export const DRAG_HANDLE_CLASS = "node-drag-handle";
export const DRAG_HANDLE_SELECTOR = `.${DRAG_HANDLE_CLASS}`;

export const API_KEY_STORAGE_KEY = "proto:openrouter-key";
export const INSTRUCTIONS_STORAGE_KEY = "proto:instructions";
export const EXPORT_LAYOUT_STORAGE_KEY = "proto:export-layout";
