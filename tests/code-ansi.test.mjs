import { test } from "node:test";
import assert from "node:assert/strict";
import { codeLine } from "../cli/code-ansi.js";
import { strip } from "../cli/ansi.js";
import { THEMES, rgb } from "../src/themes.js";

const theme = THEMES.deep;
const colour = (hex, kind = 38) => `${kind};2;${rgb(hex).join(";")}m`;

test("a code line is exactly the pane width", () => {
  const out = codeLine({ line: "lead: 0 2 4 > rev", offset: 0, theme, width: 30 });
  assert.equal(strip(out), "lead: 0 2 4 > rev".padEnd(30));
});

test("long lines scroll sideways", () => {
  const out = codeLine({ line: "abcdefghij", offset: 0, theme, width: 4, colStart: 3 });
  assert.equal(strip(out), "defg");
});

test("> uses the accent and verbs the soft colour", () => {
  const out = codeLine({ line: "a: 0 > rev", offset: 0, theme, width: 20 });
  assert.ok(out.includes(colour(theme.accent)));
  assert.ok(out.includes(colour(theme.soft)));
});

test("problems are underlined in the error colour; sounding notes are lit", () => {
  const err = codeLine({ line: "a: 0 > revv", offset: 0, theme, width: 20, problems: [{ start: 7, end: 11, severity: "error" }] });
  assert.ok(err.includes(colour(theme.error)) && err.includes("\x1b[4m"));
  const lit = codeLine({ line: "a: 0 2", offset: 0, theme, width: 20, active: new Set([3]) });
  assert.ok(lit.includes(colour(theme.accent, 48)));
});

test("a missing bracket gets a marker at the end of the line", () => {
  const out = codeLine({ line: "a: [0 2", offset: 0, theme, width: 20, problems: [{ start: 7, end: 8, severity: "error" }] });
  assert.ok(strip(out).includes("◂"));
});

test("works in every theme", () => {
  for (const t of Object.values(THEMES)) assert.equal(strip(codeLine({ line: "# hi", offset: 0, theme: t, width: 8 })).length, 8);
});
