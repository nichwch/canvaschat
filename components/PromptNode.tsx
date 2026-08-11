"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type ChatMessage,
  type PromptNodeData,
} from "@/lib/types";
import { getApiKey, getInstructions } from "@/lib/storage";
import { withTailwind } from "@/lib/preview";
import { markdownDocument } from "@/lib/markdown";
import { ForkIcon, SidebarIcon, TrashIcon } from "./icons";
import CodeEditor from "./CodeEditor";

export type PromptFlowNode = Node<PromptNodeData, "prompt">;

type Tab = "chat" | "source" | "md";

const TABS: Tab[] = ["chat", "source", "md"];

/** Leaves at least this much room for the preview when dragging the sidebar wider. */
const MIN_PREVIEW_WIDTH = 120;

function PromptNode({ id, data, width, selected }: NodeProps<PromptFlowNode>) {
  const { updateNodeData, deleteElements, setNodes, getNode, getZoom } =
    useReactFlow<PromptFlowNode>();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const sidebarWidth = data.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
  const collapsed = data.sidebarCollapsed ?? false;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [data.messages.length, data.loading]);

  // The md tab previews the markdown; every other tab previews the generated document.
  const srcDoc = useMemo(() => {
    if (tab === "md" && !collapsed) {
      return data.markdown?.trim() ? markdownDocument(data.markdown) : null;
    }
    return data.html ? withTailwind(data.html) : null;
  }, [tab, collapsed, data.markdown, data.html]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || data.loading) return;

    // Sync `data.html` into history so the model sees the document actually rendered.
    const history = data.messages.map((m, i) =>
      m.role === "assistant" && i === data.messages.length - 1 && data.html
        ? { ...m, content: data.html }
        : m
    );
    const seededHistory =
      data.html && !history.some((m) => m.role === "assistant")
        ? [{ role: "assistant" as const, content: data.html }, ...history]
        : history;
    const messages: ChatMessage[] = [...seededHistory, { role: "user", content: prompt }];
    setDraft("");
    updateNodeData(id, { messages, loading: true, error: null });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: getApiKey(),
          instructions: getInstructions(),
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
        error: err instanceof Error ? err.message : "request failed",
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

    const onMove = (moveEvent: PointerEvent) => {
      const next = startWidth + (moveEvent.clientX - startX) / zoom;
      updateNodeData(id, {
        sidebarWidth: Math.round(Math.min(Math.max(next, MIN_SIDEBAR_WIDTH), maxWidth)),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
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
          <input
            className="nodrag w-56 cursor-text text-neutral-500 outline-none"
            value={data.model}
            onChange={(e) => updateNodeData(id, { model: e.target.value })}
            spellCheck={false}
            title="openrouter model"
          />
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
                      onClick={() => setTab(name)}
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
                    <div className="border-t border-neutral-200 p-2">
                      <textarea
                        className="nodrag h-16 w-full resize-none outline-none placeholder:text-neutral-400"
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

                {tab === "source" && (
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
                  : tab === "md" && !collapsed
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
