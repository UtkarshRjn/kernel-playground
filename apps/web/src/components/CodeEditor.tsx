"use client";

import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import type { KernelLanguage } from "@kp/shared";

// Theme tuned to the app palette (see globals.css).
const kpTheme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "#dfe6f5",
    caret: "#7c8cff",
    selection: "rgba(124,140,255,0.25)",
    selectionMatch: "rgba(124,140,255,0.18)",
    lineHighlight: "rgba(255,255,255,0.035)",
    gutterBackground: "transparent",
    gutterForeground: "#525a6e",
    gutterBorder: "transparent",
    fontFamily:
      "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#69718a", fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "#b58bff" },
    { tag: [t.operatorKeyword], color: "#b58bff" },
    { tag: [t.typeName, t.className], color: "#54e0c0" },
    { tag: [t.string, t.special(t.string)], color: "#8fe3b6" },
    { tag: [t.number, t.bool, t.null, t.atom], color: "#ffcf5c" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7c8cff" },
    { tag: [t.propertyName], color: "#9fb0ff" },
    { tag: [t.operator, t.punctuation, t.bracket], color: "#9aa3b8" },
    { tag: [t.meta, t.processingInstruction], color: "#b58bff" },
    { tag: [t.variableName], color: "#dfe6f5" },
  ],
});

export default function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: KernelLanguage;
  onChange: (value: string) => void;
}) {
  const langExt = language === "cuda" ? cpp() : python();
  return (
    <CodeMirror
      value={value}
      theme={kpTheme}
      height="460px"
      extensions={[langExt]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: false,
        bracketMatching: true,
        indentOnInput: true,
      }}
      style={{ fontSize: 12.5 }}
    />
  );
}
