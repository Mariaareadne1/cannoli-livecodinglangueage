/* ============================================================
   cannoli — the editor pane
   A full-screen editor that also plays the music. Every other
   pane (guide, visual, threads) listens to this one.

     ctrl+s  play, or apply changes on the next bar (also saves)
     ctrl+t  stop at the end of the bar (twice: stop now)
     ctrl+f  apply the fix for the problem on this line
     tab     accept the suggestion, or indent
     while typing, a suggestion card pops up: ↑ ↓ choose, tab/enter insert, esc close,
     shift+tab writes out the whole line the card shows
     ctrl+e  choose a style (rave, house, funk, chill)
     ctrl+d  drum kit    ctrl+x  mixer (mute and effects)    ctrl+l  song timeline
     ctrl+g  next theme      ctrl+z / ctrl+y  undo / redo
     ctrl+q  save and quit
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { STYLES } from "../src/core/styles.js";
import { loadLanguage } from "./languages.js";
import { paneTheme, FAMILIES, FAMILY_NAMES, THEMES } from "../src/themes.js";
import * as B from "./buffer.js";
import { runPane, fg, bg, RESET, BOLD, ITALIC, fit } from "./ansi.js";
import { codeLine } from "./code-ansi.js";
import { startHub } from "./link.js";
import { buildPanel, perform } from "./panel/model.js";
import { layoutPanel, firstFocus, moveFocus, focused, hitTest, sliderValueAt, clampToStep, drawPanel } from "./panel/layout.js";
import { loadPrefs, savePrefs } from "./prefs.js";

const GUTTER = 6;
const CODE_TOP = 3;          // the screen row of the first line of code
const BROADCAST_MS = 60;
const MESSAGE_MS = 4000;
const UNDO_LIMIT = 200;
const CARD_ITEMS = 7;
const CARD_W = 46;
const PANEL_W = 78;
const PREVIEW_DEBOUNCE_MS = 140;
const PANEL_HINT = "click to choose · tab to use the keyboard · esc closes";
const PANEL_FOCUS_HINT = "arrows move · space chooses · esc leaves";
// ctrl+g cycles: the two families (each pane its own tone), then single tones for every pane
const THEME_CYCLE = [...FAMILY_NAMES, ...Object.keys(THEMES).filter((n) => !FAMILIES[n])];
const KEYS = "ctrl+s play · ctrl+t stop · ctrl+d drums · ctrl+x mixer · ctrl+l timeline · ctrl+b grid · ctrl+e style · ctrl+f fix · ctrl+g theme · ctrl+q quit";
const SONG_TOOLS = { l: "timeline", d: "kit", x: "mix" };   // the panels that belong to the whole song
const PAINTED_TOOLS = ["timeline", "kit"];
const NO_STYLE = "none";

export async function edit(file = "song.strudel", opts = {}) {
  const filePath = path.resolve(file);
  const initial = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  process.stdout.write("cannoli~ warming up…\n");
  const language = await loadLanguage(filePath);
  const { compile } = language;
  const state = {
    buf: B.fromText(initial),
    undo: [],
    redo: [],
    saved: true,
    themeName: opts.theme ?? loadPrefs().theme ?? "deep",
    scroll: { row: 0, col: 0 },
    result: compile(initial),
    runText: null,
    message: null,
    card: null,       // the suggestion card: { items, from, to, selected }
    panel: null,      // the tool under the cursor: { tool, view, focus, lines, box }
    dismissedLine: null,
    songTool: null,   // "timeline", "kit" or "mix" while one is open
    lastHit: 0,
    hits: [],
  };
  const engine = await language.makeEngine({ silent: Boolean(opts.silent) }).catch(() => null);
  const hub = startHub();
  let pane = null;

  /* ---------- editing ---------- */

  const text = () => B.toText(state.buf);

  function change(next) {
    if (B.toText(next) === text()) {
      state.buf = next;
      return;
    }
    state.undo = [...state.undo.slice(-UNDO_LIMIT), state.buf];
    state.redo = [];
    state.buf = next;
    state.saved = false;
    state.result = compile(text());
  }

  function say(textMsg, tone = "") {
    state.message = { text: textMsg, tone, until: Date.now() + MESSAGE_MS };
  }

  function problems() {
    const all = text();
    return [
      ...state.result.errors.map((e) => ({ ...plain(e), severity: "error" })),
      ...state.result.warnings.map((e) => ({ ...plain(e), severity: "warning" })),
    ].map((p) => ({ ...p, ...B.positionOf(all.split("\n"), p.start) }));
  }

  function suggestion() {
    const { settings } = state.result.program;
    const r = language.complete(text(), B.offsetOf(state.buf), { ...state.result.symbols, keyMode: settings.keys[0]?.mode, style: settings.style });
    return r.items.length ? { ...r, top: r.items[0] } : null;
  }

  function save() {
    try {
      fs.writeFileSync(filePath, text());
      state.saved = true;
    } catch (err) {
      say(`couldn't save: ${err.message}`, "bad");
    }
  }

  async function run() {
    save();
    const result = compile(text());
    state.result = result;
    if (result.errors.length) {
      say(`not playing yet: ${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} to fix${engine.playing ? " — the last version keeps playing" : ""}`, "bad");
      return;
    }
    if (!engine) {
      say("no sound device found — the panes still follow along", "bad");
      return;
    }
    state.runText = text();
    try {
      if (engine.playing) {
        await engine.update(result.program);
        say(language.updateMessage);
      } else {
        await engine.play(result.program);
        state.lastHit = engine.ctx.currentTime;
        say("playing");
      }
    } catch (err) {
      say(language.name === "strudel" ? err.message : `couldn't start the sound: ${err.message}`, "bad");
    }
  }

  function stop() {
    if (!engine?.playing) return;
    if (engine.stopping) {
      engine.stop({ now: true });
      say("stopped");
    } else {
      engine.stop();
      say("stopping at the end of the bar (ctrl+t again: now)");
    }
  }

  function fixLine() {
    const p = problems().find((x) => x.row === state.buf.row && x.fix);
    if (!p) return say("nothing to fix on this line");
    change(B.replaceRange(state.buf, p.fix.start, p.fix.end, p.fix.text));
    say(`fixed: ${p.fix.label}`);
  }

  function acceptSuggestion() {
    const s = suggestion();
    if (s && s.from < s.to) {
      change(B.replaceRange(state.buf, s.from, s.to, s.top.insert));
      return true;
    }
    return false;
  }

  /* The card follows typing: open it when there's something to suggest. */
  function refreshCard() {
    const s = suggestion();
    state.card = s ? { items: s.items.slice(0, CARD_ITEMS), from: s.from, to: s.to, lineEnd: s.lineEnd, selected: 0 } : null;
  }

  /* The style card: pick a style and it writes (or rewrites) the `style` line. */
  function openStyleCard() {
    const current = state.result.program.settings.style ?? NO_STYLE;
    const items = [...Object.entries(STYLES).map(([name, st]) => ({
      label: name, kind: `${st.tempo} bpm`, doc: st.doc, example: `style ${name}`, insert: name,
    })), { label: NO_STYLE, kind: "", doc: "no style: the neutral defaults", example: "", insert: NO_STYLE }];
    state.card = { kind: "style", items, from: B.offsetOf(state.buf), to: B.offsetOf(state.buf), selected: Math.max(0, items.findIndex((i) => i.label === current)) };
  }

  function setStyle(name) {
    const all = text();
    const edit = language.restyle(all, name);
    if (!edit) return say("no style line to remove");
    const next = B.replaceRange(state.buf, edit.start, edit.end, edit.text);
    // keep the cursor where it was, on the same text
    change({ ...next, ...B.positionOf(next.lines, Math.min(B.offsetOf(state.buf) + (next.lines.join("\n").length - all.length), next.lines.join("\n").length)) });
    if (engine?.playing) {
      run();
      say(name === NO_STYLE ? "style removed — lands on the next bar" : `style ${name}: ${STYLES[name].doc} — lands on the next bar`);
    } else {
      say(name === NO_STYLE ? "style removed" : `style ${name}: ${STYLES[name].doc} — ctrl+s to hear it`);
    }
  }

  function acceptCard({ whole = false } = {}) {
    if (state.card.kind === "style") {
      const pick = state.card.items[state.card.selected].insert;
      state.card = null;
      setStyle(pick);
      return;
    }
    const { items, from, to, lineEnd, selected } = state.card;
    const pick = items[selected];
    if (whole && pick.fill) {
      change(B.replaceRange(state.buf, from, lineEnd, pick.fill));
      state.card = null;
      return;
    }
    change(B.replaceRange(state.buf, from, to, pick.insert));
    state.card = null;
    if (items[selected].insert.endsWith(" ")) refreshCard();
  }

  /* ---------- the click-to-edit panel ---------- */

  function refreshPanel() {
    const old = state.panel;
    if (state.dismissedLine !== null && state.dismissedLine !== state.buf.row) state.dismissedLine = null;
    let tool = null;
    if (state.songTool === "timeline") tool = language.timeline(text(), old?.view?.extraBars ?? 0);
    else if (state.songTool) {
      const studio = language.studio(text());
      tool = { ...studio, kind: state.songTool, cursorPart: studio.partAt(B.offsetOf(state.buf)) };
    } else if (!state.card && state.dismissedLine === null) tool = language.toolAt(text(), B.offsetOf(state.buf), { minColumns: old?.view?.minColumns ?? 0 });
    if (!tool) {
      state.panel = null;
      pane?.setMouse(false);
      return;
    }
    const same = old?.tool.kind === tool.kind && old.row === state.buf.row;
    const panel = { tool, view: same ? old.view : {}, focus: same ? old.focus : null, row: state.buf.row, drag: same ? old.drag : null };
    state.panel = placed(panel);
    pane?.setMouse(true);
  }

  function placed(panel) {
    const width = Math.min(PANEL_W, Math.max(30, lastWidth - GUTTER));
    const lines = layoutPanel(buildPanel(panel.tool, panel.view), width);
    const keep = panel.focus && lines[panel.focus.line] ? panel.focus : panel.focus ? firstFocus(lines) : null;
    return { ...panel, lines, width, focus: keep };
  }

  /* Keep the caret where it was, relative to the text around it. */
  function applyEdit(edit) {
    const offset = B.offsetOf(state.buf);
    const growth = edit.text.length - (edit.end - edit.start);
    const caret = offset <= edit.start ? offset : offset >= edit.end ? offset + growth : Math.min(offset, edit.start + Math.max(0, edit.text.length - 1));
    const next = B.replaceRange(state.buf, edit.start, edit.end, edit.text);
    change({ ...next, ...B.positionOf(next.lines, caret) });
  }

  let previewTimer = null;
  /* Hear what was just changed: in the music while playing, otherwise a moment of that part. */
  function hearIt({ at = B.offsetOf(state.buf), quiet = false } = {}) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      if (!engine) return;
      const { errors, program } = compile(text());
      if (errors.length) return;
      if (engine.playing) {
        state.runText = text();
        await Promise.resolve(language.apply(engine, program)).catch((err) => say(err.message, "bad"));
      } else if (!quiet) {
        language.preview(engine, text(), at);
      }
    }, PREVIEW_DEBOUNCE_MS);
  }

  function act(id, extra) {
    const { tool, view } = state.panel;
    const result = perform(tool, id, view, extra);
    if (result.view) state.panel = { ...state.panel, view: result.view };
    if (result.close) {
      state.dismissedLine = state.buf.row;
      state.songTool = null;
    }
    if (result.change) {
      applyEdit(result.change);
      const isSongPart = tool.kind === "kit" || tool.kind === "mix";
      const { start, text: written } = result.change;
      hearIt({ quiet: result.quiet, at: isSongPart ? start + (written.startsWith("\n") ? 1 : 0) : undefined });
    }
    refreshPanel();
  }

  /* A press on whatever has the focus, or a nudge of a slider. */
  function pressFocus() {
    const target = focused(state.panel.lines, state.panel.focus);
    if (target && !target.min && target.id && !("value" in target)) act(target.alias ?? target.id);
  }

  function nudge(direction) {
    const slider = focused(state.panel.lines, state.panel.focus);
    act(slider.id, { value: clampToStep(slider, slider.value + direction * slider.step) });
  }

  function onPanelKey(str, key) {
    const k = key.name;
    const { lines, focus } = state.panel;
    const target = focused(lines, focus);
    if (k === "escape") {
      state.panel = { ...state.panel, focus: null };
    } else if ((k === "left" || k === "right") && target && "value" in target) {
      nudge(k === "right" ? 1 : -1);
    } else if (["up", "down", "left", "right"].includes(k)) {
      state.panel = { ...state.panel, focus: moveFocus(lines, focus, k) };
    } else if (k === "return" || k === "enter" || str === " ") {
      pressFocus();
    } else if ((str === "+" || str === "=") && target?.id?.startsWith("note:") && state.panel.tool.kind === "melody") {
      const column = Number(target.id.split(":")[2]);
      const from = state.panel.tool.cells.slice(0, column + 1).findLastIndex(Array.isArray);
      if (from >= 0) act(`hold:${column + 1}`, { from });
    }
  }

  function onMouse(key) {
    const panel = state.panel;
    if (!panel?.box) return;
    const line = key.row - CODE_TOP - panel.box.top + panel.box.scroll;
    const col = key.col - GUTTER - panel.box.left - 1;
    const inside = key.row >= CODE_TOP + panel.box.top && key.row < CODE_TOP + panel.box.top + panel.box.rows.length - 1 && col >= 0 && col < panel.width;
    if (key.release) {
      state.panel = { ...panel, drag: null };
      return;
    }
    if (!inside) {
      if (!key.drag) moveCaretTo(key);
      return;
    }
    const hit = hitTest(panel.lines, line, col);
    if (!hit) return;
    // a click leaves the keyboard with the code, so you can go straight back to typing
    if (panel.focus) state.panel = { ...panel, focus: { line: hit.line, index: hit.index } };
    if (hit.slider) return act(hit.slider.id, { value: sliderValueAt(hit.slider, col, panel.width) });
    const target = focused(panel.lines, hit);
    if (key.drag) return dragTo(target);
    const startsOn = target.on;
    state.panel = { ...state.panel, drag: { id: target.id, paint: !startsOn } };
    act(target.alias ?? target.id, PAINTED_TOOLS.includes(panel.tool.kind) ? { value: !startsOn } : undefined);
  }

  /* Dragging along a row: paint timeline bars, or hold a melody note. */
  function dragTo(target) {
    const { drag, tool } = state.panel;
    if (!drag || target.id === drag.last) return;
    const [kind, a, b] = target.id.split(":");
    const [, startA, startB] = drag.id.split(":");
    state.panel = { ...state.panel, drag: { ...drag, last: target.id } };
    if (tool.kind === "timeline" && kind === "bar" && a === startA) act(target.id, { value: drag.paint });
    if (tool.kind === "kit" && kind === "step" && a === startA) act(target.id, { value: drag.paint });
    if (tool.kind === "melody" && kind === "note" && a === startA && Number(b) > Number(startB)) act(`hold:${b}`, { from: Number(startB) });
  }

  function moveCaretTo(key) {
    const row = state.scroll.row + key.row - CODE_TOP;
    if (row < 0 || row >= state.buf.lines.length) return;
    const col = Math.max(0, Math.min(state.buf.lines[row].length, state.scroll.col + key.col - GUTTER - 1));
    state.buf = { ...state.buf, row, col };
    state.songTool = null;
    refreshPanel();
  }

  function quit() {
    save();
    engine?.stop({ now: true });
    setTimeout(() => {
      hub.close();
      engine?.ctx?.close?.();
      pane.exit(0);
    }, 300);
  }

  function onKey(str, key) {
    const k = key.name;
    if (k === "mouse") return onMouse(key);
    if (key.ctrl && k === "b") {
      if (state.panel) state.panel = { ...state.panel, focus: state.panel.focus ? null : firstFocus(state.panel.lines) };
      return;
    }
    if (key.ctrl && SONG_TOOLS[k]) {
      state.songTool = state.songTool === SONG_TOOLS[k] ? null : SONG_TOOLS[k];
      state.card = null;
      refreshPanel();
      if (state.panel && state.songTool) state.panel = { ...state.panel, focus: firstFocus(state.panel.lines) };
      return;
    }
    if (state.panel?.focus && !key.ctrl && !key.meta) return onPanelKey(str, key);
    if (k === "tab" && state.panel && !state.card) {
      state.panel = { ...state.panel, focus: firstFocus(state.panel.lines) };
      return;
    }
    if (k === "escape" && state.panel && !state.card) {
      state.dismissedLine = state.buf.row;
      state.songTool = null;
      refreshPanel();
      return;
    }
    if (key.ctrl) {
      const actions = {
        s: run, t: stop, f: fixLine, q: quit, e: openStyleCard,
        g: () => {
          state.themeName = THEME_CYCLE[(THEME_CYCLE.indexOf(state.themeName) + 1) % THEME_CYCLE.length];
          savePrefs({ theme: state.themeName });
          say(`theme: ${FAMILIES[state.themeName]?.label ?? `${THEMES[state.themeName].label} (every pane)`}`);
        },
        z: () => { if (state.undo.length) [state.redo, state.buf, state.undo] = [[...state.redo, state.buf], state.undo.at(-1), state.undo.slice(0, -1)]; state.result = compile(text()); },
        y: () => { if (state.redo.length) [state.undo, state.buf, state.redo] = [[...state.undo, state.buf], state.redo.at(-1), state.redo.slice(0, -1)]; state.result = compile(text()); },
      };
      actions[k]?.();
      refreshPanel();
      return;
    }
    if (key.meta) return;
    if (state.card) {
      const n = state.card.items.length;
      if (k === "up" || k === "down") {
        state.card = { ...state.card, selected: (state.card.selected + (k === "down" ? 1 : n - 1)) % n };
        return;
      }
      if (k === "shift-tab") { acceptCard({ whole: true }); refreshPanel(); return; }
      if (k === "tab" || k === "return" || k === "enter") { acceptCard(); refreshPanel(); return; }
      if (k === "escape") {
        state.card = null;
        refreshPanel();
        return;
      }
    }
    const typing = k === "backspace" || (str && !key.ctrl && [...str].every((c) => c >= " ") && !["return", "enter", "tab"].includes(k));
    const moves = { up: "up", down: "down", left: "left", right: "right" };
    if (moves[k]) state.buf = B.move(state.buf, moves[k]);
    else if (k === "home") state.buf = B.home(state.buf);
    else if (k === "end") state.buf = B.end(state.buf);
    else if (k === "pageup") state.buf = B.move(state.buf, "up", codeHeight() - 1);
    else if (k === "pagedown") state.buf = B.move(state.buf, "down", codeHeight() - 1);
    else if (k === "return" || k === "enter") change(B.newline(state.buf));
    else if (k === "backspace") change(B.backspace(state.buf));
    else if (k === "delete") change(B.deleteForward(state.buf));
    else if (k === "tab") {
      if (!acceptSuggestion()) change(B.insert(state.buf, "  "));
    } else if (str && !key.ctrl && [...str].every((c) => c >= " ")) {
      change(B.insert(state.buf, str));
      // typing "name:" on an indented line starts a new thread, so it moves back to the left edge
      const line = state.buf.lines[state.buf.row];
      if (str === ":" && /^\s+[A-Za-z]\w*:$/.test(line)) change(B.replaceRange(state.buf, B.offsetOf(state.buf) - line.length, B.offsetOf(state.buf), line.trimStart()));
    }
    if (typing) refreshCard();
    else state.card = null;
    refreshPanel();
  }

  /* ---------- drawing ---------- */

  let height = 24;
  let lastWidth = 100;
  const codeHeight = () => Math.max(1, height - 5);

  /* The tool's panel, as rows to lay over the code. */
  function panelBox(th, scroll) {
    const panel = state.panel;
    if (!panel) return null;
    const { rows, scroll: lineScroll } = drawPanel(panel.lines, panel.focus, th, panel.width, codeHeight(), panel.focus ? PANEL_FOCUS_HINT : PANEL_HINT);
    const below = state.buf.row - scroll.row + 1;
    // a song-wide panel sits at the bottom, so the code it rewrites stays in view
    const beside = below + rows.length <= codeHeight() ? below : Math.max(0, Math.min(codeHeight() - rows.length, below - 1 - rows.length));
    const top = state.songTool ? Math.max(0, codeHeight() - rows.length) : beside;
    const box = { rows, top, left: 0, width: panel.width, scroll: lineScroll, solid: true };
    state.panel = { ...panel, box };
    return box;
  }

  function render({ width, height: h }) {
    height = h;
    if (width !== lastWidth) {
      lastWidth = width;
      if (state.panel) state.panel = placed(state.panel);
    }
    const th = paneTheme(state.themeName, "edit");
    const all = text();
    const lines = state.buf.lines;
    const probs = problems();
    const codeW = width - GUTTER;
    // keep the cursor on screen
    const { buf, scroll } = state;
    if (buf.row < scroll.row) scroll.row = buf.row;
    if (buf.row >= scroll.row + codeHeight()) scroll.row = buf.row - codeHeight() + 1;
    if (buf.col < scroll.col) scroll.col = buf.col;
    if (buf.col >= scroll.col + codeW - 1) scroll.col = buf.col - codeW + 2;

    const active = soundingTokens(all);
    const classify = language.classifier(all);
    const card = panelBox(th, scroll) ?? cardBox(th, width, scroll);
    const out = [titleBar(th, width), rule(th, width)];
    let offset = lines.slice(0, scroll.row).reduce((n, l) => n + l.length + 1, 0);
    for (let i = 0; i < codeHeight(); i++) {
      const r = scroll.row + i;
      if (r >= lines.length) {
        const cardRow = card?.rows[i - card.top];
        const empty = (w) => `${bg(th.bg)}${fit("", Math.max(0, w))}${RESET}`;
        out.push(cardRow
          ? empty(GUTTER + card.left) + cardRow + empty(width - GUTTER - card.left - card.width)
          : empty(width));
        continue;
      }
      const lineProblems = probs.filter((p) => p.row === r);
      const gutter = gutterCell(th, r, lineProblems, r === buf.row);
      const lineOpts = { line: lines[r], offset, theme: th, symbols: state.result.symbols, problems: probs, active, classify };
      const cardRow = card?.rows[i - card.top];
      const code = all === "" && r === 0
        ? `${bg(th.bg)}${fg(th.faint)}${ITALIC}${fit(language.placeholder, codeW)}${RESET}`
        : cardRow
          ? codeLine({ ...lineOpts, colStart: scroll.col, width: card.left })
            + cardRow
            + (card.solid
              ? `${bg(th.bg)}${fit("", Math.max(0, codeW - card.left - card.width))}${RESET}`
              : codeLine({ ...lineOpts, colStart: scroll.col + card.left + card.width, width: codeW - card.left - card.width }))
          : codeLine({ ...lineOpts, colStart: scroll.col, width: codeW });
      out.push(gutter + code);
      offset += lines[r].length + 1;
    }
    out.push(rule(th, width), hintLine(th, width, probs), `${bg(th.bg)}${fg(th.faint)}${fit(` ${KEYS}`, width)}${RESET}`);
    return {
      frame: out.join("\r\n"),
      cursor: state.panel?.focus ? null : { row: CODE_TOP + buf.row - scroll.row, col: GUTTER + 1 + buf.col - scroll.col },
      theme: th,
    };
  }

  /* The suggestion card, as rows to lay over the code (positions in code-area cells). */
  function cardBox(th, width, scroll) {
    if (!state.card) return null;
    const { items, selected, from } = state.card;
    const codeW = width - GUTTER;
    const w = Math.min(CARD_W, codeW);
    const at = B.positionOf(state.buf.lines, from);
    const left = Math.max(0, Math.min(codeW - w, at.col - scroll.col));
    const below = state.buf.row - scroll.row + 1;
    const pick = items[selected];
    const body = [
      ...items.map((it, i) => {
        // a whole line to fill in needs the room; everything else shows its kind beside it
        const line = ` ${i === selected ? "▸" : " "} ${it.kind === "fill in" ? it.label : `${it.label.padEnd(14)} ${it.kind}`}`;
        return i === selected
          ? `${bg(th.raised)}${fg(th.ink)}${BOLD}${fit(line, w)}${RESET}`
          : `${bg(th.panel)}${fg(th.soft)}${fit(line, w)}${RESET}`;
      }),
      `${bg(th.panel)}${fg(th.line)}${"─".repeat(w)}${RESET}`,
      `${bg(th.panel)}${fg(th.dim)}${fit(` ${pick.doc}`, w)}${RESET}`,
      ...(pick.fill
        ? [`${bg(th.panel)}${fg(th.faint)}${fit(" whole line", w)}${RESET}`,
          ...wrap(pick.preview, w - 2).map((part) => `${bg(th.panel)} ${bg(th.raised)}${fg(th.accent)}${fit(part, w - 2)}${bg(th.panel)} ${RESET}`)]
        : pick.example ? [`${bg(th.panel)}${fg(th.faint)}${fit(` e.g. ${pick.example}`, w)}${RESET}`] : []),
      `${bg(th.panel)}${fg(th.faint)}${fit(pick.fill ? " tab word · shift+tab whole line · esc" : " ↑↓ choose · tab insert · esc close", w)}${RESET}`,
    ];
    // below the cursor if it fits, otherwise above
    const top = below + body.length <= codeHeight() ? below : Math.max(0, below - 1 - body.length);
    return { rows: body, top, left, width: w };
  }

  /* Cut text into pieces of at most n characters, breaking at spaces where it can. */
  function wrap(text, n) {
    const parts = [];
    let rest = text;
    while (rest.length > n) {
      const cut = rest.lastIndexOf(" ", n) > 0 ? rest.lastIndexOf(" ", n) : n;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    return [...parts, rest];
  }

  function titleBar(th, width) {
    const pos = engine?.position();
    const settings = state.result.program.settings;
    const name = `${path.basename(filePath)}${state.saved ? "" : " •"}`;
    const playing = engine?.playing;
    const wait = engine?.nextChangeIn;
    const bar = pos ? `bar ${pos.bar + 1}.${Math.floor(pos.progress * pos.program.settings.beats) + 1}` : "";
    const right = [
      settings.style ? settings.style : null,
      pos?.key ?? settings.keys[0]?.name,
      pos?.chord ? `chord ${pos.chord}` : null,
      bar || null,
      playing ? (engine.stopping ? "◼ stopping" : "▶ playing") : "◼ stopped",
      wait !== null && wait !== undefined ? `next in ${wait.toFixed(1)}s` : null,
    ].filter(Boolean).join("  ·  ");
    const left = ` cannoli`;
    const pad = Math.max(1, width - left.length - 1 - " editor  ".length - name.length - right.length - 1);
    return `${bg(th.panel)}${fg(th.ink)}${BOLD}${left}${fg(th.accent)}~${RESET}${bg(th.panel)}${fg(th.dim)} editor  ${fg(th.soft)}${name}`
      + `${" ".repeat(pad)}${fg(playing ? th.accent : th.dim)}${fit(right, Math.max(0, width - left.length - 1 - 9 - name.length - pad))}${RESET}`;
  }

  function gutterCell(th, r, lineProblems, isCursor) {
    const bad = lineProblems.some((p) => p.severity === "error");
    const warn = lineProblems.length && !bad;
    const color = bad ? th.error : warn ? th.warn : isCursor ? th.soft : th.faint;
    const mark = bad ? "●" : warn ? "○" : " ";
    return `${bg(th.bg)}${fg(color)}${String(r + 1).padStart(4)}${mark} ${RESET}`;
  }

  function hintLine(th, width, probs) {
    const msg = state.message && state.message.until > Date.now() ? state.message : null;
    if (msg) return `${bg(th.bg)}${fg(msg.tone === "bad" ? th.error : th.soft)}${fit(` ${msg.text}`, width)}${RESET}`;
    const here = probs.find((p) => p.row === state.buf.row);
    if (here) {
      const fix = here.fix ? `   ctrl+f: ${here.fix.label}` : "";
      return `${bg(th.bg)}${fg(here.severity === "error" ? th.error : th.warn)}${fit(` ${here.severity === "error" ? "✕" : "!"} ${here.message}${fix}`, width)}${RESET}`;
    }
    const s = state.panel ? null : suggestion();
    if (s) return `${bg(th.bg)}${fg(th.dim)}${fit(` tab ▸ ${s.top.label}  —  ${s.top.doc}`, width)}${RESET}`;
    if (probs.length) return `${bg(th.bg)}${fg(th.dim)}${fit(` ${probs.length} problem${probs.length === 1 ? "" : "s"} elsewhere — first on line ${probs[0].row + 1}`, width)}${RESET}`;
    return `${bg(th.bg)}${fit("", width)}${RESET}`;
  }

  function rule(th, width) {
    return `${bg(th.bg)}${fg(th.line)}${"─".repeat(width)}${RESET}`;
  }

  /* ---------- what's sounding, for highlights and the other panes ---------- */

  function barNotes(pos) {
    const held = engine.bars
      .filter((b) => b.bar < pos.bar)
      .flatMap((b) => b.notes.map((n) => ({ ...n, start: n.start - (pos.bar - b.bar) })))
      .filter((n) => n.start + n.dur > 0);
    return [...held, ...pos.notes].filter((n) => !n.echo);
  }

  function soundingTokens(all) {
    const pos = engine?.position();
    if (!pos || all !== state.runText) return new Set();
    return new Set(barNotes(pos)
      .filter((n) => pos.progress >= n.start && pos.progress < n.start + Math.max(n.dur, 0.06))
      .flatMap((n) => n.src.map((s) => s[0])));
  }

  function collectHits() {
    if (!engine?.playing) return;
    const now = engine.ctx.currentTime;
    for (const b of engine.bars) {
      for (const n of b.notes) {
        const t = b.time + n.start * b.seconds;
        if (t > state.lastHit && t <= now) state.hits.push({ thread: n.threadIndex, drum: n.drum, midi: n.midi[0] ?? null });
      }
    }
    state.lastHit = now;
  }

  function broadcast() {
    collectHits();
    if (hub.count === 0) {
      state.hits = [];
      return;
    }
    const pos = engine?.position();
    const settings = state.result.program.settings;
    hub.broadcast({
      theme: state.themeName,
      language: language.name,
      file: path.basename(filePath),
      text: text(),
      cursor: { row: state.buf.row, col: state.buf.col, offset: B.offsetOf(state.buf) },
      problems: problems().map((p) => ({ row: p.row, col: p.col, message: p.message, fix: p.fix?.label ?? null, severity: p.severity })),
      symbols: state.result.symbols,
      style: settings.style,
      keyMode: settings.keys[0]?.mode,
      key: pos?.key ?? settings.keys[0]?.name,
      chord: pos?.chord ?? null,
      tempo: settings.tempo,
      playing: Boolean(engine?.playing),
      bar: pos ? pos.bar + 1 : null,
      beats: pos?.program.settings.beats ?? settings.beats,
      progress: pos?.progress ?? 0,
      threads: (pos?.program ?? state.result.program).threads.map((t) => t.name),
      notes: pos ? barNotes(pos).map((n) => ({ thread: n.threadIndex, start: n.start, dur: n.dur, midi: n.midi, drum: n.drum })) : [],
      hits: state.hits,
    });
    state.hits = [];
  }

  setInterval(broadcast, BROADCAST_MS);
  pane = runPane({ fps: 20, render, onKey, onExit: () => hub.close() });
  refreshPanel();
  if (!engine) say("no sound device found — editing still works", "bad");
  else if (!initial) say(language.emptyMessage);
  else say(`opened ${path.basename(filePath)} — ctrl+s to play`);
}


function plain(err) {
  return { start: err.start, end: err.end, message: err.message, fix: err.fix };
}
