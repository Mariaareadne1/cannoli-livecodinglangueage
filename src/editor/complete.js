/* ============================================================
   cannoli — suggestions
   Given the text and cursor, what could come next? Returns the
   word being typed (from/to) and a list of suggestions, each
   with a one-line explanation for the suggestion card.
   ============================================================ */

import { VERBS, GENERATORS } from "../core/verbs.js";
import { MODES, chordDegree } from "../core/harmony.js";
import { STYLES, STYLE_NAMES, BEATS } from "../core/styles.js";

const NOTE_NAMES = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
const PROGRESSIONS = {
  major: [["I V vi IV", "the pop progression"], ["I vi IV V", "fifties doo-wop"], ["ii V I I", "jazz cadence"], ["I IV V IV", "rock and roll"], ["vi IV I V", "hopeful, starts sad"]],
  minor: [["i VI III VII", "epic, cinematic"], ["i iv v i", "classic minor"], ["i VII VI VII", "rolling, folky"], ["i iv VII III", "dark pop"], ["i VI iv V", "dramatic, pulls home"]],
};
const ROMAN = { major: ["I", "ii", "iii", "IV", "V", "vi", "vii"], minor: ["i", "ii", "III", "iv", "v", "VI", "VII"] };
const NEXT_CHORD = { 0: [3, 4, 5], 1: [4, 6], 2: [5, 3], 3: [4, 0, 1], 4: [0, 5], 5: [3, 1, 4], 6: [0, 2] };
const STEP_AFTER = /(?:>|\(|\bevery\s+\S+|\bmaybe\s+\S+|\bsometimes|\belse)\s*$/;
const LINE_STARTERS = [
  { label: "style", insert: "style ", detail: "style rave", doc: "a feel: rave, house, funk or chill. Sets tempo, drums and mix, and what gets suggested" },
  { label: "key", insert: "key d minor", detail: "key d minor", doc: "the key every thread shares" },
  { label: "tempo", insert: "tempo 100", detail: "tempo 100", doc: "beats per minute" },
  { label: "chords", insert: "chords ", detail: "chords i VI III VII", doc: "a chord progression, one chord per bar" },
  { label: "beats", insert: "beats 4", detail: "beats 3", doc: "beats in a bar" },
  { label: "swing", insert: "swing 0.2", detail: "swing 0.2", doc: "push off-beat eighths late" },
  { label: "def", insert: "def ", detail: "def lift n = up n > fast 2", doc: "define your own verb or pattern" },
];

/**
 * @typedef {{ label: string, insert: string, detail: string, doc: string, kind: string }} Suggestion
 * @param {string} text
 * @param {number} cursor
 * @param {{ vars?: string[], defs?: string[], keyMode?: string, style?: string }} [symbols]
 * @param {{ force?: boolean }} [opts]  force: show suggestions even with nothing typed
 * @returns {{ from: number, to: number, items: Suggestion[] }}
 */
export function complete(text, cursor, symbols = {}, { force = false } = {}) {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const before = text.slice(lineStart, cursor);
  if (/(^|\s)(#|\/\/)/.test(before)) return none(cursor);
  const word = before.match(/[A-Za-z][A-Za-z0-9_#]*$/)?.[0] ?? "";
  const from = cursor - word.length;
  const head = before.slice(0, before.length - word.length);
  const statement = statementText(text, lineStart) + head;

  const items = candidates(head, statement, symbols, force || word.length > 0);
  const lower = word.toLowerCase();
  const filtered = items.filter((s) => s.label.toLowerCase().startsWith(lower) && !(s.label === word && word));
  return { from, to: cursor, items: filtered.slice(0, 40) };
}

function candidates(head, statement, symbols, typed) {
  const trimmed = head.trim();
  const minor = (symbols.keyMode ? MODES[symbols.keyMode]?.[2] !== 4 : true);

  if (trimmed === "" && !/^\s+$/.test(head)) return typed ? LINE_STARTERS.map((s) => ({ ...s, kind: "line" })) : [];
  if (/^style\s+$/.test(head)) return STYLE_NAMES.map((n) => item(n, "style", `style ${n} · ${STYLES[n].tempo} bpm`, STYLES[n].doc));
  if (/\bbeat\s+$/.test(head)) return beatSuggestions(symbols.style);
  if (/^key\s+$/.test(head)) return NOTE_NAMES.map((n) => item(n, "note", `key ${n} …`, "the key's home note"));
  if (/^key\s+\S+\s+$/.test(head)) return Object.keys(MODES).map((m) => item(m, "mode", `key d ${m}`, MODE_DOCS[m]));
  if (/^chords\b/.test(head)) return chordSuggestions(head, minor ? "minor" : "major", symbols.style);
  if (STEP_AFTER.test(head)) return verbSuggestions(symbols);
  if (/[:=]/.test(statement) && typed) return patternSuggestions(symbols);
  return [];
}

function verbSuggestions(symbols) {
  const verbs = Object.entries(VERBS).map(([name, v]) =>
    item(name, v.group, signature(name, v.args), v.doc, v.example, v.args.length && !v.args[0].endsWith("?") ? `${name} ` : name));
  const defs = (symbols.defs ?? []).map((name) => item(name, "yours", `${name} …`, "a verb you defined"));
  return [...defs, ...styleFirst(verbs, STYLES[symbols.style]?.sounds, symbols.style)];
}

function patternSuggestions(symbols) {
  const gens = Object.entries(GENERATORS).map(([name, g]) =>
    item(name, "pattern", signature(name, g.args), g.doc, g.example, g.args.length ? `${name} ` : name));
  const vars = (symbols.vars ?? []).map((name) => item(name, "yours", name, "a variable you defined"));
  const words = [
    item("for", "loop", "for i 0..3 (theme + i)", "plays the body once per value of i, one after another", "", "for i 0..3 ("),
    item("if", "condition", "if bar > 8 then a else b", "picks a pattern by bar", "", "if bar > "),
    item("bar", "number", "bar", "the current bar number: 1, 2, 3 …"),
  ];
  return [...vars, ...gens, ...words];
}

function chordSuggestions(head, quality, style) {
  const names = ROMAN[quality];
  const written = head.trim().split(/\s+/).slice(1);
  if (written.length === 0) {
    const fitting = (STYLES[style]?.progressions ?? []).map(([prog, doc]) => item(prog, `fits ${style}`, `chords ${prog}`, doc));
    const general = PROGRESSIONS[quality].map(([prog, doc]) => item(prog, "progression", `chords ${prog}`, doc));
    return [...fitting, ...general.filter((g) => !fitting.some((f) => f.label === g.label))];
  }
  const last = chordDegree(written[written.length - 1]);
  const next = last === null ? [] : NEXT_CHORD[last];
  const likely = next.map((d) => item(names[d], "next chord", `${names[d]} after ${written[written.length - 1]}`, "a strong next chord"));
  const rest = names.filter((_, d) => !next.includes(d)).map((n) => item(n, "chord", n, "a chord in this key"));
  return [...likely, ...rest];
}

function beatSuggestions(style) {
  const all = Object.entries(BEATS).map(([name, b]) => item(name, "groove", `beat ${name}  ${b.steps}`, b.doc));
  return styleFirst(all, STYLES[style]?.beats, style);
}

/* Put the style's favourites first and tag them. */
function styleFirst(items, favourites = [], style = "") {
  if (!favourites.length) return items;
  const picked = favourites.map((name) => items.find((i) => i.label === name)).filter(Boolean)
    .map((i) => ({ ...i, kind: `fits ${style}` }));
  return [...picked, ...items.filter((i) => !favourites.includes(i.label))];
}

const MODE_DOCS = {
  major: "bright and settled", minor: "dark and emotional", dorian: "minor, but hopeful",
  phrygian: "dark, Spanish-tinged", lydian: "dreamy and floating", mixolydian: "bluesy major",
  locrian: "unstable and tense", harmonic: "minor with a dramatic leading note",
};

function signature(name, args) {
  const words = { num: "n", "num?": "[n]", step: "verb", pat: "pattern", cond: "condition", "else?": "[else verb]" };
  return [name, ...args.map((a) => words[a] ?? a)].join(" ");
}

function item(label, kind, detail, doc, example = "", insert = label) {
  return { label, kind, detail, doc, example, insert };
}

function none(cursor) {
  return { from: cursor, to: cursor, items: [] };
}

/* Earlier lines of a chain that continues with ">" lines. */
function statementText(text, lineStart) {
  const lines = text.slice(0, lineStart).split("\n");
  lines.pop();
  const parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    parts.unshift(lines[i]);
    if (!lines[i].trim().startsWith(">")) break;
  }
  const current = text.slice(lineStart).trimStart();
  return current.startsWith(">") ? parts.join("\n") + "\n" : "";
}
