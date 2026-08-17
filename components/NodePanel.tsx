"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "@/lib/types";
import type { PromptFlowNode } from "./PromptNode";
import { KindIcon, kindTextClass, outputKind } from "./nodeKinds";
import { NodePreviewContent, type NodeOutput } from "./NodePreview";

const CARD_WIDTH = 240;
const CARD_GAP = 8;
const EDGE_PADDING = 8;

function nodeOutput(node: PromptFlowNode): NodeOutput {
  return {
    tab: node.data.tab ?? "chat",
    html: node.data.html,
    markdown: node.data.markdown ?? null,
    drawing: node.data.drawing ?? null,
    wireframe: node.data.wireframe ?? [],
    photo: node.data.photo ?? null,
    width: node.width ?? DEFAULT_NODE_WIDTH,
    height: node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

/**
 * A collapsible index of every named node, sitting under the top bar. Rows are
 * colored by the node's output type; clicking pans the canvas to the node, and
 * hovering shows a preview of its current contents.
 */
export default function NodePanel({ nodes }: { nodes: PromptFlowNode[] }) {
  const { fitView } = useReactFlow();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState<{ id: string; anchor: DOMRect } | null>(null);

  const named = nodes.filter((n) => n.data.name?.trim());
  const hoveredNode = hovered ? (named.find((n) => n.id === hovered.id) ?? null) : null;

  function jumpTo(id: string) {
    fitView({ nodes: [{ id }], duration: 600, padding: 0.15, maxZoom: 1 });
  }

  const card =
    hovered && hoveredNode
      ? (() => {
          const output = nodeOutput(hoveredNode);
          const cardHeight = Math.round(output.height * (CARD_WIDTH / output.width));
          return {
            output,
            height: cardHeight,
            left: hovered.anchor.right + CARD_GAP,
            top: Math.max(
              EDGE_PADDING,
              Math.min(hovered.anchor.top, window.innerHeight - cardHeight - EDGE_PADDING)
            ),
          };
        })()
      : null;

  return (
    <div className="absolute top-[62px] left-[15px] z-10 w-48 border border-neutral-300 bg-white">
      <button
        className="flex w-full items-center justify-between p-2 text-left text-neutral-500 hover:text-neutral-900"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "show node list" : "hide node list"}
      >
        nodes
        <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed &&
        (named.length ? (
          <div className="max-h-[50vh] overflow-y-auto border-t border-neutral-200">
            {named.map((node) => {
              const kind = outputKind(node.data.tab);
              return (
                <button
                  key={node.id}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-neutral-50"
                  onClick={() => jumpTo(node.id)}
                  onMouseEnter={(e) =>
                    setHovered({ id: node.id, anchor: e.currentTarget.getBoundingClientRect() })
                  }
                  onMouseLeave={() => setHovered(null)}
                  title="jump to node"
                >
                  <KindIcon kind={kind} className={`shrink-0 ${kindTextClass(kind)}`} />
                  <span className="min-w-0 flex-1 truncate">{node.data.name!.trim()}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="border-t border-neutral-200 p-2 text-neutral-400">no named nodes yet</p>
        ))}
      {card &&
        hoveredNode &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 overflow-hidden border border-neutral-300 bg-white shadow-sm"
            style={{ left: card.left, top: card.top, width: CARD_WIDTH, height: card.height }}
          >
            <NodePreviewContent
              target={card.output}
              name={hoveredNode.data.name!.trim()}
              cardWidth={CARD_WIDTH}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
