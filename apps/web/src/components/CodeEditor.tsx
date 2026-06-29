"use client";

import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import type { KernelLanguage } from "@kp/shared";

// Clean light theme matched to the app palette.
const kpTheme = createTheme({
  theme: "light",
  settings: {
    background: "transparent",
    foreground: "#0a2540",
    caret: "#635bff",
    selection: "rgba(99,91,255,0.14)",
    selectionMatch: "rgba(99,91,255,0.10)",
    lineHighlight: "rgba(99,91,255,0.04)",
    gutterBackground: "transparent",
    gutterForeground: "#aab4c4",
    gutterBorder: "transparent",
    fontFamily:
      "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: "#8792a2", fontStyle: "italic" },
    { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: "#8250df" },
    { tag: [t.typeName, t.className], color: "#0a7c8a" },
    { tag: [t.string, t.special(t.string)], color: "#1a9d6b" },
    { tag: [t.number, t.bool, t.null, t.atom], color: "#b76e00" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#635bff" },
    { tag: [t.propertyName], color: "#0a2540" },
    { tag: [t.operator, t.punctuation, t.bracket], color: "#6b7689" },
    { tag: [t.meta, t.processingInstruction], color: "#8250df" },
    { tag: [t.variableName], color: "#0a2540" },
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
      height="440px"
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
