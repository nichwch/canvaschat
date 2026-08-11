"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import SettingsModal from "./SettingsModal";
import { CanvasIdProvider } from "./CanvasContext";
import { ForkIcon, GearIcon } from "./icons";
import { forkCanvas, getApiKey, getCanvas, loadNodes, renameCanvas, saveNodes } from "@/lib/storage";
import { exportCanvas, filenameFor } from "@/lib/export";
import {
  DEFAULT_MODEL,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type ExportLayout,
  type PromptNodeData,
  type StoredNode,
} from "@/lib/types";

const nodeTypes = { prompt: PromptNode };

function toFlowNodes(stored: StoredNode[]): PromptFlowNode[] {
  return stored.map((n) => ({
    ...n,
    width: n.width ?? DEFAULT_NODE_WIDTH,
    height: n.height ?? DEFAULT_NODE_HEIGHT,
    data: { ...n.data, loading: false, error: null },
  }));
}

function toStoredNodes(nodes: PromptFlowNode[]): StoredNode[] {
  return nodes.map(({ id, position, width, height, data }) => ({
    id,
    type: "prompt" as const,
    position,
    width,
    height,
    data: {
      model: data.model,
      messages: data.messages,
      html: data.html,
      markdown: data.markdown,
      tab: data.tab,
      sidebarWidth: data.sidebarWidth,
      sidebarCollapsed: data.sidebarCollapsed,
    },
  }));
}

function newNodeData(): PromptNodeData {
  return { model: DEFAULT_MODEL, messages: [], html: null, markdown: null, loading: false, error: null };
}

function TopBar({
  canvasId,
  initialName,
  onAdd,
  onOpenSettings,
}: {
  canvasId: string;
  initialName: string;
  onAdd: () => void;
  onOpenSettings: () => void;
}) {
  const [name, setName] = useState(initialName);
  const router = useRouter();

  function updateName(value: string) {
    setName(value);
    renameCanvas(canvasId, value.trim() || "untitled");
  }

  function fork() {
    const meta = forkCanvas(canvasId);
    if (meta) router.push(`/canvas/${meta.id}`);
  }

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-3 border border-neutral-300 bg-white p-2">
      <Link className="text-neutral-500 hover:text-neutral-900" href="/">
        ← canvases
      </Link>
      <input
        className="w-40 outline-none placeholder:text-neutral-400"
        value={name}
        onChange={(e) => updateName(e.target.value)}
        placeholder="untitled"
        title="canvas name"
      />
      <button className="text-neutral-500 hover:text-neutral-900" onClick={onAdd}>
        new node
      </button>
      <button
        className="text-neutral-500 hover:text-neutral-900"
        onClick={fork}
        title="fork canvas"
        aria-label="fork canvas"
      >
        <ForkIcon />
      </button>
      <button
        className="text-neutral-500 hover:text-neutral-900"
        onClick={onOpenSettings}
        title="settings"
        aria-label="settings"
      >
        <GearIcon />
      </button>
    </div>
  );
}

function CanvasInner({ canvasId, name }: { canvasId: string; name: string }) {
  const [nodes, setNodes] = useState<PromptFlowNode[]>(() => toFlowNodes(loadNodes(canvasId)));
  const [hasKey, setHasKey] = useState(() => Boolean(getApiKey()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced so dragging and resizing don't hammer localStorage on every frame.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNodes(canvasId, toStoredNodes(nodes)), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [canvasId, nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<PromptFlowNode>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    []
  );

  const addNode = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - DEFAULT_NODE_WIDTH / 2 + Math.random() * 40,
      y: window.innerHeight / 2 - DEFAULT_NODE_HEIGHT / 2 + Math.random() * 40,
    });
    setNodes((current) => [
      ...current.map((n) => ({ ...n, selected: false })),
      {
        id: crypto.randomUUID(),
        type: "prompt" as const,
        position,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        selected: true,
        data: newNodeData(),
      },
    ]);
  }, [screenToFlowPosition]);

  const buildExport = useCallback(
    (layout: ExportLayout) => {
      const currentName = getCanvas(canvasId)?.name ?? name;
      return {
        filename: filenameFor(currentName),
        html: exportCanvas(toStoredNodes(nodes), currentName, layout),
      };
    },
    [canvasId, name, nodes]
  );

  return (
    <div className="relative h-dvh w-dvw">
      <TopBar
        canvasId={canvasId}
        initialName={name}
        onAdd={addNode}
        onOpenSettings={() => setSettingsOpen(true)}
      />
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

      {/* Without a key nothing on the canvas can work, so the modal blocks until one is entered. */}
      {(!hasKey || settingsOpen) && (
        <SettingsModal
          canvasId={canvasId}
          onClose={hasKey ? () => setSettingsOpen(false) : undefined}
          buildExport={buildExport}
          onKeyChange={(key) => setHasKey(Boolean(key.trim()))}
        />
      )}
    </div>
  );
}

export default function Canvas({ canvasId }: { canvasId: string }) {
  const meta = getCanvas(canvasId);

  if (!meta) {
    return (
      <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-2">
        <p className="text-neutral-500">canvas not found</p>
        <Link className="text-neutral-500 underline hover:text-neutral-900" href="/">
          back to canvases
        </Link>
      </div>
    );
  }

  return (
    <CanvasIdProvider value={canvasId}>
      <ReactFlowProvider>
        <CanvasInner canvasId={canvasId} name={meta.name} />
      </ReactFlowProvider>
    </CanvasIdProvider>
  );
}
