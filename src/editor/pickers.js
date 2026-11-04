/* ============================================================
   cannoli — pickers
   The little grids under a line. Reads a line into beats you can
   click (kick: …) or bars you can click (every …), and writes
   your clicks back as code. No drawing here: the editors draw.
   ============================================================ */

import { BEATS } from "../core/styles.js";
import { DRUM_WORDS, euclidSteps } from "../core/verbs.js";

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
const BAR_RE = /(?:^\s*|[>(]\s*)(every|firstOf|lastOf|when)\b/g;
const CLAUSE = String.raw`bar\s*%\s*(\d+)\s*==\s*(\d+)`;

/**
 * What to show for the line the cursor is on.
 * @returns {null | { kind: "beat", steps: boolean[], perBeat: number, drum: string, name: string, blank: boolean, line: object }
 *                | { kind: "bars", bars: boolean[], verb: string, line: object }}
 */
export function pickerAt(text, cursor) {
  const line = lineAt(text, cursor);
  if (/^\s*#/.test(line.code)) return null;
  const bars = barPicker(line, cursor - line.start);
  const beat = beatPicker(line, text);
  if (bars && beat) return bars.inSpan ? bars : beat;
  return bars ?? beat;
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

/* The pattern, then everything after its first top-level ">". */
function splitBody(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(" || body[i] === "[") depth++;
    else if (body[i] === ")" || body[i] === "]") depth--;
    else if (body[i] === ">" && depth === 0) return { pattern: body.slice(0, i).trim(), chain: body.slice(i + 1).trim() };
  }
  return { pattern: body.trim(), chain: "" };
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
