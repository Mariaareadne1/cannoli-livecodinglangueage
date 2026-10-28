import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVisualFrame } from "../cli/visual-frame.js";
import { THEMES } from "../src/themes.js";

const theme = THEMES.deep;
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const base = { width: 80, height: 30, time: 3, pulse: 0, energy: 0.3, notes: [], theme };

test("the tide rises along the bottom in each thread's colour", () => {
  const frame = renderVisualFrame({ ...base, tide: [1, 0, 0, 0] });
  const lines = frame.split("\n");
  const bottom = strip(lines.at(-1));
  assert.match(bottom.slice(0, 20), /[X8S0xs]/, "the busy thread's band has glyphs");
  assert.doesNotMatch(bottom.slice(60), /[X8S0]/, "a quiet thread's band stays empty");
  assert.notEqual(frame, renderVisualFrame(base));
});

test("no tide when nothing is playing", () => {
  assert.equal(renderVisualFrame({ ...base, tide: [0, 0, 0] }), renderVisualFrame(base));
});

test("a kick ripple spreads rings through the sea", () => {
  const still = renderVisualFrame({ ...base, layers: { shark: false } });
  const ripple = renderVisualFrame({ ...base, layers: { shark: false }, ripples: [0.4] });
  assert.notEqual(still, ripple);
  assert.ok(strip(ripple).split("o").length > strip(still).split("o").length);
});

test("dots flash on the beat, more on the downbeat", () => {
  const off = renderVisualFrame({ ...base, beatPhase: 0.95 });
  const on = renderVisualFrame({ ...base, beatPhase: 0, downbeat: true });
  assert.notEqual(on, off);
});

test("layers can be switched off", () => {
  const beatOnly = strip(renderVisualFrame({ ...base, layers: { shark: false } }));
  assert.doesNotMatch(beatOnly, /[X8S0]/, "no shark");
  const sharkOnly = renderVisualFrame({ ...base, layers: { beat: false }, tide: [1, 1], ripples: [0.3], beatPhase: 0 });
  assert.equal(sharkOnly, renderVisualFrame(base));
});

test("every theme, small and large", () => {
  for (const t of Object.values(THEMES)) {
    for (const [w, h] of [[30, 10], [160, 50]]) {
      const frame = renderVisualFrame({ ...base, theme: t, width: w, height: h, tide: [0.5, 1, 0.2], ripples: [0.2, 0.9], beatPhase: 0.1 });
      assert.equal(frame.split("\n").length, h);
      assert.ok(frame.split("\n").every((l) => [...strip(l)].length === w));
    }
  }
});
