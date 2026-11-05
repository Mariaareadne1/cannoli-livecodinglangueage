import { test } from "node:test";
import assert from "node:assert/strict";
import { verbPicker, applyVerb, applyChance, verbGroups, withVerbOnly, sameVerb } from "../src/editor/verb-picker.js";
import { pickerAt, applyBars } from "../src/editor/pickers.js";
import { complete } from "../src/editor/complete.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const on = (text, word) => pickerAt(text, text.indexOf(word) + 1);

test("the menu is grouped, described, and every choice compiles inside every", () => {
  const groups = verbGroups();
  assert.ok(groups.length >= 3);
  const choices = groups.flatMap((g) => g.choices);
  assert.ok(choices.length >= 12);
  assert.equal(new Set(choices.map((c) => c.code)).size, choices.length);
  for (const { code, doc } of choices) {
    assert.ok(doc.length > 5, code);
    const form = code.includes(" ") ? `(${code})` : code;
    assert.deepEqual(compile(`a: 0 2 4 7 > every 2 ${form}\n`).errors, [], code);
  }
});

test("someCycles, someCyclesBy and other conditions open it", () => {
  const p = on("lead: 0 2 > someCycles (fast 2) > high", "someCycles");
  assert.equal(p.kind, "verb");
  assert.equal(p.verb, "(fast 2)");
  assert.equal(p.thread, "lead");
  assert.equal(on("a: 0 > someCyclesBy 0.3 shuffle", "someCyclesBy").chance, 0.3);
  assert.equal(on("a: 0 > maybe 0.5 rev", "maybe").verb, "rev");
  assert.equal(on("a: 0 > when bar > 8 rev", "when").verb, "rev");
  assert.equal(on("a: 0 > when bar % 8 != 0 and bar > 2 (up 2)", "when").verb, "(up 2)");
  assert.equal(on("a: 0 > sometimes rev", "sometimes").verb, "rev");
});

test("every and conditions on bar numbers stay with the bar grid, which has the menu too", () => {
  const p = on("a: 0 > every 4 rev", "every");
  assert.equal(p.kind, "bars");
  assert.equal(p.verb, "rev");
  assert.equal(on("a: 0 > when bar % 4 == 1 rev", "when").kind, "bars");
});

test("a number inside still gets its slider, and other parts of the line their own picker", () => {
  const text = "a: 0 2 > someCycles (fast 2) > gain 0.5";
  assert.equal(pickerAt(text, text.indexOf("fast") + 1).kind, "slider");
  assert.equal(pickerAt(text, text.indexOf("gain") + 1).kind, "slider");
  assert.equal(verbPicker({ start: 0, end: 20, code: "# a: 0 > someCycles rev" }, 12, ""), null);
  assert.equal(verbPicker({ start: 0, end: 24, code: "a: 0 > when foo > 2 rev" }, 9, ""), null, "a condition it can't read");
});

test("choosing swaps the verb, with brackets when it needs them", () => {
  const text = "a: 0 > someCycles rev > high   # n";
  const p = on(text, "someCycles");
  assert.equal(edit(text, applyVerb(p, "shuffle")), "a: 0 > someCycles shuffle > high   # n");
  assert.equal(edit(text, applyVerb(p, "fast 2")), "a: 0 > someCycles (fast 2) > high   # n");
  const brackets = "a: 0 > when bar > 8 (fast 2)";
  assert.equal(edit(brackets, applyVerb(on(brackets, "when"), "rev")), "a: 0 > when bar > 8 rev");
  const blank = "a: 0 > someCycles ";
  assert.equal(edit(blank, applyVerb(pickerAt(blank, blank.length), "rev")), "a: 0 > someCycles rev");
  const bare = "a: 0 > someCycles";
  assert.equal(edit(bare, applyVerb(pickerAt(bare, bare.length), "rev")), "a: 0 > someCycles rev");
  const other = "a: 0 > when bar > 8 rev else (fast 2)";
  assert.equal(edit(other, applyVerb(on(other, "when"), "flip")), "a: 0 > when bar > 8 flip else (fast 2)");
});

test("the bar grid's menu keeps the bars, and starts somewhere if there are none", () => {
  const text = "a: 0 > every 8 rev > high";
  assert.equal(edit(text, applyVerb(on(text, "every"), "fast 2")), "a: 0 > every 8 (fast 2) > high");
  const blank = "a: 0 > every ";
  assert.equal(edit(blank, applyVerb(pickerAt(blank, blank.length), "flip")), "a: 0 > every 4 flip");
  const when = "a: 0 > when bar % 4 == 1 rev";
  assert.equal(edit(when, applyVerb(on(when, "when"), "flip")), "a: 0 > when bar % 4 == 1 flip");
});

test("it knows which choice is current, however it's written", () => {
  assert.ok(sameVerb("(fast 2)", "fast 2"));
  assert.ok(sameVerb("( fast  2 )", "fast 2"));
  assert.ok(sameVerb("rev", "rev"));
  assert.ok(!sameVerb("fast 3", "fast 2"));
});

test("the chance slider rewrites the number only", () => {
  const text = "a: 0 > someCyclesBy 0.3 shuffle > high";
  assert.equal(edit(text, applyChance(on(text, "someCyclesBy"), 0.75)), "a: 0 > someCyclesBy 0.75 shuffle > high");
  assert.equal(on("a: 0 > someCycles rev", "someCycles").chance, null);
});

test("it can make a line play the verb on every bar, to hear what it does", () => {
  const song = "lead: 0 2 > every 4 hush\n";
  assert.equal(withVerbOnly(song, on(song, "every"), "rev"), "lead: 0 2 > rev\n");
  const brackets = "lead: 0 2 > someCycles rev > high\n";
  assert.equal(withVerbOnly(brackets, on(brackets, "someCycles"), "fast 2"), "lead: 0 2 > (fast 2) > high\n");
  const { errors, program } = compile("lead: 0 2 > (fast 2) > high\n");
  assert.deepEqual(errors, []);
  assert.equal(renderBar(program, 0).length, 4);
});

test("the suggestion card offers verbs after all of these again", () => {
  for (const head of ["a: 0 > firstOf 4 ", "a: 0 > lastOf 2 ", "a: 0 > someCycles ", "a: 0 > someCyclesBy 0.3 ", "a: 0 > every 4 "]) {
    assert.ok(complete(head, head.length).items.some((i) => i.label === "rev"), head);
  }
});
