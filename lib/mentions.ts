import type { ChatMessage, NodeTab, PromptNodeData } from "./types";
import { wireframeToDataUrl } from "./wireframe";

export type Mentionable = {
  id: string;
  name: string;
  /** Colors the chip and picks its icon by the node's output type. */
  tab: NodeTab;
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

export type MentionContext = {
  text: string;
  /** Image outputs of mentioned nodes, in the order their blocks appear in `text`. */
  images: string[];
};

/**
 * A node's output follows its selected tab: chat and html send the rendered
 * document, md sends the markdown, and draw/wire/photo attach an image.
 */
function nodeOutput(data: PromptNodeData): { text: string; image?: string } {
  switch (data.tab ?? "chat") {
    case "md":
      return data.markdown?.trim()
        ? { text: `<document type="markdown">\n${data.markdown}\n</document>` }
        : { text: "(nothing written yet)" };
    case "draw":
      return data.drawing
        ? { text: "(output: a hand-drawn sketch, attached to this message as an image)", image: data.drawing }
        : { text: "(nothing drawn yet)" };
    case "wire": {
      const image = wireframeToDataUrl(data.wireframe ?? []);
      return image
        ? { text: "(output: a wireframe, attached to this message as an image)", image }
        : { text: "(empty wireframe)" };
    }
    case "photo": {
      const image = data.photoMarked ?? data.photo;
      return image
        ? { text: "(output: an uploaded photo, attached to this message as an image)", image }
        : { text: "(no photo uploaded yet)" };
    }
    default:
      return data.html
        ? { text: `<document>\n${data.html}\n</document>` }
        : { text: "(nothing rendered yet)" };
  }
}

/**
 * Builds the context for @mentions in a prompt: each mentioned node's output
 * (per its selected tab) plus its recent prompts. Image outputs are returned
 * separately for attachment. Injected into the API copy of the user turn
 * only — the stored transcript keeps the raw text.
 */
export function buildMentionContext(
  prompt: string,
  nodes: { name: string; data: PromptNodeData }[]
): MentionContext | null {
  const mentioned = nodes.filter((n) => prompt.includes(`@${n.name}`));
  if (!mentioned.length) return null;

  const images: string[] = [];
  const blocks = mentioned.map(({ name, data }) => {
    const output = nodeOutput(data);
    if (output.image) images.push(output.image);
    const prompts = recentPrompts(data.messages);
    return [
      `<referenced-node name=${JSON.stringify(name)}>`,
      output.text,
      prompts.length ? `<recent-prompts>\n${prompts.map((p) => `- ${p}`).join("\n")}\n</recent-prompts>` : "",
      `</referenced-node>`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const intro = images.length
    ? "The @-mentions above refer to the user's other nodes. Image outputs are attached to this message after any images the user attached themselves, in the order the nodes appear below:"
    : "The @-mentions above refer to the user's other nodes:";
  return { text: `${intro}\n\n${blocks.join("\n\n")}`, images };
}
