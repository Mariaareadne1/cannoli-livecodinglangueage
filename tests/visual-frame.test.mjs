import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVisualFrame } from "../cli/visual-frame.js";
import { THEMES, rgb } from "../src/themes.js";

const ANSI = /\x1b\[[0-9;]*m/g;
const strip = (s) => s.replace(ANSI, "");

const state = (over = {}) => ({
  width: 80, height: 24, time: 10, pulse: 0, energy: 0.5, notes: [], theme: THEMES.deep, ...over,
});

/** Number of glowing cells (not plain sea) whose background is close to the theme's glow core. */
function brightCells(frame, theme) {
  const core = rgb(theme.glow.core);
  const sea = rgb(theme.bg);
  let count = 0;
  for (const line of frame.split("\n")) {
    let bright = false;
    const re = /\x1b\[48;2;(\d+);(\d+);(\d+)m|\x1b\[[0-9;]*m|([^\x1b])/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) {
        const isSea = +m[1] === sea[0] && +m[2] === sea[1] && +m[3] === sea[2];
        bright = !isSea && Math.hypot(m[1] - core[0], m[2] - core[1], m[3] - core[2]) < 40;
      }
      else if (m[4] !== undefined && bright) count++;
    }
  }
  return count;
}

const fgCount = (frame, hex) => frame.split(`\x1b[38;2;${rgb(hex).join(";")}m`).length - 1;

test("returns exactly height lines of exactly width visible cells", () => {
  for (const [width, height] of [[80, 24], [40, 15], [200, 60], [13, 4]]) {
    const lines = renderVisualFrame(state({ width, height })).split("\n");
    assert.equal(lines.length, height);
    for (const line of lines) {
      assert.equal([...strip(line)].length, width);
      assert.ok(line.endsWith("\x1b[0m"));
    }
  }
});

test("uses only colour codes, no cursor movement or clearing", () => {
  const frame = renderVisualFrame(state());
  assert.equal(frame.replace(/\x1b\[(?:0|38;2;\d+;\d+;\d+|48;2;\d+;\d+;\d+)m/g, "").includes("\x1b"), false);
});

test("is deterministic for the same state", () => {
  const s = state({ notes: [{ thread: 1, at: 0.4 }], pulse: 0.5 });
  assert.equal(renderVisualFrame(s), renderVisualFrame({ ...s }));
});

test("the creature is visible and the frame changes over time", () => {
  const frame = renderVisualFrame(state());
  assert.match(strip(frame), /[X8S0]/);
  assert.notEqual(renderVisualFrame(state({ time: 10.5 })), frame);
});

test("a kick pulse brightens the glow", () => {
  for (const theme of Object.values(THEMES)) {
    const calm = brightCells(renderVisualFrame(state({ theme, pulse: 0 })), theme);
    const kick = brightCells(renderVisualFrame(state({ theme, pulse: 1 })), theme);
    assert.ok(kick > calm, `${theme.label}: ${kick} > ${calm}`);
  }
});

test("works for all themes at small and large sizes", () => {
  for (const theme of Object.values(THEMES)) {
    for (const [width, height] of [[40, 15], [200, 60], [1, 1], [0, 0]]) {
      for (const time of [0, 3.3, 47, 1000]) {
        const frame = renderVisualFrame(state({ theme, width, height, time, pulse: 1, energy: 1 }));
        assert.equal(height === 0 ? frame : frame.split("\n").length, height === 0 ? "" : height);
      }
    }
  }
});

test("recent notes add bubbles in their thread colour", () => {
  const theme = THEMES.rose;
  const colour = theme.threads[2];
  const notes = [0, 0.1, 0.2, 0.3, 0.5].map((at) => ({ thread: 2, at }));
  const quiet = renderVisualFrame(state({ theme }));
  const busy = renderVisualFrame(state({ theme, notes }));
  assert.ok(fgCount(busy, colour) > fgCount(quiet, colour));
  assert.match(strip(busy), /[o°]/);
});

test("old notes have faded away", () => {
  const quiet = renderVisualFrame(state());
  assert.equal(renderVisualFrame(state({ notes: [{ thread: 0, at: 5 }] })), quiet);
});
