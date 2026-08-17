"use client";

import { useRef } from "react";
import { isImageFile, prepareImage } from "@/lib/images";

async function firstImage(files: FileList | File[]): Promise<string | null> {
  const file = [...files].find(isImageFile);
  return file ? prepareImage(file) : null;
}

/**
 * The main panel for a node's photo tab: shows the uploaded photo, or a
 * click/drop target when there is none.
 */
export function PhotoPane({
  photo,
  onChange,
}: {
  photo: string | null;
  onChange: (photo: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const prepared = await firstImage(files);
    if (prepared) onChange(prepared);
  }

  return (
    <div
      className="h-full w-full bg-neutral-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL photo
        <img src={photo} alt="uploaded photo" className="h-full w-full bg-white object-contain" />
      ) : (
        <button
          className="nodrag flex h-full w-full cursor-pointer items-center justify-center text-neutral-400 hover:text-neutral-900"
          onClick={() => inputRef.current?.click()}
        >
          upload a photo — click or drop an image
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The sidebar for the photo tab: upload/replace and remove. */
export function PhotoToolbar({
  photo,
  onChange,
}: {
  photo: string | null;
  onChange: (photo: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const prepared = await firstImage(files);
    if (prepared) onChange(prepared);
  }

  return (
    <div className="nodrag nowheel min-h-0 flex-1 cursor-auto space-y-3 overflow-y-auto p-3">
      <button
        className="block text-neutral-500 underline hover:text-neutral-900"
        onClick={() => inputRef.current?.click()}
      >
        {photo ? "replace photo" : "upload photo"}
      </button>
      {photo && (
        <button
          className="block text-neutral-500 underline hover:text-red-600"
          onClick={() => onChange(null)}
        >
          remove photo
        </button>
      )}
      <p className="text-neutral-400">
        with this tab selected, @-mentioning this node from another chat attaches the photo as a
        reference
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
