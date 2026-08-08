"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import PromptNode, { type PromptFlowNode } from "./PromptNode";
import {
  API_KEY_STORAGE_KEY,
  CANVAS_STORAGE_KEY,
  DEFAULT_MODEL,
  type PromptNodeData,
} from "@/lib/types";

const nodeTypes = { prompt: PromptNode };

function loadNodes(): PromptFlowNode[] {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as PromptFlowNode[];
    return saved.map((n) => ({
      ...n,
      data: { ...n.data, loading: false, error: null },
    }));
  } catch {
    return [];
  }
}

function saveNodes(nodes: PromptFlowNode[]) {
  const slim = nodes.map(({ id, type, position, data }) => ({
    id,
    type,
    position,
    data: { model: data.model, messages: data.messages, html: data.html },
  }));
  localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(slim));
}

function TopBar({ onAdd }: { onAdd: () => void }) {
  const [key, setKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? "");

  function updateKey(value: string) {
    setKey(value);
    localStorage.setItem(API_KEY_STORAGE_KEY, value);
  }

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-2 border border-neutral-300 bg-white p-2">
      <span>proto</span>
      <button className="text-neutral-500 hover:text-neutral-900" onClick={onAdd}>
        new node
      </button>
      <input
        className="w-64 outline-none placeholder:text-neutral-400"
        type="password"
        placeholder="openrouter api key"
        value={key}
        onChange={(e) => updateKey(e.target.value)}
      />
    </div>
  );
}

function newNodeData(): PromptNodeData {
  return { model: DEFAULT_MODEL, messages: [], html: null, loading: false, error: null };
}

function CanvasInner() {
  const [nodes, setNodes] = useState<PromptFlowNode[]>(loadNodes);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    saveNodes(nodes);
  }, [nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<PromptFlowNode>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    []
  );

  const addNode = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 360 + Math.random() * 40,
      y: window.innerHeight / 2 - 220 + Math.random() * 40,
    });
    setNodes((current) => [
      ...current,
      { id: crypto.randomUUID(), type: "prompt", position, data: newNodeData() },
    ]);
  }, [screenToFlowPosition]);

  return (
    <div className="h-dvh w-dvw">
      <TopBar onAdd={addNode} />
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={1}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d4" />
      </ReactFlow>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
