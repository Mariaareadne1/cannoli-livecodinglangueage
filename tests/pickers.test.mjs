import { test } from "node:test";
import assert from "node:assert/strict";
import { pickerAt, applyBeat, applyBars } from "../src/editor/pickers.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const at = (text, cursor = text.length) => pickerAt(text, cursor);
const grid = (steps) => steps.map((on) => (on ? "x" : ".")).join("");
const fromGrid = (s) => [...s].map((c) => c === "x");
const edit = (text, { start, end, text: inserted }) => text.slice(0, start) + inserted + text.slice(end);
const barsOf = (bars) => Array.from({ length: 16 }, (_, i) => bars.includes(i + 1));
const picked = (bars) => bars.flatMap((on, i) => (on ? [i + 1] : []));

/* ---------- the beat grid ---------- */

test("a drum thread opens an empty grid, split into beats", () => {
  for (const name of ["kick", "drums", "bd", "snare", "hats", "clap"]) {
    const p = at(`${name}: `);
    assert.equal(p.kind, "beat", name);
    assert.equal(p.steps.length, 16);
    assert.equal(p.perBeat, 4);
    assert.ok(p.steps.every((on) => !on));
    assert.ok(p.blank);
  }
});

test("other threads don't, unless they play a drum", () => {
  assert.equal(at("lead: "), null);
  assert.equal(at("lead: 0 2 4 > triangle"), null);
  assert.equal(at("foo: 0 . 0 . > hh").kind, "beat");
});

test("clicking writes the code, with the drum that fits the thread's name", () => {
  const text = "kick: ";
  const p = at(text);
  const change = applyBeat(p, fromGrid("x...x.....x....."));
  assert.equal(edit(text, change), "kick: 0 . 0 . . 0 . . > bd");
  assert.equal(edit("hats: ", applyBeat(at("hats: "), fromGrid("x.x.x.x.x.x.x.x."))), "hats: 0 0 0 0 0 0 0 0 > hh");
  assert.equal(edit("snare: ", applyBeat(at("snare: "), fromGrid("....x.......x..."))), "snare: beat backbeat > sd");
});

test("it keeps the rest of the line, and doesn't add a second drum", () => {
  const text = "kick: 0 . 0 . > bd > gain 0.5   # loud";
  assert.equal(edit(text, applyBeat(at(text, 8), fromGrid("x...x...x...x..."))), "kick: beat fourfloor > bd > gain 0.5   # loud");
  const other = "line one\nkick: \nline three";
  assert.equal(edit(other, applyBeat(pickerAt(other, 15), fromGrid("x...............").map(Boolean))), "line one\nkick: 0 > bd\nline three");
});

test("it reads what's already written", () => {
  assert.equal(grid(at("kick: beat backbeat > bd").steps), "....x.......x...");
  assert.equal(grid(at("kick: 0 . 0 . > bd").steps), "x.......x.......");
  assert.equal(grid(at("kick: euclid 3 8 > bd").steps), "x.....x.....x...");
  assert.equal(grid(at("hats: hits 4 16 > hh").steps), "x...x...x...x...");
});

test("patterns it can't show as a grid don't open one", () => {
  assert.equal(at("kick: run 8 > bd"), null);
  assert.equal(at("kick: euclid 5 12 > bd"), null);
  assert.equal(at("kick: 0 [2 4] > bd"), null);
  assert.equal(at("# kick: "), null);
  assert.equal(at("kick: be"), null);
});

test("the grid follows the number of beats", () => {
  const p = at("beats 3\nkick: ");
  assert.equal(p.steps.length, 12);
});

test("everything it writes compiles", () => {
  for (const pattern of ["x...............", "................", "x.x.x.x.x.x.x.x.", "x..x..x...x..x..", "xxxxxxxxxxxxxxxx"]) {
    const text = "kick: ";
    const code = edit(text, applyBeat(at(text), fromGrid(pattern)));
    assert.deepEqual(compile(code + "\n").errors, [], code);
    const hits = renderBar(compile(code + "\n").program, 0).filter((n) => n.drum === "kick").length;
    assert.equal(hits, [...pattern].filter((c) => c === "x").length, code);
  }
});

/* ---------- the bar picker ---------- */

test("every opens a row of bars and reads which ones it fires on", () => {
  const p = at("lead: 0 2 > every 4 rev");
  assert.equal(p.kind, "bars");
  assert.deepEqual(picked(p.bars), [4, 8, 12, 16]);
  assert.deepEqual(picked(at("lead: 0 2 > firstOf 4 rev").bars), [1, 5, 9, 13]);
  assert.deepEqual(picked(at("lead: 0 2 > lastOf 8 rev").bars), [8, 16]);
  assert.deepEqual(picked(at("lead: 0 2 > when bar % 4 == 1 or bar % 4 == 3 rev").bars), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(picked(at("lead: 0 2 > every ").bars), []);
});

test("picking bars writes the simplest code for them", () => {
  const write = (bars, line = "lead: 0 2 > every 4 rev") => edit(line, applyBars(at(line), barsOf(bars)));
  assert.equal(write([8, 16]), "lead: 0 2 > every 8 rev");
  assert.equal(write([1, 5, 9, 13]), "lead: 0 2 > firstOf 4 rev");
  assert.equal(write([2, 6, 10, 14]), "lead: 0 2 > when bar % 4 == 2 rev");
  assert.equal(write([1, 2, 5, 6, 9, 10, 13, 14]), "lead: 0 2 > when bar % 4 == 1 or bar % 4 == 2 rev");
  assert.equal(write([5]), "lead: 0 2 > when bar % 16 == 5 rev");
  assert.equal(write([3, 6, 9, 12, 15]), "lead: 0 2 > every 3 rev");
  assert.equal(write([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), "lead: 0 2 > every 1 rev");
});

test("it keeps the verb and everything after it; a missing verb becomes rev", () => {
  const line = "lead: 0 2 > every 4 (rev > up 2) > high";
  assert.equal(edit(line, applyBars(at(line), barsOf([8, 16]))), "lead: 0 2 > every 8 (rev > up 2) > high");
  const blank = "lead: 0 2 > every ";
  assert.equal(edit(blank, applyBars(at(blank), barsOf([4, 8, 12, 16]))), "lead: 0 2 > every 4 rev");
});

test("a continuation line works too, and picking nothing leaves the code alone", () => {
  const text = "lead: 0 2\n  > every 4 rev";
  assert.deepEqual(picked(at(text).bars), [4, 8, 12, 16]);
  assert.equal(applyBars(at(text), barsOf([])), null);
});

test("the code it writes fires on exactly the bars you picked", () => {
  for (const bars of [[8, 16], [1, 5, 9, 13], [2, 6, 10, 14], [1, 2, 5, 6, 9, 10, 13, 14], [5], [3, 6, 9, 12, 15], [1, 4, 7, 16]]) {
    const line = "lead: 0 2 > every 4 hush";
    const code = edit(line, applyBars(at(line), barsOf(bars)));
    const { errors, program } = compile(code + "\n");
    assert.deepEqual(errors, [], code);
    const silent = Array.from({ length: 16 }, (_, i) => i + 1).filter((bar) => renderBar(program, bar - 1).length === 0);
    assert.deepEqual(silent, bars, code);
    assert.deepEqual(picked(at(code).bars), bars, code);
  }
});

test("other conditions don't open it", () => {
  assert.equal(at("lead: 0 2 > when bar > 8 rev"), null);
  assert.equal(at("lead: 0 2 > fast 2"), null);
});

test("on a drum line with every, the cursor decides", () => {
  const text = "kick: 0 . 0 . > bd > every 4 rev";
  assert.equal(pickerAt(text, 8).kind, "beat");
  assert.equal(pickerAt(text, text.length).kind, "bars");
});
