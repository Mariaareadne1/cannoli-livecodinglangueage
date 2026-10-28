/* ============================================================
   cannoli — editor
   A textarea over a coloured <pre>. Adds:
     · a suggestion card while typing (Tab / Enter to accept,
       Shift+Tab to write out the whole line it shows)
     · hover on an underlined problem → what's wrong + a Fix button
     · one-click fixes that stay on the undo stack
   ============================================================ */

import { highlight } from "./highlight.js";
import { complete } from "./complete.js";

const PAD_X = 16;
const PAD_Y = 14;

/**
 * @param {HTMLElement} root
 * @param {{ value: string, onRun: () => void, onStop: (now: boolean) => void, onInput: (text: string) => void }} opts
 */
export function createEditor(root, { value, onRun, onStop, onInput }) {
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
    <div class="ed-tip" role="tooltip" hidden></div>
    <span class="ed-measure" aria-hidden="true">MMMMMMMMMM</span>`;
  const input = root.querySelector(".ed-input");
  const pre = root.querySelector(".ed-hl");
  const gutter = root.querySelector(".ed-gutter");
  const scroller = root.querySelector(".ed-scroll");
  const card = root.querySelector(".ed-card");
  const tip = root.querySelector(".ed-tip");

  const state = { problems: [], active: new Set(), symbols: {}, suggestions: null, selected: 0, tipProblem: null, errorLine: 0 };
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
    card.style.top = `${pos.y + pos.lineHeight + 4}px`;
    card.hidden = false;
    card.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  }

  function closeCard() {
    state.suggestions = null;
    card.hidden = true;
  }

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
  input.addEventListener("click", closeCard);
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
