/* ============================================================
   cannoli — editor
   A textarea over a coloured <pre>. Adds:
     · a suggestion card while typing (Tab / Enter to accept,
       Shift+Tab to write out the whole line it shows)
     · a grid under drum threads and every/firstOf/lastOf: click
       the beats or bars you want and it writes the code
     · a slider on words with a number range: drag it to hear the
       change, then keep the number or put a slider in the code
     · hover on an underlined problem → what's wrong + a Fix button
     · one-click fixes that stay on the undo stack
   ============================================================ */

import { highlight } from "./highlight.js";
import { complete } from "./complete.js";
import { pickerAt, applyBeat, applyBars, applySlider, addSlider } from "./pickers.js";

const PAD_X = 16;
const PAD_Y = 14;

const PICKER_BARS_PER_GROUP = 4;

/**
 * @param {HTMLElement} root
 * @param {{ value: string, onRun: () => void, onStop: (now: boolean) => void, onInput: (text: string) => void }} opts
 */
export function createEditor(root, { value, onRun, onStop, onInput, onSlide = () => {} }) {
  root.classList.add("ed");
  root.innerHTML = `
    <div class="ed-gutter" aria-hidden="true"></div>
    <div class="ed-scroll">
      <div class="ed-body">
        <pre class="ed-hl" aria-hidden="true"></pre>
        <textarea class="ed-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"
          aria-label="cannoli code. Ctrl+Enter to play or update, Ctrl+period to stop."></textarea>
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

  const state = { problems: [], active: new Set(), symbols: {}, suggestions: null, selected: 0, tipProblem: null, errorLine: 0, picker: null, pickerDismissed: null, sliding: false, heldCaret: null };
  input.value = value;
  input.setSelectionRange(0, 0);   // start at the top-left, not scrolled to the end

  /* ---------- drawing ---------- */

  function render() {
    pre.innerHTML = highlight(input.value, { ...state.symbols, problems: state.problems, active: state.active }) + "\n";
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
    const result = complete(input.value, cursor, state.symbols, { force });
    if (result.items.length === 0) return closeCard();
    state.suggestions = result;
    state.selected = 0;
    // a blank drum thread shows its grid and its ideas together
    if (blankDrumThread(cursor)) updatePicker();
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

  /* ---------- the beat grid and bar picker ---------- */

  function blankDrumThread(cursor) {
    const p = pickerAt(input.value, cursor);
    return p?.kind === "beat" && p.blank && currentLine(cursor) !== state.pickerDismissed;
  }

  function currentLine(cursor) {
    const start = input.value.lastIndexOf("\n", cursor - 1) + 1;
    const end = input.value.indexOf("\n", cursor);
    return input.value.slice(start, end < 0 ? input.value.length : end);
  }

  function hidePicker() {
    state.picker = null;
    pickerBox.hidden = true;
  }

  /* Only touch the page if something changed: replacing a control takes the focus off it. */
  function setPickerHtml(html) {
    if (pickerBox.dataset.drawn === html) return;
    pickerBox.dataset.drawn = html;
    pickerBox.innerHTML = html;
  }

  /* The browser can lose the text box's caret while a slider has the focus, so the editor holds on to it. */
  function caret() {
    return state.heldCaret ?? input.selectionStart;
  }

  function updatePicker() {
    if (state.sliding) return;   // redrawing would drop the slider out of the player's hand
    const cursor = caret();
    const focused = document.activeElement === input || pickerBox.contains(document.activeElement);
    const open = !state.suggestions || blankDrumThread(cursor);
    const noSelection = state.heldCaret !== null || input.selectionStart === input.selectionEnd;
    const picker = focused && open && noSelection ? pickerAt(input.value, cursor) : null;
    if (!picker || currentLine(cursor) === state.pickerDismissed) return hidePicker();
    state.picker = picker;
    if (picker.kind === "slider") {
      drawSlider(picker);
      placePicker(cursor);
    } else {
      drawPicker(picker, cursor);
    }
  }

  function drawSlider(picker) {
    const hadFocus = pickerBox.contains(document.activeElement);
    setPickerHtml(`<p class="ed-picker-title"><code>${esc(picker.word)}</code> from ${picker.min} to ${picker.max}: drag to hear it</p>
      <div class="ed-picker-slide">
        <input type="range" class="ed-picker-range" min="${picker.min}" max="${picker.max}" step="${picker.step}" value="${picker.value}" aria-label="${esc(picker.word)}" />
        <output class="ed-picker-value">${picker.value}</output>
      </div>
      <div class="ed-picker-actions">
        <button type="button" class="btn" data-action="keep">keep this number</button>
        ${picker.canAddToCode && !picker.inCode ? '<button type="button" class="btn" data-action="add">add a slider to the code</button>' : ""}
      </div>
      <p class="ed-picker-keys">${picker.inCode ? "this slider also sits in the live panel · " : ""}esc closes · ctrl+b to use the keyboard</p>`);
    pickerBox.hidden = false;
    if (hadFocus) pickerBox.querySelector(".ed-picker-range").focus();
  }

  /* Write a new number straight away, without moving focus off the slider. */
  function writeSliderValue(value) {
    const change = applySlider(state.picker, value);
    writeQuietly(change);
    state.heldCaret = change.start + 1;
    state.picker = pickerAt(input.value, state.heldCaret) ?? state.picker;
    pickerBox.querySelector(".ed-picker-value").textContent = state.picker.value;
    onSlide();
  }

  function writeQuietly({ start, end, text }) {
    input.setRangeText(text, start, end, "preserve");
    render();
    onInput(input.value);
  }

  pickerBox.addEventListener("input", (e) => {
    if (!e.target.matches(".ed-picker-range")) return;
    state.sliding = true;
    writeSliderValue(Number(e.target.value));
  });
  pickerBox.addEventListener("change", (e) => {
    if (e.target.matches(".ed-picker-range")) state.sliding = false;
  });

  function drawPicker(picker, cursor) {
    const isBeat = picker.kind === "beat";
    const cells = isBeat ? picker.steps : picker.bars;
    const perGroup = isBeat ? picker.perBeat : PICKER_BARS_PER_GROUP;
    const name = (i) => (isBeat ? `beat ${Math.floor(i / perGroup) + 1}, step ${(i % perGroup) + 1}` : `bar ${i + 1}`);
    const text = (i) => (isBeat ? (i % perGroup === 0 ? i / perGroup + 1 : "") : i + 1);
    const groups = Array.from({ length: Math.ceil(cells.length / perGroup) }, (_, g) =>
      `<div class="ed-picker-group" role="group">${cells.slice(g * perGroup, (g + 1) * perGroup).map((on, k) => {
        const i = g * perGroup + k;
        return `<button type="button" class="ed-picker-cell${on ? " on" : ""}" data-cell="${i}" aria-pressed="${on}" aria-label="${name(i)}" tabindex="-1">${text(i)}</button>`;
      }).join("")}</div>`).join("");
    const title = isBeat
      ? `<strong>${esc(picker.name)}</strong> plays <code>${esc(picker.drum)}</code>: click the steps you want`
      : `click the bars where <code>${esc(picker.verb || "rev")}</code> plays`;
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.cell : null;
    setPickerHtml(`<p class="ed-picker-title">${title}</p><div class="ed-picker-cells">${groups}</div>
      <p class="ed-picker-keys">it writes the code on your line · ctrl+enter to hear it · esc closes · ctrl+b to use the keyboard</p>`);
    if (focus !== null && focus !== undefined) pickerBox.querySelector(`[data-cell="${focus}"]`)?.focus();
    pickerBox.hidden = false;
    placePicker(cursor);
  }

  function placePicker(cursor) {
    const lineStart = input.value.lastIndexOf("\n", cursor - 1) + 1;
    const pos = coordsOf(lineStart);
    pickerBox.style.left = `${Math.max(8, pos.x - 4)}px`;
    const below = pos.y + pos.lineHeight + 4;
    const fits = below + pickerBox.offsetHeight <= root.clientHeight;
    pickerBox.style.top = `${fits ? below : Math.max(0, pos.y - pickerBox.offsetHeight - 4)}px`;
  }

  function toggleCell(i) {
    const picker = state.picker;
    if (!picker) return;
    const isBeat = picker.kind === "beat";
    const cells = (isBeat ? picker.steps : picker.bars).map((on, k) => (k === i ? !on : on));
    const change = isBeat ? applyBeat(picker, cells) : applyBars(picker, cells);
    if (!change) return;   // the last bar stays picked: every needs at least one
    const keyboard = pickerBox.contains(document.activeElement);
    replaceRange(change.start, change.end, change.text);
    // stay on the same picker: the pattern for a beat, the every/when for bars
    const at = isBeat ? change.start + 1 : change.start + change.text.length;
    input.setSelectionRange(at, at);
    closeCard();
    if (keyboard) pickerBox.querySelector(`[data-cell="${i}"]`)?.focus();
  }

  pickerBox.addEventListener("mousedown", (e) => {
    if (e.target.matches(".ed-picker-range")) return;   // the slider needs the mouse to itself
    e.preventDefault();   // keep the caret in the editor
    const cell = e.target.closest("[data-cell]");
    if (cell) toggleCell(Number(cell.dataset.cell));
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action) finishSlider(action);
  });

  function finishSlider(action) {
    state.sliding = false;
    if (action === "add") {
      const change = addSlider(state.picker, state.picker.value);
      replaceRange(change.start, change.end, change.text);
      input.setSelectionRange(change.start + 1, change.start + 1);
      onSlide();
      closeCard();
      return;
    }
    state.pickerDismissed = currentLine(caret());
    input.focus();
    hidePicker();
  }
  pickerBox.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.matches(".ed-picker-range")) {
      e.preventDefault();
      state.sliding = false;
      input.focus();
      return;
    }
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;
    const i = Number(cell.dataset.cell);
    const total = pickerBox.querySelectorAll("[data-cell]").length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      pickerBox.querySelector(`[data-cell="${(i + (e.key === "ArrowRight" ? 1 : total - 1)) % total}"]`).focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggleCell(i);
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.focus();
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
    state.pickerDismissed = null;
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
      state.pickerDismissed = currentLine(input.selectionStart);
      hidePicker();
      return;
    }
    if (mod && e.key === "b" && state.picker) {
      e.preventDefault();
      pickerBox.querySelector("[data-cell], .ed-picker-range")?.focus();
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
