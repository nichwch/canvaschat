import { withTailwind } from "./preview";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type StoredNode } from "./types";

type ExportNode = {
  x: number;
  y: number;
  width: number;
  height: number;
  model: string;
  html: string | null;
};

const VIEWER_STYLES = `
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #171717; }
  #canvas {
    position: relative; height: 100%; overflow: hidden; background-color: #fafafa;
    background-image: radial-gradient(#d4d4d4 1px, transparent 1px);
    cursor: grab; touch-action: none;
  }
  #canvas.panning { cursor: grabbing; }
  #viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  .node { position: absolute; display: flex; flex-direction: column; border: 1px solid #d4d4d4; background: #fff; }
  .node-header { padding: 8px; border-bottom: 1px solid #e5e5e5; color: #737373; }
  .node-body { position: relative; flex: 1; min-height: 0; }
  .node-body iframe { width: 100%; height: 100%; border: 0; display: block; }
  .node-empty { display: flex; height: 100%; align-items: center; justify-content: center; color: #a3a3a3; }
  #toolbar {
    position: absolute; top: 8px; left: 8px; z-index: 10; display: flex; gap: 8px;
    align-items: center; border: 1px solid #d4d4d4; background: #fff; padding: 8px;
  }
  #toolbar button {
    border: 0; padding: 0; background: none; font: inherit; color: #737373; cursor: pointer;
  }
  #toolbar button:hover { color: #171717; }
`;

const VIEWER_SCRIPT = `
  var payload = JSON.parse(document.getElementById("canvas-data").textContent);
  var canvas = document.getElementById("canvas");
  var viewport = document.getElementById("viewport");
  var view = { x: 0, y: 0, zoom: 1 };
  var MIN_ZOOM = 0.1;
  var MAX_ZOOM = 2;
  var GRID = 16;

  function applyView() {
    viewport.style.transform =
      "translate(" + view.x + "px," + view.y + "px) scale(" + view.zoom + ")";
    canvas.style.backgroundSize = GRID * view.zoom + "px " + GRID * view.zoom + "px";
    canvas.style.backgroundPosition = view.x + "px " + view.y + "px";
  }

  function fitView() {
    if (!payload.nodes.length) { view = { x: 0, y: 0, zoom: 1 }; applyView(); return; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    payload.nodes.forEach(function (n) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });
    var bounds = { width: maxX - minX, height: maxY - minY };
    var zoom = Math.min(
      (canvas.clientWidth / bounds.width) * 0.9,
      (canvas.clientHeight / bounds.height) * 0.9,
      1
    );
    view.zoom = Math.max(zoom, MIN_ZOOM);
    view.x = (canvas.clientWidth - bounds.width * view.zoom) / 2 - minX * view.zoom;
    view.y = (canvas.clientHeight - bounds.height * view.zoom) / 2 - minY * view.zoom;
    applyView();
  }

  function zoomAt(cx, cy, factor) {
    var next = Math.min(Math.max(view.zoom * factor, MIN_ZOOM), MAX_ZOOM);
    var scale = next / view.zoom;
    view.x = cx - (cx - view.x) * scale;
    view.y = cy - (cy - view.y) * scale;
    view.zoom = next;
    applyView();
  }

  function renderNode(n) {
    var node = document.createElement("div");
    node.className = "node";
    node.style.left = n.x + "px";
    node.style.top = n.y + "px";
    node.style.width = n.width + "px";
    node.style.height = n.height + "px";

    var header = document.createElement("div");
    header.className = "node-header";
    header.textContent = n.model;
    node.appendChild(header);

    var body = document.createElement("div");
    body.className = "node-body";
    if (n.html) {
      var frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", "preview");
      frame.srcdoc = n.html;
      body.appendChild(frame);
    } else {
      var empty = document.createElement("div");
      empty.className = "node-empty";
      empty.textContent = "nothing rendered";
      body.appendChild(empty);
    }
    node.appendChild(body);
    viewport.appendChild(node);
  }

  var pan = null;

  canvas.addEventListener("pointerdown", function (e) {
    if (e.target !== canvas) return;
    pan = { pointerId: e.pointerId, x: e.clientX - view.x, y: e.clientY - view.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("panning");
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    view.x = e.clientX - pan.x;
    view.y = e.clientY - pan.y;
    applyView();
  });

  canvas.addEventListener("pointerup", function (e) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    pan = null;
    canvas.classList.remove("panning");
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", function () {
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.2);
  });
  document.getElementById("zoom-out").addEventListener("click", function () {
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.2);
  });
  document.getElementById("zoom-fit").addEventListener("click", fitView);

  payload.nodes.forEach(renderNode);
  fitView();
`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildCanvasExport(name: string, nodes: StoredNode[]): string {
  const exportNodes: ExportNode[] = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    width: n.width ?? DEFAULT_NODE_WIDTH,
    height: n.height ?? DEFAULT_NODE_HEIGHT,
    model: n.data.model,
    html: n.data.html ? withTailwind(n.data.html) : null,
  }));

  // "<" is escaped so embedded documents cannot terminate the JSON script tag early.
  const payload = JSON.stringify({ nodes: exportNodes }).replace(/</g, "\\u003c");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(name)}</title>`,
    `<style>${VIEWER_STYLES}</style>`,
    "</head>",
    "<body>",
    '<div id="canvas"><div id="viewport"></div></div>',
    '<div id="toolbar">',
    `<span>${escapeHtml(name)}</span>`,
    '<button id="zoom-out" title="zoom out" aria-label="zoom out">−</button>',
    '<button id="zoom-in" title="zoom in" aria-label="zoom in">+</button>',
    '<button id="zoom-fit" title="fit view">fit</button>',
    "</div>",
    `<script id="canvas-data" type="application/json">${payload}</scr` + "ipt>",
    `<script>${VIEWER_SCRIPT}</scr` + "ipt>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function downloadCanvasExport(name: string, nodes: StoredNode[]) {
  const html = buildCanvasExport(name, nodes);
  const filename = `${name.trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "canvas"}.html`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
