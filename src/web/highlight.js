/* cannoli — colours Strudel code for the web editor, underlines problems and lights up what's sounding. */

import { tokenize } from "../../cli/strudel/highlight.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * @param {string} text
 * @param {{ problems?: { start: number, end: number, severity: string }[], active?: Set<number> }} opts
 */
export function highlightStrudel(text, { problems = [], active = new Set() } = {}) {
  let html = "";
  let pos = 0;
  for (const token of tokenize(text)) {
    html += esc(text.slice(pos, token.start));
    const problem = problems.find((p) => token.start < p.end && token.end > p.start);
    const classes = [token.cls === "comment" ? "cm" : token.cls, problem ? (problem.severity === "warning" ? "p-warn" : "p-err") : "", active.has(token.start) ? "on" : ""].filter(Boolean);
    html += `<span class="${classes.join(" ")}">${esc(token.text)}</span>`;
    pos = token.end;
  }
  return html + esc(text.slice(pos));
}
