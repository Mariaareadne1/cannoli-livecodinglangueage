import { test } from "node:test";
import assert from "node:assert/strict";
import { VERBS, GENERATORS, euclidSteps } from "../src/core/verbs.js";
import { verbLine, generatorLine, SECTION_EXAMPLES } from "../src/sheet-examples.js";
import { compile } from "../src/lang/compile.js";

const errors = (src) => compile(`${src}\n`).errors.map((e) => e.message);

test("every verb has a whole line that compiles on its own", () => {
  for (const name of Object.keys(VERBS)) {
    const { line } = verbLine(name);
    assert.match(line, /^[a-z]\w*: /, name);
    assert.deepEqual(errors(line), [], `${name}: ${line}`);
  }
});

test("every generator has a whole line that compiles on its own", () => {
  for (const name of Object.keys(GENERATORS)) {
    assert.deepEqual(errors(generatorLine(name).line), [], name);
  }
});

test("the parts you can change are the verb's arguments", () => {
  const every = verbLine("every");
  assert.equal(every.line.slice(...every.tweak).trim(), "4 rev");
  assert.deepEqual(every.hints.map(([w]) => w), ["n", "verb"]);
  assert.equal(verbLine("rev").tweak, null);
  const hits = generatorLine("euclid");
  assert.equal(hits.line.slice(...hits.tweak).trim(), "3 8");
});

test("every section's example block compiles", () => {
  for (const [section, src] of Object.entries(SECTION_EXAMPLES)) {
    assert.deepEqual(errors(src), [], section);
  }
});

test("conditions keep their > inside the part you can change, and thread names never count", () => {
  const when = verbLine("when");
  assert.equal(when.line.slice(...when.tweak).trim(), "bar > 8 (fast 2)");
  assert.equal(verbLine("bd").tweak, null);
  assert.match(verbLine("bloom").line, /bloom 0\.6/);
  assert.match(verbLine("sub").line, /^bass: 0 \. 0 4 > sub/);
});

test("the older names still compile but stay out of the menus", () => {
  for (const line of ["kick: hits 3 8 > kick", "a: 0 2 > chop 2 > saw > mute", "b: 0 2 > maybe 0.3 rev > sometimes (fast 2) > tri"]) {
    assert.deepEqual(errors(line), [], line);
  }
  assert.ok(!Object.keys(VERBS).includes("kick"));
  assert.ok(!Object.keys(GENERATORS).includes("hits"));
  assert.ok(VERBS.kick === VERBS.bd);
});

test("euclid spreads hits the Bjorklund way, as Strudel writes them", () => {
  const steps = (k, n) => euclidSteps(k, n).map((on) => (on ? "x" : ".")).join("");
  assert.equal(steps(3, 8), "x..x..x.");
  assert.equal(steps(5, 8), "x.xx.xx.");
  assert.equal(steps(4, 16), "x...x...x...x...");
  assert.equal(steps(0, 4), "....");
});

test("the manual's strudel section covers every word exactly once", async () => {
  const { SAME_NAMES, SAME_NAME_DIFFERENT, CANNOLI_ONLY } = await import("../src/strudel-names.js");
  const listed = [...SAME_NAMES, ...SAME_NAME_DIFFERENT.map(([w]) => w), ...CANNOLI_ONLY.map(([w]) => w)];
  assert.equal(new Set(listed).size, listed.length, "a word is listed twice");
  assert.deepEqual([...Object.keys(VERBS), ...Object.keys(GENERATORS)].filter((w) => !listed.includes(w)), [], "missing from the section");
  assert.deepEqual(listed.filter((w) => !VERBS[w] && !GENERATORS[w]), [], "not a real word");
});
