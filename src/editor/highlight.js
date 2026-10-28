/* ============================================================
   cannoli — syntax colouring
   Source → HTML spans. Also draws problem underlines (errors
   and warnings) and lights up the tokens that are sounding.
   ============================================================ */

import { lexLine } from "../lang/lexer.js";
import { VERBS, GENERATORS } from "../core/verbs.js";
import { SETTINGS, KEYWORDS } from "../lang/parser.js";

const THREAD_COLORS = 6;

/**
 * @param {string} text
 * @param {{ problems?: { start: number, end: number, severity: "error"|"warning" }[],
 *           active?: Set<number>, threads?: string[], vars?: string[], defs?: string[] }} opts
 */
export function highlight(text, { problems = [], active = new Set(), threads = [], vars = [], defs = [] } = {}) {
  const known = { threads, vars: new Set(vars), defs: new Set(defs) };
  let offset = 0;
  return text.split("\n").map((line) => {
    const html = lineHtml(line, offset, problems, active, known);
    offset += line.length + 1;
    return html;
  }).join("\n");
}

function lineHtml(line, offset, problems, active, known) {
  const { tokens } = lexLine(line, offset);
  const commentAt = findComment(line);
  let html = "";
  let pos = offset;
  tokens.forEach((tok, i) => {
    html += esc(line.slice(pos - offset, tok.start - offset));
    const classes = [tokenClass(tok, i, tokens, known)];
    const problem = problems.find((p) => tok.start < p.end && tok.end > p.start);
    if (problem) classes.push(problem.severity === "warning" ? "p-warn" : "p-err");
    if (active.has(tok.start)) classes.push("on");
    html += `<span class="${classes.join(" ")}">${esc(tok.text)}</span>`;
    pos = tok.end;
  });
  const codeEnd = commentAt === -1 ? line.length : commentAt;
  html += esc(line.slice(pos - offset, codeEnd));
  // a problem that points just past the code (e.g. a missing bracket)
  const lineEnd = offset + codeEnd;
  const eol = problems.find((p) => p.start >= (tokens.at(-1)?.end ?? offset) && p.start <= lineEnd && !tokens.some((t) => t.start < p.end && t.end > p.start));
  if (eol) html += `<span class="${eol.severity === "warning" ? "p-warn" : "p-err"} p-eol"> </span>`;
  if (commentAt !== -1) html += `<span class="cm">${esc(line.slice(commentAt))}</span>`;
  return html;
}

/**
 * The colour class of each token on a line, plus where a comment starts.
 * Shared by the web editor (HTML) and the terminal editor (ANSI).
 * @returns {{ tokens: { start: number, end: number, text: string, cls: string }[], commentAt: number }}
 *          offsets are in the whole source; commentAt is within the line (-1 if none)
 */
export function classifyLine(line, offset, { threads = [], vars = [], defs = [] } = {}) {
  const known = { threads, vars: new Set(vars), defs: new Set(defs) };
  const { tokens } = lexLine(line, offset);
  return { tokens: tokens.map((tok, i) => ({ ...tok, cls: tokenClass(tok, i, tokens, known) })), commentAt: findComment(line) };
}

function tokenClass(tok, i, tokens, known) {
  if (tok.type === "num") return "num";
  if (tok.type === "rest" || tok.type === "hold") return "rest";
  if (tok.type === "op") return tok.text === ">" ? "pipe" : tok.text === ":" || tok.text === "=" ? "punct" : "op";
  const w = tok.text;
  if (i === 0 && tokens[1]?.text === ":") return `thread t${Math.max(0, known.threads.indexOf(w)) % THREAD_COLORS}`;
  if (i === 0 && SETTINGS.includes(w)) return "set";
  if (KEYWORDS.includes(w)) return "kw";
  const verb = VERBS[w];
  if (verb) return verb.group === "sound" ? "snd" : verb.group === "effect" ? "fx" : "verb";
  if (GENERATORS[w]) return "gen";
  if (known.vars.has(w) || known.defs.has(w)) return "var";
  return "name";
}

function findComment(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "#" && !/[A-Za-z0-9]/.test(line[i - 1] ?? "")) return i;
    if (line[i] === "/" && line[i + 1] === "/") return i;
  }
  return -1;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
