"use client";

import type { HtmlAnnotation } from "@/lib/types";

/** Numbered chip above the prompt; hover shows the comment and highlights the marker. */
export default function AnnotationWidget({
  annotation,
  onRemove,
  onHover,
}: {
  annotation: HtmlAnnotation;
  onRemove?: () => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <span
      className="group/ann relative"
      onMouseEnter={() => onHover(annotation.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="flex h-6 min-w-6 items-center justify-center border border-neutral-900 bg-white px-1.5">
        {annotation.n}
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-48 border border-neutral-300 bg-white p-2 group-hover/ann:block">
        <span className="block truncate text-neutral-400">{annotation.label}</span>
        <span className="block whitespace-pre-wrap text-neutral-700">{annotation.comment}</span>
      </span>
      {onRemove && (
        <button
          className="absolute -top-1 -right-1 h-4 w-4 border border-neutral-300 bg-white leading-none text-neutral-500 hover:text-red-600"
          onClick={onRemove}
          title="remove annotation"
          aria-label="remove annotation"
        >
          ×
        </button>
      )}
    </span>
  );
}
