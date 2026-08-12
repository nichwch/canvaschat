import {
  MAX_AGENT_STEPS,
  type ChatMessage,
  type DocVersion,
  type RunUsage,
  type ToolCall,
} from "@/lib/types";
import { TOOL_SCHEMAS, executeToolCall, type ToolContext } from "./tools";

export type RunAgentOptions = {
  apiKey: string;
  model: string;
  instructions: string;
  /** Full transcript for the API, ending with the new user turn (mentions already expanded). */
  messages: ChatMessage[];
  html: string | null;
  versions: DocVersion[];
  signal: AbortSignal;
  /** Fires with the run's new messages and usage so the transcript updates live. */
  onUpdate?: (runMessages: ChatMessage[], usage: RunUsage) => void;
};

export type RunAgentResult = {
  /** Only the messages produced by this run (assistant turns and tool results). */
  messages: ChatMessage[];
  html: string | null;
  usage: RunUsage;
};

/**
 * The agent loop: call the model, execute any tool calls locally, feed results
 * back, repeat until it answers in plain text. The document is edited on a
 * working copy — nothing is committed if the run throws or is aborted.
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const run: ChatMessage[] = [];
  const usage: RunUsage = { promptTokens: 0, completionTokens: 0, steps: 0 };
  let working = opts.html;
  const ctx: ToolContext = {
    getHtml: () => working,
    setHtml: (html) => {
      working = html;
    },
    versions: opts.versions,
  };

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const { message, usage: stepUsage } = await requestCompletion(
      opts,
      [...opts.messages, ...run],
      working
    );
    usage.steps += 1;
    usage.promptTokens += stepUsage?.prompt_tokens ?? 0;
    usage.completionTokens += stepUsage?.completion_tokens ?? 0;
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.length
      ? message.tool_calls
      : undefined;

    if (!toolCalls) {
      // Some models ignore tools and reply with the document itself; accept it.
      const doc = extractDocument(message.content);
      if (doc) working = doc;
      run.push({ role: "assistant", content: doc ? "(rendered)" : message.content ?? null });
      opts.onUpdate?.([...run], usage);
      return { messages: run, html: working, usage };
    }

    run.push({ role: "assistant", content: message.content ?? null, tool_calls: toolCalls });
    opts.onUpdate?.([...run], usage);

    for (const call of toolCalls) {
      if (opts.signal.aborted) throw new DOMException("aborted", "AbortError");
      run.push({ role: "tool", tool_call_id: call.id, content: await executeToolCall(call, ctx) });
    }
    opts.onUpdate?.([...run], usage);
  }

  throw new Error(`stopped after ${MAX_AGENT_STEPS} steps without finishing`);
}

type CompletionMessage = { content?: string | null; tool_calls?: ToolCall[] };
type CompletionUsage = { prompt_tokens?: number; completion_tokens?: number } | null;

/** One model call via the pass-through route, retrying transient failures. */
async function requestCompletion(
  opts: RunAgentOptions,
  messages: ChatMessage[],
  html: string | null
): Promise<{ message: CompletionMessage; usage: CompletionUsage }> {
  let lastError = "request failed";

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 2000, opts.signal);

    let res: Response;
    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The run's own signal (cancel button) plus a per-request stall guard.
        signal: AbortSignal.any([opts.signal, AbortSignal.timeout(240_000)]),
        body: JSON.stringify({
          apiKey: opts.apiKey,
          model: opts.model,
          instructions: opts.instructions,
          messages,
          html,
          tools: TOOL_SCHEMAS,
        }),
      });
    } catch (err) {
      if (opts.signal.aborted) throw new DOMException("aborted", "AbortError");
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new Error("timed out after 4 minutes");
      }
      lastError = "could not reach the server";
      continue;
    }

    const body = await res.json().catch(() => null);
    if (res.ok && body?.message) {
      return { message: body.message as CompletionMessage, usage: body.usage ?? null };
    }

    lastError = body?.error ?? `request failed (${res.status})`;
    // Rate limits and upstream blips are worth retrying; anything else is not.
    if (res.status !== 429 && res.status < 500) throw new Error(lastError);
  }

  throw new Error(lastError);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function stripFences(text: string): string {
  const match = text.match(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i);
  return match ? match[1] : text;
}

/** Detects a model that answered with a raw HTML document instead of a tool call. */
function extractDocument(content: string | null | undefined): string | null {
  if (!content) return null;
  const stripped = stripFences(content).trim();
  return /^(<!doctype|<html)/i.test(stripped) ? stripped : null;
}

export function looksLikeHtmlDocument(content: string): boolean {
  return /^\s*(<!doctype|<html)/i.test(content);
}

const MAX_STORED_TOOL_RESULT = 400;
const MAX_STORED_TOOL_ARGS = 2000;

/**
 * Shrinks a finished run before it enters the stored transcript: documents in
 * write_document args and bulky tool results (fetched versions) are stubbed —
 * the model can recover any of it through fetch_version, and future turns get
 * the current document injected anyway. Earlier turns are never touched, so
 * the prompt keeps a stable, cacheable prefix.
 */
export function compactRun(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === "tool" && m.content.length > MAX_STORED_TOOL_RESULT) {
      return { ...m, content: `${m.content.slice(0, MAX_STORED_TOOL_RESULT)}… (truncated)` };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        ...m,
        tool_calls: m.tool_calls.map((call) =>
          call.function.name === "write_document" ||
          call.function.arguments.length > MAX_STORED_TOOL_ARGS
            ? {
                ...call,
                function: {
                  ...call.function,
                  arguments: JSON.stringify({ note: "(content omitted — see version history)" }),
                },
              }
            : call
        ),
      };
    }
    return m;
  });
}
