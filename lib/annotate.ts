import type { HtmlAnnotation } from "./types";
import { injectHead } from "./preview";

export const ANNOTATE_SOURCE = "canvaschat";

export type AnnotateHover = {
  label: string;
  selector: string;
  tag: string;
  text?: string;
  cursor: { x: number; y: number };
  rect: { x: number; y: number; w: number; h: number };
};

export type AnnotateMarker = {
  id: string;
  n: number;
  selector: string;
  highlight: boolean;
};

/**
 * Runs inside the sandboxed preview iframe. Kept self-contained so it can be
 * stringified into a <script> tag; the iframe origin is unique (sandbox without
 * allow-same-origin), so the parent talks to it only via postMessage.
 */
function inspectorRuntime(nonce: string) {
  const SOURCE = "canvaschat";
  let overlay: HTMLDivElement | null = null;
  let highlight: HTMLDivElement | null = null;
  let markersLayer: HTMLDivElement | null = null;
  let annotating = false;
  let markers: AnnotateMarker[] = [];
  let markersVisible = true;
  let lastEl: Element | null = null;

  function cssEscape(value: string) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function elementLabel(el: Element) {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    const classes: string[] = [];
    for (let i = 0; i < el.classList.length && classes.length < 2; i++) {
      const c = el.classList[i];
      if (c && c.length < 40) classes.push(c);
    }
    if (classes.length) return `${tag}.${classes.join(".")}`;
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 36);
    if (text) return `${tag} "${text}"`;
    return tag;
  }

  function cssPath(el: Element) {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.documentElement && depth < 6) {
      const tag = node.tagName.toLowerCase();
      let sel = tag;
      if (node.id) {
        parts.unshift(`${tag}#${cssEscape(node.id)}`);
        break;
      }
      const classes: string[] = [];
      for (let i = 0; i < node.classList.length && classes.length < 2; i++) {
        const c = node.classList[i];
        if (c && c.length < 40 && !/\s/.test(c)) classes.push(cssEscape(c));
      }
      if (classes.length) sel += `.${classes.join(".")}`;
      const parentEl: Element | null = node.parentElement;
      if (parentEl) {
        let same = 0;
        let index = 0;
        for (let j = 0; j < parentEl.children.length; j++) {
          const sib = parentEl.children[j];
          if (sib.tagName === node.tagName) {
            same++;
            if (sib === node) index = same;
          }
        }
        if (same > 1) sel += `:nth-of-type(${index})`;
      }
      parts.unshift(sel);
      node = parentEl;
      depth++;
    }
    return parts.join(" > ");
  }

  function payload(el: Element, e: MouseEvent) {
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const r = el.getBoundingClientRect();
    return {
      source: SOURCE,
      nonce,
      label: elementLabel(el),
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      text: text || undefined,
      cursor: { x: e.clientX, y: e.clientY },
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute("data-cc-inspect", "root");
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
    highlight = document.createElement("div");
    highlight.style.cssText =
      "position:fixed;display:none;border:2px solid #171717;background:rgba(23,23,23,.06);box-sizing:border-box;";
    markersLayer = document.createElement("div");
    overlay.appendChild(highlight);
    overlay.appendChild(markersLayer);
    document.documentElement.appendChild(overlay);
  }

  function placeHighlight(el: Element | null) {
    if (!highlight) return;
    if (!el) {
      highlight.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = `${r.left}px`;
    highlight.style.top = `${r.top}px`;
    highlight.style.width = `${r.width}px`;
    highlight.style.height = `${r.height}px`;
  }

  function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.textContent = "";
    for (const m of markers) {
      let el: Element | null = null;
      try {
        el = document.querySelector(m.selector);
      } catch {
        el = null;
      }
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (m.highlight) {
        const ring = document.createElement("div");
        ring.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:2px solid #171717;background:rgba(23,23,23,.08);box-sizing:border-box;`;
        markersLayer.appendChild(ring);
      }
      if (!markersVisible) continue;
      const badge = document.createElement("div");
      badge.textContent = String(m.n);
      badge.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;transform:translate(-40%,-40%);min-width:16px;height:16px;padding:0 4px;background:${m.highlight ? "#171717" : "#fff"};color:${m.highlight ? "#fff" : "#171717"};border:1px solid #171717;font:12px/16px ui-sans-serif,system-ui,sans-serif;text-align:center;box-sizing:border-box;`;
      markersLayer.appendChild(badge);
    }
  }

  function deepest(x: number, y: number) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (overlay && overlay.contains(el)) continue;
      if (el === document.documentElement || el === document.body) continue;
      return el;
    }
    return null;
  }

  function onMove(e: MouseEvent) {
    if (!annotating) return;
    const el = deepest(e.clientX, e.clientY);
    if (el === lastEl) {
      if (el) window.parent.postMessage({ ...payload(el, e), kind: "hover" }, "*");
      return;
    }
    lastEl = el;
    placeHighlight(el);
    if (!el) {
      window.parent.postMessage({ source: SOURCE, nonce, kind: "leave" }, "*");
      return;
    }
    window.parent.postMessage({ ...payload(el, e), kind: "hover" }, "*");
  }

  function onClick(e: MouseEvent) {
    if (!annotating) return;
    e.preventDefault();
    e.stopPropagation();
    const el = deepest(e.clientX, e.clientY);
    if (!el) return;
    window.parent.postMessage({ ...payload(el, e), kind: "pick" }, "*");
  }

  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.source !== SOURCE || data.nonce !== nonce) return;
    if (data.cmd === "state") {
      annotating = !!data.annotating;
      markers = data.markers || [];
      markersVisible = data.markersVisible !== false;
      document.documentElement.style.cursor = annotating ? "crosshair" : "";
      if (!annotating) {
        lastEl = null;
        placeHighlight(null);
      }
      renderMarkers();
    }
  });

  function boot() {
    ensureOverlay();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", renderMarkers, true);
    window.addEventListener("resize", renderMarkers);
    window.parent.postMessage({ source: SOURCE, nonce, kind: "ready" }, "*");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}

/** Injects the inspect/annotate runtime into a preview document. */
export function withInspector(html: string, nonce: string): string {
  const tag = `<script>(${inspectorRuntime.toString()})(${JSON.stringify(nonce)})</script>`;
  return injectHead(html, tag);
}

/** Structured notes the model can grep; kept out of the visible composer. */
export function formatAnnotations(annotations: HtmlAnnotation[]): string {
  if (!annotations.length) return "";
  const items = annotations.map((a) => {
    const lines = [`${a.n}. \`${a.label}\``, `   selector: ${a.selector}`];
    if (a.text) lines.push(`   text: ${JSON.stringify(a.text)}`);
    lines.push(`   comment: ${a.comment}`);
    return lines.join("\n");
  });
  return [
    "The user annotated specific elements in the current HTML preview. Use each selector to find the element they mean, and apply their comment:",
    "",
    items.join("\n\n"),
  ].join("\n");
}

export function numberAnnotations(list: HtmlAnnotation[]): HtmlAnnotation[] {
  return list.map((a, i) => ({ ...a, n: i + 1 }));
}
