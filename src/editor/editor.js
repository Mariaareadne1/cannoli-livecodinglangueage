/* ============================================================
   cannoli — editor
   A textarea over a coloured <pre>. Adds:
     · a suggestion card while typing (Tab / Enter to accept,
       Shift+Tab to write out the whole line it shows)
     · a tool under the code you're on: beat and melody grids,
       sounds, chords, keys, grooves, rings and sliders. Each one
       writes ordinary Strudel on your line
     · hover on an underlined problem → what's wrong + a Fix button
     · one-click fixes that stay on the undo stack
   ============================================================ */

import { highlightStrudel } from "../web/highlight.js";
import { completeStrudel } from "../../cli/strudel/complete.js";
import { strudelPickerAt } from "../../cli/strudel/pickers.js";
import { perform } from "../../cli/panel/model.js";
import { toolHtml } from "./tool-panel.js";

const PAD_X = 16;
const PAD_Y = 14;

const PREVIEW_DELAY_MS = 140;

/**
 * @param {HTMLElement} root
 * @param {{ value: string, onRun: () => void, onStop: (now: boolean) => void, onInput: (text: string) => void }} opts
 */
export function createEditor(root, { value, onRun, onStop, onInput, onSlide = () => {}, onHear = () => {} }) {
  root.classList.add("ed");
  root.innerHTML = `
    <div class="ed-gutter" aria-hidden="true"></div>
    <div class="ed-scroll">
      <div class="ed-body">
        <pre class="ed-hl" aria-hidden="true"></pre>
        <textarea class="ed-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"
          aria-label="Strudel code. Ctrl+Enter to play or update, Ctrl+period to stop."></textarea>
      </div>
    </div>
    <div class="ed-card" role="listbox" hidden></div>
    <div class="ed-picker" hidden></div>
    <div class="ed-tip" role="tooltip" hidden></div>
    <span class="ed-measure" aria-hidden="true">MMMMMMMMMM</span>`;
  const input = root.querySelector(".ed-input");
  const pre = root.querySelector(".ed-hl");
  const gutter = root.querySelector(".ed-gutter");
  const scroller = root.querySelector(".ed-scroll");
  const card = root.querySelector(".ed-card");
  const pickerBox = root.querySelector(".ed-picker");
  const tip = root.querySelector(".ed-tip");

  const state = { problems: [], active: new Set(), symbols: {}, suggestions: null, selected: 0, tipProblem: null, errorLine: 0, picker: null, pickerDismissed: null, sliding: false, heldCaret: null, toolView: {}, toolPlace: null, drag: null };
  input.value = value;
  input.setSelectionRange(0, 0);   // start at the top-left, not scrolled to the end

  /* ---------- drawing ---------- */

  function render() {
    pre.innerHTML = highlightStrudel(input.value, { problems: state.problems, active: state.active }) + "\n";
    const lines = input.value.split("\n").length;
    const bad = new Set(state.problems.filter((p) => p.severity === "error").map((p) => lineOf(p.start)));
    gutter.innerHTML = Array.from({ length: lines }, (_, i) => `<span class="${bad.has(i + 1) ? "bad" : ""}">${i + 1}</span>`).join("");
  }

  function lineOf(offset) {
    return input.value.slice(0, offset).split("\n").length;
  }

  function metrics() {
    const m = root.querySelector(".ed-measure").getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(pre).lineHeight);
    return { charWidth: m.width / 10, lineHeight };
  }

  /** Pixel position of a character offset, relative to the editor root. */
  function coordsOf(offset) {
    const before = input.value.slice(0, offset).split("\n");
    const { charWidth, lineHeight } = metrics();
    const body = root.querySelector(".ed-body").getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    return {
      x: body.left - rootBox.left + PAD_X + before[before.length - 1].length * charWidth,
      y: body.top - rootBox.top + PAD_Y + (before.length - 1) * lineHeight,
      lineHeight,
    };
  }

  /** Character offset under a mouse position. */
  function offsetAt(clientX, clientY) {
    const { charWidth, lineHeight } = metrics();
    const body = root.querySelector(".ed-body").getBoundingClientRect();
    const line = Math.floor((clientY - body.top - PAD_Y) / lineHeight);
    const col = Math.round((clientX - body.left - PAD_X) / charWidth);
    const lines = input.value.split("\n");
    if (line < 0 || line >= lines.length || col < 0 || col > lines[line].length) return -1;
    return lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + col;
  }

  /* ---------- suggestions ---------- */

  function suggest(force = false) {
    const cursor = input.selectionStart;
    if (cursor !== input.selectionEnd) return closeCard();
    // these pickers already show everything the card would
    if (!force && chordLineShowing(cursor)) return closeCard();
    const result = completeStrudel(input.value, cursor);
    if (result.items.length === 0) return closeCard();
    state.suggestions = result;
    state.selected = 0;
    // a blank drum thread shows its grid and its ideas together
    if (blankWithGrid(cursor)) updatePicker();
    else hidePicker();
    drawCard();
  }

  function drawCard() {
    const { items, from } = state.suggestions;
    const current = items[state.selected];
    card.innerHTML = `
      <ul>${items.map((s, i) => `<li role="option" data-i="${i}" class="${i === state.selected ? "sel" : ""}" aria-selected="${i === state.selected}">
        <span class="ed-card-label">${esc(s.label)}</span><span class="ed-card-kind">${esc(s.kind)}</span></li>`).join("")}</ul>
      <div class="ed-card-doc">
        <code>${esc(current.detail)}</code>
        <p>${esc(current.doc)}</p>
        ${current.fill
          ? `<p class="ed-card-fill">whole line <code>${esc(current.preview)}</code></p>`
          : current.example ? `<p class="ed-card-ex">e.g. <code>${esc(current.example)}</code></p>` : ""}
        <p class="ed-card-keys">${current.fill ? "Tab inserts the word · Shift+Tab writes the whole line" : "Tab to insert"} · Esc to close</p>
      </div>`;
    const pos = coordsOf(from);
    card.style.left = `${Math.max(8, pos.x - 4)}px`;
    const underGrid = !pickerBox.hidden && pickerBox.offsetTop > pos.y;
    card.style.top = `${underGrid ? pickerBox.offsetTop + pickerBox.offsetHeight + 4 : pos.y + pos.lineHeight + 4}px`;
    card.hidden = false;
    card.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  }

  function closeCard() {
    state.suggestions = null;
    card.hidden = true;
    updatePicker();
  }

  /* ---------- the tool under the cursor ---------- */

  const toolAt = (cursor) => strudelPickerAt(input.value, cursor, { minColumns: state.toolView.minColumns ?? 0 });

  function chordLineShowing(cursor) {
    const p = toolAt(cursor);
    return ["chords", "key", "groove"].includes(p?.kind) && lineStartOf(cursor) !== state.pickerDismissed;
  }

  /* A blank drum or melody line shows its grid and its ideas together. */
  function blankWithGrid(cursor) {
    return Boolean(toolAt(cursor)?.blank) && lineStartOf(cursor) !== state.pickerDismissed;
  }

  function lineStartOf(cursor) {
    return input.value.lastIndexOf("\n", cursor - 1) + 1;
  }

  function hidePicker() {
    state.picker = null;
    pickerBox.hidden = true;
  }

  /* Only touch the page if something changed: replacing a control takes the focus off it. */
  function setPickerHtml(html) {
    if (pickerBox.dataset.drawn === html) return;
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.tool : null;
    pickerBox.dataset.drawn = html;
    pickerBox.innerHTML = html;
    if (focus) pickerBox.querySelector(`[data-tool="${CSS.escape(focus)}"]`)?.focus();
  }

  /* The browser can lose the text box's caret while a slider has the focus, so the editor holds on to it. */
  function caret() {
    return state.heldCaret ?? input.selectionStart;
  }

  function updatePicker() {
    if (state.sliding) return;   // redrawing would drop the slider out of the player's hand
    if (document.activeElement === input) state.heldCaret = null;
    const cursor = caret();
    const focused = document.activeElement === input || pickerBox.contains(document.activeElement);
    // esc keeps it closed until the caret leaves the line
    if (state.pickerDismissed !== null && lineStartOf(cursor) !== state.pickerDismissed) state.pickerDismissed = null;
    const open = !state.suggestions || blankWithGrid(cursor);
    const noSelection = state.heldCaret !== null || input.selectionStart === input.selectionEnd;
    const tool = focused && open && noSelection ? toolAt(cursor) : null;
    if (!tool || lineStartOf(cursor) === state.pickerDismissed) return hidePicker();
    const place = `${lineStartOf(cursor)}:${tool.kind}`;
    if (place !== state.toolPlace) state.toolView = {};
    state.toolPlace = place;
    state.picker = tool;
    setPickerHtml(toolHtml(tool, state.toolView));
    pickerBox.hidden = false;
    placePicker(cursor);
  }

  function placePicker(cursor) {
    const pos = coordsOf(lineStartOf(cursor));
    pickerBox.style.left = `${Math.max(8, pos.x - 4)}px`;
    const below = pos.y + pos.lineHeight + 4;
    const fits = below + pickerBox.offsetHeight <= root.clientHeight;
    pickerBox.style.top = `${fits ? below : Math.max(0, pos.y - pickerBox.offsetHeight - 4)}px`;
  }

  function writeQuietly({ start, end, text }) {
    input.setRangeText(text, start, end, "preserve");
    render();
    onInput(input.value);
  }

  /* Write a tool's change, keeping the caret on the same piece of code so the tool stays open. */
  function writeTool(change) {
    const before = caret();
    const growth = change.text.length - (change.end - change.start);
    const after = before <= change.start ? before : before >= change.end ? before + growth : Math.min(before, change.start + Math.max(0, change.text.length - 1));
    if (state.sliding) {
      writeQuietly(change);
      state.heldCaret = after;
    } else {
      const keyboard = pickerBox.contains(document.activeElement);
      replaceRange(change.start, change.end, change.text);
      input.setSelectionRange(after, after);
      if (keyboard) state.heldCaret = after;
      closeCard();   // the write looks like typing, but nothing here needs suggesting
    }
    clearTimeout(state.hearTimer);
    state.hearTimer = setTimeout(() => onHear(change.start), PREVIEW_DELAY_MS);
    onSlide();
  }

  function act(id, extra) {
    const tool = toolAt(caret());
    if (!tool) return;
    const result = perform(tool, id, state.toolView, extra);
    if (result.view) state.toolView = result.view;
    if (result.close) {
      state.pickerDismissed = lineStartOf(caret());
      input.focus();
    }
    if (result.change) writeTool(result.change);
    updatePicker();
  }

  /* Dragging along a row of a melody holds the note. */
  function dragTo(id) {
    const { drag } = state;
    if (!drag || id === drag.last) return;
    const [kind, row, column] = id.split(":");
    const [, startRow, startColumn] = drag.id.split(":");
    state.drag = { ...drag, last: id };
    if (kind === "note" && row === startRow && Number(column) > Number(startColumn)) act(`hold:${column}`, { from: Number(startColumn) });
  }

  pickerBox.addEventListener("mousedown", (e) => {
    if (e.target.matches(".ed-picker-range")) {
      state.heldCaret = caret();
      state.sliding = true;   // nothing redraws while it's held: replacing it would drop it out of the hand
      return;                 // and it needs the mouse to itself
    }
    e.preventDefault();   // keep the caret in the editor
    const button = e.target.closest("[data-tool]");
    if (!button) return;
    state.drag = { id: button.dataset.tool };
    act(button.dataset.tool);
  });
  pickerBox.addEventListener("mouseover", (e) => {
    const button = e.target.closest("[data-tool]");
    if (button && e.buttons === 1) dragTo(button.dataset.tool);
  });
  pickerBox.addEventListener("input", (e) => {
    if (!e.target.matches(".ed-picker-range")) return;
    state.sliding = true;
    state.heldCaret = caret();
    act(e.target.dataset.tool, { value: Number(e.target.value) });
    e.target.nextElementSibling.textContent = e.target.value;
  });
  document.addEventListener("mouseup", () => {
    state.drag = null;
    if (state.sliding) {
      state.sliding = false;
      updatePicker();
    }
  });

  /* The arrow keys move around the tool's controls by where they are on screen. */
  function moveInTool(from, key) {
    const box = from.getBoundingClientRect();
    const across = key === "ArrowLeft" || key === "ArrowRight";
    const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    const others = [...pickerBox.querySelectorAll("[data-tool]")].filter((el) => el !== from).map((el) => ({ el, box: el.getBoundingClientRect() }));
    const ahead = others.filter((o) => (across ? Math.abs(o.box.top - box.top) < box.height / 2 && (o.box.left - box.left) * sign > 0 : (o.box.top - box.top) * sign > box.height / 2));
    const distance = (o) => (across ? Math.abs(o.box.left - box.left) : Math.abs(o.box.top - box.top) * 1000 + Math.abs(o.box.left - box.left));
    ahead.sort((a, b) => distance(a) - distance(b))[0]?.el.focus();
  }

  pickerBox.addEventListener("keydown", (e) => {
    const control = e.target.closest("[data-tool]");
    if (!control) return;
    if (e.key === "Escape") {
      e.preventDefault();
      state.sliding = false;
      input.focus();
    } else if (e.target.matches(".ed-picker-range")) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveInTool(control, e.key); }
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      moveInTool(control, e.key);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      act(control.dataset.tool);
    }
  });

  function accept(i = state.selected) {
    const { from, to, items } = state.suggestions;
    replaceRange(from, to, items[i].insert);
    closeCard();
    if (items[i].insert.endsWith(" ")) suggest();
  }

  /* Write out the whole line the card shows, replacing the rest of the line. */
  function acceptFill() {
    const { from, lineEnd, items } = state.suggestions;
    const pick = items[state.selected];
    if (!pick.fill) return accept();
    replaceRange(from, lineEnd, pick.fill);
    closeCard();
  }

  card.addEventListener("mousedown", (e) => {
    const li = e.target.closest("[data-i]");
    if (!li) return;
    e.preventDefault();
    accept(Number(li.dataset.i));
    input.focus();
  });

  /* ---------- problems on hover ---------- */

  function showTip(problem) {
    state.tipProblem = problem;
    const pos = coordsOf(problem.start);
    tip.innerHTML = `
      <p class="ed-tip-msg ${problem.severity}">${esc(problem.message)}</p>
      ${problem.fix ? `<button type="button" class="ed-fix">Fix: ${esc(problem.fix.label)}</button>` : ""}`;
    tip.style.left = `${Math.max(8, pos.x - 4)}px`;
    tip.style.top = `${pos.y + pos.lineHeight + 4}px`;
    tip.hidden = false;
  }

  function hideTip() {
    state.tipProblem = null;
    tip.hidden = true;
  }

  tip.addEventListener("click", (e) => {
    if (e.target.closest(".ed-fix") && state.tipProblem?.fix) {
      applyFix(state.tipProblem.fix);
      hideTip();
    }
  });
  let tipTimer = 0;
  input.addEventListener("mousemove", (e) => {
    const at = offsetAt(e.clientX, e.clientY);
    const problem = at === -1 ? null : state.problems.find((p) => at >= p.start && at <= p.end);
    clearTimeout(tipTimer);
    if (problem && problem !== state.tipProblem) showTip(problem);
    if (!problem) tipTimer = setTimeout(() => { if (!tip.matches(":hover")) hideTip(); }, 300);
  });
  tip.addEventListener("mouseleave", hideTip);

  /* ---------- editing ---------- */

  function replaceRange(start, end, text) {
    input.focus();
    input.setSelectionRange(start, end);
    // execCommand keeps the edit undoable; fall back if it's unavailable
    if (!document.execCommand("insertText", false, text)) {
      input.setRangeText(text, start, end, "end");
      input.dispatchEvent(new Event("input"));
    }
  }

  function applyFix(fix) {
    replaceRange(fix.start, fix.end, fix.text);
  }

  input.addEventListener("input", () => {
    render();
    onInput(input.value);
    suggest();
  });
  input.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (state.suggestions && !mod) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = state.suggestions.items.length;
        state.selected = (state.selected + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
        drawCard();
        return;
      }
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        acceptFill();
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        accept();
        return;
      }
      if (e.key === "Escape") {
        closeCard();
        return;
      }
    }
    if (e.key === "Escape" && state.picker) {
      state.pickerDismissed = lineStartOf(input.selectionStart);
      hidePicker();
      return;
    }
    if (mod && e.key === "b" && state.picker) {
      e.preventDefault();
      state.heldCaret = caret();
      pickerBox.querySelector("[data-tool]")?.focus();
      return;
    }
    if (mod && e.key === "Enter") {
      e.preventDefault();
      closeCard();
      onRun();
    } else if (mod && e.key === ".") {
      e.preventDefault();
      onStop(e.shiftKey);
    } else if (mod && e.key === " ") {
      e.preventDefault();
      suggest(true);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "  ");
    }
  });
  input.addEventListener("blur", () => setTimeout(closeCard, 120));
  input.addEventListener("focus", () => {
    if (state.heldCaret !== null) input.setSelectionRange(state.heldCaret, state.heldCaret);
    state.heldCaret = null;
    updatePicker();
  });
  input.addEventListener("click", closeCard);
  input.addEventListener("keyup", (e) => {
    if (!state.suggestions && e.key !== "Escape") updatePicker();
  });
  pickerBox.addEventListener("focusout", () => setTimeout(updatePicker, 120));
  scroller.addEventListener("scroll", () => { closeCard(); hideTip(); });

  render();

  return {
    get value() { return input.value; },
    get caret() { return input.selectionStart; },
    focus() { input.focus(); },
    setValue(text) {
      replaceRange(0, input.value.length, text);
    },
    /** Problems: [{ start, end, message, severity, fix }] */
    setProblems(problems) {
      state.problems = problems;
      if (state.tipProblem && !problems.includes(state.tipProblem)) hideTip();
      render();
    },
    setSymbols(symbols) {
      state.symbols = symbols;
    },
    setActive(active) {
      state.active = active;
      render();
    },
    applyFix,
    edit(change) {
      const cursor = input.selectionStart;
      const growth = change.text.length - (change.end - change.start);
      replaceRange(change.start, change.end, change.text);
      const at = change.start < cursor ? cursor + growth : cursor;
      input.setSelectionRange(at, at);
      closeCard();
      input.blur();
      onSlide();
    },
    /** A slider in the side panel moved: rewrite its number without taking the focus. */
    slideTo(change) {
      writeQuietly(change);
      onSlide();
    },
    scrollTo(offset) {
      const pos = coordsOf(offset);
      scroller.scrollTop = Math.max(0, pos.y - scroller.clientHeight / 2);
      input.focus();
      input.setSelectionRange(offset, offset);
    },
  };
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
