import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, FAMILIES, paneTheme, rgb } from "../src/themes.js";

const KEYS = ["bg", "panel", "raised", "line", "ink", "soft", "dim", "faint", "accent", "error", "warn"];

test("every theme has every colour role, as valid hex", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    for (const k of KEYS) assert.match(t[k], /^#[0-9a-f]{6}$/i, `${name}.${k}`);
    assert.equal(t.threads.length, 6, name);
    for (const k of ["core", "mid", "edge", "dot"]) assert.match(t.glow[k], /^#[0-9a-f]{6}$/i, `${name}.glow.${k}`);
  }
});

test("text stands out from the background in every theme", () => {
  const lum = (hex) => rgb(hex).reduce((a, v) => a + v, 0) / 765;
  for (const [name, t] of Object.entries(THEMES)) assert.ok(Math.abs(lum(t.ink) - lum(t.bg)) > 0.6, name);
});

test("families give each pane a tone; a single theme applies to all", () => {
  assert.equal(paneTheme("deep", "edit"), THEMES.deep);
  assert.equal(paneTheme("deep", "guide"), THEMES["deep-white"]);
  assert.equal(paneTheme("deep", "visual"), THEMES["deep-black"]);
  assert.equal(paneTheme("rose", "reference"), THEMES["rose-berry"]);
  assert.equal(paneTheme("bubblegum", "visual"), THEMES.bubblegum);
  for (const f of Object.values(FAMILIES)) for (const t of Object.values(f.panes)) assert.ok(THEMES[t], t);
});
