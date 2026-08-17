"use client";

import { useMemo } from "react";
import type { NodeTab, WireframeElement } from "@/lib/types";
import { withTailwind } from "@/lib/preview";
import { markdownDocument } from "@/lib/markdown";
import { wireframeToDataUrl } from "@/lib/wireframe";

/** A node's current output, as needed to render a small preview of it. */
export type NodeOutput = {
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
 * The content of a preview card for a node, per its selected tab: rendered
 * document, markdown, sketch, wireframe, or photo. Fills its container; mount
 * it only while the card is visible — wireframes rasterize on render.
 */
export function NodePreviewContent({
  target,
  name,
  cardWidth,
}: {
  target: NodeOutput;
  name: string;
  cardWidth: number;
}) {
  const wireframeUrl = useMemo(
    () => (target.tab === "wire" ? wireframeToDataUrl(target.wireframe) : null),
    [target.tab, target.wireframe]
  );

  const image =
    target.tab === "draw" ? target.drawing : target.tab === "photo" ? target.photo : wireframeUrl;

  if (target.tab === "draw" || target.tab === "wire" || target.tab === "photo") {
    return image ? (
      // eslint-disable-next-line @next/next/no-img-element -- data URL preview
      <img src={image} alt={`@${name} preview`} className="h-full w-full bg-white object-contain" />
    ) : (
      <EmptyNote tab={target.tab} />
    );
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
      style={{
        width: target.width,
        height: target.height,
        transform: `scale(${cardWidth / target.width})`,
      }}
      sandbox="allow-scripts"
      srcDoc={doc}
      title={`@${name} preview`}
    />
  ) : (
    <EmptyNote tab={target.tab} />
  );
}

function EmptyNote({ tab }: { tab: NodeTab }) {
  return (
    <div className="flex h-full items-center justify-center text-neutral-400">{EMPTY_NOTES[tab]}</div>
  );
}
