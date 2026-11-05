/* ============================================================
   cannoli — the chord picker
   The chords line as one block per bar, the seven chords of the
   key with their real names, what usually comes next, and
   ready-made progressions. No drawing here: the editors draw.
   ============================================================ */

import { MODES, chordDegree, chordTones, pitchClass, mod } from "../core/harmony.js";
import { STYLES } from "../core/styles.js";
import { DEFAULT_KEY } from "../lang/compile.js";
import { PROGRESSIONS, NEXT_CHORD } from "./complete.js";

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];
const SUFFIXES = { "3,7": "m", "4,7": "", "3,6": "dim", "4,8": "aug" };
const CHORDS_RE = /^chords\b(\s*)(.*?)(\s+at\s+\S+)?\s*$/;

/* ---------- the key ---------- */

/** The song's key from its first key line, or the default it plays in without one. */
export function songKey(text) {
  const match = text.match(/^key\s+([a-gA-G][#b]?)\s+(\w+)\s*(?:#.*)?$/m);
  if (match && MODES[match[2]]) return { root: match[1].toLowerCase(), mode: match[2] };
  const [root, mode] = DEFAULT_KEY.name.split(" ");
  return { root, mode };
}

/** A scale step's note name, spelled for the key: Bb in d minor rather than A#. */
export function spellStep(key, step) {
  const scale = MODES[key.mode];
  const degree = mod(step, scale.length);
  const pitch = mod(pitchClass(key.root) + scale[degree], 12);
  const index = LETTERS.indexOf(key.root[0].toUpperCase()) + degree;
  const letter = LETTERS[index % LETTERS.length];
  const offset = mod(pitch - LETTER_PITCH[index % LETTERS.length] + 6, 12) - 6;
  return letter + (offset > 0 ? "#".repeat(offset) : "b".repeat(-offset));
}

/* ---------- chords ---------- */

/** The seven chords of a key, each with its numeral and name. */
export function chordOptions(key) {
  const scale = MODES[key.mode];
  return ROMAN.map((numeral, degree) => {
    const [root, third, fifth] = chordTones(degree).map((step) => scale[mod(step, 7)] + 12 * Math.floor(step / 7));
    const suffix = SUFFIXES[`${third - root},${fifth - root}`] ?? "";
    const word = third - root === 4 ? numeral.toUpperCase() : numeral;
    return { word, name: spellStep(key, degree) + suffix, degree };
  });
}

/** A chord word as it's written, with its name in this key. */
export function nameOf(word, options) {
  return options[chordDegree(word)]?.name ?? word;
}

/** What usually follows the bar before this one. */
export function goodNext(words, slot, options) {
  const before = chordDegree(words[slot - 1] ?? "");
  return before === null ? [] : NEXT_CHORD[before].map((degree) => options[degree]);
}

/** Ready-made progressions: the style's first, then the ones that suit the key's mood. */
export function progressionsFor(key, style) {
  const quality = MODES[key.mode][2] === 4 ? "major" : "minor";
  const options = chordOptions(key);
  const make = (fits) => ([prog, doc]) => {
    const words = prog.split(" ");
    return { words, doc, fits, names: words.map((w) => nameOf(w, options)).join(" ") };
  };
  const own = (STYLES[style]?.progressions ?? []).map(make(true));
  const general = PROGRESSIONS[quality].map(make(false));
  return [...own, ...general.filter((g) => !own.some((o) => o.words.join() === g.words.join()))];
}

/* ---------- editing the list ---------- */

export function setChord(words, slot, word) {
  return words.length === 0 ? [word] : words.map((w, i) => (i === slot ? word : w));
}

export function removeBar(words, slot) {
  return words.length <= 1 ? words : words.filter((_, i) => i !== slot);
}

/** Another bar: the home chord to start, then what usually follows the last one. */
export function addBar(words, key) {
  const options = chordOptions(key);
  if (words.length === 0) return [options[0].word];
  return [...words, goodNext(words, words.length, options)[0].word];
}

/* ---------- on a line ---------- */

/** The picker for a chords line, or null if this isn't one or it has a word that isn't a chord yet. */
export function chordPicker(line, text) {
  const match = line.code.match(CHORDS_RE);
  if (!match) return null;
  const words = match[2].split(/\s+/).filter(Boolean);
  if (words.some((w) => chordDegree(w) === null)) return null;
  const key = songKey(text);
  const style = text.match(/^style\s+(\w+)/m)?.[1];
  const listStart = line.start + "chords".length;
  return {
    kind: "chords", words, key, blank: words.length === 0,
    options: chordOptions(key), progressions: progressionsFor(key, style),
    line: { ...line, listStart, listEnd: listStart + match[1].length + match[2].length },
  };
}

/** The bar whose word the cursor is in or just after. */
export function slotAtColumn(picker, column) {
  const offset = column - (picker.line.listStart - picker.line.start);
  const before = picker.line.code.slice(picker.line.listStart - picker.line.start).slice(0, Math.max(0, offset));
  return Math.max(0, Math.min(picker.words.length - 1, before.trim().split(/\s+/).filter(Boolean).length - 1));
}

/** The edit that makes the line play these chords. */
export function applyChords(picker, words) {
  return { start: picker.line.listStart, end: picker.line.listEnd, text: ` ${words.join(" ")}` };
}
