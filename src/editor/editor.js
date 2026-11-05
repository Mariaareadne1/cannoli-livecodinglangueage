/* ============================================================
   cannoli — editor
   A textarea over a coloured <pre>. Adds:
     · a suggestion card while typing (Tab / Enter to accept,
       Shift+Tab to write out the whole line it shows)
     · a grid under drum threads and every/firstOf/lastOf: click
       the beats or bars you want and it writes the code
     · a ring on euclid: sliders for hits, steps and rotation,
       with the rhythm drawn as a circle
     · a sound picker on sound words: every sound, described,
       and each plays as you pick it
     · a chord picker on the chords line: a block per bar, the
       chords of the key, what usually comes next, and progressions
     · a melody grid on patterns of scale steps: click notes,
       drag to hold them
     · a slider on words with a number range: drag it to hear the
       change, then keep the number or put a slider in the code
     · hover on an underlined problem → what's wrong + a Fix button
     · one-click fixes that stay on the undo stack
   ============================================================ */

import { highlight } from "./highlight.js";
import { complete } from "./complete.js";
import { pickerAt, applyBeat, applyBars, applySlider, addSlider } from "./pickers.js";
import { applyMelody, toggleNote, holdNote, rowsFor } from "./melody-grid.js";
import { applySound, findSound, addSound, threadOfLine } from "./sound-picker.js";
import { applyRing, ringPattern, ringName } from "./euclid-ring.js";
import { applyChords, setChord, addBar, removeBar, slotAtColumn, goodNext, nameOf } from "./chord-picker.js";

const PAD_X = 16;
const PAD_Y = 14;

const PICKER_BARS_PER_GROUP = 4;
const RING_CENTRE = 75;
const RING_RADIUS = 60;
const RING_LARGEST_DOT = 8;
const RING_SMALLEST_DOT = 3;
const RING_MOST_STEPS = 32;
const CHORD_PROGRESSIONS = 6;
const MELODY_BEATS = 4;
const MELODY_MOST_COLUMNS = 32;

/**
 * @param {HTMLElement} root
 * @param {{ value: string, onRun: () => void, onStop: (now: boolean) => void, onInput: (text: string) => void }} opts
 */
export function createEditor(root, { value, onRun, onStop, onInput, onSlide = () => {}, onPreview = () => {}, onChord = () => {}, onSound = () => {}, onRing = () => {} }) {
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

  const state = { problems: [], active: new Set(), symbols: {}, suggestions: null, selected: 0, tipProblem: null, errorLine: 0, picker: null, pickerDismissed: null, sliding: false, heldCaret: null, melodyDrag: null, finerGrid: null, chordSlot: null };
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
    // the chord picker already shows everything the card would
    if (!force && chordLineShowing(cursor)) return closeCard();
    const result = complete(input.value, cursor, state.symbols, { force });
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

  /* ---------- the beat grid and bar picker ---------- */

  function chordLineShowing(cursor) {
    const p = pickerAt(input.value, cursor);
    return p?.kind === "chords" && lineStartOf(cursor) !== state.pickerDismissed;
  }

  /* A blank drum or melody line shows its grid and its ideas together. */
  function blankWithGrid(cursor) {
    const p = pickerAt(input.value, cursor);
    return Boolean(p?.blank) && lineStartOf(cursor) !== state.pickerDismissed;
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
    // esc keeps it closed until the caret leaves the line
    if (state.pickerDismissed !== null && lineStartOf(cursor) !== state.pickerDismissed) state.pickerDismissed = null;
    const open = !state.suggestions || blankWithGrid(cursor);
    const noSelection = state.heldCaret !== null || input.selectionStart === input.selectionEnd;
    const picker = focused && open && noSelection ? pickerAt(input.value, cursor, gridOptions(cursor)) : null;
    if (!picker || lineStartOf(cursor) === state.pickerDismissed) return hidePicker();
    state.picker = picker;
    if (picker.kind === "slider") drawSlider(picker);
    else if (picker.kind === "chords") drawChords(picker, cursor);
    else if (picker.kind === "sound") drawSound(picker);
    else if (picker.kind === "euclid") drawRing(picker);
    else if (picker.kind === "melody") drawMelody(picker);
    else drawPicker(picker, cursor);
    placePicker(cursor);
  }

  /* The rhythm as a circle: a dot per step, hits joined up, step one at the top. */
  function ringSvg(picker) {
    const pattern = ringPattern(picker);
    const point = (i, r) => {
      const angle = (i / pattern.length) * 2 * Math.PI - Math.PI / 2;
      return [RING_CENTRE + r * Math.cos(angle), RING_CENTRE + r * Math.sin(angle)].map((v) => v.toFixed(1));
    };
    const dot = Math.max(RING_SMALLEST_DOT, Math.min(RING_LARGEST_DOT, (RING_RADIUS * 2.4) / pattern.length));
    const hitPoints = pattern.flatMap((on, i) => (on ? [point(i, RING_RADIUS).join(",")] : [])).join(" ");
    const dots = pattern.map((on, i) => {
      const [x, y] = point(i, RING_RADIUS);
      return `<circle cx="${x}" cy="${y}" r="${dot}" class="ed-ring-dot${on ? " on" : ""}${i === 0 ? " first" : ""}"/>`;
    }).join("");
    const shape = hitPoints ? `<polygon points="${hitPoints}" class="ed-ring-shape"/>` : "";
    return `<svg viewBox="0 0 ${RING_CENTRE * 2} ${RING_CENTRE * 2}" class="ed-ring-svg" role="img" aria-label="${picker.hits} hits over ${picker.steps} steps">${shape}
      <line x1="${RING_CENTRE}" y1="${RING_CENTRE}" x2="${RING_CENTRE}" y2="${RING_CENTRE - RING_RADIUS}" class="ed-ring-hand" hidden/>${dots}</svg>`;
  }

  function ringLabel(picker) {
    const name = ringName(picker.hits, picker.steps, picker.rotation);
    return `${picker.hits} hits over ${picker.steps} steps${name ? ` · ${name}` : ""}`;
  }

  function drawRing(picker) {
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.ring : null;
    const slider = (name, label, min, max, value) => `<label class="ed-ring-control"><span>${label}</span>
      <input type="range" class="ed-picker-range" data-ring="${name}" min="${min}" max="${max}" step="1" value="${value}"/>
      <output data-ring-value="${name}">${value}</output></label>`;
    const editable = pickerAt(input.value, picker.line.start + 1, {})?.kind === "beat";
    setPickerHtml(`<p class="ed-picker-title"><code>${esc(picker.word)}</code>: spreads hits as evenly as it can. <span data-ring-label>${esc(ringLabel(picker))}</span></p>
      <div class="ed-ring"><div data-ring-drawing>${ringSvg(picker)}</div><div class="ed-ring-controls">
        ${slider("hits", "hits", 0, picker.steps, picker.hits)}
        ${slider("steps", "steps", 1, RING_MOST_STEPS, picker.steps)}
        ${picker.word === "hits" ? "" : slider("rotation", "rotate", 0, picker.steps - 1, picker.rotation)}
      </div></div>
      ${editable ? '<div class="ed-picker-actions"><button type="button" class="btn" data-action="steps">edit each step</button></div>' : ""}
      <p class="ed-picker-keys">it writes the code on your line · esc closes · ctrl+b to use the keyboard</p>`);
    pickerBox.hidden = false;
    if (focus) pickerBox.querySelector(`[data-ring="${focus}"]`)?.focus();
  }

  function slideRing(control) {
    state.sliding = true;
    const read = (name) => Number(pickerBox.querySelector(`[data-ring="${name}"]`)?.value ?? 0);
    const steps = read("steps");
    const change = applyRing(state.picker, { hits: read("hits"), steps, rotation: read("rotation") });
    writeQuietly(change);
    state.heldCaret = change.start + 1;
    state.picker = pickerAt(input.value, state.heldCaret) ?? state.picker;
    const { hits, rotation } = state.picker;
    // the other sliders' limits follow the steps; the page isn't rebuilt, so the slider stays in the hand
    const fit = (name, max, value) => {
      const el = pickerBox.querySelector(`[data-ring="${name}"]`);
      if (!el) return;
      el.max = max;
      if (el !== control) el.value = value;
      pickerBox.querySelector(`[data-ring-value="${name}"]`).textContent = value;
    };
    fit("hits", steps, hits);
    fit("rotation", steps - 1, rotation);
    pickerBox.querySelector('[data-ring-value="steps"]').textContent = steps;
    pickerBox.querySelector("[data-ring-drawing]").innerHTML = ringSvg(state.picker);
    pickerBox.querySelector("[data-ring-label]").textContent = ringLabel(state.picker);
    onSlide();
  }

  function drawSound(picker) {
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    const groups = picker.groups.map((group) => `<p class="ed-picker-title">${esc(group.title)}</p><div class="ed-sounds">${group.sounds.map((s) => `
      <button type="button" class="ed-sound${s.word === picker.current ? " on" : ""}" data-act="sound:${esc(s.word)}" aria-pressed="${s.word === picker.current}" tabindex="-1">
        <strong>${esc(s.word)}${s.fits ? ' <span class="ed-sound-fits">fits this style</span>' : ""}</strong><span>${esc(s.doc)}</span></button>`).join("")}</div>`).join("");
    const who = picker.thread ? `<strong>${esc(picker.thread)}</strong> plays` : "this plays";
    setPickerHtml(`<p class="ed-picker-title">${who} <code>${esc(picker.current)}</code>: click a sound to hear it and switch</p>${groups}
      <p class="ed-picker-keys">it writes the code on your line · esc closes · ctrl+b to use the keyboard</p>`);
    pickerBox.hidden = false;
    if (focus) pickerBox.querySelector(`[data-act="${focus}"]`)?.focus();
  }

  function chooseSound(word) {
    const picker = state.picker;
    if (picker?.kind !== "sound") return;
    const keyboard = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    const change = applySound(picker, word);
    replaceRange(change.start, change.end, change.text);
    input.setSelectionRange(change.start + 1, change.start + 1);   // stay in the word, so the picker stays open
    closeCard();
    onSlide();
    onSound(picker.thread, word);
    if (keyboard) pickerBox.querySelector(`[data-act="${keyboard}"]`)?.focus();
  }

  /* From a grid: go to this line's sound, adding one if it hasn't got one. */
  function goToSound() {
    const cursor = caret();
    const line = lineStartOf(cursor);
    const found = findSound(input.value, line);
    if (found) {
      input.focus();
      input.setSelectionRange(found.start + 1, found.start + 1);
    } else {
      const change = addSound(input.value, line);
      replaceRange(change.start, change.end, change.text);
      const inWord = change.start + change.text.indexOf(">") + 3;
      input.setSelectionRange(inWord, inWord);
      onSlide();
    }
    closeCard();
  }

  /* The bar being chosen: the one the caret is on, until a block is clicked. */
  function chordSlot(picker, cursor) {
    const line = lineStartOf(cursor);
    if (state.chordSlot?.line !== line) state.chordSlot = { line, index: slotAtColumn(picker, cursor - line) };
    state.chordSlot.index = Math.max(0, Math.min(picker.words.length - 1, state.chordSlot.index));
    return state.chordSlot.index;
  }

  function drawChords(picker, cursor) {
    const { words, options, progressions, key } = picker;
    const slot = chordSlot(picker, cursor);
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    const next = new Set(goodNext(words, slot, options).map((o) => o.degree));
    const blocks = words.map((word, i) => `<button type="button" class="ed-chord-bar${i === slot ? " on" : ""}" data-act="slot:${i}" aria-pressed="${i === slot}" aria-label="bar ${i + 1}: ${esc(nameOf(word, options))}" tabindex="-1">
      <span class="ed-chord-count">${i + 1}</span><strong>${esc(nameOf(word, options))}</strong><span>${esc(word)}</span></button>`).join("");
    const choices = options.map((o) => `<button type="button" class="ed-chord${next.has(o.degree) ? " next" : ""}" data-act="chord:${esc(o.word)}" tabindex="-1">
      <strong>${esc(o.name)}</strong><span>${esc(o.word)}</span></button>`).join("");
    const ready = progressions.slice(0, CHORD_PROGRESSIONS).map((p, i) => `<button type="button" class="ed-chord-prog" data-act="prog:${i}" tabindex="-1">
      <strong>${esc(p.names)}</strong><span>${esc(p.doc)}${p.fits ? " · fits this style" : ""}</span></button>`).join("");
    const keyName = `${key.root.toUpperCase()}${key.root.slice(1)} ${key.mode}`;
    setPickerHtml(`<p class="ed-picker-title">bars in <strong>${esc(keyName)}</strong>: pick a bar, then a chord</p>
      <div class="ed-chord-row">${blocks}
        <button type="button" class="ed-chord-add" data-act="add" tabindex="-1" aria-label="add a bar">+ bar</button>
        ${words.length > 1 ? `<button type="button" class="ed-chord-add" data-act="remove" tabindex="-1" aria-label="remove bar ${slot + 1}">− bar</button>` : ""}
      </div>
      <p class="ed-picker-title">chords in this key${next.size ? ' · <span class="ed-chord-next-key">usually comes next</span>' : ""}</p>
      <div class="ed-chord-row">${choices}</div>
      <p class="ed-picker-title">ready-made</p>
      <div class="ed-chord-progs">${ready}</div>
      <p class="ed-picker-keys">it writes the code on your line · esc closes · ctrl+b to use the keyboard</p>`);
    pickerBox.hidden = false;
    if (focus) pickerBox.querySelector(`[data-act="${focus}"]`)?.focus();
  }

  function writeChords(words) {
    const change = applyChords(state.picker, words);
    const keyboard = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    replaceRange(change.start, change.end, change.text);
    const end = change.start + change.text.length;
    input.setSelectionRange(end, end);
    closeCard();
    onSlide();
    if (keyboard) pickerBox.querySelector(`[data-act="${keyboard}"]`)?.focus();
  }

  function pickerAct(act) {
    const picker = state.picker;
    const [name, value] = act.split(":");
    if (name === "sound") return chooseSound(value);
    if (picker?.kind !== "chords") return;
    const cursor = input.selectionStart;
    const slot = chordSlot(picker, cursor);
    if (name === "slot") {
      state.chordSlot.index = Number(value);
      onChord(picker.words[Number(value)]);
      updatePicker();
    } else if (name === "chord") {
      onChord(value);
      state.chordSlot.index = picker.words.length === 0 ? 0 : Math.min(slot + 1, picker.words.length - 1);
      writeChords(setChord(picker.words, slot, value));
    } else if (name === "add") {
      const words = addBar(picker.words, picker.key);
      state.chordSlot.index = words.length - 1;
      onChord(words.at(-1));
      writeChords(words);
    } else if (name === "remove") {
      writeChords(removeBar(picker.words, slot));
    } else if (name === "prog") {
      const { words } = picker.progressions[Number(value)];
      state.chordSlot.index = 0;
      onChord(words[0]);
      writeChords(words);
    }
  }

  /* A melody grid made finer stays that way until the caret leaves the line. */
  function gridOptions(cursor) {
    const line = lineStartOf(cursor);
    if (state.finerGrid?.line !== line) state.finerGrid = null;
    return { minColumns: state.finerGrid?.columns ?? 0 };
  }

  function drawMelody(picker) {
    const { cells } = picker;
    const rows = rowsFor(cells, input.value);
    const focus = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.melody : null;
    const perBeat = cells.length % MELODY_BEATS === 0 ? cells.length / MELODY_BEATS : cells.length;
    const sounding = (column) => {
      for (let i = column; i >= 0; i--) if (Array.isArray(cells[i])) return cells[i];
      return [];
    };
    const body = rows.map((row, r) => {
      const buttons = cells.map((cell, c) => {
        const on = Array.isArray(cell) && cell.includes(row.step);
        const held = cell === "hold" && sounding(c).includes(row.step);
        const state_ = on ? " on" : held ? " held" : "";
        return `<button type="button" class="ed-melody-cell${state_}${c > 0 && c % perBeat === 0 ? " beat" : ""}" data-melody="${r}:${c}" data-step="${row.step}" data-column="${c}" aria-pressed="${on || held}" aria-label="${row.note}, step ${c + 1} of ${cells.length}" tabindex="-1"></button>`;
      }).join("");
      return `<div class="ed-melody-row${row.home ? " home" : ""}"><span class="ed-melody-note">${row.note}</span><span class="ed-melody-step">${row.step}</span>${buttons}</div>`;
    }).join("");
    setPickerHtml(`<p class="ed-picker-title"><strong>${esc(picker.name)}</strong>: click notes, drag right to hold them</p>
      <div class="ed-melody">${body}</div>
      <div class="ed-picker-actions"><button type="button" class="btn" data-action="finer">more steps</button>${picker.blank || picker.isVariable ? "" : '<button type="button" class="btn" data-action="sound">choose a sound</button>'}</div>
      <p class="ed-picker-keys">notes on the beat lock to the current chord (add &gt; free to turn that off) · esc closes · ctrl+b to use the keyboard</p>`);
    pickerBox.hidden = false;
    if (focus) pickerBox.querySelector(`[data-melody="${focus}"]`)?.focus();
  }

  /* Write the grid into the code, keeping the caret on the line it was on. */
  function writeMelody(cells) {
    const picker = state.picker;
    const cursor = input.selectionStart;
    const change = applyMelody(picker, cells);
    const growth = change.text.length - (change.end - change.start);
    const sameLine = picker.line.start === lineStartOf(cursor);
    const caretAt = !sameLine ? (change.start < cursor ? cursor + growth : cursor)   // editing the variable this line plays
      : picker.line.blank ? change.start + change.text.length
        : change.start + 1;
    const keyboard = pickerBox.contains(document.activeElement) ? document.activeElement.dataset.melody : null;
    replaceRange(change.start, change.end, change.text);
    input.setSelectionRange(caretAt, caretAt);
    closeCard();
    onSlide();
    if (keyboard) pickerBox.querySelector(`[data-melody="${keyboard}"]`)?.focus();
  }

  function clickMelody(step, column) {
    const picker = state.picker;
    if (picker?.kind !== "melody") return;
    const cells = toggleNote(picker.cells, step, column);
    state.melodyDrag = Array.isArray(cells[column]) && cells[column].includes(step) ? { column, last: column } : null;
    if (state.melodyDrag && !(Array.isArray(picker.cells[column]) && picker.cells[column].includes(step))) onPreview(step, picker);
    writeMelody(cells);
  }

  function dragMelody(column) {
    const drag = state.melodyDrag;
    const picker = state.picker;
    if (!drag || picker?.kind !== "melody" || column === drag.last) return;
    drag.last = column;
    writeMelody(holdNote(picker.cells, drag.column, column));
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
    if (e.target.dataset.ring) return slideRing(e.target);
    state.sliding = true;
    writeSliderValue(Number(e.target.value));
  });
  pickerBox.addEventListener("change", (e) => {
    if (!e.target.matches(".ed-picker-range")) return;
    state.sliding = false;
    if (e.target.dataset.ring) onRing(threadOfLine(input.value, lineStartOf(caret())));
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
    const soundButton = isBeat && !picker.blank ? '<div class="ed-picker-actions"><button type="button" class="btn" data-action="sound">choose a sound</button></div>' : "";
    setPickerHtml(`<p class="ed-picker-title">${title}</p><div class="ed-picker-cells">${groups}</div>${soundButton}
      <p class="ed-picker-keys">it writes the code on your line · ctrl+enter to hear it · esc closes · ctrl+b to use the keyboard</p>`);
    if (focus !== null && focus !== undefined) pickerBox.querySelector(`[data-cell="${focus}"]`)?.focus();
    pickerBox.hidden = false;
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
    if (e.target.matches(".ed-picker-range")) {
      state.sliding = true;   // nothing redraws while it's held: replacing it would drop it out of the hand
      return;                 // and it needs the mouse to itself
    }
    e.preventDefault();   // keep the caret in the editor
    const cell = e.target.closest("[data-cell]");
    if (cell) toggleCell(Number(cell.dataset.cell));
    const melody = e.target.closest("[data-melody]");
    if (melody) clickMelody(Number(melody.dataset.step), Number(melody.dataset.column));
    const act = e.target.closest("[data-act]");
    if (act) pickerAct(act.dataset.act);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "finer") makeFiner();
    else if (action === "sound") goToSound();
    else if (action === "steps") {
      input.focus();
      const start = state.picker.line.start;
      input.setSelectionRange(start + 1, start + 1);
      closeCard();
    }
    else if (action) finishSlider(action);
  });
  pickerBox.addEventListener("mouseover", (e) => {
    const melody = e.target.closest("[data-melody]");
    if (melody && e.buttons === 1) dragMelody(Number(melody.dataset.column));
  });
  document.addEventListener("mouseup", () => {
    state.melodyDrag = null;
    if (state.sliding) {
      state.sliding = false;
      updatePicker();
    }
  });

  function makeFiner() {
    const picker = state.picker;
    if (picker?.kind !== "melody" || picker.cells.length * 2 > MELODY_MOST_COLUMNS) return;
    const line = lineStartOf(input.selectionStart);
    state.finerGrid = { line, columns: picker.cells.length * 2 };
    updatePicker();
  }

  function actKey(e, act) {
    const all = [...pickerBox.querySelectorAll("[data-act]")];
    const at = all.indexOf(act);
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      all[(at + (forward ? 1 : all.length - 1)) % all.length].focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      pickerAct(act.dataset.act);
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.focus();
    }
  }

  function melodyKey(e, note) {
    const [r, c] = note.dataset.melody.split(":").map(Number);
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key];
      pickerBox.querySelector(`[data-melody="${r + dr}:${c + dc}"]`)?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      clickMelody(Number(note.dataset.step), Number(note.dataset.column));
      state.melodyDrag = null;
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.focus();
    }
  }

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
    state.pickerDismissed = lineStartOf(caret());
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
    const note = e.target.closest("[data-melody]");
    if (note) return melodyKey(e, note);
    const act = e.target.closest("[data-act]");
    if (act) return actKey(e, act);
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
      pickerBox.querySelector("[data-cell], [data-melody], [data-act], .ed-picker-range")?.focus();
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
    /** Where the bar has got to (0 to 1), or null when stopped: the ring's hand follows it. */
    setProgress(progress) {
      if (state.picker?.kind !== "euclid") return;
      const hand = pickerBox.querySelector(".ed-ring-hand");
      if (!hand) return;
      hand.toggleAttribute("hidden", progress === null);
      if (progress !== null) hand.setAttribute("transform", `rotate(${progress * 360} ${RING_CENTRE} ${RING_CENTRE})`);
    },
    /** Another panel changed the code: one undoable step, leaving the caret where it was and the editor unfocused. */
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
