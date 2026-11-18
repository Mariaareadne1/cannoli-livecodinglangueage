/* ============================================================
   cannoli — the drum kit and the mixer, for Strudel code
   The same parts and edits as src/editor/studio.js, written as
   ordinary Strudel: _kick: mutes a part, .room(.4) adds reverb.
   ============================================================ */

import { BEATS } from "../../src/core/styles.js";
import { THREAD_DRUMS } from "../../src/editor/pickers.js";
import { KIT, tidyAmount } from "../../src/editor/studio.js";
import { statements, callsIn, splitArgs, stringOf, beatPicker, writeBeat, DRUM_WORDS } from "./pickers.js";

const STEPS_PER_BEAT = 4;
const STEP_COUNT = 16;
const NUMBER_RE = /^-?\d*\.?\d+$/;
const SLIDER_RE = /^slider\(\s*(-?\d*\.?\d+)/;
const MUTED_RE = /^_|_$/;

const amount01 = { min: 0, max: 1, step: 0.01, rest: 0, removable: true };
const EFFECTS = [
  { word: "gain", min: 0, max: 1.5, step: 0.01, rest: 1, removable: false },
  { word: "pan", min: 0, max: 1, step: 0.01, rest: 0.5, removable: true },
  { word: "lpf", min: 50, max: 10000, step: 50, rest: 10000, removable: true },
  { word: "hpf", min: 20, max: 8000, step: 20, rest: 20, removable: true },
  { word: "room", ...amount01 },
  { word: "delay", ...amount01 },
  { word: "shape", ...amount01 },
  { word: "crush", min: 1, max: 16, step: 1, rest: 16, removable: true },
  { word: "bloom", ...amount01 },
  { word: "ghost", ...amount01 },
  { word: "tape", ...amount01 },
  { word: "pump", ...amount01 },
  { word: "air", ...amount01 },
];

/* The calls chained on the pattern itself, not the ones inside another call's arguments. */
function chainCalls(body) {
  const calls = callsIn(body);
  return calls.filter((c) => !calls.some((o) => o !== c && o.open < c.start && c.close < o.close));
}

function readEffect(effect, call) {
  if (!call) return { ...effect, value: effect.rest, written: false, locked: null };
  const args = splitArgs(call);
  const arg = args[0]?.text ?? "";
  const slider = arg.match(SLIDER_RE);
  if (args.length === 1 && slider) return { ...effect, value: Number(slider[1]), written: true, locked: null, call, arg: args[0] };
  if (args.length === 1 && NUMBER_RE.test(arg)) return { ...effect, value: Number(arg), written: true, locked: null, call, arg: args[0] };
  return { ...effect, value: effect.rest, written: true, locked: call.args.trim(), call };
}

function readPart(text, statement, index) {
  const bodyStart = statement.start + statement.name.length + 1;
  const body = text.slice(bodyStart, statement.end);
  const calls = chainCalls(body);
  const root = calls.find((c) => !c.dotted && (c.name === "s" || c.name === "sound"));
  const str = root && stringOf(root);
  const name = statement.name.replace(MUTED_RE, "");
  const words = str ? str.body.match(/[A-Za-z_]\w*/g) ?? [] : [];
  const isDrum = Boolean(THREAD_DRUMS[name.toLowerCase()]) || (words.length > 0 && words.every((w) => DRUM_WORDS.has(w)));
  const picker = str ? beatPicker(text, { start: bodyStart, code: body }, root, str, name) : null;
  return {
    id: index,
    name: name.includes("$") || name === "" ? `part ${index + 1}` : name,
    start: statement.start,
    end: statement.end,
    label: statement.name,
    muted: MUTED_RE.test(statement.name),
    isDrum,
    steps: picker?.steps ?? null,
    picker,
    bodyStart,
    bodyLength: body.length,
    effects: EFFECTS.map((effect) => readEffect(effect, calls.find((c) => c.dotted && c.name === effect.word))),
  };
}

function muteEdit(part, muted) {
  if (muted === part.muted) return null;
  const label = muted ? `_${part.label}` : part.label.replace(MUTED_RE, "");
  return { start: part.start, end: part.start + part.label.length, text: label };
}

function effectEdit(text, part, effect, value) {
  if (effect.locked) return null;
  const amount = tidyAmount(effect, value);
  const atRest = effect.removable && amount === effect.rest;
  if (!effect.call) {
    if (atRest) return null;
    const end = part.bodyStart + part.bodyLength;
    return { start: end, end, text: `.${effect.word}(${amount})` };
  }
  if (atRest) {
    const before = text.slice(0, part.bodyStart + effect.call.start).trimEnd().length;
    return { start: before, end: part.bodyStart + effect.call.close + 1, text: "" };
  }
  const slider = effect.arg.text.match(SLIDER_RE);
  const start = part.bodyStart + effect.arg.start + (slider ? slider[0].length - slider[1].length : 0);
  return { start, end: start + (slider ? slider[1].length : effect.arg.text.length), text: String(amount) };
}

function addDrumEdit(text, parts, entry) {
  const steps = [...BEATS[entry.groove].steps].map((c) => c === "x");
  const line = `${entry.name}: s("${writeBeat(entry.drum, steps)}")`;
  const lastDrum = parts.filter((p) => p.isDrum).at(-1);
  if (lastDrum) return { start: lastDrum.end, end: lastDrum.end, text: `\n${line}` };
  if (parts.length) return { start: parts[0].start, end: parts[0].start, text: `${line}\n` };
  return { start: text.length, end: text.length, text: `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n` };
}

/**
 * The song's parts, and the edits that change them.
 * @param {string} text
 */
export function readStrudelStudio(text) {
  const parts = statements(text).map((statement, i) => readPart(text, statement, i));
  const names = new Set(parts.map((p) => p.name.toLowerCase()));
  return {
    parts,
    drums: parts.filter((p) => p.isDrum),
    perBeat: STEPS_PER_BEAT,
    stepCount: STEP_COUNT,
    addable: KIT.filter((k) => !names.has(k.name) && BEATS[k.groove]),
    partAt: (offset) => parts.find((p) => offset >= p.start && offset <= p.end)?.id ?? null,
    setMute: (id, muted) => muteEdit(parts[id], muted),
    setSteps: (id, steps) => parts[id].picker?.apply(steps) ?? null,
    setEffect: (id, word, value) => effectEdit(text, parts[id], parts[id].effects.find((e) => e.word === word), value),
    addDrum: (name) => addDrumEdit(text, parts, KIT.find((k) => k.name === name)),
  };
}
