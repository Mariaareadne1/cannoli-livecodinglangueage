import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeys } from "../cli/keys.js";
import { plainFrame, fg, bg, BOLD, RESET, REVERSE, UNDERLINE } from "../cli/ansi.js";
import { buildPanel, perform } from "../cli/panel/model.js";
import { layoutPanel, firstFocus, moveFocus, focused, hitTest, sliderValueAt, clampToStep } from "../cli/panel/layout.js";
import { strudelPickerAt } from "../cli/strudel/pickers.js";

const WIDTH = 78;
const edit = (text, c) => text.slice(0, c.start) + c.text + text.slice(c.end);
const toolOn = (text, word) => strudelPickerAt(text, text.indexOf(word) + 1);
const linesFor = (tool) => layoutPanel(buildPanel(tool), WIDTH);

test("a mouse press, drag and release are read from the terminal's codes", () => {
  assert.deepEqual(parseKeys("\x1b[<0;12;7M"), [{ name: "mouse", col: 12, row: 7, drag: false, release: false }]);
  assert.deepEqual(parseKeys("\x1b[<32;13;7M"), [{ name: "mouse", col: 13, row: 7, drag: true, release: false }]);
  assert.deepEqual(parseKeys("\x1b[<0;13;7m"), [{ name: "mouse", col: 13, row: 7, drag: false, release: true }]);
});

test("mouse codes arriving together with a key stay separate", () => {
  const keys = parseKeys("\x1b[<0;1;2Mx");
  assert.deepEqual(keys.map((k) => k.name), ["mouse", "x"]);
});

test("pressing a step in the beat grid rewrites the pattern", () => {
  const text = 's("bd*4")';
  const tool = toolOn(text, "bd");
  const { change } = perform(tool, "step:1");
  assert.equal(edit(text, change), 's("bd bd ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~")');
});

test("the keyboard can reach every cell in a panel", () => {
  const lines = linesFor(toolOn('s("bd*4")', "bd"));
  const start = firstFocus(lines);
  const next = moveFocus(lines, start, "right");
  assert.ok(focused(lines, start));
  assert.notDeepEqual(next, start);
  assert.deepEqual(moveFocus(lines, next, "left"), start);
});

test("a click outside any cell hits nothing", () => {
  const lines = linesFor(toolOn('s("bd*4")', "bd"));
  assert.equal(hitTest(lines, lines.length + 5, 0) ?? null, null);
});

test("a slider's value follows the column and stays on its steps", () => {
  const slider = { min: 0, max: 1, step: 0.25, value: 0.5, col: 10, width: 40 };
  assert.equal(clampToStep(slider, 0.3), 0.25);
  assert.equal(clampToStep(slider, 7), 1);
  assert.equal(clampToStep(slider, -7), 0);
  const low = sliderValueAt(slider, 0, WIDTH);
  const high = sliderValueAt(slider, WIDTH - 1, WIDTH);
  assert.ok(low <= high);
});

test("a plain frame keeps its text and selection but loses every colour", () => {
  const frame = `${bg("#102030")}${fg("#ffffff")}${BOLD}kick${RESET} ${REVERSE}on${RESET} ${UNDERLINE}off${RESET}\x1b[3;4H`;
  assert.equal(plainFrame(frame), `kick${RESET} ${REVERSE}on${RESET} ${UNDERLINE}off${RESET}\x1b[3;4H`);
});
