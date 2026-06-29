"use client";

import { cpp } from "@codemirror/lang-cpp";
import { python } from "@codemirror/lang-python";
import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import type { KernelLanguage } from "@kp/shared";
import { useTheme } from "@/components/theme";

const sharedStyles = (c: {
  comment: string;
  keyword: string;
  type: string;
  string: string;
  number: string;
  func: string;
  prop: string;
  op: string;
}) => [
  { tag: [t.comment, t.lineComment, t.blockComment], color: c.comment, fontStyle: "italic" },
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword],
    color: c.keyword,
  },
  { tag: [t.typeName, t.className], color: c.type },
  { tag: [t.string, t.special(t.string)], color: c.string },
  { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.func },
  { tag: [t.propertyName], color: c.prop },
  { tag: [t.operator, t.punctuation, t.bracket], color: c.op },
  { tag: [t.meta, t.processingInstruction], color: c.keyword },
];

const FONT =
  "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const lightTheme = createTheme({
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
    fontFamily: FONT,
  },
  styles: sharedStyles({
    comment: "#8792a2",
    keyword: "#8250df",
    type: "#0a7c8a",
    string: "#1a9d6b",
    number: "#b76e00",
    func: "#635bff",
    prop: "#0a2540",
    op: "#6b7689",
  }),
});

const darkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "#dfe6f5",
    caret: "#8b93ff",
    selection: "rgba(139,147,255,0.22)",
    selectionMatch: "rgba(139,147,255,0.16)",
    lineHighlight: "rgba(255,255,255,0.035)",
    gutterBackground: "transparent",
    gutterForeground: "#5b6375",
    gutterBorder: "transparent",
    fontFamily: FONT,
  },
  styles: sharedStyles({
    comment: "#69718a",
    keyword: "#c4a7ff",
    type: "#5ce0c8",
    string: "#7fdca6",
    number: "#ffcf5c",
    func: "#9fb0ff",
    prop: "#dfe6f5",
    op: "#9aa3b8",
  }),
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
  const { mode } = useTheme();
  const langExt = language === "cuda" ? cpp() : python();
  return (
    <CodeMirror
      value={value}
      theme={mode === "dark" ? darkTheme : lightTheme}
      height="100%"
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
      style={{ fontSize: 12.5, height: "100%" }}
    />
  );
}
