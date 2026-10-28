import { test } from "node:test";
import assert from "node:assert/strict";
import { complete } from "../src/editor/complete.js";

const at = (text, symbols) => complete(text, text.length, symbols);
const labels = (r) => r.items.map((i) => i.label);

test("after > it suggests verbs, filtered by what you've typed", () => {
  const r = at("lead: 0 2 4 > re");
  assert.ok(labels(r).includes("rev"));
  assert.ok(!labels(r).includes("fast"));
  assert.equal(r.from, "lead: 0 2 4 > ".length);
  assert.ok(labels(at("lead: 0 2 4 > ")).includes("every"));
});

test("verbs show their signature and explanation", () => {
  const every = at("a: 0 > ev").items.find((i) => i.label === "every");
  assert.equal(every.detail, "every n verb");
  assert.match(every.doc, /every nth bar/);
  assert.equal(every.insert, "every ");
});

test("after every n it suggests the verb to apply", () => {
  assert.ok(labels(at("a: 0 > every 4 ")).includes("rev"));
});

test("your own defs are suggested as verbs", () => {
  assert.ok(labels(at("a: 0 > li", { defs: ["lift"] })).includes("lift"));
});

test("in a pattern it suggests generators and your variables", () => {
  const r = at("a: th", { vars: ["theme"] });
  assert.deepEqual(labels(r), ["theme"]);
  assert.ok(labels(at("a: hi")).includes("hits"));
});

test("key suggests notes, then modes", () => {
  assert.ok(labels(at("key ")).includes("f#"));
  assert.ok(labels(at("key d ")).includes("dorian"));
});

test("chords suggests whole progressions, then likely next chords", () => {
  assert.ok(labels(at("chords ", { keyMode: "minor" })).includes("i VI III VII"));
  assert.ok(labels(at("chords ", { keyMode: "major" })).includes("I V vi IV"));
  const next = at("chords I ", { keyMode: "major" });
  assert.equal(next.items[0].kind, "next chord");
});

test("line starters when typing at the start of a line", () => {
  assert.ok(labels(at("te")).includes("tempo"));
});

test("nothing inside comments", () => {
  assert.equal(at("# a: 0 > re").items.length, 0);
});

test("continuation lines know they are in a chain", () => {
  assert.ok(labels(at("a: 0 2\n  > fa")).includes("fast"));
});
