/* ============================================================
   cannoli — code colouring for the terminal
   One line of code → exactly `width` coloured cells, scrolled
   horizontally from `colStart`. Same token classes as the web
   editor, mapped onto the theme's few colour roles.
   ============================================================ */

import { classifyLine } from "../src/editor/highlight.js";
import { fg, bg, RESET, BOLD, ITALIC, UNDERLINE } from "./ansi.js";

/* token class → [colour role, extra style] */
const ROLES = {
  pipe: ["accent", BOLD],
  num: ["ink", ""],
  rest: ["faint", ""],
  punct: ["dim", ""],
  op: ["dim", ""],
  set: ["soft", ""],
  kw: ["soft", ITALIC],
  verb: ["soft", ""],
  gen: ["ink", ""],
  snd: ["soft", ""],
  fx: ["accent", ""],
  var: ["ink", BOLD],
  name: ["ink", ""],
  comment: ["faint", ITALIC],
  plain: ["ink", ""],
};

/**
 * @param {{ line: string, offset: number, theme: import("../src/themes.js").Theme, symbols?: object,
 *           problems?: { start: number, end: number, severity: string }[], active?: Set<number>,
 *           colStart?: number, width: number, background?: string }} opts
 */
export function codeLine({ line, offset, theme, symbols = {}, problems = [], active = new Set(), colStart = 0, width, background }) {
  const base = background ?? theme.bg;
  const { tokens, commentAt } = classifyLine(line, offset, symbols);
  const chars = [...line];
  // one style per character
  const styles = chars.map((_, i) => ({ color: theme.ink, extra: "", back: base }));
  for (const tok of tokens) {
    const thread = tok.cls.match(/^thread t(\d)/);
    const [role, extra] = thread ? [null, BOLD] : ROLES[tok.cls] ?? ROLES.plain;
    const color = thread ? theme.threads[Number(thread[1])] : theme[role];
    const problem = problems.find((p) => tok.start < p.end && tok.end > p.start);
    const on = active.has(tok.start);
    for (let i = tok.start - offset; i < tok.end - offset; i++) {
      styles[i] = {
        color: on ? base : problem ? (problem.severity === "warning" ? theme.warn : theme.error) : color,
        extra: extra + (problem ? UNDERLINE : ""),
        back: on ? theme.accent : base,
      };
    }
  }
  if (commentAt !== -1) for (let i = commentAt; i < chars.length; i++) styles[i] = { color: theme.faint, extra: ITALIC, back: base };

  // a problem just past the end of the code (e.g. a missing bracket) gets a marker
  const codeEnd = commentAt === -1 ? chars.length : commentAt;
  const eol = problems.find((p) => p.start >= offset + codeEnd - 1 && p.start <= offset + codeEnd
    && !tokens.some((t) => t.start < p.end && t.end > p.start));
  if (eol) {
    chars.push(" ", "◂");
    styles.push({ color: theme.error, extra: "", back: base }, { color: theme.error, extra: BOLD, back: base });
  }

  let out = "";
  let prev = "";
  for (let i = colStart; i < colStart + width; i++) {
    const s = styles[i] ?? { color: theme.ink, extra: "", back: base };
    const code = `${RESET}${bg(s.back)}${fg(s.color)}${s.extra}`;
    if (code !== prev) {
      out += code;
      prev = code;
    }
    out += chars[i] ?? " ";
  }
  return out + RESET;
}
