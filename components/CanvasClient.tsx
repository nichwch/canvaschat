"use client";

import dynamic from "next/dynamic";

// The canvas reads localStorage on first render, so it is client-only.
const Canvas = dynamic(() => import("./Canvas"), { ssr: false });

export default function CanvasClient({ canvasId }: { canvasId: string }) {
  return <Canvas canvasId={canvasId} />;
}
