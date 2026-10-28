import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/lang/compile.js";

const errorsOf = (src) => compile(src).errors;
const applyFix = (src, fix) => src.slice(0, fix.start) + fix.text + src.slice(fix.end);

test("a misspelled verb is pointed at and fixable", () => {
  const src = "a: 0 2 4 > revv";
  const [err] = errorsOf(src);
  assert.equal(src.slice(err.start, err.end), "revv");
  assert.match(err.message, /rev/);
  assert.equal(applyFix(src, err.fix), "a: 0 2 4 > rev");
  assert.equal(errorsOf(applyFix(src, err.fix)).length, 0);
});

test("a missing argument offers a default", () => {
  const src = "a: 0 2 > fast";
  const [err] = errorsOf(src);
  assert.match(err.message, /needs a number/);
  assert.equal(errorsOf(applyFix(src, err.fix)).length, 0);
});

test("a missing bracket is inserted", () => {
  const src = "a: 0 [2 4";
  const [err] = errorsOf(src);
  assert.match(err.message, /missing its "\]"/);
  assert.equal(errorsOf(applyFix(src, err.fix)).length, 0);
});

test("a forgotten colon is added", () => {
  const src = "lead 0 2 4";
  const [err] = errorsOf(src);
  assert.equal(applyFix(src, err.fix), "lead: 0 2 4");
});

test("unknown names and modes suggest the nearest", () => {
  const [name] = errorsOf("theme = 0 2\na: thme");
  assert.match(name.message, /theme/);
  const [mode] = errorsOf("key d minr\na: 0");
  assert.equal(mode.fix.text, "minor");
});

test("a verb written without > gets a hint", () => {
  const [err] = errorsOf("a: 0 2 rev");
  assert.match(err.message, /goes after ">"/);
});

test("every mistake is reported, not just the first", () => {
  assert.equal(errorsOf("a: 0 > revv\nb: 0 > fsat 2\nc: 0 2").length, 2);
});

test("self-reference is caught", () => {
  assert.match(errorsOf("loop = loop + 1\na: loop")[0].message, /itself/);
});

test("crowded ranges produce a warning with a fix", () => {
  const out = compile("lead: 0 2 4\npad: chord");
  assert.equal(out.errors.length, 0);
  assert.equal(out.warnings.length, 1);
  assert.equal(out.warnings[0].fix.text, " > high");
});

test("drums don't count as crowding", () => {
  assert.equal(compile("lead: 0 2 4\nbeat: hits 3 8 > kick").warnings.length, 0);
});

test("swapped letters still find the verb", () => {
  const src = "a: 0 2 > fsat 2";
  const [err] = errorsOf(src);
  assert.equal(err.fix.text, "fast");
});
