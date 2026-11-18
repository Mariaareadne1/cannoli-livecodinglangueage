/* ============================================================
   cannoli — the drum kit and the mixer
   Reads a song into its parts: which are drums, what they play,
   whether they're muted and what effects they have. Every change
   comes back as an edit to the code, so the code stays the truth.
   No drawing here: the web app and the terminal draw it.
   ============================================================ */

import { BEATS } from "../core/styles.js";
import { DRUM_WORDS } from "../core/verbs.js";
import { THREAD_DRUMS, beatPicker, applyBeat, writeSteps, lineAt } from "./pickers.js";
import { splitBody } from "./melody-grid.js";
import { threadsIn } from "./timeline.js";

const STEPS_PER_BEAT = 4;
const DEFAULT_BEATS = 4;
const AMOUNT_DECIMALS = 2;
const MUTE_RE = /\s*>\s*(?:hush|mute)\s*$/;
const NUMBER_RE = /^-?\d*\.?\d+$/;
const SLIDER_RE = /^slider\(\s*(-?\d*\.?\d+)/;

/** Drums you can add to a song, each starting on a groove that suits it. */
export const KIT = [
  { name: "kick", drum: "bd", groove: "fourfloor" },
  { name: "snare", drum: "sd", groove: "backbeat" },
  { name: "hats", drum: "hh", groove: "offbeat" },
  { name: "open", drum: "oh", groove: "offbeat" },
  { name: "clap", drum: "cp", groove: "backbeat" },
  { name: "rim", drum: "rim", groove: "tresillo" },
];

// rest: where the slider sits when the code doesn't mention it. removable: going back there removes the step.
const EFFECTS = [
  { word: "gain", min: 0, max: 1, step: 0.01, rest: 1, removable: false, bare: 1 },
  { word: "pan", min: -1, max: 1, step: 0.01, rest: 0, removable: true, bare: 0 },
  { word: "bright", min: 0, max: 1, step: 0.01, rest: 0.5, removable: false, bare: 0.5 },
  { word: "bloom", min: 0, max: 1, step: 0.01, rest: 0, removable: true, bare: 0.5 },
  { word: "ghost", min: 0, max: 1, step: 0.01, rest: 0, removable: true, bare: 0.5 },
  { word: "tape", min: 0, max: 1, step: 0.01, rest: 0, removable: true, bare: 0.5 },
  { word: "pump", min: 0, max: 1, step: 0.01, rest: 0, removable: true, bare: 0.6 },
  { word: "air", min: 0, max: 1, step: 0.01, rest: 0, removable: true, bare: 0.4 },
];

/** A slider's value, on its steps and inside its range, as short as it can be written. */
export function tidyAmount(effect, value) {
  const inside = Math.max(effect.min, Math.min(effect.max, value));
  return Number((Math.round(inside / effect.step) * effect.step).toFixed(AMOUNT_DECIMALS));
}

/* The steps of a thread's chain, ignoring any ">" inside brackets. */
function chainSteps(body) {
  const end = body.trimEnd().length;
  const marks = [];
  let depth = 0;
  for (let i = 0; i < end; i++) {
    if ("([".includes(body[i])) depth++;
    else if (")]".includes(body[i])) depth--;
    else if (body[i] === ">" && depth === 0) marks.push(i);
  }
  return marks.flatMap((at, i) => {
    const stop = marks[i + 1] ?? end;
    const word = body.slice(at + 1, stop).match(/^\s*([A-Za-z]\w*)/);
    if (!word) return [];
    const wordEnd = at + 1 + word[0].length;
    const raw = body.slice(wordEnd, stop);
    const argStart = wordEnd + (raw.length - raw.trimStart().length);
    return [{ at, stop: at + body.slice(at, stop).trimEnd().length, word: word[1], wordEnd, argStart, arg: raw.trim() }];
  });
}

function readEffect(effect, found) {
  if (!found) return { ...effect, value: effect.rest, written: false, locked: null };
  if (found.arg === "") return { ...effect, value: effect.bare, written: true, locked: null, found };
  const slider = found.arg.match(SLIDER_RE);
  if (slider) return { ...effect, value: Number(slider[1]), written: true, locked: null, found };
  if (NUMBER_RE.test(found.arg)) return { ...effect, value: Number(found.arg), written: true, locked: null, found };
  return { ...effect, value: effect.rest, written: true, locked: found.arg, found };
}

function readPart(text, thread, index) {
  const steps = chainSteps(thread.body);
  const drumWord = steps.find((s) => DRUM_WORDS.includes(s.word))?.word;
  const picker = beatPicker(lineAt(text, thread.start), text);
  return {
    id: index,
    name: thread.name,
    start: thread.start,
    end: thread.end,
    muted: MUTE_RE.test(thread.body.trimEnd()),
    isDrum: Boolean(drumWord || THREAD_DRUMS[thread.name.toLowerCase()]),
    steps: picker?.steps ?? null,
    effects: EFFECTS.map((effect) => readEffect(effect, steps.find((s) => s.word === effect.word))),
  };
}

/* ---------- writing ---------- */

function muteEdit(thread, muted) {
  const body = thread.body.trimEnd();
  const found = body.match(MUTE_RE);
  if (muted === Boolean(found)) return null;
  if (muted) return { start: thread.start + body.length, end: thread.start + body.length, text: " > hush" };
  return { start: thread.start + found.index, end: thread.start + body.length, text: "" };
}

function stepsEdit(text, thread, steps) {
  const line = lineAt(text, thread.start);
  const picker = beatPicker(line, text);
  if (!picker) return null;
  const opening = thread.name.length + 1;
  const after = line.code.slice(opening);
  const { pattern } = splitBody(after.trimEnd());
  if (pattern === "") return applyBeat(picker, steps);
  const start = line.start + opening + (after.length - after.trimStart().length);
  const hasDrum = chainSteps(thread.body).some((s) => DRUM_WORDS.includes(s.word));
  return { start, end: start + pattern.length, text: `${writeSteps(steps)}${hasDrum ? "" : ` > ${picker.drum}`}` };
}

function effectEdit(thread, effect, value) {
  if (effect.locked) return null;
  const amount = tidyAmount(effect, value);
  const { found } = effect;
  const body = thread.body.trimEnd();
  if (!found) {
    if (effect.removable && amount === effect.rest) return null;
    const at = thread.start + (body.match(MUTE_RE)?.index ?? body.length);
    return { start: at, end: at, text: ` > ${effect.word} ${amount}` };
  }
  if (effect.removable && amount === effect.rest) {
    return { start: thread.start + thread.body.slice(0, found.at).trimEnd().length, end: thread.start + found.stop, text: "" };
  }
  if (found.arg === "") return { start: thread.start + found.wordEnd, end: thread.start + found.wordEnd, text: ` ${amount}` };
  const slider = found.arg.match(SLIDER_RE);
  if (slider) {
    const start = thread.start + found.argStart + slider[0].length - slider[1].length;
    return { start, end: start + slider[1].length, text: String(amount) };
  }
  return { start: thread.start + found.argStart, end: thread.start + found.argStart + found.arg.length, text: String(amount) };
}

function addDrumEdit(text, threads, parts, entry) {
  const line = `${entry.name}: beat ${entry.groove} > ${entry.drum}`;
  const lastDrum = parts.filter((p) => p.isDrum).at(-1);
  if (lastDrum) return { start: lastDrum.end, end: lastDrum.end, text: `\n${line}` };
  if (threads.length) return { start: threads[0].start, end: threads[0].start, text: `${line}\n` };
  return { start: text.length, end: text.length, text: `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n` };
}

/**
 * The song's parts, and the edits that change them.
 * @param {string} text
 */
export function readStudio(text) {
  const threads = threadsIn(text);
  const parts = threads.map((thread, i) => readPart(text, thread, i));
  const names = new Set(parts.map((p) => p.name.toLowerCase()));
  const beats = Number(text.match(/^beats\s+(\d+)/m)?.[1]) || DEFAULT_BEATS;
  return {
    parts,
    drums: parts.filter((p) => p.isDrum),
    perBeat: STEPS_PER_BEAT,
    stepCount: beats * STEPS_PER_BEAT,
    addable: KIT.filter((k) => !names.has(k.name) && BEATS[k.groove]),
    partAt: (offset) => parts.find((p) => offset >= p.start && offset <= p.end)?.id ?? null,
    setMute: (id, muted) => muteEdit(threads[id], muted),
    setSteps: (id, steps) => stepsEdit(text, threads[id], steps),
    setEffect: (id, word, value) => effectEdit(threads[id], parts[id].effects.find((e) => e.word === word), value),
    addDrum: (name) => addDrumEdit(text, threads, parts, KIT.find((k) => k.name === name)),
  };
}
