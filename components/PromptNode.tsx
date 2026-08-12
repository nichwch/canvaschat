"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import {
  DEFAULT_CHAT_INPUT_HEIGHT,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_CHAT_INPUT_HEIGHT,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type ChatMessage,
  type NodeTab,
  type PromptNodeData,
} from "@/lib/types";
import { CUSTOM_MODEL, MODEL_GROUPS, isKnownModel } from "@/lib/models";
import { getApiKey, getInstructions } from "@/lib/storage";
import { useCanvasId } from "./CanvasContext";
import { useDebouncedValue } from "./useDebouncedValue";
import { withTailwind } from "@/lib/preview";
import { markdownDocument } from "@/lib/markdown";
import { ForkIcon, SidebarIcon, TrashIcon } from "./icons";
import CodeEditor from "./CodeEditor";

export type PromptFlowNode = Node<PromptNodeData, "prompt">;

const TABS: NodeTab[] = ["chat", "html", "md"];

/** Leaves at least this much room for the preview when dragging the sidebar wider. */
const MIN_PREVIEW_WIDTH = 120;

/** Header plus tab bar, subtracted when working out how tall the chat input may grow. */
const SIDEBAR_CHROME_HEIGHT = 76;
/** Leaves at least this much room for the transcript when dragging the input taller. */
const MIN_CHAT_LOG_HEIGHT = 72;

/** Runs `onMove` for the duration of a pointer drag, then unhooks itself. */
function trackPointerDrag(onMove: (event: PointerEvent) => void) {
  const stop = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
}

function PromptNode({ id, data, width, height, selected }: NodeProps<PromptFlowNode>) {
  const { updateNodeData, deleteElements, setNodes, getNode, getZoom } =
    useReactFlow<PromptFlowNode>();
  const [draft, setDraft] = useState("");
  // A model saved before it was in the list — or typed by hand — opens in custom mode.
  const [customModel, setCustomModel] = useState(() => !isKnownModel(data.model));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasId = useCanvasId();

  const sidebarWidth = data.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
  const chatInputHeight = data.chatInputHeight ?? DEFAULT_CHAT_INPUT_HEIGHT;
  const collapsed = data.sidebarCollapsed ?? false;
  // Persisted, so reopening a canvas restores each node to the view it was left on.
  const tab = data.tab ?? "chat";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [data.messages.length, data.loading]);

  // Trailing values keep the iframe from reloading on every keystroke while editing.
  const previewMarkdown = useDebouncedValue(data.markdown ?? "");
  const previewHtml = useDebouncedValue(data.html ?? "");

  // The md tab previews the markdown; every other tab previews the generated
  // document. Hiding the sidebar keeps whichever tab was last selected, so the
  // preview does not change out from under you.
  const srcDoc = useMemo(() => {
    if (tab === "md") {
      return previewMarkdown.trim() ? markdownDocument(previewMarkdown) : null;
    }
    return previewHtml ? withTailwind(previewHtml) : null;
  }, [tab, previewMarkdown, previewHtml]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || data.loading) return;

    // Every assistant turn stores a full HTML document, so sending the raw
    // history balloons the prompt by a whole document per turn. Only the
    // latest render matters — send `data.html` (the document actually
    // rendered, edits included) there and a stub everywhere else.
    const lastAssistant = data.messages.findLastIndex((m) => m.role === "assistant");
    const history = data.messages.map((m, i) => {
      if (m.role !== "assistant") return m;
      if (i === lastAssistant) return data.html ? { ...m, content: data.html } : m;
      return { ...m, content: "(an earlier version of the document, since replaced)" };
    });
    const seededHistory =
      data.html && lastAssistant === -1
        ? [{ role: "assistant" as const, content: data.html }, ...history]
        : history;
    const messages: ChatMessage[] = [...seededHistory, { role: "user", content: prompt }];
    setDraft("");
    updateNodeData(id, { messages, loading: true, error: null });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Give up instead of leaving the node stuck on "generating…" forever.
        signal: AbortSignal.timeout(240_000),
        body: JSON.stringify({
          apiKey: getApiKey(),
          instructions: getInstructions(canvasId),
          model: data.model,
          messages,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "request failed");

      updateNodeData(id, {
        messages: [...messages, { role: "assistant", content: body.html }],
        html: body.html,
        loading: false,
      });
    } catch (err) {
      updateNodeData(id, {
        loading: false,
        error:
          err instanceof DOMException && err.name === "TimeoutError"
            ? "timed out after 4 minutes"
            : err instanceof Error
              ? err.message
              : "request failed",
      });
    }
  }

  function fork() {
    const node = getNode(id);
    if (!node) return;
    const nodeWidth = node.width ?? DEFAULT_NODE_WIDTH;
    const copy: PromptFlowNode = {
      id: crypto.randomUUID(),
      type: "prompt",
      position: { x: node.position.x + nodeWidth + 40, y: node.position.y },
      width: nodeWidth,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
      selected: true,
      data: { ...data, messages: [...data.messages], loading: false, error: null },
    };
    // Deselect everything else, otherwise the source node drags along with the copy.
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), copy]);
  }

  function remove() {
    deleteElements({ nodes: [{ id }] });
  }

  function startSidebarResize(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    // Pointer deltas are in screen pixels; the node is drawn at the canvas zoom level.
    const zoom = getZoom();
    const maxWidth = (width ?? DEFAULT_NODE_WIDTH) - MIN_PREVIEW_WIDTH;

    trackPointerDrag((moveEvent) => {
      const next = startWidth + (moveEvent.clientX - startX) / zoom;
      updateNodeData(id, {
        sidebarWidth: Math.round(Math.min(Math.max(next, MIN_SIDEBAR_WIDTH), maxWidth)),
      });
    });
  }

  function startChatInputResize(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = chatInputHeight;
    const zoom = getZoom();
    const maxHeight =
      (height ?? DEFAULT_NODE_HEIGHT) - SIDEBAR_CHROME_HEIGHT - MIN_CHAT_LOG_HEIGHT;

    trackPointerDrag((moveEvent) => {
      // The handle sits above the input, so dragging up grows it.
      const next = startHeight - (moveEvent.clientY - startY) / zoom;
      updateNodeData(id, {
        chatInputHeight: Math.round(
          Math.min(Math.max(next, MIN_CHAT_INPUT_HEIGHT), Math.max(maxHeight, MIN_CHAT_INPUT_HEIGHT))
        ),
      });
    });
  }

  return (
    <>
      <NodeResizer
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        isVisible={selected}
        color="#171717"
        handleStyle={{ width: 8, height: 8, borderRadius: 0 }}
      />
      <div
        className={`flex h-full w-full flex-col border bg-white ${
          selected ? "border-neutral-900" : "border-neutral-300"
        }`}
      >
        <div className="flex cursor-grab items-center gap-2 border-b border-neutral-200 p-2 active:cursor-grabbing">
          <button
            className="nodrag text-neutral-500 hover:text-neutral-900"
            onClick={() => updateNodeData(id, { sidebarCollapsed: !collapsed })}
            title={collapsed ? "show chat sidebar" : "hide chat sidebar"}
            aria-label={collapsed ? "show chat sidebar" : "hide chat sidebar"}
          >
            <SidebarIcon collapsed={collapsed} />
          </button>
          <select
            className="nodrag cursor-pointer bg-white text-neutral-500 outline-none hover:text-neutral-900"
            value={customModel ? CUSTOM_MODEL : data.model}
            onChange={(e) => {
              if (e.target.value === CUSTOM_MODEL) {
                setCustomModel(true);
                return;
              }
              setCustomModel(false);
              updateNodeData(id, { model: e.target.value });
            }}
            title="openrouter model"
          >
            {MODEL_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM_MODEL}>custom…</option>
          </select>
          {customModel && (
            <input
              className="nodrag w-56 cursor-text text-neutral-500 outline-none"
              value={data.model}
              onChange={(e) => updateNodeData(id, { model: e.target.value })}
              placeholder="provider/model"
              spellCheck={false}
              title="openrouter model slug"
            />
          )}
          <span className="flex-1" />
          <button
            className="nodrag text-neutral-500 hover:text-neutral-900"
            onClick={fork}
            title="fork"
            aria-label="fork"
          >
            <ForkIcon />
          </button>
          <button
            className="nodrag text-neutral-500 hover:text-red-600"
            onClick={remove}
            title="delete"
            aria-label="delete"
          >
            <TrashIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {!collapsed && (
            <>
              <div
                className="flex shrink-0 flex-col border-r border-neutral-200"
                style={{ width: sidebarWidth }}
              >
                <div className="flex gap-2 border-b border-neutral-200 p-2">
                  {TABS.map((name) => (
                    <button
                      key={name}
                      className={`nodrag ${
                        tab === name ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-900"
                      }`}
                      onClick={() => updateNodeData(id, { tab: name })}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {tab === "chat" && (
                  <>
                    <div className="nowheel min-h-0 flex-1 overflow-y-auto p-2">
                      {data.messages.map((m, i) =>
                        m.role === "user" ? (
                          <p key={i} className="m-2">
                            {m.content}
                          </p>
                        ) : (
                          <p key={i} className="m-2 text-neutral-400">
                            rendered
                          </p>
                        )
                      )}
                      {data.loading && <p className="m-2 text-neutral-400">generating…</p>}
                      {data.error && <p className="m-2 text-red-600">{data.error}</p>}
                      <div ref={chatEndRef} />
                    </div>
                    <div
                      className="nodrag h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-neutral-300"
                      onPointerDown={startChatInputResize}
                      title="drag to resize"
                    />
                    <div
                      className="shrink-0 border-t border-neutral-200 p-2"
                      style={{ height: chatInputHeight }}
                    >
                      <textarea
                        className="nodrag h-full w-full resize-none outline-none placeholder:text-neutral-400"
                        placeholder="describe the interface…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                {tab === "html" && (
                  <CodeEditor
                    language="html"
                    value={data.html ?? ""}
                    onChange={(html) => updateNodeData(id, { html })}
                    placeholder="no source yet"
                  />
                )}

                {tab === "md" && (
                  <CodeEditor
                    language="markdown"
                    value={data.markdown ?? ""}
                    onChange={(markdown) => updateNodeData(id, { markdown })}
                    placeholder="# write an essay…"
                  />
                )}
              </div>

              <div
                className="nodrag w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-neutral-300"
                onPointerDown={startSidebarResize}
                title="drag to resize"
              />
            </>
          )}

          <div className="min-w-0 flex-1">
            {srcDoc ? (
              <iframe
                className="h-full w-full"
                sandbox="allow-scripts"
                srcDoc={srcDoc}
                title="preview"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                {data.loading
                  ? "generating…"
                  : tab === "md"
                    ? "nothing written yet"
                    : "nothing rendered yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(PromptNode);
