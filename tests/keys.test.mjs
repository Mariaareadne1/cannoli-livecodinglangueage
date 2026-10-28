import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeys } from "../cli/keys.js";

const names = (s) => parseKeys(s).map((k) => (k.ctrl ? `ctrl+${k.name}` : k.name));

test("Esc on its own is a key, even right before another", () => {
  assert.deepEqual(names("\x1b"), ["escape"]);
  assert.deepEqual(names("\x1b\x13"), ["escape", "ctrl+s"]);
});

test("arrows, home/end, delete, page keys", () => {
  assert.deepEqual(names("\x1b[A\x1b[B\x1bOC\x1b[D"), ["up", "down", "right", "left"]);
  assert.deepEqual(names("\x1b[H\x1b[F\x1b[3~\x1b[5~\x1b[6~"), ["home", "end", "delete", "pageup", "pagedown"]);
});

test("control keys, enter, tab, backspace", () => {
  assert.deepEqual(names("\x13\x14\x06\x11"), ["ctrl+s", "ctrl+t", "ctrl+f", "ctrl+q"]);
  assert.deepEqual(names("\r\t\x7f"), ["return", "tab", "backspace"]);
});

test("pasted text arrives as characters, including unicode", () => {
  const keys = parseKeys("a: 0 ♯");
  assert.equal(keys.map((k) => k.str).join(""), "a: 0 ♯");
});
