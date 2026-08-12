"use client";

import { useRef, useState } from "react";
import type { Mentionable } from "@/lib/mentions";

/** Matches the user's mockup; also used for transcript chips. */
export const MENTION_CHIP_CLASS =
  "mention-chip mx-0.5 px-1.5 bg-red-100 border border-red-300 text-red-500";

/**
 * Plain-text chat input with @mention chips. The DOM is the source of truth
 * while typing; `serialize` flattens it back to plaintext (chips → "@name")
 * for the model. Typing "@" opens an autocomplete over the canvas's node names.
 */
export default function MentionInput({
  getOptions,
  placeholder,
  disabled,
  onSubmit,
}: {
  /** Called when the menu opens, so the list is always current without subscribing. */
  getOptions: () => Mentionable[];
  placeholder: string;
  /** While true, Enter keeps the draft instead of submitting into a busy node. */
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<Mentionable[]>([]);
  const [active, setActive] = useState(0);

  const filtered =
    query === null
      ? []
      : options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));

  // Keep the highlight in range as the query narrows the list.
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  /** The "@query" run of text immediately before the caret, if any. */
  function caretMention(): { node: Text; start: number; end: number; query: string } | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !ref.current) return null;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || !ref.current.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const node = range.startContainer as Text;
    const upToCaret = (node.textContent ?? "").slice(0, range.startOffset);
    const match = upToCaret.match(/@([^\s@]*)$/);
    if (!match) return null;
    return {
      node,
      start: upToCaret.length - match[0].length,
      end: range.startOffset,
      query: match[1],
    };
  }

  function refreshMenu() {
    const hit = caretMention();
    if (!hit) {
      setQuery(null);
      return;
    }
    if (query === null) setOptions(getOptions());
    if (hit.query !== query) setActive(0);
    setQuery(hit.query);
  }

  function insertMention(option: Mentionable) {
    const hit = caretMention();
    if (!hit) return setQuery(null);

    hit.node.deleteData(hit.start, hit.end - hit.start);
    const rest = hit.node.splitText(hit.start);

    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset.mention = option.name;
    chip.className = MENTION_CHIP_CLASS;
    chip.textContent = `@${option.name}`;

    const space = document.createTextNode(" ");
    rest.parentNode!.insertBefore(chip, rest);
    rest.parentNode!.insertBefore(space, rest);

    const selection = window.getSelection()!;
    const caret = document.createRange();
    caret.setStart(space, 1);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);

    setQuery(null);
  }

  function serialize(el: Node): string {
    let out = "";
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent;
      } else if (child instanceof HTMLElement && child.dataset.mention) {
        out += `@${child.dataset.mention}`;
      } else if (child.nodeName === "BR") {
        out += "\n";
      } else if (child instanceof HTMLElement) {
        // Contenteditable wraps continuation lines in divs.
        out += `\n${serialize(child)}`;
      }
    });
    return out;
  }

  function submit() {
    if (!ref.current || disabled) return;
    const text = serialize(ref.current).replace(/ /g, " ").trim();
    if (!text) return;
    ref.current.innerHTML = "";
    setQuery(null);
    onSubmit(text);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (query !== null && filtered.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        return setActive((a) => (a + 1) % filtered.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return setActive((a) => (a - 1 + filtered.length) % filtered.length);
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        return insertMention(filtered[activeIndex]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return setQuery(null);
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative h-full">
      {query !== null && filtered.length > 0 && (
        <div className="nodrag absolute bottom-full left-0 right-0 z-20 mb-2 max-h-40 overflow-y-auto border border-neutral-300 bg-white">
          {filtered.map((option, i) => (
            <button
              key={option.id}
              className={`block w-full px-2 py-1 text-left ${
                i === activeIndex ? "bg-red-50 text-red-500" : "text-neutral-600"
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(option)}
              onMouseEnter={() => setActive(i)}
            >
              @{option.name}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        className="nodrag nowheel h-full w-full cursor-text overflow-y-auto whitespace-pre-wrap break-words outline-none"
        contentEditable
        data-placeholder={placeholder}
        spellCheck={false}
        onInput={refreshMenu}
        onKeyDown={onKeyDown}
        onBlur={() => setQuery(null)}
        onPaste={(event) => {
          // Keep the input plaintext — pasted HTML would otherwise land as markup.
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
