import type { ToolCall } from "@/lib/types";

export type CompletionMessage = {
  content?: string | null;
  tool_calls?: ToolCall[];
  /** Provider reasoning blocks; passed back verbatim on multi-step tool runs. */
  reasoning_details?: Record<string, unknown>[];
};
export type CompletionUsage = { prompt_tokens?: number; completion_tokens?: number } | null;

export type AssembledCompletion = {
  message: CompletionMessage;
  usage: CompletionUsage;
  finishReason: string | null;
};

type ToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type StreamEvent = {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: Record<string, unknown>[];
      tool_calls?: ToolCallDelta[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Reasoning details stream like tool calls: merge by index, concatenating text. */
function mergeReasoningDetail(
  into: Record<string, unknown>[],
  detail: Record<string, unknown>,
  index: number
) {
  const existing = into[index] ?? {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(detail)) {
    merged[key] =
      typeof value === "string" && typeof existing[key] === "string" && key !== "id" && key !== "format"
        ? (existing[key] as string) + value
        : value ?? existing[key];
  }
  into[index] = merged;
}

/**
 * Consumes an OpenAI-style SSE completion stream and assembles the final
 * message. Streaming exists only to report progress — `onProgress` fires as
 * chunks arrive, and nothing partial is ever handed to the caller.
 */
export async function assembleCompletion(
  body: ReadableStream<Uint8Array>,
  onProgress: (chunks: number, tool: string | null) => void,
  onActivity?: () => void
): Promise<AssembledCompletion> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let usage: CompletionUsage = null;
  let finishReason: string | null = null;
  let chunks = 0;
  let reported = 0;
  // What the model was last doing, for the progress label.
  let phase: string | null = null;
  const reasoningDetails: Record<string, unknown>[] = [];

  // Providers differ on whether tool-call deltas carry an index; when it is
  // missing the call is a continuation of the one being assembled.
  const calls: { id: string; name: string; args: string }[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onActivity?.();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let event: StreamEvent;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        if (event.usage) usage = event.usage;
        const choice = event.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;

        const delta = choice?.delta;
        if (delta?.content) {
          content += delta.content;
          chunks++;
          phase = null;
        }
        // Reasoning models think before answering; count it so the UI moves.
        if (delta?.reasoning) {
          chunks++;
          phase = "thinking";
        }
        delta?.reasoning_details?.forEach((detail, i) => {
          const index = typeof detail.index === "number" ? detail.index : i;
          mergeReasoningDetail(reasoningDetails, detail, index);
        });

        for (const delta_call of delta?.tool_calls ?? []) {
          const index = delta_call.index ?? Math.max(calls.length - 1, 0);
          const existing = calls[index] ?? { id: "", name: "", args: "" };
          calls[index] = {
            id: delta_call.id || existing.id,
            name: delta_call.function?.name || existing.name,
            args: existing.args + (delta_call.function?.arguments ?? ""),
          };
          chunks++;
          phase = calls[index].name || phase;
        }
      }

      // Throttled so progress updates don't flood the client.
      if (chunks - reported >= 15) {
        reported = chunks;
        onProgress(chunks, phase);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  const toolCalls: ToolCall[] = calls
    .filter(Boolean)
    .map((call, i) => ({
      id: call.id || `call_${i}`,
      type: "function" as const,
      function: { name: call.name, arguments: call.args },
    }))
    .filter((call) => call.function.name);

  const details = reasoningDetails.filter(Boolean);
  return {
    message: {
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(details.length ? { reasoning_details: details } : {}),
    },
    usage,
    finishReason,
  };
}
