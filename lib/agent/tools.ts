import type { DocVersion, ToolCall } from "@/lib/types";
import { withErrorReporting, withTailwind } from "@/lib/preview";

/**
 * The agent's tools all execute in the browser, where the document and its
 * versions actually live. The server only relays schemas and tool calls.
 */
export type ToolContext = {
  getHtml: () => string | null;
  setHtml: (html: string) => void;
  versions: DocVersion[];
};

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "write_document",
      description:
        "Replace the entire document with new HTML. Use for the first version or for large rewrites.",
      parameters: {
        type: "object",
        properties: {
          html: { type: "string", description: "A complete, self-contained HTML document." },
        },
        required: ["html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_document",
      description:
        "Replace an exact substring of the current document. old_str must appear exactly once; include surrounding context to disambiguate. Prefer this over write_document for small changes.",
      parameters: {
        type: "object",
        properties: {
          old_str: { type: "string", description: "Exact text to find. Must match exactly once." },
          new_str: { type: "string", description: "Text to replace it with." },
        },
        required: ["old_str", "new_str"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_render",
      description:
        "Render the current document in a sandbox and report page errors, unhandled rejections, and console.error output. Call after making changes; fix anything it reports.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_version",
      description:
        "Fetch an older saved version of the document. n=1 is the most recently saved version, n=2 the one before that.",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", minimum: 1 } },
        required: ["n"],
      },
    },
  },
];

/** How long check_render lets the document run before reporting. */
const RENDER_CHECK_MS = 2500;

function countOccurrences(haystack: string, needle: string): number {
  return needle ? haystack.split(needle).length - 1 : 0;
}

/** Errors go back to the model as results — it recovers well from a clear message. */
export async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return "error: tool arguments were not valid JSON";
  }

  switch (call.function.name) {
    case "write_document": {
      const html = args.html;
      if (typeof html !== "string" || !html.trim()) return "error: html must be a non-empty string";
      ctx.setHtml(html.trim());
      return `ok — document replaced (${html.length} chars)`;
    }

    case "edit_document": {
      const html = ctx.getHtml();
      if (!html) return "error: there is no document yet — use write_document";
      const { old_str: oldStr, new_str: newStr } = args;
      if (typeof oldStr !== "string" || typeof newStr !== "string") {
        return "error: old_str and new_str must be strings";
      }
      const count = countOccurrences(html, oldStr);
      if (count === 0) return "error: old_str was not found in the document";
      if (count > 1) return `error: old_str matched ${count} times — include more surrounding context`;
      ctx.setHtml(html.replace(oldStr, newStr));
      return "ok — edit applied";
    }

    case "check_render": {
      const html = ctx.getHtml();
      if (!html) return "error: there is no document to render";
      return checkRender(html);
    }

    case "fetch_version": {
      const n = args.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
        return "error: n must be a positive integer";
      }
      const version = ctx.versions[ctx.versions.length - n];
      if (!version) {
        return ctx.versions.length
          ? `error: only ${ctx.versions.length} saved version(s)`
          : "error: no saved versions yet";
      }
      return `version saved ${new Date(version.ts).toLocaleString()}:\n\n${version.html}`;
    }

    default:
      return `error: unknown tool ${call.function.name}`;
  }
}

/** Renders in a hidden sandboxed iframe and collects errors posted by withErrorReporting. */
function checkRender(html: string): Promise<string> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.cssText = "position:fixed;left:-10000px;width:720px;height:440px;visibility:hidden";

    const errors: string[] = [];
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === iframe.contentWindow &&
        event.data?.nonce === nonce &&
        typeof event.data.error === "string"
      ) {
        errors.push(event.data.error);
      }
    };

    window.addEventListener("message", onMessage);
    iframe.srcdoc = withErrorReporting(withTailwind(html), nonce);
    document.body.appendChild(iframe);

    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
      resolve(
        errors.length
          ? `${errors.length} error(s):\n${errors.slice(0, 10).map((e) => `- ${e}`).join("\n")}`
          : "no errors detected"
      );
    }, RENDER_CHECK_MS);
  });
}
