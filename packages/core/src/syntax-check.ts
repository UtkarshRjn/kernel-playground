import type { KernelLanguage } from "@kp/shared";

/**
 * Lightweight, GPU-free syntax sanity check used by the mock provider so the free "Test"
 * catches obvious mistakes (unbalanced braces/parens, missing kp_run) even when the real
 * compiler backend isn't reachable. This is a HEURISTIC, not a compiler — the Modal nvcc /
 * Python check is the source of truth; this just avoids blindly passing broken code offline.
 *
 * Returns a diagnostics string if a problem is found, or null if it looks OK.
 */
export function offlineSyntaxCheck(code: string, language: KernelLanguage): string | null {
  const stripped = stripCommentsAndStrings(code, language);

  const pairs: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  const opens = new Set(["(", "{", "["]);
  const stack: { ch: string; line: number }[] = [];
  let line = 1;
  for (const ch of stripped) {
    if (ch === "\n") line++;
    else if (opens.has(ch)) stack.push({ ch, line });
    else if (ch in pairs) {
      const top = stack.pop();
      if (!top || top.ch !== pairs[ch]) {
        return `unexpected '${ch}' on line ${line} — check your brackets`;
      }
    }
  }
  if (stack.length > 0) {
    const last = stack[stack.length - 1]!;
    return `unclosed '${last.ch}' opened on line ${last.line} — missing a closing '${closingOf(last.ch)}'`;
  }

  if (!/\bkp_run\s*\(/.test(stripped)) {
    return "no kp_run() found — define kp_run() as the kernel entry point";
  }
  return null;
}

function closingOf(open: string): string {
  return open === "(" ? ")" : open === "{" ? "}" : "]";
}

/** Remove comments and string/char literals so their contents don't skew the brace count. */
function stripCommentsAndStrings(code: string, language: KernelLanguage): string {
  const isPy = language === "triton";
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    // line comments
    if (c === "/" && d === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (isPy && c === "#") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    // block comments
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // string / char literals
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n && code[i] !== q) {
        if (code[i] === "\\") i++;
        if (code[i] === "\n") out += "\n"; // preserve line numbers
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
