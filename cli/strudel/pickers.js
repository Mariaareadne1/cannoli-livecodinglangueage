/* ============================================================
   cannoli — the click-to-edit tools, for Strudel code
   Reads the call under the cursor into a beat grid, melody grid,
   chord picker and the rest, and writes your choices back as
   ordinary Strudel. Nothing here draws: cli/panel does that.
   ============================================================ */

import { BEATS, STYLES } from "../../src/core/styles.js";
import { MODES, pitchClass, mod } from "../../src/core/harmony.js";
import { THREAD_DRUMS } from "../../src/editor/pickers.js";
import { readCells, writeCells, finer, MELODIC_NAMES } from "../../src/editor/melody-grid.js";
import { chordOptions, spellStep, progressionsFor } from "../../src/editor/chord-picker.js";
import { MODE_DOCS, NOTE_NAMES, NEXT_CHORD } from "../../src/editor/complete.js";
import { keyDetails } from "../../src/editor/key-picker.js";
import { grooveList } from "../../src/editor/groove-picker.js";
import { euclidSteps } from "../../src/core/verbs.js";
import { ringName } from "../../src/editor/euclid-ring.js";
import { blocksIn } from "./highlight.js";
import { SOUNDS } from "./complete.js";
import { readHeader } from "./dialect.js";
import { cannoliToolAt } from "../panel/cannoli-tools.js";

export const DRUM_WORDS = new Set(["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cb", "cr", "rd", "sh", "tb", "perc"]);
const BEAT_STEPS = 16;
const MELODY_STEPS = 8;
const BARS = 16;
const TOP_STEP = 9;
const DEFAULT_SCALE = { root: "c", octave: "", mode: "minor" };
const BRIGHTEST_FIRST = ["lydian", "major", "mixolydian", "dorian", "minor", "harmonic", "phrygian", "locrian"];
const CHANCE_WORDS = ["sometimes", "often", "rarely", "almostNever", "almostAlways", "someCycles"];
const CHANCE_BY_WORDS = ["sometimesBy", "someCyclesBy"];
// the numbers worth sliding: [lowest, highest, step, value if none is written]
const SLIDERS = {
  gain: [0, 1.5, 0.01, 0.8], postgain: [0, 1.5, 0.01, 1], velocity: [0, 1, 0.01, 1], pan: [0, 1, 0.01, 0.5],
  lpf: [50, 10000, 50, 2000], cutoff: [50, 10000, 50, 2000], ctf: [50, 10000, 50, 2000], hpf: [20, 8000, 20, 400], lpq: [0, 30, 0.5, 1], hpq: [0, 30, 0.5, 1],
  room: [0, 1, 0.01, 0.4], roomsize: [0, 10, 0.1, 2], delay: [0, 1, 0.01, 0.4], delaytime: [0, 1, 0.01, 0.25], delayfeedback: [0, 0.95, 0.01, 0.5],
  shape: [0, 1, 0.01, 0.3], crush: [1, 16, 1, 8], coarse: [1, 32, 1, 4], speed: [-2, 4, 0.05, 1],
  fast: [0.25, 8, 0.25, 2], slow: [0.25, 8, 0.25, 2], ply: [1, 8, 1, 2], clip: [0.1, 4, 0.1, 1], legato: [0.1, 4, 0.1, 1],
  attack: [0, 2, 0.01, 0.1], decay: [0, 2, 0.01, 0.2], sustain: [0, 1, 0.01, 0.6], release: [0, 4, 0.01, 0.3], octave: [0, 8, 1, 3],
  bloom: [0, 1, 0.01, 0.5], ghost: [0, 1, 0.01, 0.5], tape: [0, 1, 0.01, 0.5], pump: [0, 1, 0.01, 0.6], air: [0, 1, 0.01, 0.4],
  setcpm: [10, 90, 0.5, 30], setcps: [0.1, 2, 0.01, 0.5],
};

/** What can happen on chosen cycles, written as Strudel. */
export const STRUDEL_VERBS = [
  { title: "order", choices: [["rev", "plays the cycle backwards"], ["palindrome", "forwards, then backwards the next cycle"], ["iter(4)", "starts one step later each cycle"], ["shuffle(4)", "shuffles four slices"]] },
  { title: "time", choices: [["fast(2)", "twice as fast"], ["slow(2)", "half as fast"], ["ply(2)", "plays each note twice"], ["hurry(2)", "faster and higher"]] },
  { title: "pitch", choices: [["add(note(7))", "up a fifth"], ["add(note(12))", "up an octave"], ["add(note(-12))", "down an octave"]] },
  { title: "tone", choices: [["x=>x.gain(.5)", "half as loud"], ["x=>x.lpf(500)", "dark and muffled"], ["x=>x.room(.8)", "drenched in reverb"], ["x=>x.crush(4)", "crunchy and lo-fi"]] },
  { title: "together", choices: [["x=>x.rev().fast(2)", "backwards and twice as fast"], ["x=>x.ply(2).gain(.6)", "doubled and quieter"]] },
].map(({ title, choices }) => ({ title, choices: choices.map(([code, doc]) => ({ code, doc })) }));

/* ---------- reading a line ---------- */

function lineAt(text, cursor) {
  const start = text.lastIndexOf("\n", cursor - 1) + 1;
  const newline = text.indexOf("\n", cursor);
  const end = newline < 0 ? text.length : newline;
  const whole = text.slice(start, end);
  let quote = null;
  let codeEnd = whole.length;
  for (let i = 0; i < whole.length; i++) {
    if (quote) { if (whole[i] === quote) quote = null; } else if (`"'\``.includes(whole[i])) quote = whole[i];
    else if (whole.startsWith("//", i)) { codeEnd = i; break; }
  }
  return { start, end, code: whole.slice(0, codeEnd) };
}

/* Every call on a line, with where its arguments are. */
export function callsIn(code) {
  const calls = [];
  for (const m of code.matchAll(/(\.?)\b([A-Za-z_]\w*)\(/g)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let quote = null;
    let close = -1;
    for (let i = open; i < code.length; i++) {
      const ch = code[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (`"'\``.includes(ch)) quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) { close = i; break; }
    }
    if (close >= 0) calls.push({ name: m[2], dotted: m[1] === ".", start: m.index, nameStart: m.index + m[1].length, open, close, args: code.slice(open + 1, close) });
  }
  return calls;
}

/* Arguments split at top-level commas, each with its place in the line. */
export function splitArgs(call) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let from = 0;
  const { args } = call;
  for (let i = 0; i <= args.length; i++) {
    const ch = args[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch && `"'\``.includes(ch)) quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (i === args.length || (ch === "," && depth === 0)) {
      const raw = args.slice(from, i);
      const lead = raw.length - raw.trimStart().length;
      parts.push({ text: raw.trim(), start: call.open + 1 + from + lead, end: call.open + 1 + from + lead + raw.trim().length });
      from = i + 1;
    }
  }
  return parts.filter((p, i) => p.text || parts.length > 1 || i > 0);
}

/* The one quoted string a call was given, or null. */
export function stringOf(call) {
  const [arg, extra] = splitArgs(call);
  if (!arg || extra) return null;
  const m = arg.text.match(/^(["'`])(.*)\1$/);
  return m ? { body: m[2], start: arg.start + 1, end: arg.end - 1 } : null;
}

const tidy = (value, step) => String(Number(value.toFixed((String(step).split(".")[1] ?? "").length)));

/* ---------- the song's scale ---------- */

function parseScale(body) {
  const m = body.match(/^([A-Ga-g][#b]?)(\d*)[: ](.+)$/);
  if (!m) return null;
  const mode = m[3].replace(/:/g, " ") === "harmonic minor" ? "harmonic" : m[3];
  return MODES[mode] ? { root: m[1].toLowerCase(), octave: m[2], mode } : null;
}

function writeScale({ root, octave, mode }) {
  return `${root[0].toUpperCase()}${root.slice(1)}${octave}:${mode === "harmonic" ? "harmonic:minor" : mode}`;
}

function songScale(text) {
  const { key } = readHeader(text);
  if (key) return { root: key.root, octave: "", mode: key.mode };
  const m = text.match(/\.scale\(\s*["']([^"']+)["']/);
  return (m && parseScale(m[1])) ?? DEFAULT_SCALE;
}

/* ---------- beats ---------- */

function readBeat(body) {
  const words = new Set();
  const dots = body.replace(/([A-Za-z_]\w*)(?:\*(\d+))?|~|-/g, (atom, word, times) => {
    if (!word) return ".";
    words.add(word);
    return times ? `[${Array(Number(times)).fill("0").join(" ")}]` : "0";
  });
  if (words.size !== 1) return null;
  const cells = readCells(dots, BEAT_STEPS);
  if (!cells || cells.length !== BEAT_STEPS) return null;
  return { word: [...words][0], steps: cells.map((c) => Array.isArray(c)) };
}

/** Steps as mini-notation: bd*4 when it's regular, otherwise written out. */
export function writeBeat(word, steps) {
  if (!steps.some(Boolean)) return "~";
  for (let count = steps.length; count >= 1; count--) {
    if (steps.length % count === 0 && steps.every((on, i) => on === (i % (steps.length / count) === 0))) return count === 1 ? word : `${word}*${count}`;
  }
  let cells = steps;
  while (cells.length % 2 === 0 && cells.every((on, i) => !on || i % 2 === 0)) cells = cells.filter((_, i) => i % 2 === 0);
  return cells.map((on) => (on ? word : "~")).join(" ");
}

export function beatPicker(text, line, call, str, name) {
  const read = readBeat(str.body);
  if (!read) return null;
  const after = callsIn(line.code).find((c) => c.name === "groove" && c.start === call.close + 1);
  const named = after && stringOf(after)?.body;
  const steps = BEATS[named] ? [...BEATS[named].steps].map((c) => c === "x") : read.steps;
  const start = line.start + str.start;
  const end = line.start + (BEATS[named] ? stringOf(after).end : str.end);
  return {
    kind: "beat", steps, perBeat: 4, drum: read.word, name, blank: false, grooves: grooveList(styleOf(text)),
    apply: (next) => ({ start, end, text: writeBeat(read.word, next) }),
    applyGroove: (groove) => ({ start, end, text: `${read.word}").groove("${groove}` }),
    soundOffset: null,
  };
}

function blankBeat(text, line, label, drum) {
  const at = line.start + line.code.length;
  const gap = /\s$/.test(line.code) ? "" : " ";
  return {
    kind: "beat", steps: Array(BEAT_STEPS).fill(false), perBeat: 4, drum, name: label, blank: true, grooves: grooveList(styleOf(text)),
    apply: (next) => ({ start: at, end: at, text: `${gap}s("${writeBeat(drum, next)}")` }),
    applyGroove: (groove) => ({ start: at, end: at, text: `${gap}s("${drum}").groove("${groove}")` }),
  };
}

const styleOf = (text) => text.match(/\bstyle\(\s*["'](\w+)["']/)?.[1];

/* ---------- melodies ---------- */

function spread(cells, columns) {
  return cells.length >= columns || columns % cells.length !== 0 ? cells : spread(finer(cells), columns);
}

function rowsOf(cells, scale) {
  const used = cells.flatMap((c) => (Array.isArray(c) ? c : []));
  const top = Math.max(TOP_STEP, ...used);
  const bottom = Math.min(0, ...used);
  return Array.from({ length: top - bottom + 1 }, (_, i) => {
    const step = top - i;
    return { step, note: spellStep(scale, step), home: mod(step, 7) === 0 };
  });
}

function melodyPicker(text, line, str, name, minColumns) {
  const cells = readCells(str.body.replace(/~|-(?!\d)/g, "."), Math.max(MELODY_STEPS, minColumns));
  if (!cells) return null;
  const shown = minColumns ? spread(cells, minColumns) : cells;
  const start = line.start + str.start;
  const end = line.start + str.end;
  return {
    kind: "melody", cells: shown, name, blank: false, rows: rowsOf(shown, songScale(text)),
    apply: (next) => ({ start, end, text: writeCells(next).replace(/\./g, "~") }),
  };
}

function blankMelody(text, line, name, minColumns) {
  const cells = Array(Math.max(MELODY_STEPS, minColumns)).fill(null);
  const at = line.start + line.code.length;
  const gap = /\s$/.test(line.code) ? "" : " ";
  const scale = songScale(text);
  return {
    kind: "melody", cells, name, blank: true, rows: rowsOf(cells, scale),
    apply: (next) => ({ start: at, end: at, text: `${gap}n("${writeCells(next).replace(/\./g, "~")}").scale("${writeScale(scale)}")` }),
  };
}

/* ---------- sliders ---------- */

function sliderPicker(line, call) {
  const [min, max, step, fallback] = SLIDERS[call.name];
  const [arg, extra] = splitArgs(call);
  if (extra || (arg && !/^-?\d*\.?\d+$/.test(arg.text))) return null;
  const value = arg ? Number(arg.text) : fallback;
  const start = line.start + (arg?.start ?? call.open + 1);
  const end = line.start + (arg?.end ?? call.close);
  return {
    kind: "slider", word: call.name, value, min: Math.min(min, value), max: Math.max(max, value), step, canAddToCode: false,
    apply: (next) => ({ start, end, text: tidy(next, step) }),
  };
}

/* ---------- every, when and friends ---------- */

function readBinary(body) {
  const inner = body.match(/^<(.*)>$/)?.[1];
  if (!inner) return null;
  const bits = inner.trim().split(/\s+/).flatMap((t) => {
    const m = t.match(/^([01])(?:!(\d+))?$/);
    return m ? Array(Number(m[2] ?? 1)).fill(m[1] === "1") : [null];
  });
  return bits.includes(null) ? null : bits;
}

/* Bars as the simplest Strudel: every(4, …) on bars 1, 5, 9; lastOf(4, …) on bars 4, 8, 12; otherwise when("<…>"). */
export function writeBars(bars, fn) {
  const same = (fires) => bars.every((on, i) => on === fires(i));
  for (let n = 1; n <= BARS; n++) if (same((i) => i % n === 0)) return `every(${n}, ${fn})`;
  for (let n = 2; n <= BARS; n++) if (same((i) => (i + 1) % n === 0)) return `lastOf(${n}, ${fn})`;
  const period = [2, 4, 8, 16].find((p) => bars.every((on, i) => on === bars[i % p]));
  return `when("<${bars.slice(0, period).map((on) => (on ? 1 : 0)).join(" ")}>", ${fn})`;
}

function barsPicker(line, call) {
  const [first, second] = splitArgs(call);
  let fires = () => false;
  if (call.name === "when") {
    const bits = first && readBinary(first.text.slice(1, -1));
    if (!bits) return null;
    fires = (i) => bits[i % bits.length];
  } else if (first?.text) {
    const n = Number(first.text);
    if (!Number.isInteger(n) || n < 1 || n > BARS) return null;
    fires = call.name === "lastOf" ? (i) => (i + 1) % n === 0 : (i) => i % n === 0;
  }
  const verb = second?.text ?? "";
  const start = line.start + call.nameStart;
  const end = line.start + call.close + 1;
  const bars = Array.from({ length: BARS }, (_, i) => fires(i));
  return {
    kind: "bars", bars, verb, groups: STRUDEL_VERBS,
    apply: (next) => (next.some(Boolean) ? { start, end, text: writeBars(next, verb || "rev") } : null),
    applyVerb: (code) => (second
      ? { start: line.start + second.start, end: line.start + second.end, text: code }
      : { start, end, text: writeBars(bars.some(Boolean) ? bars : bars.map((_, i) => i % 4 === 0), code) }),
  };
}

function verbPicker(line, call) {
  const parts = splitArgs(call);
  const hasChance = CHANCE_BY_WORDS.includes(call.name);
  const chance = hasChance ? parts[0] : null;
  const fn = hasChance ? parts[1] : parts[0];
  if (hasChance && chance && !/^\d*\.?\d+$/.test(chance.text)) return null;
  return {
    kind: "verb", word: call.name, verb: fn?.text ?? "", chance: hasChance ? Number(chance?.text ?? 0.5) : null, groups: STRUDEL_VERBS,
    apply: (code) => (fn
      ? { start: line.start + fn.start, end: line.start + fn.end, text: code }
      : { start: line.start + call.open + 1, end: line.start + call.close, text: hasChance ? `0.5, ${code}` : code }),
    applyChance: (value) => (chance ? { start: line.start + chance.start, end: line.start + chance.end, text: String(value) } : null),
  };
}

/* ---------- rings ---------- */

function ring(word, hits, steps, rotation, write) {
  return {
    kind: "euclid", word, hits, steps, rotation,
    pattern: (v) => euclidSteps(v.hits, v.steps, v.rotation),
    nameOf: (v) => ringName(v.hits, v.steps, v.rotation),
    apply: write,
  };
}

function miniRing(line, str) {
  const m = str.body.match(/^(\w+)\((\d+),\s*(\d+)(?:,\s*(\d+))?\)$/);
  if (!m) return null;
  return ring("euclid", Number(m[2]), Number(m[3]), Number(m[4] ?? 0), ({ hits, steps, rotation }) => ({
    start: line.start + str.start, end: line.start + str.end,
    text: `${m[1]}(${Math.min(hits, steps)},${steps}${rotation % steps ? `,${rotation % steps}` : ""})`,
  }));
}

function methodRing(line, call) {
  const nums = splitArgs(call).map((a) => Number(a.text));
  if (nums.length < 2 || nums.some((n) => !Number.isInteger(n))) return null;
  return ring(call.name, nums[0], nums[1], nums[2] ?? 0, ({ hits, steps, rotation }) => {
    const turn = rotation % steps;
    return { start: line.start + call.nameStart, end: line.start + call.close + 1, text: `${turn ? "euclidRot" : "euclid"}(${Math.min(hits, steps)}, ${steps}${turn ? `, ${turn}` : ""})` };
  });
}

/* ---------- chords, keys, sounds, grooves ---------- */

function chordsPicker(text, line, str) {
  const words = (str.body.match(/^<(.*)>$/)?.[1] ?? str.body).trim().split(/\s+/).filter(Boolean);
  if (!words.every((w) => /^[A-G][#b]?[\w^+#-]*$/.test(w))) return null;
  const scale = songScale(text);
  const key = text.includes(".scale(") || readHeader(text).key ? scale : { root: "a", mode: "minor" };
  const options = chordOptions(key).map((o) => ({ ...o, word: o.name }));
  const degree = (word) => options.findIndex((o) => o.name === word);
  return {
    kind: "chords", words, options, key, nameOf: (w) => w,
    progressions: progressionsFor(key, styleOf(text)).map((p) => ({ ...p, words: p.names.split(" ") })),
    next: (slot) => (degree(words[slot - 1] ?? "") < 0 ? [] : NEXT_CHORD[degree(words[slot - 1])].map((d) => options[d])),
    added: (list) => [...list, (NEXT_CHORD[degree(list.at(-1))] ?? [0]).map((d) => options[d])[0]?.word ?? options[0].word],
    apply: (next) => ({ start: line.start + str.start, end: line.start + str.end, text: `<${next.join(" ")}>` }),
  };
}

function keyPicker(text, str) {
  const scale = parseScale(str.body);
  if (!scale) return null;
  const details = { note: scale.root, mode: scale.mode };
  return {
    kind: "key", note: scale.root, mode: scale.mode,
    notes: NOTE_NAMES.map((name) => ({ name, label: name[0].toUpperCase() + name.slice(1) })),
    modes: BRIGHTEST_FIRST.map((name) => ({ name, doc: MODE_DOCS[name] })),
    details: keyDetails(details),
    same: (a, b) => pitchClass(a) === pitchClass(b),
    apply({ note, mode }) {
      // every part shares the key, so every scale in the song moves together
      const matches = [...text.matchAll(/\.scale\(\s*(["'])([^"']+)\1/g)].filter((m) => parseScale(m[2]));
      const from = matches[0].index;
      const last = matches.at(-1);
      const to = last.index + last[0].length;
      const updated = text.slice(from, to).replace(/\.scale\(\s*(["'])([^"']+)\1/g, (whole, q, body) => {
        const old = parseScale(body);
        return old ? `.scale(${q}${writeScale({ ...old, root: note ?? old.root, mode: mode ?? old.mode })}${q}` : whole;
      });
      return { start: from, end: to, text: updated };
    },
  };
}

function soundPicker(text, line, str, thread) {
  const favourites = STYLES[styleOf(text)]?.sounds ?? [];
  const entries = SOUNDS.map(([word, doc]) => ({ word, doc, fits: favourites.includes(word) }));
  const drums = { title: "drums", sounds: entries.filter((s) => DRUM_WORDS.has(s.word)) };
  const melodic = { title: "melodic sounds", sounds: entries.filter((s) => !DRUM_WORDS.has(s.word)) };
  return {
    kind: "sound", current: str.body, thread, groups: DRUM_WORDS.has(str.body) ? [drums, melodic] : [melodic, drums],
    apply: (word) => ({ start: line.start + str.start, end: line.start + str.end, text: word }),
  };
}

function groovePicker(text, line, str, thread) {
  return {
    kind: "groove", name: str.body, thread, grooves: grooveList(styleOf(text)),
    apply: (name) => ({ start: line.start + str.start, end: line.start + str.end, text: name }),
  };
}

/* ---------- which tool is under the cursor ---------- */

function pickerFor(text, line, call, label, opts) {
  const str = stringOf(call);
  const { name } = call;
  if (name === "chord" && str) return chordsPicker(text, line, str);
  if (name === "scale" && str) return keyPicker(text, str);
  if ((name === "groove" || name === "beat") && str && BEATS[str.body]) return groovePicker(text, line, str, label);
  if ((name === "s" || name === "sound") && str) {
    const turned = miniRing(line, str);
    if (turned) return turned;
    const single = /^\w+$/.test(str.body);
    if (single && (call.dotted || !DRUM_WORDS.has(str.body))) return soundPicker(text, line, str, label);
    return beatPicker(text, line, call, str, label ?? "this line");
  }
  if (name === "n" && str) return melodyPicker(text, line, str, label ?? "this line", opts.minColumns ?? 0);
  if (name === "euclid" || name === "euclidRot") return methodRing(line, call);
  if (SLIDERS[name]) return sliderPicker(line, call);
  if (["every", "firstOf", "lastOf", "when"].includes(name)) return barsPicker(line, call);
  if (CHANCE_WORDS.includes(name) || CHANCE_BY_WORDS.includes(name)) return verbPicker(line, call);
  return null;
}

/**
 * The tool for the cursor's place in the song, or null.
 * @param {string} text
 * @param {number} cursor
 * @param {{ minColumns?: number }} [opts]
 */
export function strudelPickerAt(text, cursor, opts = {}) {
  const line = lineAt(text, cursor);
  if (!line.code.trim()) return null;
  if (/^\s*(key|tempo)\s/.test(line.code)) return cannoliToolAt(text, cursor, opts);
  const column = cursor - line.start;
  const label = line.code.match(/^\s*([A-Za-z_$][\w$]*):/)?.[1] ?? null;
  const blank = line.code.match(/^\s*([A-Za-z_][\w]*):\s*$/)?.[1];
  if (blank) {
    const lower = blank.toLowerCase();
    if (THREAD_DRUMS[lower]) return blankBeat(text, line, blank, THREAD_DRUMS[lower] === "cb" ? "cb" : THREAD_DRUMS[lower]);
    if (MELODIC_NAMES.some((word) => lower.includes(word))) return blankMelody(text, line, blank, opts.minColumns ?? 0);
    return null;
  }
  // the innermost call wins: on fast(2) inside every(4, fast(2)) you get fast's slider
  const here = callsIn(line.code).filter((c) => column >= c.start && column <= c.close + 1).sort((a, b) => (a.close - a.start) - (b.close - b.start));
  for (const call of here) {
    const picker = pickerFor(text, line, call, label, opts);
    if (picker) return picker;
  }
  return null;
}

/* ---------- the song timeline ---------- */

const MASK_RE = /\s*\.mask\(\s*["']<([01!\d\s]+)>["']\s*\)/;

export function statements(text) {
  const blocks = blocksIn(text);
  return blocks.map((block, i) => {
    const limit = blocks[i + 1]?.start ?? text.length;
    const lines = text.slice(block.start, limit).split("\n");
    let length = 0;
    let codeLength = 0;
    for (const whole of lines) {
      const code = lineAt(whole, 0).code.trimEnd();
      if (i < blocks.length && !code.trim() && length > 0) break;
      if (code.trim()) codeLength = length + code.length;
      length += whole.length + 1;
    }
    return { name: block.name, index: i, start: block.start, end: block.start + codeLength };
  });
}

/** One row per pattern: which cycles it plays in. */
export function readStrudelTimeline(text, bars) {
  return statements(text).map((s) => {
    const bits = readBinary(`<${text.slice(s.start, s.end).match(MASK_RE)?.[1] ?? "1"}>`) ?? [true];
    return { id: s.index, name: s.name, on: Array.from({ length: bars }, (_, i) => bits[i % bits.length]) };
  });
}

function writeMask(on) {
  const runs = [];
  on.forEach((v) => { if (runs.at(-1)?.[0] === v) runs.at(-1)[1] += 1; else runs.push([v, 1]); });
  return runs.map(([v, n]) => `${v ? 1 : 0}${n > 1 ? `!${n}` : ""}`).join(" ");
}

/** The edit that makes a pattern play in these cycles. The timeline loops, as patterns do. */
export function applyStrudelTimeline(text, id, on) {
  const s = statements(text)[id];
  if (!s) return null;
  const body = text.slice(s.start, s.end);
  const rule = body.match(MASK_RE);
  const step = on.every(Boolean) ? "" : `.mask("<${writeMask(on)}>")`;
  if (rule) return { start: s.start + rule.index, end: s.start + rule.index + rule[0].length, text: step };
  return step ? { start: s.end, end: s.end, text: step } : null;
}
