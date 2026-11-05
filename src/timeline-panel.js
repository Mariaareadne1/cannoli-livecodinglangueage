/* ============================================================
   cannoli — the timeline tab
   Draws the song timeline and turns clicks and drags into code.
   Drag along a row to paint bars on or off; the code changes
   when you let go, as one step you can undo.
   ============================================================ */

import { readTimeline, applyTimeline, timelineLength } from "./editor/timeline.js";
import { renderBar } from "./core/render.js";

const BARS_PER_GROUP = 4;
const MORE_BARS = 8;

/**
 * @param {{ root: HTMLElement, moreButton: HTMLElement, getText: () => string, edit: (change: object) => void }} opts
 */
export function createTimelinePanel({ root, moreButton, getText, edit }) {
  let result = null;
  let extra = 0;
  let paint = null;
  let drawn = "";
  let nowBar = 0;
  let longest = 0;   // it never shrinks while you work, so bars don't move under the mouse

  /* Which bars actually make a sound, rules and all. */
  function soundingBars(names, bars) {
    if (!result || result.errors.length) return null;
    const heard = new Map(names.map((n) => [n, Array(bars).fill(false)]));
    for (let bar = 0; bar < bars; bar++) {
      try {
        for (const note of renderBar(result.program, bar)) {
          if (heard.has(note.thread)) heard.get(note.thread)[bar] = true;
        }
      } catch {
        return null;   // a bar that can't be worked out shouldn't take the panel down with it
      }
    }
    return heard;
  }

  function draw() {
    if (paint) return;
    const text = getText();
    longest = Math.max(longest, timelineLength(text) + extra);
    const bars = longest;
    const rows = readTimeline(text, bars);
    if (rows.length === 0) {
      setHtml('<p class="dim">Write a thread, like <code>kick: beat fourfloor &gt; bd</code>, and it appears here.</p>');
      return;
    }
    const heard = soundingBars(rows.map((r) => r.name), bars);
    const numbers = Array.from({ length: bars }, (_, i) => `<span class="tl-number${groupStart(i)}" data-bar="${i + 1}">${i % BARS_PER_GROUP === 0 ? i + 1 : ""}</span>`).join("");
    const body = rows.map((row, r) => `<div class="tl-row"><span class="tl-name" title="${esc(row.name)}">${esc(row.name)}</span>${row.on.map((on, i) => {
      const quiet = on && heard && !heard.get(row.name)[i];
      return `<button type="button" class="tl-cell${on ? " on" : ""}${quiet ? " quiet" : ""}${groupStart(i)}" data-row="${r}" data-name="${esc(row.name)}" data-bar="${i + 1}" aria-pressed="${on}" aria-label="${esc(row.name)}, bar ${i + 1}: ${on ? "playing" : "silent"}" tabindex="${r === 0 && i === 0 ? 0 : -1}"></button>`;
    }).join("")}</div>`).join("");
    setHtml(`<div class="tl-row tl-head"><span class="tl-name"></span>${numbers}</div>${body}`);
    markNow();
  }

  /* Only replace the page if something changed: replacing a cell takes the focus off it. */
  function setHtml(html) {
    if (html === drawn) return;
    const focus = root.contains(document.activeElement) ? [document.activeElement.dataset.row, document.activeElement.dataset.bar] : null;
    drawn = html;
    root.innerHTML = html;
    if (focus) root.querySelector(`[data-row="${focus[0]}"][data-bar="${focus[1]}"]`)?.focus();
  }

  function rowCells(name) {
    return [...root.querySelectorAll(".tl-cell")].filter((c) => c.dataset.name === name);
  }

  function setCell(cell, on) {
    cell.classList.toggle("on", on);
    cell.classList.remove("quiet");
    cell.setAttribute("aria-pressed", String(on));
  }

  function commit(name) {
    const on = rowCells(name).map((c) => c.classList.contains("on"));
    const change = applyTimeline(getText(), name, on);
    if (change) edit(change);
  }

  root.addEventListener("mousedown", (e) => {
    const cell = e.target.closest(".tl-cell");
    if (!cell) return;
    e.preventDefault();
    const value = !cell.classList.contains("on");
    paint = { name: cell.dataset.name, value, last: Number(cell.dataset.bar) };
    setCell(cell, value);
  });

  root.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".tl-cell");
    if (!paint || !cell || cell.dataset.name !== paint.name) return;
    const bar = Number(cell.dataset.bar);
    const [from, to] = [Math.min(bar, paint.last), Math.max(bar, paint.last)];
    rowCells(paint.name).slice(from - 1, to).forEach((c) => setCell(c, paint.value));
    paint.last = bar;
  });

  document.addEventListener("mouseup", () => {
    if (!paint) return;
    const { name } = paint;
    paint = null;
    commit(name);
    draw();
  });

  root.addEventListener("keydown", (e) => {
    const cell = e.target.closest(".tl-cell");
    if (!cell) return;
    const [row, bar] = [Number(cell.dataset.row), Number(cell.dataset.bar)];
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      root.querySelector(`[data-row="${row + moves[e.key][0]}"][data-bar="${bar + moves[e.key][1]}"]`)?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setCell(cell, !cell.classList.contains("on"));
      commit(cell.dataset.name);
      cell.focus();
      draw();
    }
  });

  moreButton.addEventListener("click", () => {
    extra += MORE_BARS;
    draw();
  });

  function markNow() {
    root.querySelectorAll(".now").forEach((el) => el.classList.remove("now"));
    if (nowBar) root.querySelectorAll(`[data-bar="${nowBar}"]`).forEach((el) => el.classList.add("now"));
  }

  return {
    /** The song changed: redraw, using this compile for which bars make a sound. */
    update(compiled) {
      result = compiled;
      if (!root.closest("[hidden]")) draw();
    },
    draw,
    /** The bar now playing (1-based), or 0 if stopped. */
    setBar(bar) {
      if (bar === nowBar) return;
      nowBar = bar;
      if (!root.closest("[hidden]")) markNow();
    },
  };
}

function groupStart(i) {
  return i > 0 && i % BARS_PER_GROUP === 0 ? " group" : "";
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
