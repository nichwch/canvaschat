"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import {
  API_KEY_STORAGE_KEY,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  type ChatMessage,
  type PromptNodeData,
} from "@/lib/types";
import { withTailwind } from "@/lib/preview";
import { ForkIcon, TrashIcon } from "./icons";
import HtmlEditor from "./HtmlEditor";

export type PromptFlowNode = Node<PromptNodeData, "prompt">;

function PromptNode({ id, data, selected }: NodeProps<PromptFlowNode>) {
  const { updateNodeData, deleteElements, setNodes, getNode } = useReactFlow<PromptFlowNode>();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"chat" | "source">("chat");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [data.messages.length, data.loading]);

  const srcDoc = useMemo(() => (data.html ? withTailwind(data.html) : null), [data.html]);

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
          apiKey: localStorage.getItem(API_KEY_STORAGE_KEY) ?? "",
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
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const copy: PromptFlowNode = {
      id: crypto.randomUUID(),
      type: "prompt",
      position: { x: node.position.x + width + 40, y: node.position.y },
      width,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
      selected: true,
      data: {
        model: data.model,
        messages: [...data.messages],
        html: data.html,
        loading: false,
        error: null,
      },
    };
    // Deselect everything else, otherwise the source node drags along with the copy.
    setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), copy]);
  }

  function remove() {
    deleteElements({ nodes: [{ id }] });
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
          <input
            className="nodrag w-64 cursor-text text-neutral-500 outline-none"
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
          <div className="flex w-[240px] shrink-0 flex-col border-r border-neutral-200">
            <div className="flex gap-2 border-b border-neutral-200 p-2">
              <button
                className={`nodrag ${tab === "chat" ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-900"}`}
                onClick={() => setTab("chat")}
              >
                chat
              </button>
              <button
                className={`nodrag ${tab === "source" ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-900"}`}
                onClick={() => setTab("source")}
              >
                source
              </button>
            </div>

            {tab === "chat" ? (
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
            ) : (
              <HtmlEditor
                value={data.html ?? ""}
                onChange={(html) => updateNodeData(id, { html })}
                placeholder="no source yet"
              />
            )}
          </div>

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
                {data.loading ? "generating…" : "nothing rendered yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(PromptNode);
