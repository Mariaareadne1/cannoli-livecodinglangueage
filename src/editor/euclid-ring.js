/* ============================================================
   cannoli — the euclid ring
   Reads euclid 3 8 into a ring of steps with sliders for hits,
   steps and rotation, and writes them back. No drawing here:
   the editors draw.
   ============================================================ */

import { euclidSteps } from "../core/verbs.js";

const DEFAULT_HITS = 3;
const DEFAULT_STEPS = 8;
const WORD_RE = /\b(euclidRot|euclid|hits)\b((?:\s+\d+){0,3})/g;
const KNOWN_RHYTHMS = {
  "3,8": "tresillo",
  "5,8": "cinquillo",
  "4,16": "four on the floor",
  "7,12": "a West African bell pattern",
  "5,16": "close to the bossa nova",
};

/**
 * The ring for the euclid under the cursor, or null.
 * @param {{ start: number, end: number, code: string }} line
 * @param {number} column  the cursor's place on the line
 */
export function ringPicker(line, column) {
  if (/^\s*#/.test(line.code)) return null;
  for (const match of line.code.matchAll(WORD_RE)) {
    const [whole, word, args] = match;
    const end = match.index + whole.length;
    const rest = line.code.slice(end);
    // something else after the numbers, like  bar  or  + 2, isn't a plain rhythm
    if (!/^\s*($|>|\))/.test(rest)) continue;
    if (column < match.index || column > end + (args ? 0 : rest.match(/^\s*/)[0].length)) continue;
    const [hits = DEFAULT_HITS, steps = DEFAULT_STEPS, rotation = 0] = args.trim().split(/\s+/).filter(Boolean).map(Number);
    const trailing = !args && rest.trim() === "" ? rest.length : 0;   // a blank "euclid " at the end of a line
    return {
      kind: "euclid", word, hits, steps, rotation,
      line: { ...line, ringStart: line.start + match.index, ringEnd: line.start + end + trailing },
    };
  }
  return null;
}

/** The steps the song plays, true for a hit. */
export function ringPattern({ word, hits, steps, rotation }) {
  if (word === "hits") return Array.from({ length: steps }, (_, i) => (i * hits) % steps < hits);
  return euclidSteps(hits, steps, rotation);
}

/** The name of a well-known rhythm, or null. Turned, it isn't that rhythm any more. */
export function ringName(hits, steps, rotation = 0) {
  return rotation === 0 ? KNOWN_RHYTHMS[`${hits},${steps}`] ?? null : null;
}

/** The edit that writes these values, kept within the steps. */
export function applyRing(picker, { hits, steps, rotation }) {
  const fittedHits = Math.min(hits, steps);
  const fittedRotation = picker.word === "hits" ? 0 : rotation % steps;
  const word = picker.word === "hits" ? "hits" : fittedRotation > 0 ? "euclidRot" : "euclid";
  const text = `${word} ${fittedHits} ${steps}${fittedRotation > 0 ? ` ${fittedRotation}` : ""}`;
  return { start: picker.line.ringStart, end: picker.line.ringEnd, text };
}
