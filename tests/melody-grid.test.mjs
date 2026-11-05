import { test } from "node:test";
import assert from "node:assert/strict";
import { readCells, writeCells, toggleNote, holdNote, melodyPicker, applyMelody, rowsFor, finer } from "../src/editor/melody-grid.js";
import { pickerAt } from "../src/editor/pickers.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const H = "hold";
const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const line = (code) => ({ start: 0, end: code.length, code });

/* What the song actually plays: start, length and pitches of each note. */
function played(pattern) {
  const { errors, program } = compile(`key c major\nlead: ${pattern} > free > triangle\n`);
  assert.deepEqual(errors, [], pattern);
  return renderBar(program, 0).map((n) => [Number(n.start.toFixed(4)), Number(n.dur.toFixed(4)), [...n.midi].sort().join("+")]);
}

test("it reads notes, rests, holds, brackets and chords", () => {
  assert.deepEqual(readCells("0 2 4 7", 8), [[0], H, [2], H, [4], H, [7], H]);
  assert.deepEqual(readCells("0 . 4 _", 4), [[0], null, [4], H]);
  assert.deepEqual(readCells("0 [2 4]", 4), [[0], H, [2], [4]]);
  assert.deepEqual(readCells("[0,2,4] .", 2), [[0, 2, 4], null]);
  assert.deepEqual(readCells("-1 0", 2), [[-1], [0]]);
  assert.equal(readCells("0 2 4 _ 6 4", 8).length, 6, "six steps don't fit in eight: the grid has six");
  assert.equal(readCells("0 [2 4] 2 _ 6 4 [8 6] 4", 8).length, 16);
});

test("patterns it can't draw don't open a grid", () => {
  for (const p of ["run 8", "theme + 2", "3#", "0x3", "(0 2)", "0.5", "[0 2", "chord"]) assert.equal(readCells(p, 8), null, p);
});

test("it writes the shortest pattern that says the same thing", () => {
  assert.equal(writeCells([[0], H, [2], H, [4], H, [7], H]), "0 2 4 7");
  assert.equal(writeCells([[0], null, [4], H]), "0 . 4 _");
  assert.equal(writeCells([[0], H, [2], [4]]), "0 [2 4]");
  assert.equal(writeCells([[0, 2], H, null, null]), "[0,2] .");
  assert.equal(writeCells([null, null, null, null]), ".");
});

test("your theme survives a trip through the grid", () => {
  const theme = "0 [2 4] 2 _ 6 4 [8 6] 4";
  assert.equal(writeCells(readCells(theme, 8)), theme);
});

test("written code plays exactly what the grid shows", () => {
  let seed = 7;
  const next = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  for (let round = 0; round < 150; round++) {
    const size = [4, 6, 8, 12, 16][next(5)];
    const cells = [];
    for (let i = 0; i < size; i++) {
      const roll = next(6);
      if (roll < 2 || i === 0 && roll > 3) cells.push([next(10)]);
      else if (roll === 2) cells.push([next(8), 8 + next(4)]);
      else if (roll === 3 && cells[i - 1] !== null && i > 0) cells.push(H);
      else cells.push(null);
    }
    const pattern = writeCells(cells);
    const expected = [];
    cells.forEach((cell, i) => {
      if (!Array.isArray(cell)) return;
      let len = 1;
      while (cells[i + len] === H) len++;
      const midi = played(`${cell.join(" ") && (cell.length > 1 ? `[${cell.join(",")}]` : cell[0])}`)[0][2];
      expected.push([Number((i / size).toFixed(4)), Number((len / size).toFixed(4)), midi]);
    });
    assert.deepEqual(played(pattern), expected, `${JSON.stringify(cells)} wrote ${pattern}`);
    assert.deepEqual(readCells(pattern, size), cells, `${pattern} reads back`);
  }
});

test("clicking adds, removes and shortens", () => {
  const start = [[0], H, null, null];
  assert.deepEqual(toggleNote(start, 4, 2), [[0], H, [4], null]);
  assert.deepEqual(toggleNote(start, 2, 0), [[0, 2], H, null, null], "another row makes a chord");
  assert.deepEqual(toggleNote(start, 0, 0), [null, null, null, null], "the note and its hold go together");
  assert.deepEqual(toggleNote([[0], H, H, null], 0, 2), [[0], H, null, null], "clicking a held step ends it there");
  assert.deepEqual(toggleNote([[0], H, H, null], 5, 1), [[0], [5], H, null], "another row starts a new note");
});

test("dragging right holds the note, and stops at the next one", () => {
  assert.deepEqual(holdNote([[0], null, null, null], 0, 2), [[0], H, H, null]);
  assert.deepEqual(holdNote([[0], null, [4], null], 0, 3), [[0], H, [4], null]);
  assert.deepEqual(holdNote([[0], H, H, null], 0, 1), [[0], H, null, null], "dragging back shortens it");
});

test("it can split the grid finer", () => {
  assert.deepEqual(finer([[0], null]), [[0], H, null, null]);
});

test("melodic threads and variables open it; drums and other patterns don't", () => {
  assert.equal(pickerAt("lead: 0 2 4 7 > triangle", 7).kind, "melody");
  assert.equal(pickerAt("theme = 0 2 4", 10).kind, "melody");
  assert.equal(pickerAt("kick: 0 . 0 . > bd", 7).kind, "beat");
  assert.equal(pickerAt("lead: run 8 > bell", 7), null);
  assert.equal(pickerAt("speed = 2", 9), null, "a lone number is a value, not a melody");
  assert.equal(pickerAt("key d minor", 5), null);
});

test("a blank melodic part opens it, but not a part that isn't a melody", () => {
  assert.ok(pickerAt("lead: ", 6).blank);
  assert.equal(pickerAt("lead: ", 6).kind, "melody");
  assert.equal(pickerAt("slowlead:", 9).kind, "melody");
  assert.equal(pickerAt("theme = ", 8).kind, "melody");
  assert.equal(pickerAt("pad: ", 5), null);
  assert.equal(pickerAt("arp: ", 5), null);
});

test("the cursor still picks the slider or bars on the same line", () => {
  const text = "lead: 0 2 > gain 0.4 > every 4 rev";
  assert.equal(pickerAt(text, 7).kind, "melody");
  assert.equal(pickerAt(text, text.indexOf("gain") + 1).kind, "slider");
  assert.equal(pickerAt(text, text.indexOf("every") + 1).kind, "bars");
});

test("clicking rewrites just the pattern and keeps the rest of the line", () => {
  const text = "lead: 0 2 > triangle > high   # hello";
  const p = pickerAt(text, 7);
  assert.equal(edit(text, applyMelody(p, [[0], [4]])), "lead: 0 4 > triangle > high   # hello");
  assert.equal(edit("lead: ", applyMelody(pickerAt("lead: ", 6), [[0], [4]])), "lead: 0 4");
  assert.equal(edit("lead:", applyMelody(pickerAt("lead:", 5), [[0], [4]])), "lead: 0 4");
  assert.equal(edit("theme = 0 2", applyMelody(pickerAt("theme = 0 2", 9), [[1], [2]])), "theme = 1 2");
});

test("a line that plays a variable edits that variable", () => {
  const song = "theme = 0 2 4 7\nlead: theme > triangle\n";
  const p = pickerAt(song, song.indexOf("theme >") + 2);
  assert.equal(p.kind, "melody");
  assert.equal(p.name, "theme");
  assert.deepEqual(p.cells[0], [0]);
  assert.equal(edit(song, applyMelody(p, [[1], [2]])), "theme = 1 2\nlead: theme > triangle\n");
});

test("a finer grid stays finer after you click", () => {
  const p = melodyPicker(line("lead: 0 2"), "lead: 0 2", { minColumns: 16 });
  assert.equal(p.cells.length, 16);
});

test("rows show the note names of the song's key, and always fit what's written", () => {
  const rows = rowsFor([[0], [9]], "key d minor\n");
  assert.equal(rows[rows.length - 1].step, 0);
  assert.equal(rows[rows.length - 1].note, "D");
  assert.equal(rows.find((r) => r.step === 2).note, "F");
  assert.equal(rows.find((r) => r.step === 7).note, "D");
  assert.ok(rows.find((r) => r.step === 7).home);
  assert.equal(rowsFor([[-3]], "").at(-1).step, -3);
  assert.ok(rowsFor([[14]], "")[0].step === 14);
});
