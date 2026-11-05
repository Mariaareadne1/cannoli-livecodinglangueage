/* ============================================================
   cannoli — the melody grid
   Reads a pattern of scale steps into cells you can click, one
   per step of the bar, and writes them back as the shortest
   pattern that plays the same thing. A cell is a list of scale
   steps (a note or chord), "hold" (the last note carries on) or
   null (a rest). No drawing here: the editors draw.
   ============================================================ */

import { mod } from "../core/harmony.js";
import { songKey, spellStep } from "./chord-picker.js";

const HOLD = "hold";
const STEPS_PER_BEAT = 2;
const MOST_COLUMNS = 64;
const TOKEN_RE = /\[|\]|,|_|\.|-?\d+/g;
const MELODIC_NAMES = ["lead", "melody", "riff", "hook", "synth", "bass", "keys", "piano", "pluck", "bell", "vox", "voice", "echo", "counter", "theme"];
const SCALE_LENGTH = 7;
const TOP_ROW = 9;

/* ---------- reading ---------- */

/**
 * @param {string} pattern
 * @param {number} size  columns to fill if the pattern fits them evenly
 * @returns {(number[]|string|null)[] | null}  null if it can't be drawn as a grid
 */
export function readCells(pattern, size) {
  const tree = parseTree(pattern);
  if (!tree) return null;
  const natural = widthOf(tree);
  if (natural > MOST_COLUMNS) return null;
  const columns = natural % 1 === 0 && size % natural === 0 ? size : natural;
  return tidy(flatten(tree, columns));
}

function parseTree(pattern) {
  if (/\d\.\d/.test(pattern)) return null;
  const tokens = pattern.match(TOKEN_RE) ?? [];
  if (tokens.join("") !== pattern.replace(/\s+/g, "")) return null;
  let at = 0;
  const sequence = (depth) => {
    const items = [];
    while (at < tokens.length && tokens[at] !== "]") {
      const item = readItem(depth);
      if (!item) return null;
      items.push(item);
    }
    return items;
  };
  const readItem = (depth) => {
    const token = tokens[at++];
    if (token === "_") return { hold: true };
    if (token === ".") return { rest: true };
    if (token === "[") {
      const close = tokens.indexOf("]", at);
      if (close < 0 || depth > 1) return null;
      const inside = tokens.slice(at, close);
      if (inside.includes(",") && !tokens.slice(at, close).includes("[")) {
        at = close + 1;
        const degs = inside.filter((t) => t !== ",").map(Number);
        return degs.every(Number.isInteger) && inside.length === degs.length * 2 - 1 ? { degs } : null;
      }
      const items = sequence(depth + 1);
      if (!items || tokens[at] !== "]" || items.length === 0) return null;
      at += 1;
      return { items };
    }
    return /^-?\d+$/.test(token) ? { degs: [Number(token)] } : null;
  };
  const tree = sequence(0);
  return tree && tree.length && at === tokens.length ? tree : null;
}

function widthOf(items) {
  const inner = items.reduce((all, item) => lcm(all, item.items ? widthOf(item.items) : 1), 1);
  return items.length * inner;
}

function lcm(a, b) {
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  return (a * b) / gcd(a, b);
}

function flatten(items, columns) {
  const each = columns / items.length;
  return items.flatMap((item) => {
    if (item.items) return flatten(item.items, each);
    if (item.rest) return Array(each).fill(null);
    if (item.hold) return Array(each).fill(HOLD);
    return [item.degs, ...Array(each - 1).fill(HOLD)];
  });
}

/* A hold only means something after a note. */
function tidy(cells) {
  return cells.reduce((out, cell) => [...out, cell === HOLD && (out.length === 0 || out.at(-1) === null) ? null : cell], []);
}

/* ---------- writing ---------- */

/** The shortest pattern that plays these cells. */
export function writeCells(cells) {
  const options = divisorsOf(cells.length)
    .map((count) => chunks(cells, count).map(writeChunk).join(" "))
    .filter((option) => !option.includes("[_"));   // a hold can't start a bracket
  return options.reduce((best, option) => (awkwardness(option) < awkwardness(best) ? option : best));
}

/* Its length, plus a little for brackets with a rest or hold inside: [0 .] 4 reads worse than 0 . 4 _ */
function awkwardness(option) {
  return option.length + (option.match(/\[[^\]]*[._][^\]]*\]/g) ?? []).length * 2;
}

function divisorsOf(n) {
  return Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0);
}

function chunks(cells, count) {
  const each = cells.length / count;
  return Array.from({ length: count }, (_, i) => cells.slice(i * each, (i + 1) * each));
}

/* One step if the chunk is a single thing, otherwise brackets split as evenly as they can be. */
function writeChunk(chunk) {
  const count = divisorsOf(chunk.length).find((n) => chunks(chunk, n).every(isOneThing));
  const parts = chunks(chunk, count).map((part) => writeCell(part[0]));
  return parts.length === 1 ? parts[0] : `[${parts.join(" ")}]`;
}

function isOneThing(chunk) {
  const rest = chunk.slice(1);
  return chunk[0] === null ? rest.every((c) => c === null) : rest.every((c) => c === HOLD);
}

function writeCell(cell) {
  if (cell === null) return ".";
  if (cell === HOLD) return "_";
  return cell.length > 1 ? `[${cell.join(",")}]` : String(cell[0]);
}

/* ---------- clicking ---------- */

/** Click a cell: start, add to, remove or cut short a note. */
export function toggleNote(cells, step, column) {
  const cell = cells[column];
  const replaced = cells.map((c, i) => {
    if (i !== column) return c;
    if (Array.isArray(cell)) {
      if (!cell.includes(step)) return [...cell, step].sort((a, b) => a - b);
      const left = cell.filter((s) => s !== step);
      return left.length ? left : null;
    }
    return cell === HOLD && soundingAt(cells, column).includes(step) ? null : [step];
  });
  return tidy(replaced);
}

function soundingAt(cells, column) {
  for (let i = column; i >= 0; i--) {
    if (Array.isArray(cells[i])) return cells[i];
  }
  return [];
}

/** Drag from a note to another column: it holds until there, up to the next note. */
export function holdNote(cells, from, to) {
  const next = cells.findIndex((c, i) => i > from && Array.isArray(c));
  const end = next < 0 ? cells.length : next;
  return cells.map((c, i) => (i <= from || i >= end ? c : i <= to ? HOLD : null));
}

/** The same music with twice as many columns. */
export function finer(cells) {
  return cells.flatMap((cell) => (cell === null ? [null, null] : [cell, HOLD]));
}

/* ---------- on a line ---------- */

/**
 * The grid for a line of code, or null.
 * @param {{ start: number, end: number, code: string }} line
 * @param {string} text  the whole song
 * @param {{ minColumns?: number, column?: number }} [opts]
 *   minColumns keeps a grid split finer than its pattern needs; column is the cursor's place on the
 *   line, and the grid only opens with the cursor on the notes, not on the verbs after them
 */
export function melodyPicker(line, text, { minColumns = 0, column = 0 } = {}) {
  const part = readPart(line);
  if (!part || part.isDrum) return null;
  if (column > part.patternEnd - line.start) return null;
  const size = Math.max((Number(text.match(/^beats\s+(\d+)/m)?.[1]) || 4) * STEPS_PER_BEAT, minColumns);
  if (part.pattern === "") {
    const melodic = part.isVariable || MELODIC_NAMES.some((word) => part.name.toLowerCase().includes(word));
    return melodic ? pickerFor(part, Array(size).fill(null), line, true) : null;
  }
  const variable = part.isVariable ? null : findVariable(part.pattern, text);
  if (variable) return melodyPicker(variable, text, { minColumns });
  if (part.isVariable && /^-?\d+$/.test(part.pattern)) return null;
  const cells = readCells(part.pattern, size);
  if (!cells) return null;
  // a pattern can need fewer columns than a finer grid has
  const stretched = minColumns > cells.length && minColumns % cells.length === 0 ? spread(cells, minColumns) : cells;
  return pickerFor(part, stretched, line, false);
}

function spread(cells, columns) {
  return cells.length >= columns ? cells : spread(finer(cells), columns);
}

function pickerFor(part, cells, line, blank) {
  return { kind: "melody", cells, name: part.name, blank, line: { ...line, patternStart: part.patternStart, patternEnd: part.patternEnd, blank } };
}

function readPart(line) {
  const match = line.code.match(/^([A-Za-z]\w*)\s*(:|=(?!=))(\s*)(.*)$/);
  if (!match || match[1] === "def") return null;
  const [, name, mark, gap, body] = match;
  const isVariable = mark === "=";
  const { pattern, chain } = splitBody(body.trimEnd());
  const bodyStart = line.start + line.code.indexOf(mark) + 1;
  const patternStart = bodyStart + gap.length;
  return {
    name, isVariable, pattern,
    isDrum: /(^|>\s*)(bd|sd|hh|oh|cp|rim|mt|cb|sh|kick|snare|hat|open|clap|tom|cowbell|shaker)\b/.test(chain),
    patternStart: pattern === "" ? bodyStart : patternStart,
    patternEnd: pattern === "" ? line.start + line.code.length : patternStart + pattern.length,
  };
}

function findVariable(name, text) {
  if (!/^[A-Za-z]\w*$/.test(name)) return null;
  const match = text.match(new RegExp(`^${name}\\s*=.*$`, "m"));
  if (!match) return null;
  const comment = match[0].search(/(^|\s)#/);
  return { start: match.index, end: match.index + match[0].length, code: comment < 0 ? match[0] : match[0].slice(0, comment) };
}

/* The pattern, then everything after its first top-level ">". */
export function splitBody(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(" || body[i] === "[") depth++;
    else if (body[i] === ")" || body[i] === "]") depth--;
    else if (body[i] === ">" && depth === 0) return { pattern: body.slice(0, i).trim(), chain: body.slice(i + 1).trim() };
  }
  return { pattern: body.trim(), chain: "" };
}

/** The edit that makes the line play these cells. */
export function applyMelody(picker, cells) {
  const { patternStart, patternEnd, blank } = picker.line;
  const pattern = writeCells(cells);
  return { start: patternStart, end: patternEnd, text: blank ? ` ${pattern}` : pattern };
}

/**
 * The rows to draw, highest first: one for each scale step, named in the song's key.
 * @returns {{ step: number, note: string, home: boolean }[]}
 */
export function rowsFor(cells, text) {
  const used = cells.flatMap((c) => (Array.isArray(c) ? c : []));
  const key = songKey(text);
  const top = Math.max(TOP_ROW, ...used);
  const bottom = Math.min(0, ...used);
  return Array.from({ length: top - bottom + 1 }, (_, i) => {
    const step = top - i;
    return { step, note: spellStep(key, step), home: mod(step, SCALE_LENGTH) === 0 };
  });
}
