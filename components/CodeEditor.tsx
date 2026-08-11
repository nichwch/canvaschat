"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

const theme = EditorView.theme({
  "&": { fontSize: "12px", height: "100%", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  // Without an explicit overflow the scroller sizes to its content and the pane never scrolls.
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5", overflow: "auto" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#a3a3a3" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-content": { padding: "8px 0" },
});

export default function CodeEditor({
  value,
  onChange,
  placeholder,
  language,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  language: "html" | "markdown";
}) {
  const extensions = useMemo(
    () => [language === "html" ? html() : markdown(), EditorView.lineWrapping, theme],
    [language]
  );

  return (
    <div className="nodrag nowheel min-h-0 flex-1 overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        placeholder={placeholder}
        // The library's wrapper div is height:auto, so `height="100%"` on the editor
        // has nothing to resolve against until this className gives it one.
        className="h-full"
        height="100%"
        basicSetup={{ foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      />
    </div>
  );
}
