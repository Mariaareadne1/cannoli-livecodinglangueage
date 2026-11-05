import { test } from "node:test";
import assert from "node:assert/strict";
import { groovePicker, applyGroove, grooveList } from "../src/editor/groove-picker.js";
import { pickerAt } from "../src/editor/pickers.js";
import { BEATS } from "../src/core/styles.js";
import { compile } from "../src/lang/compile.js";

const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const on = (text, word) => pickerAt(text, text.indexOf(word) + 1);

test("the list has every groove, with its steps, and the style's come first", () => {
  const list = grooveList("funk");
  assert.equal(list.length, Object.keys(BEATS).length);
  assert.deepEqual(list.slice(0, 3).map((g) => g.name), ["tamborzao", "tresillo", "batida"]);
  assert.ok(list[0].fits);
  assert.ok(!list.at(-1).fits);
  assert.equal(list[0].steps.filter(Boolean).length, 5);
  assert.equal(list[0].steps.length, 16);
  assert.ok(list.every((g) => g.doc.length > 3));
  assert.equal(grooveList()[0].fits, false);
});

test("beat in a mask opens it, because that isn't a drum line's own pattern", () => {
  const text = "stab: chord > mask (beat tresillo) > stab";
  const p = on(text, "tresillo");
  assert.equal(p.kind, "groove");
  assert.equal(p.name, "tresillo");
  assert.equal(p.thread, "stab");
  assert.equal(on(text, "beat tresillo").kind, "groove");
});

test("a melodic line's beat opens it, and so does a beat with no name yet", () => {
  assert.equal(on("lead: beat skip > triangle", "skip").kind, "groove");
  assert.equal(pickerAt("kick: beat ", 11).kind, "groove");
  assert.equal(pickerAt("kick: beat ", 11).name, null);
});

test("on a drum line, its own beat stays with the beat grid, which offers the grooves", () => {
  const p = on("style funk\nkick: beat tresillo > bd", "tresillo");
  assert.equal(p.kind, "beat");
  assert.equal(p.grooves[0].name, "tamborzao");
  assert.equal(on("kick: 0 . > bd > mask (beat skip)", "skip").kind, "groove", "a mask on a drum line is still a groove");
});

test("elsewhere on the line, and for unknown names, it stays closed", () => {
  const text = "stab: chord > mask (beat tresillo) > stab > gain 0.5";
  assert.equal(pickerAt(text, text.indexOf("gain") + 1).kind, "slider");
  assert.equal(pickerAt("lead: beat nope > triangle", 13)?.kind === "groove", false);
  assert.equal(groovePicker({ start: 0, end: 16, code: "# a: beat skip" }, 10, ""), null);
});

test("picking swaps just the name", () => {
  const text = "stab: chord > mask (beat tresillo) > stab   # go";
  const p = on(text, "tresillo");
  const written = edit(text, applyGroove(p, "skip"));
  assert.equal(written, "stab: chord > mask (beat skip) > stab   # go");
  assert.equal(edit("kick: beat ", applyGroove(pickerAt("kick: beat ", 11), "batida")), "kick: beat batida");
  assert.equal(edit("kick: beat", applyGroove(pickerAt("kick: beat", 10), "batida")), "kick: beat batida");
  for (const { name } of grooveList()) assert.deepEqual(compile(`a: chord > mask (beat ${name}) > stab\n`).errors, [], name);
});
