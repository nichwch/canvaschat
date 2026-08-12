import { NextRequest, NextResponse } from "next/server";
import { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM_PROMPT = [
  "You are an agent that builds and edits a user interface prototype — one complete, self-contained HTML document — using tools.",
  "The document renders in a sandboxed iframe. Tailwind CSS is injected into every render, so use utility classes freely and never add the Tailwind script yourself.",
  "You may use third-party libraries via script tags or ES module imports from jsdelivr/unpkg/esm.sh; always pin major versions.",
  "Use write_document for the first version or large rewrites, and edit_document for targeted changes — prefer edits, they are much faster.",
  "After changing the document, call check_render once and fix any errors it reports.",
  "The current state of the document is provided below; user messages may include <referenced-node> blocks containing HTML from the user's other prototypes to draw from.",
  "When you are done, reply with a one or two sentence summary of what changed. Never include the document itself in your reply.",
].join(" ");

export async function POST(req: NextRequest) {
  const { apiKey, model, messages, instructions, tools, html } = (await req.json()) as {
    apiKey?: string;
    model?: string;
    messages?: ChatMessage[];
    instructions?: string;
    tools?: unknown[];
    html?: string | null;
  };

  if (!apiKey) {
    return NextResponse.json({ error: "missing openrouter api key" }, { status: 400 });
  }
  if (!model || !messages?.length) {
    return NextResponse.json({ error: "missing model or messages" }, { status: 400 });
  }

  // User instructions from settings apply to every node, on top of the base prompt.
  let system = instructions?.trim()
    ? `${SYSTEM_PROMPT}\n\nThe user's standing instructions for every prototype:\n${instructions.trim()}`
    : SYSTEM_PROMPT;
  system += html
    ? `\n\nCurrent document:\n${html}`
    : "\n\nThere is no document yet — create one with write_document.";

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // A stalled upstream request would otherwise hold the route open until maxDuration.
      signal: AbortSignal.timeout(210_000),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        ...(tools?.length ? { tools } : {}),
      }),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "openrouter timed out" : "could not reach openrouter" },
      { status: 504 }
    );
  }

  if (!res.ok) {
    const body = await res.text();
    let message = `openrouter error (${res.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {}
    return NextResponse.json({ error: message }, { status: res.status });
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    return NextResponse.json({ error: "empty response from model" }, { status: 502 });
  }

  return NextResponse.json({ message, usage: data?.usage ?? null });
}
