import { test } from "node:test";
import assert from "node:assert/strict";
import { keyPicker, applyKey, keyDetails } from "../src/editor/key-picker.js";
import { pickerAt } from "../src/editor/pickers.js";
import { MODES } from "../src/core/harmony.js";
import { compile } from "../src/lang/compile.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const line = (code) => ({ start: 0, end: code.length, code });

test("the key line opens it, and reads what's written", () => {
  const p = pickerAt("key d minor", 5);
  assert.equal(p.kind, "key");
  assert.deepEqual([p.note, p.mode], ["d", "minor"]);
  assert.deepEqual([pickerAt("key F# dorian", 5).note, pickerAt("key F# dorian", 5).mode], ["f#", "dorian"]);
  assert.deepEqual([pickerAt("key g major at 17", 3).note, pickerAt("key g major at 17", 3).mode], ["g", "major"]);
});

test("a line still being typed works, a word it can't read doesn't", () => {
  assert.deepEqual([pickerAt("key ", 4).note, pickerAt("key ", 4).mode], [null, null]);
  assert.deepEqual([pickerAt("key", 3).note, pickerAt("key", 3).mode], [null, null]);
  assert.deepEqual([pickerAt("key e", 5).note, pickerAt("key e", 5).mode], ["e", null]);
  assert.equal(pickerAt("key d mi", 8), null);
  assert.equal(pickerAt("key h minor", 5), null);
  assert.equal(pickerAt("# key d minor", 5), null);
  assert.equal(pickerAt("key: 0 2", 2)?.kind === "key", false, "a thread called key isn't this");
});

test("it offers all twelve notes and every mode, each with a mood", () => {
  const p = keyPicker(line("key d minor"));
  assert.equal(p.notes.length, 12);
  assert.deepEqual(new Set(p.modes.map((m) => m.name)), new Set(Object.keys(MODES)));
  assert.ok(p.modes.every((m) => m.doc.length > 5));
  assert.equal(p.modes[0].name, "lydian", "brightest first");
  assert.equal(p.modes.at(-1).name, "locrian", "darkest last");
});

test("picking writes only the key and keeps the rest", () => {
  const text = "key g major at 17   # chorus";
  const p = pickerAt(text, 5);
  assert.equal(edit(text, applyKey(p, { note: "a" })), "key a major at 17   # chorus");
  assert.equal(edit(text, applyKey(p, { mode: "dorian" })), "key g dorian at 17   # chorus");
});

test("from a blank line, picking one half fills in the other", () => {
  assert.equal(edit("key ", applyKey(keyPicker(line("key ")), { note: "e" })), "key e minor");
  assert.equal(edit("key", applyKey(keyPicker(line("key")), { mode: "major" })), "key d major");
  assert.equal(edit("key f", applyKey(keyPicker(line("key f")), { mode: "major" })), "key f major");
});

test("everything it writes compiles", () => {
  const p = keyPicker(line("key d minor"));
  for (const { name } of p.notes) {
    for (const { name: mode } of p.modes) {
      const text = edit("key d minor", applyKey(keyPicker(line("key d minor")), { note: name, mode }));
      const { errors, program } = compile(`${text}\na: 0\n`);
      assert.deepEqual(errors, [], text);
      assert.equal(program.settings.keys[0].mode, mode);
    }
  }
});

test("it shows the scale and chords of the key", () => {
  const details = keyDetails({ note: "d", mode: "minor" });
  assert.deepEqual(details.scale, ["D", "E", "F", "G", "A", "Bb", "C"]);
  assert.deepEqual(details.chords, ["Dm", "Edim", "F", "Gm", "Am", "Bb", "C"]);
  assert.deepEqual(keyDetails({ note: "f#", mode: "major" }).scale, ["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
  assert.deepEqual(keyDetails({ note: null, mode: null }).scale, ["D", "E", "F", "G", "A", "Bb", "C"], "no key line plays d minor");
});
