/* ============================================================
   cannoli — every word in Strudel, from Strudel's own docs
   Reads the documentation comments that ship inside the Strudel
   packages, so the suggestion card, guide and reference describe
   the version that's installed.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_DOCS } from "./extras.js";

const MODULES = fileURLToPath(new URL("../../node_modules/", import.meta.url));
const SOURCES = [
  ["patterns", "@strudel/core/pattern.mjs"],
  ["sound", "@strudel/core/controls.mjs"],
  ["signals", "@strudel/core/signal.mjs"],
  ["picking", "@strudel/core/pick.mjs"],
  ["rhythm", "@strudel/core/euclid.mjs"],
  ["harmony", "@strudel/tonal/tonal.mjs"],
  ["harmony", "@strudel/tonal/voicings.mjs"],
];
const COMMENT_RE = /\/\*\*([\s\S]*?)\*\/(?=\s*([^\n]*))/g;

function clean(comment) {
  return comment.split("\n").map((line) => line.replace(/^\s*\*\s?/, "")).join("\n").trim();
}

function nameFrom(body, nextLine) {
  const tagged = body.match(/@name\s+(\w+)/)?.[1];
  if (tagged) return tagged;
  return nextLine.match(/Pattern\.prototype\.(\w+)/)?.[1] ?? nextLine.match(/(?:const|function)\s+\{?\s*(\w+)/)?.[1] ?? nextLine.match(/register\(\s*\[?\s*['"](\w+)['"]/)?.[1] ?? null;
}

/* Every name a line of code defines:  export const { firstOf, every } = register(['firstOf', 'every'], … */
function namesIn(line) {
  const destructured = line.match(/\{([\w\s,]+)\}\s*=/)?.[1] ?? "";
  const registered = line.match(/register\(\s*\[([^\]]+)\]/)?.[1]?.replace(/['"]/g, "") ?? "";
  return `${destructured},${registered}`.split(/[,\s]+/).filter((word) => /^[a-zA-Z]\w*$/.test(word));
}

/** The documented words in one source file. */
export function parseDocs(source, group) {
  const entries = [];
  for (const [, comment, nextLine] of source.matchAll(COMMENT_RE)) {
    const body = clean(comment);
    const name = nameFrom(body, nextLine);
    if (!name || name.startsWith("_") || /@(private|noAutocomplete)\b/.test(body)) continue;
    const doc = body.split(/\n\s*@/)[0].replace(/<[^>]+>|\*\*|`/g, "").replace(/\s+/g, " ").trim();
    const params = [...body.matchAll(/@param\s+(?:\{[^}]*\}\s*)?\[?(\w+)/g)].map((m) => m[1]);
    const example = body.match(/@example\s*\n([\s\S]*?)(?=\n\s*@|$)/)?.[1].trim() ?? "";
    const tagged = (body.match(/@(?:synonyms|alias)\s+([^\n]+)/)?.[1] ?? "").split(/[,\s]+/).filter(Boolean);
    const synonyms = [...new Set([...tagged, ...namesIn(nextLine)])].filter((word) => word !== name);
    entries.push({ name, doc, params, example, synonyms, group });
  }
  return entries;
}

let cached = null;

/** Every word, by name. Synonyms point at the same entry. */
export function catalog() {
  if (cached) return cached;
  const words = new Map();
  const add = (entry) => {
    for (const name of [entry.name, ...entry.synonyms]) if (!words.has(name)) words.set(name, entry);
  };
  for (const [name, extra] of Object.entries(EXTRA_DOCS)) {
    add({ name, doc: extra.doc, params: extra.args ? [extra.args] : [], example: extra.example, synonyms: [], group: "cannoli" });
  }
  for (const [group, file] of SOURCES) {
    const full = path.join(MODULES, file);
    if (fs.existsSync(full)) parseDocs(fs.readFileSync(full, "utf8"), group).forEach(add);
  }
  cached = words;
  return words;
}
