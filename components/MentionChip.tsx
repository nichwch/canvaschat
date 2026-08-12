"use client";

import { useState } from "react";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "@/lib/types";
import { withTailwind } from "@/lib/preview";
import { MENTION_CHIP_CLASS } from "./MentionInput";

const CARD_WIDTH = 240;

/**
 * An @mention in the transcript. Hovering shows a live mini render of the
 * mentioned node; clicking pans the canvas to it.
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
  const [hovered, setHovered] = useState(false);

  const width = target?.width ?? DEFAULT_NODE_WIDTH;
  const height = target?.height ?? DEFAULT_NODE_HEIGHT;
  const scale = CARD_WIDTH / width;

  if (!target) {
    return (
      <span className={`${MENTION_CHIP_CLASS} opacity-50`} title="node not found">
        @{name}
      </span>
    );
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button className={`nodrag ${MENTION_CHIP_CLASS} cursor-pointer`} onClick={onJump} title="jump to node">
        @{name}
      </button>
      {hovered && (
        <span
          className="absolute bottom-full left-0 z-30 mb-1 block overflow-hidden border border-neutral-300 bg-white shadow-sm"
          style={{ width: CARD_WIDTH, height: Math.round(height * scale) }}
        >
          {target.html ? (
            <iframe
              className="pointer-events-none origin-top-left border-0"
              style={{ width, height, transform: `scale(${scale})` }}
              sandbox="allow-scripts"
              srcDoc={withTailwind(target.html)}
              title={`@${name} preview`}
            />
          ) : (
            <span className="flex h-full items-center justify-center text-neutral-400">
              nothing rendered yet
            </span>
          )}
        </span>
      )}
    </span>
  );
}
