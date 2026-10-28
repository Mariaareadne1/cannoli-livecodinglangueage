/* ============================================================
   cannoli — suggestions
   Given the text and cursor, what could come next? Returns the
   word being typed (from/to) and a list of suggestions, each
   with a one-line explanation for the suggestion card.
   A suggestion can also carry a `fill`: the rest of the line,
   fully written out (`preview` is the line it makes). On a blank
   — "kick: ", "def lift n = ", "theme = " — every suggestion is
   a whole line.
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

  const lineEnd = text.indexOf("\n", cursor) < 0 ? text.length : text.indexOf("\n", cursor);

  const blank = word ? null : blankSuggestions(head, symbols);
  if (blank) return { from, to: cursor, lineEnd, items: blank.map((s) => ({ ...s, detail: head + s.insert })) };

  const items = candidates(head, statement, symbols, force || word.length > 0);
  const lower = word.toLowerCase();
  const filtered = items.filter((s) => s.label.toLowerCase().startsWith(lower) && !(s.label === word && word));
  return { from, to: cursor, lineEnd, items: filtered.slice(0, 40).map((s) => (s.fill ? { ...s, preview: head + s.fill } : s)) };
}

/* ---------- blanks: whole lines to fill in ---------- */

const MOTIF = "0 2 4 _ 6 4";

function blankSuggestions(head, symbols) {
  const def = head.match(/^def\s+[A-Za-z]\w*((?:\s+[A-Za-z]\w*)*)\s*=\s$/);
  if (def) return fills(defBodies(def[1].trim().split(/\s+/).filter(Boolean)));
  const named = head.match(/^([A-Za-z]\w*)\s*([:=])\s$/);
  if (!named || /^(key|tempo|chords|beats|swing|style)$/.test(named[1])) return null;
  return fills(named[2] === "=" ? VARIABLE_BODIES : threadBodies(named[1], symbols));
}

/* Thread bodies, the ones that suit the thread's name first. */
function threadBodies(name, symbols) {
  const groove = STYLES[symbols.style]?.beats?.[0] ?? "fourfloor";
  const melody = symbols.vars?.[0] ?? MOTIF;
  const bodies = [
    ["kick", `beat ${groove} > kick`, "a kick on the style's main groove"],
    ["snare", "beat backbeat > snare", "a snare on beats 2 and 4"],
    ["clap", "beat backbeat > clap", "a clap on beats 2 and 4"],
    ["hat", "hits 7 16 > hat > gain 0.4", "quiet, busy hats spread across the bar"],
    ["bass", "0 . 0 4 > low > saw > pump", "a bassline that breathes with the kick"],
    ["pad", "chord > slow 2 > pad > bloom", "the chords, held for two bars, ringing in the key"],
    ["lead", `${melody} > every 4 rev > high > tri`, "a melody up high, backwards every 4th bar"],
    ["arp", "chord > arp > fast 2 > high > pluck", "the chord, one note at a time"],
  ];
  const lower = name.toLowerCase();
  const fits = ([key]) => lower.startsWith(key) || key.startsWith(lower);
  return [...bodies.filter(fits), ...bodies.filter((b) => !fits(b))].map(([, body, doc]) => [body, doc]);
}

function defBodies([param]) {
  if (!param) {
    return [
      ["rev > fast 2", "a verb: backwards and twice as fast"],
      ["up 2 > short", "a verb: two steps up, short and detached"],
      [MOTIF, "a pattern: a motif to reuse anywhere"],
    ];
  }
  return [
    [`when bar <= ${param} mute`, `a verb: silent until bar ${param} + 1, for build-ups ("> enter 8")`],
    [`up ${param} > fast 2`, `a verb: ${param} steps up, twice as fast`],
    [`every ${param} rev`, `a verb: backwards every ${param}th bar`],
    [`0 2 4 + ${param}`, `a pattern: a motif that starts ${param} steps up`],
  ];
}

const VARIABLE_BODIES = [
  [MOTIF, "a motif: use it in any thread, add to it, multiply it"],
  ["run 8 * 3 % 7", "a melody from arithmetic: 0 3 6 2 5 1 4 0"],
  ["walk 8 > penta", "eight notes that wander, new every bar"],
  ["hits 3 8", "a rhythm: 3 hits spread over 8 steps"],
];

function fills(bodies) {
  return bodies.map(([body, doc]) => ({ label: body, kind: "fill in", detail: body, doc, example: "", insert: body }));
}

/* The verb or pattern written out from its example: "every 4 rev" from "theme > every 4 rev". */
function withFill(it, example) {
  const fill = example.match(new RegExp(`(?:^|[\\s(>])(${it.label}\\b.*)$`))?.[1] ?? "";
  return fill && fill !== it.insert.trim() ? { ...it, fill } : it;
}

function candidates(head, statement, symbols, typed) {
  const trimmed = head.trim();
  const minor = (symbols.keyMode ? MODES[symbols.keyMode]?.[2] !== 4 : true);

  if (trimmed === "" && !/^\s+$/.test(head)) return typed ? LINE_STARTERS.map((s) => ({ ...s, kind: "line", ...(s.detail !== s.insert && { fill: s.detail }) })) : [];
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
    withFill(item(name, v.group, signature(name, v.args), v.doc, v.example, v.args.length && !v.args[0].endsWith("?") ? `${name} ` : name), v.example));
  const defs = (symbols.defs ?? []).map((name) => item(name, "yours", `${name} …`, "a verb you defined"));
  return [...defs, ...styleFirst(verbs, STYLES[symbols.style]?.sounds, symbols.style)];
}

function patternSuggestions(symbols) {
  const gens = Object.entries(GENERATORS).map(([name, g]) =>
    withFill(item(name, "pattern", signature(name, g.args), g.doc, g.example, g.args.length ? `${name} ` : name), g.example));
  const vars = (symbols.vars ?? []).map((name) => item(name, "yours", name, "a variable you defined"));
  const melody = symbols.vars?.[0] ?? `(${MOTIF})`;
  const words = [
    { ...item("for", "loop", "for i 0..3 (theme + i)", "plays the body once per value of i, one after another", "", "for i 0..3 ("), fill: `for i 0..3 (${melody} + i)` },
    { ...item("if", "condition", "if bar > 8 then a else b", "picks a pattern by bar", "", "if bar > "), fill: `if bar > 8 then ${melody} else ${melody} * 2` },
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
