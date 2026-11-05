/* ============================================================
   cannoli — the sound picker
   The cursor on a sound word opens every sound, with what each
   is like. The style's favourites come first, and on a drum line
   the drums do. No drawing here: the editors draw.
   ============================================================ */

import { VERBS, DRUM_WORDS } from "../core/verbs.js";
import { STYLES } from "../core/styles.js";

const DEFAULT_SOUND = "triangle";
const WORD_RE = /[A-Za-z]\w*/g;

function isSound(word) {
  return VERBS[word]?.group === "sound";
}

/* The word's name in the menus: an older spelling shares its entry with the new one. */
function canonical(word) {
  return Object.keys(VERBS).find((name) => VERBS[name] === VERBS[word]);
}

function soundWordsIn(code) {
  return [...code.matchAll(WORD_RE)]
    .filter((m) => isSound(m[0]) && !/^\s*[:=]/.test(code.slice(m.index + m[0].length)) && !/\bbeat\s+$/.test(code.slice(0, m.index)))
    .map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

function groupsFor(current, style) {
  const favourites = STYLES[style]?.sounds ?? [];
  const entries = Object.entries(VERBS).filter(([, v]) => v.group === "sound")
    .map(([word, v]) => ({ word, doc: v.doc, fits: favourites.includes(word) }));
  const ordered = (list) => [
    ...list.filter((s) => s.fits).sort((a, b) => favourites.indexOf(a.word) - favourites.indexOf(b.word)),
    ...list.filter((s) => !s.fits),
  ];
  const drums = { title: "drums", sounds: ordered(entries.filter((s) => DRUM_WORDS.includes(s.word))) };
  const melodic = { title: "melodic sounds", sounds: ordered(entries.filter((s) => !DRUM_WORDS.includes(s.word))) };
  return DRUM_WORDS.includes(current) ? [drums, melodic] : [melodic, drums];
}

/**
 * The picker for the sound word under the cursor, or null. The cursor has to be in the word, not
 * just past it, so it doesn't open the moment you finish typing one.
 */
export function soundPicker(line, column, text) {
  if (/^\s*#/.test(line.code)) return null;
  const found = soundWordsIn(line.code).find((s) => column >= s.start && column < s.end);
  if (!found) return null;
  const current = canonical(found.word);
  const style = text.match(/^style\s+(\w+)/m)?.[1];
  return {
    kind: "sound", current, thread: threadOfLine(text, line.start), groups: groupsFor(current, style),
    line: { ...line, wordStart: line.start + found.start, wordEnd: line.start + found.end },
  };
}

/** The edit that switches to this sound. */
export function applySound(picker, word) {
  return { start: picker.line.wordStart, end: picker.line.wordEnd, text: word };
}

/** The thread a line belongs to, looking back over continuation lines; null for anything else. */
export function threadOfLine(text, lineStart) {
  const before = text.slice(0, lineStart).split("\n");
  before.pop();
  const lines = [text.slice(lineStart).split("\n")[0], ...before.reverse()];
  for (const line of lines) {
    const name = line.match(/^([A-Za-z]\w*):/)?.[1];
    if (name) return name;
    if (!/^\s*>/.test(line)) return null;
  }
  return null;
}

/* The lines of the statement starting here: this one and any continuation lines, with offsets. */
function statementLines(text, lineStart) {
  const out = [];
  let start = lineStart;
  for (const whole of text.slice(lineStart).split("\n")) {
    if (out.length && !/^\s*>/.test(whole)) break;
    const at = whole.search(/(^|\s)#/);
    out.push({ start, code: at < 0 ? whole : whole.slice(0, at) });
    start += whole.length + 1;
  }
  return out;
}

/** Where this statement says its sound, if it does. */
export function findSound(text, lineStart) {
  for (const line of statementLines(text, lineStart)) {
    const found = soundWordsIn(line.code)[0];
    if (found) return { start: line.start + found.start, end: line.start + found.end };
  }
  return null;
}

/** The edit that gives a statement a sound, at the end of its last line. */
export function addSound(text, lineStart) {
  const last = statementLines(text, lineStart).at(-1);
  const at = last.start + last.code.trimEnd().length;
  return { start: at, end: at, text: ` > ${DEFAULT_SOUND}` };
}
