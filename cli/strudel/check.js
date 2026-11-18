/* ============================================================
   cannoli — checking Strudel code as you type
   Finds mistakes without playing anything, and reads what the
   editor shows about a song: its threads, tempo and key.
   ============================================================ */

import { STYLES } from "../../src/core/styles.js";
import { closest } from "../../src/lang/errors.js";
import { blocksIn, tokenize } from "./highlight.js";
import { prepareSong, readHeader } from "./dialect.js";

const DEFAULT_CPS = 0.5;
const SECONDS_PER_MINUTE = 60;
const BEATS_PER_CYCLE = 4;

function friendly(message) {
  if (/Unterminated string/.test(message)) return 'This quote is never closed: add the matching " at the end of the pattern.';
  if (/Unterminated template/.test(message)) return "This ` is never closed.";
  if (/Unexpected token/.test(message)) return 'Something is off here: check for a missing ")" or a stray character.';
  return message.replace(/\s*\(\d+:\d+\)\s*$/, "");
}

/* A mistake inside a pattern doesn't say where, so try each pattern in turn. */
function findBadPattern(text, transpiler) {
  for (const match of text.matchAll(/"[^"\n]*"/g)) {
    try {
      transpiler(match[0], { emitMiniLocations: true, wrapAsync: false, addReturn: false });
    } catch (err) {
      return { start: match.index, end: match.index + match[0].length, message: `This pattern has a mistake: ${err.message.replace(/^\[mini\] parse error at line \d+:\s*/, "")}` };
    }
  }
  return { start: 0, end: Math.min(text.length, 1), message: "A pattern has a mistake." };
}

function syntaxProblem(text, err, transpiler) {
  if (typeof err.pos === "number") return { start: err.pos, end: Math.min(text.length, err.pos + 1), message: friendly(err.message) };
  return findBadPattern(text, transpiler);
}

/* Typos in method names: Strudel only reports these once it plays, so catch them while typing. */
function typoWarnings(text, known) {
  const declared = new Set([...text.matchAll(/register\(\s*['"](\w+)['"]/g)].map((m) => m[1]));
  const options = [...known];
  const out = [];
  for (const token of tokenize(text)) {
    if (token.cls !== "verb" || text[token.end] !== "(" || known.has(token.text) || declared.has(token.text)) continue;
    const guess = closest(token.text, options);
    out.push({
      start: token.start, end: token.end,
      message: `Strudel doesn't have ".${token.text}()".${guess ? ` Did you mean ".${guess}()"?` : ""}`,
      fix: guess ? { label: `change to "${guess}"`, start: token.start, end: token.end, text: guess } : undefined,
    });
  }
  return out;
}

function number(expression) {
  const parts = expression.split("/").map((p) => Number(p.trim()));
  return parts.every(Number.isFinite) ? parts.reduce((a, b) => a / b) : null;
}

function tempoOf(text) {
  const written = readHeader(text).tempo;
  if (written) return written;
  const cpm = text.match(/\bsetc[pP]m\(([^()]+)\)/);
  if (cpm && number(cpm[1])) return number(cpm[1]) * BEATS_PER_CYCLE;
  const cps = text.match(/\bsetc[pP]s\(([^()]+)\)/);
  if (cps && number(cps[1])) return number(cps[1]) * SECONDS_PER_MINUTE * BEATS_PER_CYCLE;
  const style = text.match(/\bstyle\(\s*["'](\w+)["']\s*\)/)?.[1];
  return STYLES[style]?.tempo ?? DEFAULT_CPS * SECONDS_PER_MINUTE * BEATS_PER_CYCLE;
}

function threadNames(text) {
  const blocks = blocksIn(text);
  if (blocks.length === 0) return text.trim() ? ["pattern"] : [];
  let anonymous = 0;
  return blocks.map((b) => (b.name.includes("$") ? `${b.name.replace(/\$$/, "$")}${++anonymous}` : b.name));
}

/**
 * Check a song. The same shape the cannoli compiler returns, so the editor treats both alike.
 * @param {string} text
 * @param {{ transpiler: Function, known: Set<string> }} tools
 */
export function checkSong(text, { transpiler, known }) {
  const errors = [];
  let warnings = [];
  if (text.trim()) {
    try {
      transpiler(prepareSong(text), { emitMiniLocations: true, wrapAsync: true, addReturn: true });
      warnings = typoWarnings(text, known);
    } catch (err) {
      errors.push(syntaxProblem(text, err, transpiler));
    }
  }
  const scale = text.match(/\.scale\(\s*["']([A-Ga-g][#b]?\d*):?(\w+)?/);
  const { key } = readHeader(text);
  const style = text.match(/\bstyle\(\s*["'](\w+)["']\s*\)/)?.[1] ?? null;
  return {
    errors, warnings, symbols: {},
    program: {
      code: text,
      threads: threadNames(text).map((name) => ({ name })),
      settings: {
        tempo: tempoOf(text), beats: BEATS_PER_CYCLE, style, chords: [],
        keys: key ? [{ mode: key.mode, name: key.name }] : scale ? [{ mode: scale[2] ?? "major", name: `${scale[1]} ${scale[2] ?? "major"}` }] : [],
      },
    },
  };
}
