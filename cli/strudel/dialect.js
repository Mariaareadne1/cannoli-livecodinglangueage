/* ============================================================
   cannoli — the two lines cannoli adds to Strudel
     key a minor    every n("0 2 4") in the song follows this key
     tempo 120      beats per minute
   Everything else in a song is ordinary Strudel. These lines are
   blanked out at the same length, so Strudel's note positions
   still line up with the code on screen.
   ============================================================ */

import { MODES } from "../../src/core/harmony.js";

const BEATS_PER_CYCLE = 4;
const KEY_LINE = /^[ \t]*key[ \t]+([A-Ga-g][#b]?)[ \t]+([A-Za-z]+)[ \t]*(?:\/\/.*)?$/gm;
const TEMPO_LINE = /^[ \t]*tempo[ \t]+(\d+(?:\.\d+)?)[ \t]*(?:\/\/.*)?$/gm;

/* "harmonic" is how the key picker says it; Strudel calls it harmonic:minor. */
const scaleName = (root, mode) => `${root[0].toUpperCase()}${root.slice(1)}:${mode === "harmonic" ? "harmonic:minor" : mode}`;

/**
 * The song's key and tempo lines.
 * @param {string} text
 * @returns {{ key: { root: string, mode: string, name: string, scale: string } | null, tempo: number | null,
 *             ranges: [number, number][] }}
 */
export function readHeader(text) {
  const keys = [...text.matchAll(KEY_LINE)].filter((m) => MODES[m[2].toLowerCase()]);
  const tempos = [...text.matchAll(TEMPO_LINE)];
  const [root, rawMode] = keys[0]?.slice(1) ?? [];
  const mode = rawMode?.toLowerCase();
  return {
    key: keys[0] ? { root: root.toLowerCase(), mode, name: `${root} ${mode}`, scale: scaleName(root, mode) } : null,
    tempo: tempos[0] ? Number(tempos[0][1]) : null,
    ranges: [...keys, ...tempos].map((m) => [m.index, m.index + m[0].length]),
  };
}

/** The song as Strudel sees it: the key and tempo lines become blank space. */
export function prepareSong(text) {
  return readHeader(text).ranges.reduce((code, [start, end]) => code.slice(0, start) + " ".repeat(end - start) + code.slice(end), text);
}

/** What the key and tempo lines do, as Strudel code. */
export function setupCode(text) {
  const { key, tempo } = readHeader(text);
  return `${tempo ? `setcpm(${tempo}/${BEATS_PER_CYCLE});` : ""}${key ? `all(inKey(${JSON.stringify(key.scale)}));` : ""}`;
}

/** Strudel's transpiler, taught the key and tempo lines. */
export function withHeader(transpiler) {
  return (code, options) => {
    const out = transpiler(prepareSong(code), options);
    return { ...out, output: `${setupCode(code)}${out.output}` };
  };
}
