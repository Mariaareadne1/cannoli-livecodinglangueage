import { test } from "node:test";
import assert from "node:assert/strict";
import { readTimeline, applyTimeline, timelineLength } from "../src/editor/timeline.js";
import { compile } from "../src/lang/compile.js";
import { renderBar } from "../src/core/render.js";

const edit = (text, change) => (change ? text.slice(0, change.start) + change.text + text.slice(change.end) : text);
const cells = (s) => [...s].map((c) => c === "x");
const shown = (on) => on.map((v) => (v ? "x" : ".")).join("");
const row = (text, name, bars = 16) => shown(readTimeline(text, bars).find((t) => t.name === name).on);

test("it lists every thread, in order, and leaves other lines out", () => {
  const song = "key d minor\ntheme = 0 2\ndef lift n = up n\nkick: 0 > bd\nlead: theme\n  > high\n";
  assert.deepEqual(readTimeline(song, 4).map((t) => t.name), ["kick", "lead"]);
  assert.equal(row(song, "kick", 4), "xxxx");
});

test("it reads the ways a song brings parts in and out", () => {
  assert.equal(row("a: 0 > when bar <= 4 hush", "a", 8), "....xxxx");
  assert.equal(row("a: 0 > when bar > 4 hush", "a", 8), "xxxx....");
  assert.equal(row("a: 0 > when bar <= 2 or bar > 6 hush", "a", 8), "..xxxx..");
  assert.equal(row("a: 0 > when bar > 2 and bar <= 4 hush", "a", 8), "xx..xxxx");
  assert.equal(row("a: 0 > when bar == 3 mute", "a", 8), "xx.xxxxx");
  assert.equal(row("a: 0 > hush", "a", 4), "....");
  assert.equal(row("a: 0 > mute", "a", 4), "....");
  assert.equal(row("a: 0\n  > high\n  > when bar <= 1 hush", "a", 4), ".xxx");
});

test("it reads a helper like enter 8", () => {
  const song = "def enter n = when bar <= n hush\nhats: 0 > hh > enter 2 > gain 0.5\n";
  assert.equal(row(song, "hats", 4), "..xx");
});

test("other conditions aren't its business", () => {
  assert.equal(row("a: 0 > when bar % 4 == 0 hush", "a", 4), "xxxx");
  assert.equal(row("a: 0 > every 4 hush", "a", 4), "xxxx");
  assert.equal(row("a: 0 > every 4 (when bar <= 2 hush)", "a", 4), "xxxx");
});

test("it writes the simplest code and keeps the rest of the line", () => {
  const write = (line, on) => edit(line, applyTimeline(line, "a", cells(on)));
  assert.equal(write("a: 0 > high", "....xxxx"), "a: 0 > high > when bar <= 4 hush");
  assert.equal(write("a: 0 > high", "xxxx...."), "a: 0 > high > when bar > 4 hush");
  assert.equal(write("a: 0 > high", "..xxxx.."), "a: 0 > high > when bar <= 2 or bar > 6 hush");
  assert.equal(write("a: 0 > high", "xx..xxxx"), "a: 0 > high > when bar > 2 and bar <= 4 hush");
  assert.equal(write("a: 0 > high", "xx.xxxxx"), "a: 0 > high > when bar == 3 hush");
  assert.equal(write("a: 0 > high", "........"), "a: 0 > high > hush");
  assert.equal(write("a: 0 > when bar <= 4 hush > high", "xx.xxxxx"), "a: 0 > when bar == 3 hush > high");
  assert.equal(write("a: 0 > when bar <= 4 hush > high", "xxxxxxxx"), "a: 0 > high");
  assert.equal(write("a: 0 > high   # keep me", "..xxxxxx"), "a: 0 > high > when bar <= 2 hush   # keep me");
});

test("a part on its own line comes and goes tidily", () => {
  const song = "a: 0\n  > when bar <= 4 hush\n  > high\nb: 0\n";
  assert.equal(edit(song, applyTimeline(song, "a", cells("xxxx"))), "a: 0\n  > high\nb: 0\n");
  const open = "a: 0\n  > high  # up\nb: 0\n";
  assert.equal(edit(open, applyTimeline(open, "a", cells("..xx"))), "a: 0\n  > high > when bar <= 2 hush  # up\nb: 0\n");
});

test("a song's own helper stays if it still says the thing", () => {
  const song = "def enter n = when bar <= n hush\na: 0 > enter 8\n";
  assert.equal(edit(song, applyTimeline(song, "a", cells("....xxxx"))), "def enter n = when bar <= n hush\na: 0 > enter 4\n");
  assert.equal(edit(song, applyTimeline(song, "a", cells("..xx..xx"))), "def enter n = when bar <= n hush\na: 0 > when bar <= 2 or bar > 4 and bar <= 6 hush\n");
  assert.equal(edit("b: 0\n", applyTimeline("b: 0\n", "b", cells("..xx"))), "b: 0 > when bar <= 2 hush\n");
});

test("no change, no edit", () => {
  assert.equal(applyTimeline("a: 0 > high", "a", cells("xxxx")), null);
  assert.equal(applyTimeline("a: 0 > when bar <= 2 hush", "a", cells("..xx")), null);
  assert.equal(applyTimeline("a: 0", "nope", cells("xx")), null);
});

test("the code plays exactly the bars on the timeline, and the last bar carries on", () => {
  let seed = 11;
  const next = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  for (let round = 0; round < 120; round++) {
    const on = [];
    while (on.length < 16) {
      const value = next(2) === 0;
      for (let run = 1 + next(5); run > 0 && on.length < 16; run--) on.push(value);
    }
    const line = "a: 0 0 > high\n";
    const code = edit(line, applyTimeline(line, "a", on));
    const { errors, program } = compile(code);
    assert.deepEqual(errors, [], code);
    const heard = Array.from({ length: 24 }, (_, i) => renderBar(program, i).length > 0);
    assert.deepEqual(heard.slice(0, 16), on, code);
    assert.ok(heard.slice(16).every((v) => v === on[15]), `${code} carries on after bar 16`);
    assert.equal(row(code, "a"), shown(on), `${code} reads back`);
  }
});

test("the timeline is long enough to show what's written", () => {
  assert.equal(timelineLength("a: 0"), 16);
  assert.equal(timelineLength("a: 0 > when bar <= 15 hush"), 16, "a click on the last bar doesn't make it jump");
  assert.equal(timelineLength("a: 0 > when bar <= 16 hush"), 24);
  assert.equal(timelineLength("a: 0 > when bar > 40 hush"), 48);
  assert.equal(timelineLength("def enter n = when bar <= n hush\na: 0 > enter 20"), 24);
});
