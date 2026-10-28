import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalScript, layout } from "../cli/stage.js";

test("the editor takes the left side and panes stack on the right", () => {
  const script = terminalScript([0, 25, 1000, 825], ["guide", "visual"]);
  assert.match(script, /set bounds of editorWindow to \{0, 25, 560, 825\}/);
  assert.match(script, /do script "guide"\n  set bounds of front window to \{560, 25, 1000, 425\}/);
  assert.match(script, /do script "visual"\n  set bounds of front window to \{560, 425, 1000, 825\}/);
});

test("commands with quotes and spaces are escaped for AppleScript", () => {
  const script = terminalScript([0, 0, 100, 100], ["node '/a b/cannoli.js' guide --x=\"y\""]);
  assert.match(script, /do script "node '\/a b\/cannoli.js' guide --x=\\"y\\""/);
});

test("four panes make a 2 × 2 grid beside the editor", () => {
  const [editor, guide, visual, reference, threads] = layout([0, 0, 1000, 800], 4);
  assert.deepEqual(editor, { left: 0, top: 0, right: 420, bottom: 800 });
  assert.deepEqual(guide, { left: 420, top: 0, right: 710, bottom: 400 });
  assert.deepEqual(visual, { left: 710, top: 0, right: 1000, bottom: 400 });
  assert.deepEqual(reference, { left: 420, top: 400, right: 710, bottom: 800 });
  assert.deepEqual(threads, { left: 710, top: 400, right: 1000, bottom: 800 });
});
