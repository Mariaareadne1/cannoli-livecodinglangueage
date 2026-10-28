import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";
import { complete } from "../src/editor/complete.js";

const ok = (src) => {
  const out = compile(src);
  assert.deepEqual(out.errors.map((e) => e.message), []);
  return out.program;
};

test("a style sets the default tempo and swing", () => {
  assert.equal(ok("style rave\na: 0").settings.tempo, 140);
  assert.equal(ok("style chill\na: 0").settings.swing, 0.16);
  assert.equal(ok("style rave\ntempo 150\na: 0").settings.tempo, 150);
  assert.equal(ok("a: 0").settings.tempo, 100);
});

test("a style picks the drum kit", () => {
  const [kick] = renderBar(ok("style funk\nk: 0 > kick"), 0);
  assert.equal(kick.props.kit, "funk");
});

test("beat plays a named groove", () => {
  const p = ok("k: beat tamborzao > kick");
  const starts = renderBar(p, 0).map((n) => n.start * 16);
  assert.deepEqual(starts, [0, 3, 6, 10, 13]);
});

test("unknown styles and grooves suggest the nearest", () => {
  const [style] = compile("style raev\na: 0").errors;
  assert.equal(style.fix.text, "rave");
  const [groove] = compile("k: beat fourflor > kick").errors;
  assert.equal(groove.fix.text, "fourfloor");
});

test("sub and boom sit in the bass range on their own", () => {
  const [n] = renderBar(ok("b: 0 > sub"), 0);
  assert.equal(n.props.range, "low");
  assert.equal(compile("b: 0 > boom\nlead: 0 2 4").warnings.length, 0);
});

test("new sounds exist as verbs", () => {
  for (const s of ["supersaw", "acid", "stab", "sub", "boom", "cowbell", "shaker"]) ok(`a: 0 > ${s}`);
});

const labels = (r) => r.items.map((i) => i.label);

test("style suggestions: styles after `style`, grooves after `beat`", () => {
  assert.deepEqual(labels(complete("style ", 6)), ["rave", "house", "funk", "chill"]);
  const funk = complete("k: beat ", 8, { style: "funk" });
  assert.equal(funk.items[0].label, "tamborzao");
  assert.match(funk.items[0].kind, /funk/);
});

test("with a style, its sounds come first after >", () => {
  const rave = complete("a: 0 > ", 7, { style: "rave" });
  assert.equal(rave.items[0].label, "supersaw");
  assert.match(rave.items[0].kind, /rave/);
});

test("with a style, chords suggests that style's progressions", () => {
  const funk = complete("chords ", 7, { style: "funk", keyMode: "minor" });
  assert.equal(funk.items[0].label, "i i iv iv");
});

test("threads may share a name with a sound or generator", () => {
  ok("beat: hits 4 16 > kick\nboom: 0 > boom\nacid: 0 > acid");
  assert.match(compile("beat = 0 2").errors[0].message, /already means/);
});

test("mask gates a long chord into stabs on each hit", () => {
  const notes = renderBar(ok("s: chord > mask (beat tresillo) > stab"), 0);
  assert.deepEqual(notes.map((n) => n.start * 16), [0, 3, 6, 8, 11, 14]);
  assert.ok(notes.every((n) => n.dur <= 1 / 16 + 1e-9));
});
