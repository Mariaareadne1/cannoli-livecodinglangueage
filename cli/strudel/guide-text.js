/* ============================================================
   cannoli — what the guide pane says about Strudel code
   Explains the line you're on from Strudel's own documentation,
   lists problems and suggestions, and builds the reference.
   ============================================================ */

import { catalog } from "./catalog.js";
import { completeStrudel } from "./complete.js";
import { tokenize } from "./highlight.js";

const MAX_EXPLAINED = 8;
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/;
const GROUP_TITLES = {
  cannoli: "added by cannoli", patterns: "patterns: time and structure", sound: "sound: effects and controls",
  signals: "signals: values that change over time", picking: "picking between patterns", rhythm: "euclidean rhythm", harmony: "notes, scales and chords",
};
const KEYS = [
  ["ctrl+s", "play, or apply your changes"], ["ctrl+t", "stop at the end of the cycle (twice: now)"], ["ctrl+f", "apply the fix on this line"],
  ["tab", "accept the suggestion"], ["shift+tab", "write out the whole call"], ["ctrl+e", "choose a style"], ["ctrl+g", "next theme"], ["ctrl+q", "save and quit"],
];

function brief(doc) {
  return doc.match(FIRST_SENTENCE)?.[0] ?? doc;
}

/** Explain the line under the cursor. */
export function explainStrudelLine(msg) {
  const text = msg.text ?? "";
  const lines = text.split("\n");
  const row = msg.cursor?.row ?? 0;
  const line = lines[row] ?? "";
  if (!line.trim()) return [{ text: 'an empty line: start one with  $: s("bd*4")  or a name, like  kick:', role: "dim" }];
  if (line.trim().startsWith("//")) return [{ text: "a comment: nothing on this line plays", role: "dim" }];
  const start = lines.slice(0, row).reduce((n, l) => n + l.length + 1, 0);
  const words = catalog();
  const out = [];
  const label = line.match(/^\s*([A-Za-z_$][\w$]*):/)?.[1];
  if (label) {
    const muted = label.startsWith("_") || label.endsWith("_");
    out.push({ text: muted ? `${label}: muted, so this pattern is silent` : `${label}: a pattern that plays alongside the others`, role: "ink" });
  }
  const seen = new Set();
  for (const token of tokenize(text).filter((t) => t.start >= start && t.end <= start + line.length)) {
    const entry = words.get(token.text);
    if (seen.has(token.text) || !entry || !["verb", "gen", "fx"].includes(token.cls)) continue;
    seen.add(token.text);
    out.push({ text: `${token.text} — ${brief(entry.doc)}`, role: "soft" });
    if (seen.size >= MAX_EXPLAINED) break;
  }
  if (line.includes('"')) out.push({ text: 'inside quotes: * repeats · [ ] groups · < > one per cycle · ~ rests · , plays together', role: "dim" });
  return out;
}

/** The whole assistant page. */
export function strudelAssistant(msg) {
  const out = [{ text: "this line", role: "head" }, ...explainStrudelLine(msg), { text: "", role: "dim" }];
  const problems = msg.problems ?? [];
  out.push({ text: problems.length ? `problems · ${problems.length}` : "problems · none", role: "head" });
  for (const p of problems.slice(0, 6)) {
    out.push({ text: `line ${p.row + 1}  ${p.message}`, role: p.severity === "error" ? "error" : "warn" });
    if (p.fix) out.push({ text: `        ctrl+f on that line: ${p.fix}`, role: "dim" });
  }
  out.push({ text: "", role: "dim" });
  const suggestions = completeStrudel(msg.text ?? "", msg.cursor?.offset ?? 0).items;
  if (suggestions.length) {
    out.push({ text: "try next", role: "head" });
    for (const s of suggestions.slice(0, 6)) out.push({ text: `${s.label.padEnd(14)} ${brief(s.doc)}`, role: "soft" });
    out.push({ text: "", role: "dim" });
  }
  out.push({ text: "now", role: "head" });
  out.push({
    text: msg.playing ? `cycle ${msg.bar} · ${Math.round(msg.tempo ?? 0)} bpm${msg.key ? ` · ${msg.key}` : ""}` : "stopped — ctrl+s in the editor plays",
    role: msg.playing ? "accent" : "dim",
  });
  return out;
}

/** Every word in Strudel, as a scrollable list. */
export function strudelReference() {
  const out = [];
  const head = (title) => out.push({ text: "", role: "dim" }, { text: title, role: "head" });
  head("keys (editor)");
  KEYS.forEach(([key, doc]) => out.push({ text: `${key.padEnd(10)} ${doc}`, role: "soft" }));
  head("inside quotes (mini-notation)");
  [["bd sd", "one after another, sharing the cycle"], ["bd*4", "repeat, faster"], ["bd/2", "slower: every 2 cycles"], ["[bd sd]", "squeeze into one step"], ["<bd sd>", "one per cycle"], ["bd, hh", "at the same time"], ["~ or -", "a rest"], ["bd!3", "replicate"], ["bd@3", "stretch: 3 steps long"], ["bd?", "sometimes drop it"], ["bd(3,8)", "euclidean: 3 hits over 8 steps"], ["bd:2", "the third sample of bd"]]
    .forEach(([code, doc]) => out.push({ text: `${code.padEnd(10)} ${doc}`, role: "soft" }));
  const entries = [...new Set(catalog().values())];
  for (const [group, title] of Object.entries(GROUP_TITLES)) {
    head(title);
    entries.filter((e) => e.group === group).sort((a, b) => a.name.localeCompare(b.name))
      .forEach((e) => out.push({ text: `${e.name.padEnd(16)} ${brief(e.doc)}`, role: "soft" }));
  }
  return out;
}
