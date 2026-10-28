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

/* ---------- filling in the rest of the line ---------- */

test("an empty thread body suggests whole lines, matched to the thread's name", () => {
  const r = at("kick: ", { style: "funk" });
  assert.equal(r.items[0].insert, "beat tamborzao > kick");
  assert.equal(r.items[0].kind, "fill in");
  assert.equal(r.items[0].detail, "kick: beat tamborzao > kick");
  assert.equal(at("bass: ").items[0].insert, "0 . 0 4 > low > saw > pump");
});

test("a melody body reuses a variable you wrote", () => {
  assert.match(at("lead: ", { vars: ["theme"] }).items[0].insert, /^theme > /);
});

test("a def body is written with the def's own parameter", () => {
  const r = at("def enter n = ");
  assert.ok(r.items.some((s) => s.insert === "when bar <= n mute"));
  assert.ok(r.items.every((s) => s.kind === "fill in"));
  assert.ok(at("def wobble = ").items.length > 0);
});

test("a variable body suggests patterns", () => {
  assert.ok(at("theme = ").items.some((s) => s.insert === "0 2 4 _ 6 4"));
});

test("verbs with arguments come with a whole-line fill", () => {
  const r = at("lead: theme > ev");
  const every = r.items.find((s) => s.label === "every");
  assert.equal(every.fill, "every 4 rev");
  assert.equal(every.preview, "lead: theme > every 4 rev");
  assert.equal(r.items.find((s) => s.label === "rev")?.fill ?? "", "");
});

test("a fill replaces the rest of the line", () => {
  const text = "lead: theme > ev old stuff\nbass: 0";
  const r = complete(text, "lead: theme > ev".length);
  assert.equal(r.lineEnd, text.indexOf("\n"));
});

test("typing after the blank goes back to word suggestions", () => {
  assert.ok(at("kick: be").items.some((s) => s.label === "beat"));
});

test("every whole line it fills in compiles", async () => {
  const { compile } = await import("../src/lang/compile.js");
  const song = "theme = 0 2 4\n";
  for (const blank of ["kick: ", "lead: ", "def enter n = ", "def wobble = ", "motif = "]) {
    for (const s of at(song + blank, { vars: ["theme"] }).items) {
      assert.deepEqual(compile(`${song}${s.detail}\n`).errors, [], s.detail);
    }
  }
});
