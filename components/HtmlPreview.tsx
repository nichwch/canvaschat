"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HtmlAnnotation } from "@/lib/types";
import {
  ANNOTATE_SOURCE,
  withInspector,
  type AnnotateHover,
  type AnnotateMarker,
} from "@/lib/annotate";

function toScreen(iframe: HTMLIFrameElement, x: number, y: number) {
  const rect = iframe.getBoundingClientRect();
  const sx = rect.width / (iframe.clientWidth || 1);
  const sy = rect.height / (iframe.clientHeight || 1);
  return { x: rect.left + x * sx, y: rect.top + y * sy };
}

/**
 * HTML preview iframe with an Agentation-style inspect overlay: hover shows
 * the element path, click reports a pick to the parent so it can take a comment.
 */
export default function HtmlPreview({
  srcDoc,
  title,
  annotating,
  annotations,
  highlightId,
  markersVisible,
  onHover,
  onPick,
  onLeave,
}: {
  srcDoc: string;
  title: string;
  annotating: boolean;
  annotations: HtmlAnnotation[];
  highlightId: string | null;
  markersVisible: boolean;
  onHover: (hover: AnnotateHover, screen: { x: number; y: number }) => void;
  onPick: (hover: AnnotateHover, screen: { x: number; y: number }) => void;
  onLeave: () => void;
}) {
  const nonce = useId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; label: string } | null>(null);
  const doc = useMemo(() => withInspector(srcDoc, nonce), [srcDoc, nonce]);

  const postState = useCallback(() => {
    const markers: AnnotateMarker[] = annotations.map((a) => ({
      id: a.id,
      n: a.n,
      selector: a.selector,
      highlight: a.id === highlightId,
    }));
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: ANNOTATE_SOURCE,
        nonce,
        cmd: "state",
        annotating,
        markersVisible,
        markers,
      },
      "*"
    );
  }, [annotations, annotating, highlightId, markersVisible, nonce]);

  useEffect(() => {
    postState();
  }, [postState]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.source !== ANNOTATE_SOURCE || data.nonce !== nonce) return;
      const iframe = iframeRef.current;
      if (!iframe) return;

      if (data.kind === "ready") {
        postState();
        return;
      }
      if (data.kind === "leave") {
        setCursor(null);
        onLeave();
        return;
      }
      if (data.kind !== "hover" && data.kind !== "pick") return;

      const hover: AnnotateHover = {
        label: data.label,
        selector: data.selector,
        tag: data.tag,
        text: data.text,
        cursor: data.cursor,
        rect: data.rect,
      };
      const screen = toScreen(iframe, data.cursor.x, data.cursor.y);
      if (data.kind === "hover") {
        setCursor({ x: screen.x, y: screen.y, label: hover.label });
        onHover(hover, screen);
      } else {
        setCursor(null);
        onPick(hover, screen);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [nonce, onHover, onLeave, onPick, postState]);

  return (
    <div className="nodrag nowheel relative h-full w-full">
      <iframe
        ref={iframeRef}
        className="h-full w-full"
        sandbox="allow-scripts"
        srcDoc={doc}
        title={title}
        onLoad={postState}
      />
      {annotating &&
        cursor &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] max-w-xs border border-neutral-900 bg-white px-1.5 py-0.5 text-neutral-900 shadow-sm"
            style={{ left: cursor.x + 12, top: cursor.y + 16 }}
          >
            {cursor.label}
          </div>,
          document.body
        )}
    </div>
  );
}
