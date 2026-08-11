import { NextRequest, NextResponse } from "next/server";
import { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM_PROMPT = [
  "You build user interface prototypes.",
  "Reply with one complete, self-contained HTML document: inline CSS and inline JavaScript only.",
  "Tailwind CSS is already injected into every document, so use Tailwind utility classes freely and never add the Tailwind script yourself.",
  "You may use third-party libraries via script tags or ES module imports from jsdelivr/unpkg/esm.sh; always pin major versions.",
  "The document renders directly in a sandboxed iframe.",
  "Every reply fully replaces the previous document, so always output the entire document.",
  "When prior assistant messages contain HTML, that is the current document — apply the user's request as a modification of it, preserving unchanged parts unless asked otherwise.",
  "Output raw HTML only. No markdown fences, no commentary.",
].join(" ");

function stripFences(text: string): string {
  const match = text.match(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i);
  return match ? match[1] : text;
}

export async function POST(req: NextRequest) {
  const { apiKey, model, messages, instructions } = (await req.json()) as {
    apiKey?: string;
    model?: string;
    messages?: ChatMessage[];
    instructions?: string;
  };

  if (!apiKey) {
    return NextResponse.json({ error: "missing openrouter api key" }, { status: 400 });
  }
  if (!model || !messages?.length) {
    return NextResponse.json({ error: "missing model or messages" }, { status: 400 });
  }

  // User instructions from settings apply to every node, on top of the base prompt.
  const system = instructions?.trim()
    ? `${SYSTEM_PROMPT}\n\nThe user's standing instructions for every prototype:\n${instructions.trim()}`
    : SYSTEM_PROMPT;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

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
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "empty response from model" }, { status: 502 });
  }

  return NextResponse.json({ html: stripFences(content).trim() });
}
