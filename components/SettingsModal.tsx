"use client";

import { useState } from "react";
import {
  getApiKey,
  getExportLayout,
  getInstructions,
  setApiKey,
  setExportLayout,
  setInstructions,
} from "@/lib/storage";
import type { ExportLayout } from "@/lib/types";
import { DownloadIcon } from "./icons";

const LAYOUTS: { value: ExportLayout; label: string; hint: string }[] = [
  { value: "stacked", label: "stacked document", hint: "nodes in reading order, full width" },
  { value: "canvas", label: "faithful canvas", hint: "exact positions, cropped to your nodes" },
];

export default function SettingsModal({
  onClose,
  onExport,
  onKeyChange,
}: {
  /** Omitted when the modal is blocking on a missing api key. */
  onClose?: () => void;
  /** Omitted on the home page, where no single canvas is in scope. */
  onExport?: (layout: ExportLayout) => void;
  onKeyChange?: (key: string) => void;
}) {
  const [key, setKey] = useState(getApiKey);
  const [instructions, setInstructionsState] = useState(getInstructions);
  const [layout, setLayoutState] = useState<ExportLayout>(getExportLayout);

  const blocking = !onClose;

  function updateKey(value: string) {
    setKey(value);
    setApiKey(value);
    onKeyChange?.(value);
  }

  function updateInstructions(value: string) {
    setInstructionsState(value);
    setInstructions(value);
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
        </div>

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
          <p className="mt-1 text-neutral-400">applied to every generation on every canvas.</p>
        </div>

        {onExport && (
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
            <button
              className="flex items-center gap-2 border border-neutral-300 px-2 py-1 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900"
              onClick={() => onExport(layout)}
            >
              <DownloadIcon />
              download html
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
