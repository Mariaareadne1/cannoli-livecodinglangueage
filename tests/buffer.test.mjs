import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromText, toText, insert, newline, backspace, deleteForward, move, home, end, replaceRange, offsetOf, positionOf,
} from "../cli/buffer.js";

test("typing inserts at the cursor", () => {
  const b = insert(fromText(""), "kick: ");
  assert.equal(toText(b), "kick: ");
  assert.equal(b.col, 6);
});

test("enter keeps indentation, and indents after a thread line", () => {
  let b = { lines: ["lead: 0 2 4"], row: 0, col: 11 };
  b = newline(b);
  assert.deepEqual(b.lines, ["lead: 0 2 4", "  "]);
  b = insert(b, "> rev");
  b = newline(b);
  assert.deepEqual(b.lines, ["lead: 0 2 4", "  > rev", "  "]);
});

test("enter in the middle splits the line", () => {
  const b = newline({ lines: ["ab cd"], row: 0, col: 2 });
  assert.deepEqual(b.lines, ["ab", "cd"]);
});

test("backspace joins lines and removes whole indents", () => {
  assert.deepEqual(backspace({ lines: ["a", "b"], row: 1, col: 0 }).lines, ["ab"]);
  const b = backspace({ lines: ["    x"], row: 0, col: 4 });
  assert.deepEqual([b.lines[0], b.col], ["  x", 2]);
  assert.deepEqual(deleteForward({ lines: ["a", "b"], row: 0, col: 1 }).lines, ["ab"]);
});

test("moving wraps at line ends and clamps columns", () => {
  const b = { lines: ["abc", "d"], row: 0, col: 3 };
  assert.deepEqual([move(b, "right").row, move(b, "right").col], [1, 0]);
  assert.equal(move(b, "down").col, 1);
  assert.equal(home({ lines: ["  x"], row: 0, col: 3 }).col, 2);
  assert.equal(end({ lines: ["abc"], row: 0, col: 0 }).col, 3);
});

test("offsets and fixes across lines", () => {
  const b = { lines: ["a: 0", "b: revv"], row: 1, col: 3 };
  assert.equal(offsetOf(b), 8);
  assert.deepEqual(positionOf(b.lines, 8), { row: 1, col: 3 });
  const fixed = replaceRange(b, 8, 12, "rev");
  assert.equal(toText(fixed), "a: 0\nb: rev");
  assert.deepEqual([fixed.row, fixed.col], [1, 6]);
});

test("pasted text with newlines", () => {
  assert.equal(toText(insert(fromText(""), "a: 0\nb: 1")), "a: 0\nb: 1");
});
