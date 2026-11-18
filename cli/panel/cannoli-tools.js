/* ============================================================
   cannoli — the click-to-edit tools, for cannoli code
   Gives each of the web editor's pickers the same shape as the
   Strudel ones, so one terminal panel can draw them all.
   ============================================================ */

import { pickerAt, applyBeat, applyBars, applySlider, addSlider } from "../../src/editor/pickers.js";
import { applyMelody, rowsFor } from "../../src/editor/melody-grid.js";
import { applyChords, addBar, goodNext, nameOf } from "../../src/editor/chord-picker.js";
import { applyKey, keyDetails, sameNote } from "../../src/editor/key-picker.js";
import { applySound } from "../../src/editor/sound-picker.js";
import { applyGroove } from "../../src/editor/groove-picker.js";
import { applyRing, ringPattern, ringName } from "../../src/editor/euclid-ring.js";
import { applyVerb, applyChance } from "../../src/editor/verb-picker.js";

const SHAPES = {
  beat: (p) => ({ apply: (steps) => applyBeat(p, steps), applyGroove: (name) => applyBeat(p, p.grooves.find((g) => g.name === name).steps) }),
  bars: (p) => ({ apply: (bars) => applyBars(p, bars), applyVerb: (code) => applyVerb(p, code) }),
  verb: (p) => ({ apply: (code) => applyVerb(p, code), applyChance: (value) => applyChance(p, value) }),
  slider: (p) => ({ apply: (value) => applySlider(p, value), addToCode: (value) => addSlider(p, value) }),
  melody: (p, text) => ({ apply: (cells) => applyMelody(p, cells), rows: rowsFor(p.cells, text) }),
  chords: (p) => ({
    apply: (words) => applyChords(p, words), nameOf: (word) => nameOf(word, p.options),
    next: (slot) => goodNext(p.words, slot, p.options), added: (words) => addBar(words, p.key),
  }),
  key: (p) => ({ apply: (choice) => applyKey(p, choice), details: keyDetails(p), same: sameNote }),
  sound: (p) => ({ apply: (word) => applySound(p, word) }),
  groove: (p) => ({ apply: (name) => applyGroove(p, name) }),
  euclid: (p) => ({
    apply: (values) => applyRing(p, values), pattern: (values) => ringPattern({ ...p, ...values }),
    nameOf: (values) => ringName(values.hits, values.steps, values.rotation),
  }),
};

/** The tool for the cursor's place in a cannoli song, or null. */
export function cannoliToolAt(text, cursor, opts) {
  const picker = pickerAt(text, cursor, opts);
  return picker ? { ...picker, ...SHAPES[picker.kind](picker, text) } : null;
}
