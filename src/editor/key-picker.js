/* ============================================================
   cannoli — the key picker
   The key line as twelve notes and the modes, each with its mood,
   plus the scale and chords that choice gives you. No drawing
   here: the editors draw.
   ============================================================ */

import { MODES, pitchClass } from "../core/harmony.js";
import { MODE_DOCS, NOTE_NAMES } from "./complete.js";
import { chordOptions, spellStep, songKey } from "./chord-picker.js";

const BRIGHTEST_FIRST = ["lydian", "major", "mixolydian", "dorian", "minor", "harmonic", "phrygian", "locrian"];
const KEY_RE = /^key(?:(\s+)([a-gA-G][#b]?))?(?:\s+([A-Za-z]+))?(\s+at\s+\S+)?\s*$/;
const BLANK_RE = /^key\s*$/;

/** The picker for a key line, or null if this isn't one or it has a word that isn't a note or mode yet. */
export function keyPicker(line) {
  const code = line.code;
  if (!BLANK_RE.test(code) && !/^key\s/.test(code)) return null;
  const match = code.match(KEY_RE);
  if (!match) return null;
  const [, , note, mode, after] = match;
  if (mode && !MODES[mode]) return null;
  const argEnd = code.length - code.match(/\s*$/)[0].length - (after?.length ?? 0);
  return {
    kind: "key", note: note?.toLowerCase() ?? null, mode: mode ?? null,
    notes: NOTE_NAMES.map((name) => ({ name, label: name[0].toUpperCase() + name.slice(1) })),
    modes: BRIGHTEST_FIRST.map((name) => ({ name, doc: MODE_DOCS[name] })),
    line: { ...line, argStart: line.start + "key".length, argEnd: line.start + (BLANK_RE.test(code) ? code.length : argEnd) },
  };
}

/** Does this note name mean the same note? c# and db do. */
export function sameNote(a, b) {
  return a !== null && b !== null && pitchClass(a) === pitchClass(b);
}

/** The edit that writes a choice; whatever isn't chosen stays, or takes the song's default. */
export function applyKey(picker, { note, mode }) {
  const fallback = songKey("");
  const chosenNote = note ?? picker.note ?? fallback.root;
  const chosenMode = mode ?? picker.mode ?? fallback.mode;
  return { start: picker.line.argStart, end: picker.line.argEnd, text: ` ${chosenNote} ${chosenMode}` };
}

/** What a key gives you: its seven notes and seven chords. */
export function keyDetails({ note, mode }) {
  const fallback = songKey("");
  const key = { root: note ?? fallback.root, mode: mode ?? fallback.mode };
  return {
    scale: Array.from({ length: 7 }, (_, step) => spellStep(key, step)),
    chords: chordOptions(key).map((chord) => chord.name),
  };
}
