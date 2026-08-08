"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { API_KEY_STORAGE_KEY, type ChatMessage, type PromptNodeData } from "@/lib/types";

export type PromptFlowNode = Node<PromptNodeData, "prompt">;

function PromptNode({ id, data, selected }: NodeProps<PromptFlowNode>) {
  const { updateNodeData, deleteElements, addNodes, getNode } = useReactFlow();
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [data.messages.length, data.loading]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || data.loading) return;

    const messages: ChatMessage[] = [...data.messages, { role: "user", content: prompt }];
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
    addNodes({
      id: crypto.randomUUID(),
      type: "prompt",
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true,
      data: {
        model: data.model,
        messages: [...data.messages],
        html: data.html,
        loading: false,
        error: null,
      },
    });
  }

  function remove() {
    deleteElements({ nodes: [{ id }] });
  }

  return (
    <div
      className={`flex h-[440px] w-[720px] flex-col border bg-white ${
        selected ? "border-neutral-900" : "border-neutral-300"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 p-2">
        <input
          className="nodrag min-w-0 flex-1 text-neutral-500 outline-none"
          value={data.model}
          onChange={(e) => updateNodeData(id, { model: e.target.value })}
          spellCheck={false}
          title="openrouter model"
        />
        <button className="nodrag text-neutral-500 hover:text-neutral-900" onClick={fork}>
          fork
        </button>
        <button className="nodrag text-neutral-500 hover:text-neutral-900" onClick={remove}>
          delete
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {data.html ? (
            <iframe
              className="h-full w-full"
              sandbox="allow-scripts"
              srcDoc={data.html}
              title="preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400">
              {data.loading ? "generating…" : "nothing rendered yet"}
            </div>
          )}
        </div>

        <div className="flex w-[240px] flex-col border-l border-neutral-200">
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
        </div>
      </div>
    </div>
  );
}

export default memo(PromptNode);
