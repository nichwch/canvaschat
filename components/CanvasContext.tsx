"use client";

import { createContext, useContext } from "react";

/** Nodes are rendered by React Flow, so the canvas they belong to arrives by context. */
const CanvasIdContext = createContext<string | null>(null);

export const CanvasIdProvider = CanvasIdContext.Provider;

export function useCanvasId(): string {
  const id = useContext(CanvasIdContext);
  if (!id) throw new Error("useCanvasId must be used within a CanvasIdProvider");
  return id;
}
