import { test } from "node:test";
import assert from "node:assert/strict";
import { readStudio } from "../src/editor/studio.js";
import { readStrudelStudio } from "../cli/strudel/studio.js";
import { compile } from "../src/lang/compile.js";
import { loadLanguage } from "../cli/languages.js";

const language = await loadLanguage("a.strudel");
const change = (text, c) => text.slice(0, c.start) + c.text + text.slice(c.end);
const cannoliClean = (code) => assert.deepEqual(compile(code).errors, [], code);
const strudelClean = (code) => assert.deepEqual(language.compile(code).errors, [], code);
const flip = (steps, i) => steps.map((v, k) => (k === i ? !v : v));
const SONG = "key a minor\nkick: beat fourfloor > bd   # the pulse\nsnare: beat backbeat > sd\n  > gain 0.5\nlead: 0 2 4 7 > triangle > when bar > 8 (bloom 0.9) > tape\n";

test("cannoli: finds the drums among the parts, on 16 steps", () => {
  const studio = readStudio(SONG);
  assert.deepEqual(studio.parts.map((p) => p.name), ["kick", "snare", "lead"]);
  assert.deepEqual(studio.drums.map((p) => p.name), ["kick", "snare"]);
  assert.equal(studio.drums[0].steps.length, 16);
  assert.equal(studio.stepCount, 16);
});

test("cannoli: mute writes > hush at the end of the whole part, and unmute removes it", () => {
  const muted = change(SONG, readStudio(SONG).setMute(1, true));
  assert.match(muted, /> gain 0\.5 > hush\n/);
  cannoliClean(muted);
  assert.equal(readStudio(muted).parts[1].muted, true);
  assert.equal(change(muted, readStudio(muted).setMute(1, false)), SONG);
  assert.equal(readStudio(SONG).setMute(0, false), null);
});

test("cannoli: mute keeps a comment on the line", () => {
  const muted = change(SONG, readStudio(SONG).setMute(0, true));
  assert.match(muted, /kick: beat fourfloor > bd > hush   # the pulse/);
});

test("cannoli: a step click rewrites only that part's pattern", () => {
  const studio = readStudio(SONG);
  const edited = change(SONG, studio.setSteps(0, flip(studio.drums[0].steps, 2)));
  assert.match(edited, /kick: 0 0 0 \. 0 \. 0 \. > bd   # the pulse/);
  cannoliClean(edited);
  assert.deepEqual(readStudio(edited).drums[0].steps, flip(studio.drums[0].steps, 2));
});

test("cannoli: an effect slider writes, updates and removes its step", () => {
  const added = change(SONG, readStudio(SONG).setEffect(0, "bloom", 0.4));
  assert.match(added, /bd > bloom 0\.4   # the pulse/);
  cannoliClean(added);
  const moved = change(added, readStudio(added).setEffect(0, "bloom", 0.75));
  assert.match(moved, /bloom 0\.75/);
  assert.equal(change(moved, readStudio(moved).setEffect(0, "bloom", 0)), SONG);
});

test("cannoli: an effect goes before a mute, so the part stays muted", () => {
  const muted = change(SONG, readStudio(SONG).setMute(0, true));
  const added = change(muted, readStudio(muted).setEffect(0, "tape", 0.3));
  assert.match(added, /bd > tape 0\.3 > hush/);
  assert.equal(readStudio(added).parts[0].muted, true);
});

test("cannoli: reads the step on another line, a bare effect, and ignores ones in brackets", () => {
  const { parts } = readStudio(SONG);
  assert.equal(parts[1].effects.find((e) => e.word === "gain").value, 0.5);
  const lead = parts[2].effects;
  assert.equal(lead.find((e) => e.word === "tape").value, 0.5);
  assert.equal(lead.find((e) => e.word === "bloom").written, false);
  const edited = change(SONG, readStudio(SONG).setEffect(2, "tape", 0.2));
  assert.match(edited, /> tape 0\.2\n/);
});

test("cannoli: a written slider keeps its range, and a pattern can't be dragged", () => {
  const song = "lead: 0 2 > gain slider(0.5, 0, 1) > pan (0.2 0.8)\n";
  const studio = readStudio(song);
  assert.equal(change(song, studio.setEffect(0, "gain", 0.7)), "lead: 0 2 > gain slider(0.7, 0, 1) > pan (0.2 0.8)\n");
  assert.equal(studio.parts[0].effects.find((e) => e.word === "pan").locked, "(0.2 0.8)");
  assert.equal(studio.setEffect(0, "pan", 0.5), null);
});

test("cannoli: adding a drum puts it after the other drums, and it plays", () => {
  const studio = readStudio(SONG);
  assert.deepEqual(studio.addable.map((k) => k.name), ["hats", "open", "clap", "rim"]);
  const added = change(SONG, studio.addDrum("hats"));
  assert.match(added, /> gain 0\.5\nlead|hats: beat offbeat > hh/);
  cannoliClean(added);
  assert.equal(readStudio(added).drums.length, 3);
  assert.equal(change("", readStudio("").addDrum("kick")), "kick: beat fourfloor > bd\n");
});

const STRUDEL = 'setcpm(30)\nkick: s("bd*4").gain(.8) // pulse\nhats: s("hh*8")\n  .room(.3)\nlead: n("0 2").s("sine").every(4, x=>x.gain(.2))\n';

test("strudel: finds the drums and reads their steps", () => {
  const studio = readStrudelStudio(STRUDEL);
  assert.deepEqual(studio.parts.map((p) => p.name), ["kick", "hats", "lead"]);
  assert.deepEqual(studio.drums.map((p) => p.name), ["kick", "hats"]);
  assert.equal(studio.drums[0].steps.filter(Boolean).length, 4);
});

test("strudel: mute uses Strudel's own _name, and unmute puts it back", () => {
  const muted = change(STRUDEL, readStrudelStudio(STRUDEL).setMute(0, true));
  assert.match(muted, /^_kick: s\("bd\*4"\)/m);
  strudelClean(muted);
  const studio = readStrudelStudio(muted);
  assert.equal(studio.parts[0].muted, true);
  assert.equal(studio.parts[0].name, "kick");
  assert.equal(change(muted, studio.setMute(0, false)), STRUDEL);
});

test("strudel: a step click rewrites the pattern", () => {
  const studio = readStrudelStudio(STRUDEL);
  const edited = change(STRUDEL, studio.setSteps(0, flip(studio.drums[0].steps, 2)));
  assert.match(edited, /kick: s\("bd bd bd ~ bd ~ bd ~"\)\.gain\(\.8\)/);
  strudelClean(edited);
});

test("strudel: effects write, update and remove real calls", () => {
  const added = change(STRUDEL, readStrudelStudio(STRUDEL).setEffect(0, "room", 0.4));
  assert.match(added, /\.gain\(\.8\)\.room\(0\.4\) \/\/ pulse/);
  strudelClean(added);
  const moved = change(added, readStrudelStudio(added).setEffect(0, "room", 0.6));
  assert.match(moved, /\.room\(0\.6\)/);
  assert.equal(change(moved, readStrudelStudio(moved).setEffect(0, "room", 0)), STRUDEL);
  const lower = change(STRUDEL, readStrudelStudio(STRUDEL).setEffect(0, "gain", 0.5));
  assert.match(lower, /\.gain\(0\.5\)/);
});

test("strudel: removes an effect on its own line, and ignores one inside every", () => {
  const studio = readStrudelStudio(STRUDEL);
  assert.equal(change(STRUDEL, studio.setEffect(1, "room", 0)), STRUDEL.replace("\n  .room(.3)", ""));
  assert.equal(studio.parts[2].effects.find((e) => e.word === "gain").written, false);
});

test("strudel: a pattern as an amount stays in the code", () => {
  const song = 'hats: s("hh*8").gain("[.5 .3]*4")\n';
  const studio = readStrudelStudio(song);
  assert.equal(studio.parts[0].effects.find((e) => e.word === "gain").locked, '"[.5 .3]*4"');
  assert.equal(studio.setEffect(0, "gain", 0.5), null);
});

test("strudel: adding a drum writes a labelled pattern that plays", () => {
  const added = change(STRUDEL, readStrudelStudio(STRUDEL).addDrum("snare"));
  assert.match(added, /\.room\(\.3\)\nsnare: beat\("backbeat"\)\.s\("sd"\)\nlead/);
  strudelClean(added);
});
