/* ============================================================
   cannoli — colouring Strudel code
   Splits the song into tokens, with the same colour classes the
   cannoli editor uses, including each word inside a "pattern".
   ============================================================ */

import { catalog } from "./catalog.js";

const KEYWORDS = new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "await", "async", "new"]);
const THREAD_COLORS = 6;
const LABEL_RE = /^(\s*)([A-Za-z_$][\w$]*):(?!:)/;
const ATOM_RE = /[A-Za-z_][\w:#.-]*|-?\d*\.?\d+|[~-]|\S/g;
const RESTS = new Set(["~", "-"]);

/** The labelled blocks of a song, in order: "$:" and "kick:" each start one. */
export function blocksIn(text) {
  const blocks = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const label = line.match(LABEL_RE);
    if (label && !line.trimStart().startsWith("//")) blocks.push({ name: label[2], start: offset + label[1].length });
    offset += line.length + 1;
  }
  return blocks;
}

function miniTokens(body, start) {
  const out = [];
  for (const m of body.matchAll(ATOM_RE)) {
    const word = m[0];
    const cls = RESTS.has(word) ? "rest" : /^-?\d*\.?\d+$/.test(word) ? "num" : /^[A-Za-z_]/.test(word) ? "snd" : "punct";
    out.push({ start: start + m.index, end: start + m.index + word.length, text: word, cls });
  }
  return out;
}

/** Every token in the song. */
export function tokenize(text) {
  const words = catalog();
  const tokens = [];
  const blocks = blocksIn(text);
  const push = (start, end, cls) => tokens.push({ start, end, text: text.slice(start, end), cls });
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      push(i, stop, "comment");
      i = stop;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      const stop = close < 0 ? text.length : close + 2;
      push(i, stop, "comment");
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let end = i + 1;
      while (end < text.length && text[end] !== ch && (ch === "`" || text[end] !== "\n")) end += text[end] === "\\" ? 2 : 1;
      push(i, i + 1, "punct");
      tokens.push(...miniTokens(text.slice(i + 1, end), i + 1));
      if (text[end] === ch) push(end, end + 1, "punct");
      i = end + 1;
    } else if (/[A-Za-z_$]/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[\w$]/.test(text[end])) end++;
      const word = text.slice(i, end);
      const block = blocks.findIndex((b) => b.start === i);
      const afterDot = text[i - 1] === ".";
      if (block >= 0 && text[end] === ":") push(i, end, `thread t${block % THREAD_COLORS}`);
      else if (KEYWORDS.has(word)) push(i, end, "kw");
      else if (words.get(word)?.group === "cannoli") push(i, end, "fx");
      else if (afterDot) push(i, end, "verb");
      else if (text[end] === "(") push(i, end, "gen");
      else push(i, end, "name");
      i = end;
    } else if (/\d/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[\d.]/.test(text[end])) end++;
      push(i, end, "num");
      i = end;
    } else {
      push(i, i + 1, ".".includes(ch) ? "pipe" : "punct");
      i++;
    }
  }
  return tokens;
}

/** A classifier for one song: the tokens of a line, split where a comment runs across lines. */
export function lineClassifier(text) {
  const tokens = tokenize(text);
  return (line, offset) => ({
    commentAt: -1,
    tokens: tokens.filter((t) => t.start < offset + line.length && t.end > offset)
      .map((t) => ({ ...t, start: Math.max(t.start, offset), end: Math.min(t.end, offset + line.length) })),
  });
}
