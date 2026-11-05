/* ============================================================
   cannoli — the groove picker
   Every named rhythm with a picture of its steps, the style's
   favourites first. No drawing here: the editors draw.
   ============================================================ */

import { BEATS, STYLES } from "../core/styles.js";
import { threadOfLine } from "./sound-picker.js";

const BEAT_RE = /\bbeat\b(?:(\s+)(\w*))?/g;

/** Every groove, the style's first and in the style's order. */
export function grooveList(style) {
  const favourites = STYLES[style]?.beats ?? [];
  const entries = Object.entries(BEATS).map(([name, beat]) => ({
    name, doc: beat.doc, fits: favourites.includes(name), steps: [...beat.steps].map((c) => c === "x"),
  }));
  return [
    ...entries.filter((g) => g.fits).sort((a, b) => favourites.indexOf(a.name) - favourites.indexOf(b.name)),
    ...entries.filter((g) => !g.fits),
  ];
}

/** The picker for the beat under the cursor, or null. */
export function groovePicker(line, column, text) {
  if (/^\s*#/.test(line.code)) return null;
  for (const match of line.code.matchAll(BEAT_RE)) {
    const name = match[2] || null;
    const end = match.index + match[0].length;
    if (column < match.index || column > end) continue;
    if (name && !BEATS[name]) continue;
    const style = text.match(/^style\s+(\w+)/m)?.[1];
    return {
      kind: "groove", name, grooves: grooveList(style), thread: threadOfLine(text, line.start),
      isThreadsPattern: /^[A-Za-z]\w*:\s*$/.test(line.code.slice(0, match.index)),
      line: { ...line, nameStart: line.start + match.index + "beat".length, nameEnd: line.start + end },
    };
  }
  return null;
}

/** The edit that switches to this groove. */
export function applyGroove(picker, name) {
  return { start: picker.line.nameStart, end: picker.line.nameEnd, text: ` ${name}` };
}
