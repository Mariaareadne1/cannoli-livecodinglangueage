/* ============================================================
   cannoli — the verb picker
   The verb inside every, someCycles, when and the rest: a menu
   of what could happen, each described. No drawing here: the
   editors draw.
   ============================================================ */

import { VERBS } from "../core/verbs.js";
import { applyBars } from "./pickers.js";
import { threadOfLine } from "./sound-picker.js";

const CHANCE_WORDS = ["someCyclesBy", "maybe"];
const PLAIN_WORDS = ["someCycles", "sometimes"];
const COUNT_WORDS = ["every", "firstOf", "lastOf"];
const CLAUSE = String.raw`bar\s*(?:%\s*\d+\s*)?(?:==|!=|<=|>=|<|>)\s*\d+`;
const CONDITION = String.raw`${CLAUSE}(?:\s+(?:and|or)\s+${CLAUSE})*`;
const CHANCE_RE = new RegExp(String.raw`(?:^|[>(]\s*)(${CHANCE_WORDS.join("|")})(\s+)(\d*\.?\d+)(\s*)`, "g");
const PLAIN_RE = new RegExp(String.raw`(?:^|[>(]\s*)(${PLAIN_WORDS.join("|")})\b(\s*)`, "g");
const WHEN_RE = new RegExp(String.raw`(?:^|[>(]\s*)(when)(\s+)(${CONDITION})(\s*)`, "g");
const COUNT_RE = new RegExp(String.raw`(?:^|[>(]\s*)(${COUNT_WORDS.join("|")})(\s+)(\d+)(\s*)`, "g");
const DEFAULT_BARS = 4;
const BAR_COUNT = 16;

const GROUPS = [
  ["order", ["rev", "mirror", "shuffle", "rot 1"]],
  ["time", ["fast 2", "slow 2", "ply 2", "short", "long"]],
  ["pitch", ["up 2", "down 2", "oct 1", "flip", "penta"]],
  ["loudness", ["gain 0.5", "bright 0.2", "hush"]],
  ["together", ["rev > up 2", "fast 2 > rev", "up 2 > short"]],
];

/** The menu: each choice as you'd write it, with what it does. */
export function verbGroups() {
  return GROUPS.map(([title, codes]) => ({
    title,
    choices: codes.map((code) => ({
      code,
      doc: code.includes(">") ? code.split(" > ").map((step) => VERBS[step.split(" ")[0]].doc).join(", then ") : VERBS[code.split(" ")[0]].doc,
    })),
  }));
}

/** Are these the same verb, brackets and spacing aside? */
export function sameVerb(written, code) {
  const plain = (s) => s.replace(/^\s*\(\s*/, "").replace(/\s*\)\s*$/, "").replace(/\s+/g, " ").trim();
  return plain(written) === plain(code);
}

function written(code) {
  return code.includes(" ") ? `(${code})` : code;
}

/* Where the verb stops: the next ">" or ")" outside its own brackets, or an else. */
function verbEnd(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0 && (code[i] === ">" || /^\belse\b/.test(code.slice(i)))) return i;
  }
  return code.length;
}

/* Every keyword on the line with its verb slot, for whichever pattern finds it. */
function slotsIn(code) {
  const found = [];
  const collect = (re, build) => {
    for (const m of code.matchAll(re)) {
      const at = m.index + m[0].indexOf(m[1]);
      const slotStart = m.index + m[0].length;
      found.push({ at, slotStart, ...build(m, at) });
    }
  };
  collect(CHANCE_RE, (m, at) => ({ word: m[1], chance: Number(m[3]), chanceStart: at + m[1].length + m[2].length, chanceEnd: at + m[1].length + m[2].length + m[3].length }));
  collect(PLAIN_RE, (m) => ({ word: m[1], chance: null }));
  collect(WHEN_RE, (m) => ({ word: m[1], chance: null }));
  collect(COUNT_RE, (m) => ({ word: m[1], chance: null }));
  return found;
}

/**
 * The menu for the keyword under the cursor, or null.
 * @param {{ start: number, end: number, code: string }} line
 * @param {number} column  the cursor's place on the line
 * @param {string} text  the whole song
 */
export function verbPicker(line, column, text) {
  if (/^\s*#/.test(line.code)) return null;
  for (const slot of slotsIn(line.code)) {
    const stop = verbEnd(line.code, slot.slotStart);
    const verb = line.code.slice(slot.slotStart, stop).trim();
    const end = slot.slotStart + line.code.slice(slot.slotStart, stop).trimEnd().length;
    if (column < slot.at || column > Math.max(end, slot.slotStart)) continue;
    return {
      kind: "verb", word: slot.word, verb, chance: slot.chance, groups: verbGroups(), thread: threadOfLine(text, line.start),
      line: {
        ...line, spanStart: line.start + slot.at, slotStart: line.start + slot.slotStart, slotEnd: line.start + end,
        chanceStart: line.start + (slot.chanceStart ?? 0), chanceEnd: line.start + (slot.chanceEnd ?? 0),
      },
    };
  }
  return null;
}

/** The edit that switches the verb, on a bar grid or on this menu. */
export function applyVerb(picker, code) {
  if (picker.kind === "bars") {
    if (picker.verb) return { start: picker.line.spanEnd - picker.verb.length, end: picker.line.spanEnd, text: written(code) };
    const bars = picker.bars.some(Boolean) ? picker.bars : Array.from({ length: BAR_COUNT }, (_, i) => (i + 1) % DEFAULT_BARS === 0);
    return applyBars({ ...picker, verb: written(code) }, bars);
  }
  const { slotStart, slotEnd, spanStart, code: lineCode, start } = picker.line;
  const touching = slotStart > spanStart && !/\s/.test(lineCode[slotStart - start - 1]);
  return { start: slotStart, end: slotEnd, text: `${touching ? " " : ""}${written(code)}` };
}

/** The edit that changes the chance. */
export function applyChance(picker, value) {
  return { start: picker.line.chanceStart, end: picker.line.chanceEnd, text: String(value) };
}

/** The song with this step replaced by the verb on its own, to hear what the verb does. */
export function withVerbOnly(text, picker, code) {
  const end = picker.kind === "bars" ? picker.line.spanEnd : picker.line.slotEnd;
  return text.slice(0, picker.line.spanStart) + written(code) + text.slice(end);
}
