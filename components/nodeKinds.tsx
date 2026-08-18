import type { NodeTab } from "@/lib/types";

/** What a node's output is, given its selected tab; chat renders html. */
export type OutputKind = "html" | "md" | "draw" | "wire" | "photo";

export function outputKind(tab: NodeTab | undefined | null): OutputKind {
  switch (tab) {
    case "md":
    case "draw":
    case "wire":
    case "photo":
      return tab;
    default:
      return "html";
  }
}

const CHIP_COLORS: Record<OutputKind, string> = {
  html: "bg-red-100 border-red-300 text-red-500",
  md: "bg-blue-100 border-blue-300 text-blue-500",
  draw: "bg-green-100 border-green-300 text-green-600",
  wire: "bg-yellow-100 border-yellow-300 text-yellow-600",
  photo: "bg-orange-100 border-orange-300 text-orange-600",
};

const TEXT_COLORS: Record<OutputKind, string> = {
  html: "text-red-500",
  md: "text-blue-500",
  draw: "text-green-600",
  wire: "text-yellow-600",
  photo: "text-orange-600",
};

/**
 * Inline SVG markup, so the same icons work both in React and in the
 * imperatively-built chips of the contenteditable composer.
 */
const ICONS: Record<OutputKind, string> = {
  html: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5 1.5 8 5 11.5"/><path d="m11 4.5 3.5 3.5-3.5 3.5"/><path d="m9.25 2.5-2.5 11"/></svg>',
  md: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M6 8h4M6 11h4"/></svg>',
  draw: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 13 .9-3.2 7.5-7.5 2.3 2.3-7.5 7.5L3 13z"/><path d="m9.9 3.8 2.3 2.3"/></svg>',
  wire: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11"/></svg>',
  photo:
    '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10"/><circle cx="10.5" cy="6.5" r="1"/><path d="m2.5 11 3.5-3.5 3 3 2-2 2.5 2.5"/></svg>',
};

export const MENTION_CHIP_BASE = "mention-chip mx-0.5 px-1.5 border";

export function mentionChipClass(kind: OutputKind): string {
  return `${MENTION_CHIP_BASE} ${CHIP_COLORS[kind]}`;
}

/** Fallback style for chips whose node has been deleted or renamed. */
export const MENTION_CHIP_MISSING = `${MENTION_CHIP_BASE} ${CHIP_COLORS.html} opacity-50`;

export function kindIconSvg(kind: OutputKind): string {
  return ICONS[kind];
}

export function kindTextClass(kind: OutputKind): string {
  return TEXT_COLORS[kind];
}

export function KindIcon({ kind, className }: { kind: OutputKind; className?: string }) {
  return (
    <span
      className={`inline-flex align-[-1px] ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: ICONS[kind] }}
    />
  );
}
