import { test } from "node:test";
import assert from "node:assert/strict";
import { chordOptions, songKey, spellStep, applyChords, setChord, addBar, removeBar, slotAtColumn, goodNext, progressionsFor } from "../src/editor/chord-picker.js";
import { pickerAt } from "../src/editor/pickers.js";
import { rowsFor } from "../src/editor/melody-grid.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const at = (text, cursor = text.length) => pickerAt(text, cursor);

test("notes are spelled for the key", () => {
  const dMinor = { root: "d", mode: "minor" };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((s) => spellStep(dMinor, s)), ["D", "E", "F", "G", "A", "Bb", "C"]);
  assert.deepEqual([0, 3, 6].map((s) => spellStep({ root: "f#", mode: "minor" }, s)), ["F#", "B", "E"]);
  assert.deepEqual([0, 3].map((s) => spellStep({ root: "bb", mode: "major" }, s)), ["Bb", "Eb"]);
  assert.equal(spellStep(dMinor, 7), "D");
  assert.equal(spellStep(dMinor, -1), "C");
});

test("a song with no key line is in d minor, as it plays", () => {
  assert.deepEqual(songKey(""), { root: "d", mode: "minor" });
  assert.deepEqual(songKey("key g major\nkey a minor at 9\n"), { root: "g", mode: "major" });
  assert.equal(rowsFor([[0]], "").at(-1).note, "D");
  assert.equal(rowsFor([[5]], "key d minor").find((r) => r.step === 5).note, "Bb");
});

test("the seven chords of the key have real names and the right case", () => {
  const minor = chordOptions({ root: "d", mode: "minor" });
  assert.deepEqual(minor.map((o) => o.word), ["i", "ii", "III", "iv", "v", "VI", "VII"]);
  assert.deepEqual(minor.map((o) => o.name), ["Dm", "Edim", "F", "Gm", "Am", "Bb", "C"]);
  const major = chordOptions({ root: "c", mode: "major" });
  assert.deepEqual(major.map((o) => o.word), ["I", "ii", "iii", "IV", "V", "vi", "vii"]);
  assert.deepEqual(major.map((o) => o.name), ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
});

test("the names match the notes the song plays", () => {
  const options = chordOptions({ root: "c", mode: "major" });
  const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  options.forEach((option, i) => {
    const { program } = compile(`key c major\nchords ${option.word}\nx1: chord > free\n`);
    const pcs = renderBar(program, 0)[0].midi.map((m) => m % 12);
    assert.ok(pcs.includes(PITCH[option.name[0]]), `${option.name} on degree ${i}`);
  });
});

test("the chords line opens it; other lines and unknown words don't", () => {
  const p = at("key d minor\nchords i VI III VII");
  assert.equal(p.kind, "chords");
  assert.deepEqual(p.words, ["i", "VI", "III", "VII"]);
  assert.equal(p.options.length, 7);
  assert.ok(at("chords ").blank);
  assert.equal(at("chords i xx"), null);
  assert.equal(at("# chords i VI"), null);
  assert.equal(at("key d minor").kind, "key");
});

test("choosing rewrites only the chords and keeps the rest of the line", () => {
  const text = "chords i VI III VII at 9   # verse";
  const p = pickerAt(text, 8);
  assert.deepEqual(p.words, ["i", "VI", "III", "VII"]);
  assert.equal(edit(text, applyChords(p, ["i", "iv"])), "chords i iv at 9   # verse");
  assert.equal(edit("chords ", applyChords(at("chords "), ["i"])), "chords i");
  assert.equal(edit("chords", applyChords(at("chords"), ["i"])), "chords i");
  const code = edit("chords i VI", applyChords(at("chords i VI"), ["i", "iv", "VI"]));
  assert.deepEqual(compile(`${code}\na: 0\n`).errors, []);
});

test("bars can be changed, added and removed", () => {
  assert.deepEqual(setChord(["i", "VI"], 1, "iv"), ["i", "iv"]);
  assert.deepEqual(setChord([], 0, "iv"), ["iv"]);
  assert.deepEqual(removeBar(["i", "VI", "III"], 1), ["i", "III"]);
  assert.deepEqual(removeBar(["i"], 0), ["i"], "a line needs at least one chord");
  assert.equal(addBar(["i"], { root: "d", mode: "minor" }).length, 2);
  assert.equal(addBar([], { root: "d", mode: "minor" })[0], "i");
});

test("it knows which bar the cursor is on", () => {
  const text = "chords i VI III";
  const p = pickerAt(text, 10);
  assert.equal(slotAtColumn(p, 7), 0);
  assert.equal(slotAtColumn(p, 10), 1);
  assert.equal(slotAtColumn(p, text.length), 2);
  assert.equal(slotAtColumn(p, 2), 0);
});

test("it suggests what usually comes next", () => {
  const options = chordOptions({ root: "d", mode: "minor" });
  assert.deepEqual(goodNext(["i", "VI"], 1, options).map((o) => o.word), ["iv", "v", "VI"]);
  assert.deepEqual(goodNext(["i", "VI"], 0, options).map((o) => o.word), []);
  assert.deepEqual(goodNext(["i", "V", "VI"], 2, options).map((o) => o.word), ["i", "VI"]);
});

test("ready-made progressions fit the key's mood and the style first, with real names", () => {
  const funk = progressionsFor({ root: "c", mode: "minor" }, "funk");
  assert.ok(funk[0].fits);
  assert.equal(funk[0].words.join(" "), "i i iv iv");
  assert.equal(funk[0].names, "Cm Cm Fm Fm");
  assert.ok(progressionsFor({ root: "c", mode: "major" }).some((p) => p.words.join(" ") === "I V vi IV"));
  assert.equal(new Set(funk.map((p) => p.words.join(" "))).size, funk.length);
  for (const key of [{ root: "c", mode: "major" }, { root: "d", mode: "minor" }]) {
    for (const p of progressionsFor(key, "house")) assert.deepEqual(compile(`chords ${p.words.join(" ")}\na: 0\n`).errors, []);
  }
});
