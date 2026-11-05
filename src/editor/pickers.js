/* ============================================================
   cannoli — pickers
   The little grids under a line. Reads a line into beats you can
   click (kick: …) or bars you can click (every …), and writes
   your clicks back as code. No drawing here: the editors draw.
   ============================================================ */

import { BEATS } from "../core/styles.js";
import { DRUM_WORDS, euclidSteps } from "../core/verbs.js";
import { melodyPicker, splitBody } from "./melody-grid.js";
import { chordPicker } from "./chord-picker.js";

const STEPS_PER_BEAT = 4;
const BARS = 16;
const DEFAULT_VERB = "rev";
const THREAD_DRUMS = {
  kick: "bd", bd: "bd", drum: "bd", drums: "bd",
  snare: "sd", sd: "sd",
  hat: "hh", hats: "hh", hihat: "hh", hh: "hh",
  open: "oh", oh: "oh",
  clap: "cp", cp: "cp",
  rim: "rim",
  tom: "mt", mt: "mt",
  bell: "cb", cowbell: "cb", cb: "cb",
  shaker: "sh", sh: "sh",
};
// the words with a number you can slide: [lowest, highest, step, value if none is written]
const SLIDERS = {
  gain: [0, 1, 0.01, 0.5], pan: [-1, 1, 0.01, 0], bright: [0, 1, 0.01, 0.5],
  bloom: [0, 1, 0.01, 0.5], ghost: [0, 1, 0.01, 0.5], tape: [0, 1, 0.01, 0.5], pump: [0, 1, 0.01, 0.6], air: [0, 1, 0.01, 0.4],
  someCyclesBy: [0, 1, 0.01, 0.5], maybe: [0, 1, 0.01, 0.5], drift: [0, 1, 0.01, 0.3],
  clip: [0.1, 4, 0.1, 1], fast: [1, 8, 0.5, 2], slow: [1, 8, 0.5, 2], ply: [1, 8, 1, 2], chop: [1, 8, 1, 2],
  up: [0, 12, 1, 2], down: [0, 12, 1, 2], scaleTranspose: [-12, 12, 1, 2], oct: [-3, 3, 1, 1], rot: [0, 8, 1, 1],
};
const SETTING_SLIDERS = { tempo: [40, 220, 1, 120], swing: [0, 0.5, 0.01, 0.1] };
const CODE_SLIDER = String.raw`slider\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)`;
const SLIDER_ARG = new RegExp(String.raw`^(\s+)(?:${CODE_SLIDER}|(-?\d*\.?\d+))`);
const WORD_RE = new RegExp(String.raw`(?:^|[>(\s])(${Object.keys(SLIDERS).join("|")})\b`, "g");
const BAR_RE = /(?:^\s*|[>(]\s*)(every|firstOf|lastOf|when)\b/g;
const CLAUSE = String.raw`bar\s*%\s*(\d+)\s*==\s*(\d+)`;

/**
 * What to show for the line the cursor is on.
 * @returns {null | { kind: "beat", steps: boolean[], perBeat: number, drum: string, name: string, blank: boolean, line: object }
 *                | { kind: "bars", bars: boolean[], verb: string, line: object }}
 */
export function pickerAt(text, cursor, opts = {}) {
  const line = lineAt(text, cursor);
  if (/^\s*#/.test(line.code)) return null;
  const chords = chordPicker(line, text);
  if (chords) return chords;
  const slider = sliderAt(line, cursor - line.start);
  if (slider) return slider;
  const bars = barPicker(line, cursor - line.start);
  const part = beatPicker(line, text) ?? melodyPicker(line, text, { ...opts, column: cursor - line.start });
  if (bars && part) return bars.inSpan ? bars : part;
  return bars ?? part;
}

function lineAt(text, cursor) {
  const start = text.lastIndexOf("\n", cursor - 1) + 1;
  const newline = text.indexOf("\n", cursor);
  const end = newline < 0 ? text.length : newline;
  const whole = text.slice(start, end);
  const comment = whole.search(/(^|\s)#/);
  const code = comment < 0 ? whole : whole.slice(0, comment);
  return { start, end, code };
}

/* ---------- the beat grid ---------- */

function beatPicker(line, text) {
  const thread = line.code.match(/^([A-Za-z]\w*):(\s*)(.*)$/);
  if (!thread) return null;
  const [, name, , body] = thread;
  const { pattern, chain } = splitBody(body.trimEnd());
  const drumInChain = chain.split(">").map((s) => s.trim().split(/\s+/)[0]).find((w) => DRUM_WORDS.includes(w));
  const drum = THREAD_DRUMS[name.toLowerCase()];
  if (!drum && !drumInChain) return null;
  const size = (Number(text.match(/^beats\s+(\d+)/m)?.[1]) || 4) * STEPS_PER_BEAT;
  const steps = readSteps(pattern, size);
  if (!steps) return null;
  return {
    kind: "beat", steps, perBeat: STEPS_PER_BEAT, drum: drumInChain ?? drum, name, blank: pattern === "",
    line: { ...line, bodyStart: line.start + name.length + 1, chain, hasDrum: Boolean(drumInChain) },
  };
}

function readSteps(pattern, size) {
  if (pattern === "") return Array(size).fill(false);
  const beat = pattern.match(/^beat\s+(\w+)$/);
  if (beat) return BEATS[beat[1]] && BEATS[beat[1]].steps.length === size ? [...BEATS[beat[1]].steps].map((c) => c === "x") : null;
  const euclid = pattern.match(/^euclid\s+(\d+)\s+(\d+)$/);
  if (euclid) return stretch(euclidSteps(Number(euclid[1]), Number(euclid[2])), size);
  const hits = pattern.match(/^hits\s+(\d+)\s+(\d+)$/);
  if (hits) {
    const [k, n] = [Number(hits[1]), Number(hits[2])];
    return stretch(Array.from({ length: n }, (_, i) => (i * k) % n < k), size);
  }
  const tokens = pattern.split(/\s+/);
  if (!tokens.every((t) => t === "." || /^-?\d+$/.test(t))) return null;
  return stretch(tokens.map((t) => t !== "."), size);
}

/* A shorter pattern spread over the grid: 0 . 0 . becomes x...x...x...x... */
function stretch(steps, size) {
  if (steps.length === 0 || size % steps.length !== 0) return null;
  const each = size / steps.length;
  return steps.flatMap((on) => [on, ...Array(each - 1).fill(false)]);
}

/** The edit that makes the line play these steps. */
export function applyBeat(picker, steps) {
  const { line, drum } = picker;
  const chain = line.hasDrum ? line.chain : [drum, line.chain].filter(Boolean).join(" > ");
  const body = `${writeSteps(steps)} > ${chain}`;
  const codeEnd = line.start + line.code.length;
  const hasComment = codeEnd < line.end;
  return { start: line.bodyStart, end: hasComment ? codeEnd - line.code.match(/\s*$/)[0].length : line.end, text: ` ${body}` };
}

function writeSteps(steps) {
  const key = steps.map((on) => (on ? "x" : ".")).join("");
  const groove = Object.entries(BEATS).find(([, b]) => b.steps === key)?.[0];
  if (groove) return `beat ${groove}`;
  return smallest(steps).map((on) => (on ? "0" : ".")).join(" ");
}

/* The same rhythm with fewer steps: a pattern fills the bar, so halve it whenever every other step is empty. */
function smallest(steps) {
  if (steps.length % 2 !== 0 || steps.some((on, i) => on && i % 2 === 1)) return steps;
  return smallest(steps.filter((_, i) => i % 2 === 0));
}

/* ---------- the bar picker ---------- */

function barPicker(line, column) {
  for (const found of line.code.matchAll(BAR_RE)) {
    const keyword = found[1];
    const at = found.index + found[0].length - keyword.length;
    const parsed = keyword === "when" ? readWhen(line.code, at) : readEvery(line.code, at, keyword);
    if (!parsed) continue;
    return {
      kind: "bars", bars: parsed.bars, verb: parsed.verb,
      inSpan: column >= at && column <= parsed.end,
      line: { ...line, spanStart: line.start + at, spanEnd: line.start + parsed.end },
    };
  }
  return null;
}

function readEvery(code, at, keyword) {
  const match = code.slice(at).match(new RegExp(`^${keyword}(?:\\s+(\\d+))?\\s*`));
  const n = match[1] ? Number(match[1]) : null;
  const verbStart = at + match[0].length;
  const end = verbEnd(code, verbStart);
  const verb = code.slice(verbStart, end).trim();
  if (n !== null && (n < 1 || n > BARS)) return null;
  const fires = (bar) => n !== null && (keyword === "firstOf" ? (bar - 1) % n === 0 : bar % n === 0);
  return { bars: barList(fires), verb, end: verbStart + code.slice(verbStart, end).trimEnd().length };
}

function readWhen(code, at) {
  const match = code.slice(at).match(new RegExp(`^when\\s+(${CLAUSE}(?:\\s+or\\s+${CLAUSE})*)\\s*`));
  if (!match) return null;
  const clauses = [...match[1].matchAll(new RegExp(CLAUSE, "g"))].map((m) => [Number(m[1]), Number(m[2])]);
  const verbStart = at + match[0].length;
  const end = verbEnd(code, verbStart);
  return {
    bars: barList((bar) => clauses.some(([period, rest]) => bar % period === rest)),
    verb: code.slice(verbStart, end).trim(),
    end: verbStart + code.slice(verbStart, end).trimEnd().length,
  };
}

function barList(fires) {
  return Array.from({ length: BARS }, (_, i) => fires(i + 1));
}

/* Where the verb after every/when stops: the next ">" outside its brackets. */
function verbEnd(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") {
      if (depth === 0) return i;
      depth--;
    } else if (code[i] === ">" && depth === 0) return i;
  }
  return code.length;
}

/** The edit that makes the line fire on these bars, or null if none are picked. */
export function applyBars(picker, bars) {
  if (!bars.some(Boolean)) return null;
  const { spanStart, spanEnd } = picker.line;
  return { start: spanStart, end: spanEnd, text: `${writeBars(bars)} ${picker.verb || DEFAULT_VERB}` };
}

function writeBars(bars) {
  const same = (fires) => bars.every((on, i) => on === fires(i + 1));
  for (let n = 1; n <= BARS; n++) {
    if (same((bar) => bar % n === 0)) return `every ${n}`;
  }
  for (let n = 2; n <= BARS; n++) {
    if (same((bar) => (bar - 1) % n === 0)) return `firstOf ${n}`;
  }
  const period = [1, 2, 4, 8, 16].find((p) => bars.every((on, i) => on === bars[i % p]));
  const rests = bars.slice(0, period).flatMap((on, i) => (on ? [(i + 1) % period] : []));
  return `when ${rests.map((rest) => `bar % ${period} == ${rest}`).join(" or ")}`;
}

/* ---------- sliders ---------- */

function sliderAt(line, column) {
  const setting = line.code.match(/^(tempo|swing)\b/);
  if (setting) {
    const found = readSlider(line, setting[1], setting[1].length, SETTING_SLIDERS[setting[1]]);
    return found && { ...found, canAddToCode: false };
  }
  for (const found of line.code.matchAll(WORD_RE)) {
    const word = found[1];
    const wordEnd = found.index + found[0].length;
    const slider = readSlider(line, word, wordEnd, SLIDERS[word]);
    if (slider && column >= wordEnd - word.length && column <= slider.line.argEnd - line.start) return { ...slider, canAddToCode: true };
  }
  return null;
}

/* The slider for the word ending at wordEnd, or null if what follows isn't a plain number. */
function readSlider(line, word, wordEnd, [min, max, step, fallback]) {
  const rest = line.code.slice(wordEnd);
  const arg = rest.match(SLIDER_ARG);
  const after = arg ? rest.slice(arg[0].length) : rest;
  if (!/^\s*($|>|\))/.test(after)) return null;
  const inCode = Boolean(arg?.[2]);
  const value = arg ? Number(arg[2] ?? arg[5]) : fallback;
  const low = inCode ? Number(arg[3]) : Math.min(min, value);
  const high = inCode ? Number(arg[4]) : Math.max(max, value);
  const atEnd = !arg && after.trim() === "";
  const argEnd = wordEnd + (arg ? arg[0].length : atEnd ? rest.length : 0);
  return {
    kind: "slider", word, value, min: low, max: high, step, inCode,
    line: { ...line, argStart: line.start + wordEnd, argEnd: line.start + argEnd },
  };
}

function tidy(value, step) {
  const places = (String(step).split(".")[1] ?? "").length;
  return String(Number(value.toFixed(places)));
}

/** The edit that sets a slider's number, in the code's own form. */
export function applySlider(picker, value) {
  const number = tidy(value, picker.step);
  const text = picker.inCode ? `slider(${number}, ${picker.min}, ${picker.max})` : number;
  return { start: picker.line.argStart, end: picker.line.argEnd, text: ` ${text}` };
}

/** The edit that writes a slider into the code at this value. */
export function addSlider(picker, value) {
  return applySlider({ ...picker, inCode: true }, value);
}

/** Every slider written in the song, labelled with its thread. */
export function findSliders(text) {
  const out = [];
  let thread = "";
  let start = 0;
  for (const whole of text.split("\n")) {
    const comment = whole.search(/(^|\s)#/);
    const code = comment < 0 ? whole : whole.slice(0, comment);
    thread = code.match(/^([A-Za-z]\w*):/)?.[1] ?? (code.trim() && !code.trim().startsWith(">") ? "" : thread);
    const line = { start, end: start + whole.length, code };
    for (const found of code.matchAll(/([A-Za-z]\w*)\s+slider\(/g)) {
      const word = found[1];
      const range = SLIDERS[word] ?? [0, 1, 0.01, 0.5];
      const slider = readSlider(line, word, found.index + word.length, range);
      if (slider) out.push({ ...slider, label: `${thread} ${word}`.trim() });
    }
    start += whole.length + 1;
  }
  return out;
}
