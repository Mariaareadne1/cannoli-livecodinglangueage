import { test } from "node:test";
import assert from "node:assert/strict";
import { assistant, explainLine, reference, wrap } from "../cli/guide-text.js";

const msg = (text, row = 0, extra = {}) => ({ text, cursor: { row, col: 0, offset: 0 }, problems: [], symbols: {}, ...extra });

test("explains a thread line: what it is, its verbs and groove", () => {
  const lines = explainLine(msg("kick: beat tamborzao > kick > every 2 rev")).map((l) => l.text);
  assert.match(lines[0], /kick: a thread/);
  assert.ok(lines.some((l) => l.startsWith("tamborzao")));
  assert.ok(lines.some((l) => l.startsWith("every")));
  assert.ok(lines.some((l) => l.startsWith("rev")));
});

test("explains settings, comments, variables and continuation lines", () => {
  assert.match(explainLine(msg("style funk"))[0].text, /style: the feel/);
  assert.match(explainLine(msg("# kick: 0"))[0].text, /comment/);
  assert.match(explainLine(msg("theme = 0 2 4"))[0].text, /variable/);
  assert.match(explainLine(msg("a: 0\n  > rev", 1))[0].text, /continues/);
});

test("lists problems with their fix", () => {
  const out = assistant(msg("a: 0 > revv", 0, { problems: [{ row: 0, col: 7, message: "nope", fix: "change to rev", severity: "error" }] }));
  assert.ok(out.some((l) => l.role === "error" && l.text.includes("line 1")));
  assert.ok(out.some((l) => l.text.includes("change to rev")));
});

test("the reference covers grooves and styles", () => {
  const text = reference().map((l) => l.text).join("\n");
  assert.match(text, /tamborzao/);
  assert.match(text, /rave/);
});

test("wrapping keeps words whole", () => {
  const rows = wrap([{ text: "one two three four five six", role: "ink" }], 10);
  assert.ok(rows.every((r) => r.text.length <= 10));
  assert.equal(rows.map((r) => r.text.trim()).join(" "), "one two three four five six");
});
