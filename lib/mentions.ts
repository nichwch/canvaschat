import type { ChatMessage, PromptNodeData } from "./types";

export type Mentionable = {
  id: string;
  name: string;
};

export type MentionPart =
  | { type: "text"; value: string }
  | { type: "mention"; name: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches against the actual node names (longest first), so names containing
 * spaces work and "@button v2" doesn't stop at "@button".
 */
function mentionPattern(names: string[]): RegExp | null {
  const candidates = names.filter((n) => n.trim());
  if (!candidates.length) return null;
  const alternatives = candidates
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`@(${alternatives})`, "g");
}

/** Splits text into plain-text runs and resolved mentions, for chip rendering. */
export function splitMentions(text: string, names: string[]): MentionPart[] {
  const pattern = mentionPattern(names);
  if (!pattern) return [{ type: "text", value: text }];

  const parts: MentionPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) parts.push({ type: "text", value: text.slice(cursor, match.index) });
    parts.push({ type: "mention", name: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts;
}

/** The last few things the user asked of a node summarize its intent well. */
function recentPrompts(messages: ChatMessage[], limit = 3): string[] {
  return messages
    .filter((m): m is ChatMessage & { role: "user" } => m.role === "user")
    .slice(-limit)
    .map((m) => m.content.slice(0, 300));
}

/**
 * Builds the context block for @mentions in a prompt: each mentioned node's
 * rendered html plus its recent prompts. Injected into the API copy of the
 * user turn only — the stored transcript keeps the raw text.
 */
export function buildMentionContext(
  prompt: string,
  nodes: { name: string; data: PromptNodeData }[]
): string | null {
  const mentioned = nodes.filter((n) => prompt.includes(`@${n.name}`));
  if (!mentioned.length) return null;

  const blocks = mentioned.map(({ name, data }) => {
    const prompts = recentPrompts(data.messages);
    return [
      `<referenced-node name=${JSON.stringify(name)}>`,
      data.html ? `<document>\n${data.html}\n</document>` : "(nothing rendered yet)",
      prompts.length ? `<recent-prompts>\n${prompts.map((p) => `- ${p}`).join("\n")}\n</recent-prompts>` : "",
      `</referenced-node>`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `The @-mentions above refer to the user's other prototypes:\n\n${blocks.join("\n\n")}`;
}
