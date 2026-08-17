"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type NodeTab,
  type WireframeElement,
} from "@/lib/types";
import { withTailwind } from "@/lib/preview";
import { markdownDocument } from "@/lib/markdown";
import { wireframeToDataUrl } from "@/lib/wireframe";
import { MENTION_CHIP_CLASS } from "./MentionInput";

const CARD_WIDTH = 240;
const CARD_GAP = 6;
const EDGE_PADDING = 8;

export type MentionTarget = {
  tab: NodeTab;
  html: string | null;
  markdown: string | null;
  drawing: string | null;
  wireframe: WireframeElement[];
  photo: string | null;
  width: number;
  height: number;
};

const EMPTY_NOTES: Record<NodeTab, string> = {
  chat: "nothing rendered yet",
  html: "nothing rendered yet",
  md: "nothing written yet",
  draw: "nothing drawn yet",
  wire: "empty wireframe",
  photo: "no photo yet",
};

/**
 * An @mention in the transcript. Hovering shows the mentioned node's current
 * output — rendered document, markdown, sketch, wireframe, or photo, per its
 * selected tab; clicking pans the canvas to it. The card renders through a
 * portal in screen coordinates — inside the node it would be clipped by the
 * transcript's scroll container and scaled by the canvas zoom.
 */
export default function MentionChip({
  name,
  target,
  onJump,
}: {
  name: string;
  /** null when the mentioned node has been deleted or renamed. */
  target: MentionTarget | null;
  onJump: () => void;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  // Rasterized lazily — only while a card for a wire-tab node is showing.
  const wireframeUrl = useMemo(
    () => (anchor && target?.tab === "wire" ? wireframeToDataUrl(target.wireframe) : null),
    [anchor, target]
  );

  if (!target) {
    return (
      <span className={`${MENTION_CHIP_CLASS} opacity-50`} title="node not found">
        @{name}
      </span>
    );
  }

  const width = target.width || DEFAULT_NODE_WIDTH;
  const height = target.height || DEFAULT_NODE_HEIGHT;
  const scale = CARD_WIDTH / width;
  const cardHeight = Math.round(height * scale);

  // Above the chip when there's room, below otherwise; clamped to the viewport.
  const card = anchor
    ? {
        left: Math.max(
          EDGE_PADDING,
          Math.min(anchor.left, window.innerWidth - CARD_WIDTH - EDGE_PADDING)
        ),
        top:
          anchor.top - CARD_GAP - cardHeight >= EDGE_PADDING
            ? anchor.top - CARD_GAP - cardHeight
            : anchor.bottom + CARD_GAP,
      }
    : null;

  function cardContent() {
    if (!target) return null;
    const image =
      target.tab === "draw" ? target.drawing : target.tab === "photo" ? target.photo : wireframeUrl;
    if (target.tab === "draw" || target.tab === "wire" || target.tab === "photo") {
      return image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL preview
        <img src={image} alt={`@${name} preview`} className="h-full w-full bg-white object-contain" />
      ) : null;
    }
    const doc =
      target.tab === "md"
        ? target.markdown?.trim()
          ? markdownDocument(target.markdown)
          : null
        : target.html
          ? withTailwind(target.html)
          : null;
    return doc ? (
      <iframe
        className="origin-top-left border-0"
        style={{ width, height, transform: `scale(${scale})` }}
        sandbox="allow-scripts"
        srcDoc={doc}
        title={`@${name} preview`}
      />
    ) : null;
  }

  return (
    <>
      <button
        ref={chipRef}
        className={`nodrag ${MENTION_CHIP_CLASS} cursor-pointer`}
        onClick={onJump}
        onMouseEnter={() => setAnchor(chipRef.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setAnchor(null)}
        title="jump to node"
      >
        @{name}
      </button>
      {card &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 overflow-hidden border border-neutral-300 bg-white shadow-sm"
            style={{ left: card.left, top: card.top, width: CARD_WIDTH, height: cardHeight }}
          >
            {cardContent() ?? (
              <div className="flex h-full items-center justify-center text-neutral-400">
                {EMPTY_NOTES[target.tab]}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
