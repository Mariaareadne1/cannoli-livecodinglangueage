import { test } from "node:test";
import assert from "node:assert/strict";
import { soundPicker, applySound, findSound, addSound, threadOfLine } from "../src/editor/sound-picker.js";
import { pickerAt } from "../src/editor/pickers.js";
import { compile } from "../src/lang/compile.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const on = (text, word) => pickerAt(text, text.indexOf(word) + 1);

test("the cursor on a sound word opens it", () => {
  const text = "lead: 0 2 > triangle > high";
  const p = on(text, "triangle");
  assert.equal(p.kind, "sound");
  assert.equal(p.current, "triangle");
  assert.equal(p.thread, "lead");
  assert.equal(on("kick: 0 . > bd", "bd").kind, "sound");
  assert.equal(on("a: 0 > every 4 (sawtooth)", "sawtooth").kind, "sound");
});

test("older names count, and are written in the new spelling", () => {
  const text = "lead: 0 2 > saw";
  const p = on(text, "saw");
  assert.equal(p.current, "sawtooth");
  assert.equal(edit(text, applySound(p, "pluck")), "lead: 0 2 > pluck");
});

test("thread names, patterns and the end of a word don't open it", () => {
  assert.notEqual(pickerAt("pad: chord > high", 1)?.kind, "sound");
  assert.notEqual(pickerAt("kick: 0 . > bd", 2)?.kind, "sound");
  assert.notEqual(pickerAt("a: 0 > mask (beat shuffle)", 20)?.kind, "sound");
  assert.notEqual(pickerAt("lead: 0 2 > triangle", 20)?.kind, "sound", "just finished typing it");
  assert.equal(soundPicker({ start: 0, end: 12, code: "# a > bell" }, 7, ""), null);
});

test("sounds come grouped, drums first on a drum line, and every one is real", () => {
  const melodic = on("lead: 0 2 > triangle", "triangle");
  assert.deepEqual(melodic.groups.map((g) => g.title), ["melodic sounds", "drums"]);
  const drum = on("kick: 0 > bd", "bd");
  assert.deepEqual(drum.groups.map((g) => g.title), ["drums", "melodic sounds"]);
  const all = melodic.groups.flatMap((g) => g.sounds);
  assert.equal(all.length, 21);
  assert.ok(all.every((s) => s.doc.length > 5));
  for (const { word } of all) assert.deepEqual(compile(`a: 0 > ${word}\n`).errors, [], word);
});

test("sounds that suit the style are marked and come first", () => {
  const p = on("style funk\nlead: 0 2 > triangle", "triangle");
  const sounds = p.groups[0].sounds;
  assert.equal(sounds[0].word, "boom");
  assert.ok(sounds[0].fits);
  assert.ok(!sounds.find((s) => s.word === "triangle").fits);
});

test("choosing swaps only that word", () => {
  const text = "lead: 0 2 > triangle > high   # note";
  assert.equal(edit(text, applySound(on(text, "triangle"), "bell")), "lead: 0 2 > bell > high   # note");
});

test("it finds the thread from a continuation line", () => {
  const song = "kick: 0 > bd\nlead: 0 2\n  > high\n  > triangle\n";
  assert.equal(threadOfLine(song, song.indexOf("  > triangle")), "lead");
  assert.equal(on(song, "triangle").thread, "lead");
  assert.equal(threadOfLine("theme = 0 2\n", 0), null);
});

test("it can find a line's sound, or add one where there's none", () => {
  const song = "lead: 0 2\n  > high\n  > triangle\nb: 0\n";
  const found = findSound(song, 0);
  assert.equal(song.slice(found.start, found.end), "triangle");
  assert.equal(findSound("a: 0 > high\nb: 0 > bell\n", 0), null, "another thread's sound isn't this one's");
  const bare = "lead: 0 2 > high  # up\nb: 0\n";
  const added = addSound(bare, 0);
  assert.equal(edit(bare, added), "lead: 0 2 > high > triangle  # up\nb: 0\n");
  assert.equal(edit("a: 0\n  > high\nb: 0\n", addSound("a: 0\n  > high\nb: 0\n", 0)), "a: 0\n  > high > triangle\nb: 0\n");
});
