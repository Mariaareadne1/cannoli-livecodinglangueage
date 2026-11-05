import { test } from "node:test";
import assert from "node:assert/strict";
import { ringPicker, applyRing, ringPattern, ringName } from "../src/editor/euclid-ring.js";
import { pickerAt } from "../src/editor/pickers.js";
import { euclidSteps } from "../src/core/verbs.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const shown = (steps) => steps.map((on) => (on ? "x" : ".")).join("");
const on = (text, word = "euclid") => pickerAt(text, text.indexOf(word) + 1);

test("euclidRot turns the rhythm so it starts later in the pattern", () => {
  assert.equal(shown(euclidSteps(3, 8, 0)), "x..x..x.");
  assert.equal(shown(euclidSteps(3, 8, 2)), ".x..x.x.");
  assert.equal(shown(euclidSteps(3, 8, 8)), "x..x..x.");
});

test("it plays in the language", () => {
  const { errors, program } = compile("a: euclidRot 3 8 2 > bd\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(renderBar(program, 0).map((n) => n.start * 8), [1, 4, 6]);
});

test("the cursor on euclid opens the ring", () => {
  const p = on("kick: euclid 5 16 > bd");
  assert.equal(p.kind, "euclid");
  assert.deepEqual([p.word, p.hits, p.steps, p.rotation], ["euclid", 5, 16, 0]);
  const rot = on("kick: euclidRot 3 8 2 > bd");
  assert.deepEqual([rot.word, rot.hits, rot.steps, rot.rotation], ["euclidRot", 3, 8, 2]);
  assert.deepEqual([on("a: euclid ").hits, on("a: euclid ").steps], [3, 8], "blank starts somewhere useful");
  assert.equal(on("a: euclid 4").hits, 4);
  assert.equal(on("stab: chord > mask (euclid 3 8) > stab").kind, "euclid");
  assert.equal(on("a: hits 3 8 > bd", "hits").word, "hits");
});

test("elsewhere on the line, the other grids still open", () => {
  const text = "kick: euclid 3 8 > bd > gain 0.5";
  assert.equal(pickerAt(text, 2).kind, "beat");
  assert.equal(pickerAt(text, text.indexOf("gain") + 1).kind, "slider");
});

test("what it can't read as plain numbers stays closed", () => {
  assert.equal(ringPicker({ start: 0, end: 20, code: "a: euclid bar 8 > bd" }, 5), null);
  assert.equal(ringPicker({ start: 0, end: 22, code: "a: euclid 3 8 + 2 > bd" }, 5), null);
  assert.equal(ringPicker({ start: 0, end: 18, code: "# a: euclid 3 8" }, 7), null);
});

test("it writes only the rhythm, and euclidRot only when it's turned", () => {
  const text = "kick: euclid 5 16 > bd > gain 0.5   # note";
  const p = on(text);
  assert.equal(edit(text, applyRing(p, { hits: 3, steps: 8, rotation: 0 })), "kick: euclid 3 8 > bd > gain 0.5   # note");
  assert.equal(edit(text, applyRing(p, { hits: 3, steps: 8, rotation: 2 })), "kick: euclidRot 3 8 2 > bd > gain 0.5   # note");
  const rot = "a: euclidRot 3 8 2 > bd";
  assert.equal(edit(rot, applyRing(on(rot), { hits: 3, steps: 8, rotation: 0 })), "a: euclid 3 8 > bd");
  assert.equal(edit("a: euclid ", applyRing(on("a: euclid "), { hits: 3, steps: 8, rotation: 0 })), "a: euclid 3 8");
});

test("hits and rotation always fit inside the steps", () => {
  const text = "a: euclid 5 8 > bd";
  assert.equal(edit(text, applyRing(on(text), { hits: 5, steps: 3, rotation: 7 })), "a: euclidRot 3 3 1 > bd");
});

test("hits keeps its own spelling and rhythm", () => {
  const text = "a: hits 5 8 > bd";
  const p = on(text, "hits");
  assert.equal(shown(ringPattern(p)), "x.x.xx.x");
  assert.equal(edit(text, applyRing(p, { hits: 3, steps: 8, rotation: 0 })), "a: hits 3 8 > bd");
});

test("the ring shows what the song plays", () => {
  for (const code of ["euclid 3 8", "euclid 5 8", "euclid 7 16", "euclidRot 3 8 2", "euclidRot 5 16 3", "hits 5 8"]) {
    const p = ringPicker({ start: 0, end: 40, code: `a: ${code} > bd` }, 5);
    const steps = ringPattern(p);
    const { program } = compile(`a: ${code} > bd\n`);
    const heard = renderBar(program, 0).map((n) => Math.round(n.start * steps.length));
    assert.deepEqual(heard, steps.flatMap((hit, i) => (hit ? [i] : [])), code);
  }
});

test("well-known rhythms get their name", () => {
  assert.equal(ringName(3, 8), "tresillo");
  assert.equal(ringName(4, 16), "four on the floor");
  assert.equal(ringName(6, 11), null);
  assert.equal(ringName(3, 8, 2), null, "turned, it isn't the tresillo any more");
});
