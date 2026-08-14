"use client";

import { useMemo, useState } from "react";
import {
  getApiKey,
  getExportLayout,
  getInstructions,
  setApiKey,
  setExportLayout,
  setInstructions,
} from "@/lib/storage";
import type { ExportLayout } from "@/lib/types";
import FolderSettings from "./FolderSettings";
import { DownloadIcon } from "./icons";

/** Minimal shape of the File System Access API bit we use; not in the default TS lib. */
type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

const LAYOUTS: { value: ExportLayout; label: string; hint: string }[] = [
  { value: "stacked", label: "stacked document", hint: "nodes in reading order, full width" },
  { value: "canvas", label: "faithful canvas", hint: "exact positions, cropped to your nodes" },
];

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function SettingsModal({
  canvasId,
  onClose,
  buildExport,
  onKeyChange,
  onCanvasesChanged,
}: {
  /** Omitted on the home page, where no single canvas is in scope. */
  canvasId?: string;
  /** Omitted when the modal is blocking on a missing api key. */
  onClose?: () => void;
  /** Omitted on the home page. Returns the file to offer, it does not download it. */
  buildExport?: (layout: ExportLayout) => { filename: string; html: string };
  onKeyChange?: (key: string) => void;
  /**
   * Passed only from the home page, which is where folders are managed and the
   * only place that can re-read the list after one is opened.
   */
  onCanvasesChanged?: () => void;
}) {
  const [key, setKey] = useState(getApiKey);
  const [instructions, setInstructionsState] = useState(() =>
    canvasId ? getInstructions(canvasId) : ""
  );
  const [layout, setLayoutState] = useState<ExportLayout>(getExportLayout);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const blocking = !onClose;

  // Built up front and handed to a real anchor.
  //
  // These urls are deliberately never revoked. Anything that revokes while the
  // anchor still points at the url — an effect cleanup, a strict-mode remount —
  // leaves a dead href, which the browser reports as a failed download. The only
  // provably safe release point is document unload, which the browser already
  // does for us; the cost is a few unreferenced blobs per session.
  const download = useMemo(() => {
    if (!buildExport) return null;
    try {
      const { filename, html } = buildExport(layout);
      const blob = new Blob([html], { type: "text/html" });
      return { filename, blob, url: URL.createObjectURL(blob), size: blob.size, error: null };
    } catch (err) {
      return {
        filename: "",
        blob: null,
        url: "",
        size: 0,
        error: err instanceof Error ? err.message : "export failed",
      };
    }
  }, [buildExport, layout]);

  /**
   * Chrome and Edge can open a real save dialog, which reports its own failures
   * instead of quietly doing nothing. Elsewhere the anchor's own download runs.
   */
  async function save(event: React.MouseEvent) {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
      .showSaveFilePicker;
    if (!picker || !download?.blob) return;

    event.preventDefault();
    setSaveNote(null);
    try {
      const handle = await picker({
        suggestedName: download.filename,
        types: [{ description: "HTML", accept: { "text/html": [".html"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(download.blob);
      await writable.close();
      setSaveNote(`saved ${download.filename}`);
    } catch (err) {
      // Dismissing the dialog is a normal outcome, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSaveNote(err instanceof Error ? `save failed: ${err.message}` : "save failed");
    }
  }

  function updateKey(value: string) {
    setKey(value);
    setApiKey(value);
    onKeyChange?.(value);
  }

  function updateInstructions(value: string) {
    if (!canvasId) return;
    setInstructionsState(value);
    setInstructions(canvasId, value);
  }

  function updateLayout(value: ExportLayout) {
    setLayoutState(value);
    setExportLayout(value);
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/20 p-4">
      <div className="max-h-full w-[520px] overflow-y-auto border border-neutral-300 bg-white">
        <div className="flex items-center border-b border-neutral-200 p-3">
          <span>settings</span>
          <span className="flex-1" />
          {onClose && (
            <button className="text-neutral-500 hover:text-neutral-900" onClick={onClose}>
              close
            </button>
          )}
        </div>

        <div className="border-b border-neutral-200 p-3">
          <label className="mb-1 block text-neutral-500" htmlFor="settings-api-key">
            openrouter api key
          </label>
          <input
            id="settings-api-key"
            className="w-full border border-neutral-300 p-2 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            type="password"
            placeholder="sk-or-…"
            value={key}
            onChange={(e) => updateKey(e.target.value)}
            autoFocus={blocking}
          />
          {blocking && (
            <p className="mt-2 text-neutral-500">
              enter an openrouter api key to use this canvas. it is stored in this browser only.
            </p>
          )}
          <p className="mt-1 text-neutral-400">
            create one at{" "}
            <a
              className="underline hover:text-neutral-900"
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noreferrer"
            >
              openrouter.ai/settings/keys
            </a>
          </p>
        </div>

        {onCanvasesChanged && <FolderSettings onCanvasesChanged={onCanvasesChanged} />}

        {canvasId && (
          <div className="border-b border-neutral-200 p-3">
            <label className="mb-1 block text-neutral-500" htmlFor="settings-instructions">
              instructions for all nodes
            </label>
            <textarea
              id="settings-instructions"
              className="h-28 w-full resize-none border border-neutral-300 p-2 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              placeholder="e.g. always use a dark theme, prefer system fonts, no rounded corners…"
              value={instructions}
              onChange={(e) => updateInstructions(e.target.value)}
            />
            <p className="mt-1 text-neutral-400">
              applied to every generation on this canvas.
            </p>
          </div>
        )}

        {download && (
          <div className="p-3">
            <span className="mb-1 block text-neutral-500">export canvas as html</span>
            <div className="mb-2 flex flex-col gap-1">
              {LAYOUTS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-baseline gap-2">
                  <input
                    type="radio"
                    name="export-layout"
                    checked={layout === option.value}
                    onChange={() => updateLayout(option.value)}
                  />
                  <span>{option.label}</span>
                  <span className="text-neutral-400">— {option.hint}</span>
                </label>
              ))}
            </div>
            {download.error ? (
              <p className="text-red-600">{download.error}</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <a
                    className="flex items-center gap-2 border border-neutral-300 px-2 py-1 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900"
                    href={download.url}
                    download={download.filename}
                    onClick={save}
                  >
                    <DownloadIcon />
                    download html
                  </a>
                  {/* Escape hatch if the browser suppresses the download outright. */}
                  <a
                    className="text-neutral-400 underline hover:text-neutral-900"
                    href={download.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open in new tab
                  </a>
                </div>
                <p className="mt-1 text-neutral-400">
                  {download.filename} · {formatSize(download.size)}
                </p>
                {saveNote && (
                  <p className={saveNote.includes("failed") ? "text-red-600" : "text-neutral-500"}>
                    {saveNote}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
