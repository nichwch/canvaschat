"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "@/lib/types";
import { withTailwind } from "@/lib/preview";
import { MENTION_CHIP_CLASS } from "./MentionInput";

const CARD_WIDTH = 240;
const CARD_GAP = 6;
const EDGE_PADDING = 8;

/**
 * An @mention in the transcript. Hovering shows a live mini render of the
 * mentioned node; clicking pans the canvas to it. The card renders through a
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
  target: { html: string | null; width: number; height: number } | null;
  onJump: () => void;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

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
            {target.html ? (
              <iframe
                className="origin-top-left border-0"
                style={{ width, height, transform: `scale(${scale})` }}
                sandbox="allow-scripts"
                srcDoc={withTailwind(target.html)}
                title={`@${name} preview`}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                nothing rendered yet
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
