"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";

const theme = EditorView.theme({
  "&": { fontSize: "12px", height: "100%", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#a3a3a3" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-content": { padding: "8px 0" },
});

export default function HtmlEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const extensions = useMemo(() => [html(), EditorView.lineWrapping, theme], []);

  return (
    <div className="nodrag nowheel min-h-0 flex-1 overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        placeholder={placeholder}
        height="100%"
        basicSetup={{ foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      />
    </div>
  );
}
