import { test } from "node:test";
import assert from "node:assert/strict";
import { VERBS, GENERATORS } from "../src/core/verbs.js";
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
  const hits = generatorLine("hits");
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
  assert.equal(verbLine("kick").tweak, null);
  assert.match(verbLine("bloom").line, /bloom 0\.6/);
  assert.match(verbLine("sub").line, /^bass: 0 \. 0 4 > sub/);
});
