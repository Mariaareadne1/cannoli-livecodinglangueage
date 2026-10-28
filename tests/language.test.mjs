import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

/* Helpers: scale steps of a thread in a bar, without harmony applied. */
const program = (src) => {
  const out = compile(src);
  assert.deepEqual(out.errors.map((e) => e.message), [], "expected no errors");
  return out.program;
};
const ctx = (bar = 0) => ({ bar, chord: [0, 2, 4], vars: {}, seed: 0 });
const steps = (src, bar = 0, thread = 0) =>
  program(src).threads[thread].pattern.query(bar, ctx(bar))
    .sort((a, b) => a.start - b.start)
    .map((e) => (e.notes.length === 1 ? e.notes[0].deg : e.notes.map((n) => n.deg)));
const starts = (src, bar = 0) => program(src).threads[0].pattern.query(bar, ctx(bar)).map((e) => e.start).sort((a, b) => a - b);

/* ---------- patterns ---------- */

test("a pattern shares the bar evenly", () => {
  assert.deepEqual(steps("a: 0 2 4 7"), [0, 2, 4, 7]);
  assert.deepEqual(starts("a: 0 2 4 7"), [0, 0.25, 0.5, 0.75]);
});

test("rests, holds, groups, chords and repeats", () => {
  assert.deepEqual(starts("a: 0 . 4 ."), [0, 0.5]);
  const held = program("a: 0 _ _ 4").threads[0].pattern.query(0, ctx());
  assert.equal(held[0].dur, 0.75);
  assert.deepEqual(starts("a: 0 [2 4]"), [0, 0.5, 0.75]);
  assert.deepEqual(steps("a: [0,2,4]"), [[0, 2, 4]]);
  assert.deepEqual(steps("a: 0x3 4"), [0, 0, 0, 4]);
});

test("generators: hits, run, chord", () => {
  assert.deepEqual(starts("a: hits 3 8"), [0, 3 / 8, 6 / 8]);
  assert.deepEqual(steps("a: run 4"), [0, 1, 2, 3]);
  assert.deepEqual(steps("a: chord"), [[0, 2, 4]]);
});

/* ---------- arithmetic ---------- */

test("arithmetic transposes, widens and wraps", () => {
  assert.deepEqual(steps("a: 0 1 2 + 2"), [2, 3, 4]);
  assert.deepEqual(steps("a: 0 1 2 * 2"), [0, 2, 4]);
  assert.deepEqual(steps("a: run 8 * 3 % 7"), [0, 3, 6, 2, 5, 1, 4, 0]);
});

test("two patterns combine note by note", () => {
  assert.deepEqual(steps("a: (0 1 2 3) + (0 4)"), [0, 5, 2, 7]);
});

/* ---------- variables and functions ---------- */

test("variables hold patterns and numbers", () => {
  assert.deepEqual(steps("theme = 0 2 4\na: theme + 1"), [1, 3, 5]);
  assert.deepEqual(steps("n = 3\na: 0 > up n * 2"), [6]);
});

test("def makes new verbs and new patterns", () => {
  assert.deepEqual(steps("def lift n = up n > rev\na: 0 1 2 > lift 2"), [4, 3, 2]);
  assert.deepEqual(steps("def motif n = 0 2 4 + n\na: motif 1"), [1, 3, 5]);
});

/* ---------- time, loops, conditions ---------- */

test("then and x sequence bars", () => {
  const src = "a: 0 x 2 then 4";
  assert.deepEqual([0, 1, 2, 3].map((b) => steps(src, b)[0]), [0, 0, 4, 0]);
});

test("for loops write one bar per pass", () => {
  const src = "a: for i 0..2 (0 + i)";
  assert.deepEqual([0, 1, 2, 3].map((b) => steps(src, b)[0]), [0, 1, 2, 0]);
});

test("if picks by bar", () => {
  const src = "a: if bar > 2 then 7 else 0";
  assert.deepEqual([0, 1, 2, 3].map((b) => steps(src, b)[0]), [0, 0, 7, 7]);
});

test("every and when apply verbs in some bars", () => {
  const src = "a: 0 1 2 > every 2 rev";
  assert.deepEqual(steps(src, 0), [0, 1, 2]);
  assert.deepEqual(steps(src, 1), [2, 1, 0]);
  const w = "a: 0 > when bar % 3 == 0 (up 1) else (down 1)";
  assert.deepEqual([0, 1, 2].map((b) => steps(w, b)[0]), [-1, -1, 1]);
});

test("verbs reshape structure", () => {
  assert.deepEqual(steps("a: 0 1 2 > rot 1"), [1, 2, 0]);
  assert.deepEqual(steps("a: 0 1 > mirror"), [0, 1, 1, 0]);
  assert.deepEqual(steps("a: 0 2 > grow"), [0, 2, 2, 4]);
  assert.deepEqual(steps("a: 0 1 > fast 2"), [0, 1, 0, 1]);
  assert.deepEqual(steps("a: 0 1 > chop 2"), [0, 0, 1, 1]);
  assert.deepEqual(steps("a: 0 2 > flip"), [0, -2]);
  assert.deepEqual(steps("a: [0,2,4] > arp"), [0, 2, 4]);
  assert.deepEqual(starts("a: 0 1 2 3 > slow 2", 1), [0, 0.5]);
});

test("chains can continue on lines that start with >", () => {
  assert.deepEqual(steps("a: 0 1 2\n  > rev\n  > up 1"), [3, 2, 1]);
});

test("comments mute a line", () => {
  assert.deepEqual(steps("a: 0 1 2\n# > rev\n  > up 1"), [1, 2, 3]);
});

/* ---------- harmony ---------- */

test("settings: key, tempo, chords", () => {
  const { settings } = program("key f# dorian\ntempo 60 * 2\nchords i iv V i\na: 0");
  assert.equal(settings.keys[0].root, 6);
  assert.equal(settings.keys[0].mode, "dorian");
  assert.equal(settings.tempo, 120);
  assert.deepEqual(settings.chords[0].degrees, [0, 3, 4, 0]);
});

test("downbeat notes lock to the chord; off-beats stay free", () => {
  const p = program("key c major\nchords IV\na: 1 1 1 1 1 1 1 1 > free\nb: 1 1 1 1 1 1 1 1");
  const notes = renderBar(p, 0);
  const free = notes.filter((n) => n.thread === "a").map((n) => n.midi[0]);
  const locked = notes.filter((n) => n.thread === "b").map((n) => n.midi[0]);
  assert.deepEqual(free, [62, 62, 62, 62, 62, 62, 62, 62]); // D, untouched
  // IV in C is F A C: D snaps down to C on the beats, stays D between them
  assert.deepEqual(locked, [60, 62, 60, 62, 60, 62, 60, 62]);
});

test("ranges fold notes into their register", () => {
  const p = program("key c major\na: 0 > low > free\nb: 0 > high > free\nc: 30 > free");
  const [low, high, wild] = renderBar(p, 0);
  assert.equal(low.midi[0], 36);
  assert.equal(high.midi[0], 72);
  assert.ok(wild.midi[0] <= 60 + 19);
});

test("chords are voiced close together", () => {
  const p = program("key c major\na: [0,2,11] > free");
  const [n] = renderBar(p, 0);
  assert.ok(Math.max(...n.midi) - Math.min(...n.midi) <= 12);
});

test("drums ignore pitch; ghost adds climbing echoes", () => {
  const p = program("a: hits 2 4 > kick\nb: 0 > ghost");
  const notes = renderBar(p, 0);
  assert.equal(notes.filter((n) => n.drum === "kick").length, 2);
  assert.equal(notes.filter((n) => n.echo).length, 3);
});

test("key changes and chord lines apply from a bar", () => {
  const p = program("key c major\nkey g major at 3\nchords I V\na: 0 > free");
  assert.equal(renderBar(p, 0)[0].midi[0], 60);
  assert.equal(renderBar(p, 2)[0].midi[0], 55); // G3: each key's root sits near middle C
});
