export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PromptNodeData = {
  model: string;
  messages: ChatMessage[];
  html: string | null;
  loading?: boolean;
  error?: string | null;
};

export const DEFAULT_MODEL = "anthropic/claude-fable-5";

export const API_KEY_STORAGE_KEY = "proto:openrouter-key";
export const CANVAS_STORAGE_KEY = "proto:canvas";
