/* ============================================================
   cannoli — placing a panel in the terminal
   Wraps a panel's rows to the width, finds which cell a key or
   a click lands on, and draws it in the theme's colours.
   ============================================================ */

import { fg, bg, RESET, BOLD, fit } from "../ansi.js";

const LABEL_W = 10;
const CELL_GAP = 1;
const BEAT_GAP = 2;
const SLIDER_VALUE_W = 7;

/** Wrap a panel into lines, each cell with its column. */
export function layoutPanel(panel, width) {
  const lines = [{ text: panel.title, role: "head" }];
  for (const row of panel.rows) {
    if (row.text !== undefined) {
      lines.push({ text: row.text, role: row.role });
    } else if (row.slider) {
      lines.push({ slider: row.slider });
    } else {
      const hasLabel = row.label !== undefined;
      const start = hasLabel ? LABEL_W : 1;
      let line = { label: row.label, home: row.home, cells: [] };
      let x = start;
      for (const cell of row.cells) {
        const w = [...cell.text].length + (cell.boxed === false ? 0 : 0);
        const gap = cell.gap ? BEAT_GAP : 0;
        if (x + gap + w > width - 1 && line.cells.length) {
          lines.push(line);
          line = { label: "", cells: [] };
          x = start;
        }
        line.cells.push({ ...cell, x: x + (line.cells.length ? gap : 0), w });
        x += (line.cells.length > 1 ? gap : 0) + w + CELL_GAP;
      }
      lines.push(line);
    }
  }
  return lines;
}

const usable = (cell) => !cell.label;

function focusables(line) {
  if (line.slider) return [{ x: LABEL_W }];
  return (line.cells ?? []).filter(usable);
}

/** The first thing that can take the focus. */
export function firstFocus(lines) {
  const line = lines.findIndex((l) => focusables(l).length);
  return line < 0 ? null : { line, index: 0 };
}

/** Move the focus with an arrow key. */
export function moveFocus(lines, focus, direction) {
  const here = focusables(lines[focus.line]);
  if (direction === "left" || direction === "right") {
    const index = focus.index + (direction === "right" ? 1 : -1);
    return index >= 0 && index < here.length ? { ...focus, index } : focus;
  }
  const x = here[focus.index]?.x ?? 0;
  const step = direction === "down" ? 1 : -1;
  for (let l = focus.line + step; l >= 0 && l < lines.length; l += step) {
    const there = focusables(lines[l]);
    if (!there.length) continue;
    const index = there.reduce((best, c, i) => (Math.abs(c.x - x) < Math.abs(there[best].x - x) ? i : best), 0);
    return { line: l, index };
  }
  return focus;
}

/** The cell or slider under the focus. */
export function focused(lines, focus) {
  const line = focus && lines[focus.line];
  if (!line) return null;
  return line.slider ?? focusables(line)[focus.index] ?? null;
}

function sliderTrack(width) {
  return { from: LABEL_W, size: Math.max(4, width - LABEL_W - SLIDER_VALUE_W - 1) };
}

/** The value a click at this column means on a slider. */
export function sliderValueAt(slider, col, width) {
  const { from, size } = sliderTrack(width);
  const share = Math.max(0, Math.min(1, (col - from) / (size - 1)));
  const raw = slider.min + share * (slider.max - slider.min);
  return clampToStep(slider, raw);
}

/** Round to the slider's step, inside its range. */
export function clampToStep(slider, value) {
  const stepped = Math.round((value - slider.min) / slider.step) * slider.step + slider.min;
  return Number(Math.max(slider.min, Math.min(slider.max, stepped)).toFixed(4));
}

/** What's at a position in the panel. */
export function hitTest(lines, lineIndex, col) {
  const line = lines[lineIndex];
  if (!line) return null;
  if (line.slider) return col >= LABEL_W ? { line: lineIndex, index: 0, slider: line.slider } : null;
  const index = focusables(line).findIndex((c) => col >= c.x && col < c.x + c.w);
  return index < 0 ? null : { line: lineIndex, index };
}

function drawLine(line, isFocus, focusIndex, th, width) {
  const base = `${bg(th.panel)}`;
  if (line.text !== undefined) {
    const color = line.role === "head" ? th.ink : th[line.role] ?? th.dim;
    return `${base}${fg(color)}${line.role === "head" ? BOLD : ""}${fit(` ${line.text}`, width)}${RESET}`;
  }
  if (line.slider) {
    const { from, size } = sliderTrack(width);
    const { min, max, value, label } = line.slider;
    const filled = Math.round(((value - min) / (max - min || 1)) * (size - 1));
    const bar = Array.from({ length: size }, (_, i) => (i === filled ? "█" : i < filled ? "━" : "─")).join("");
    const head = isFocus ? `${bg(th.raised)}${fg(th.ink)}${BOLD}` : `${fg(th.dim)}`;
    return `${base}${head}${fit(` ${label}`, from)}${RESET}${base}${fg(th.accent)}${bar}${fg(th.ink)}${BOLD}${String(value).padStart(SLIDER_VALUE_W)} ${RESET}${base}${" ".repeat(Math.max(0, width - from - size - SLIDER_VALUE_W - 1))}${RESET}`;
  }
  let out = `${base}${fg(line.home ? th.ink : th.dim)}${fit(line.label !== undefined ? ` ${line.label}` : "", line.label !== undefined ? LABEL_W : 1)}${RESET}`;
  let x = line.label !== undefined ? LABEL_W : 1;
  const usableCells = focusables(line);
  for (const cell of line.cells) {
    if (cell.x > x) out += `${base}${" ".repeat(cell.x - x)}`;
    const focus = isFocus && usableCells[focusIndex] === cell;
    const colors = focus ? `${bg(th.accent)}${fg(th.bg)}${BOLD}`
      : cell.on ? `${bg(th.raised)}${fg(th.accent)}${BOLD}`
        : cell.accent ? `${base}${fg(th.accent)}`
          : cell.label || cell.dim ? `${base}${fg(th.faint)}` : `${base}${fg(th.soft)}`;
    out += `${colors}${cell.text}${RESET}`;
    x = cell.x + cell.w;
  }
  return `${out}${base}${" ".repeat(Math.max(0, width - x))}${RESET}`;
}

/**
 * Draw the panel, scrolled so the focus stays in view.
 * @returns {{ rows: string[], scroll: number }}
 */
export function drawPanel(lines, focus, th, width, maxRows, hint) {
  const room = Math.max(1, maxRows - 1);
  const scroll = focus ? Math.max(0, Math.min(focus.line - Math.floor(room / 2), lines.length - room)) : 0;
  const shown = lines.slice(scroll, scroll + room);
  const rows = shown.map((line, i) => drawLine(line, focus?.line === scroll + i, focus?.index, th, width));
  const doc = focused(lines, focus)?.doc;
  rows.push(`${bg(th.panel)}${fg(th.faint)}${fit(` ${doc ?? hint}`, width)}${RESET}`);
  return { rows, scroll };
}
