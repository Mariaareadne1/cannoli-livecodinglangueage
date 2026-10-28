/* ============================================================
   cannoli — the editor pane
   A full-screen editor that also plays the music. Every other
   pane (guide, visual, threads) listens to this one.

     ctrl+s  play, or apply changes on the next bar (also saves)
     ctrl+t  stop at the end of the bar (twice: stop now)
     ctrl+f  apply the fix for the problem on this line
     tab     accept the suggestion, or indent
     while typing, a suggestion card pops up: ↑ ↓ choose, tab/enter insert, esc close
     ctrl+g  next theme      ctrl+z / ctrl+y  undo / redo
     ctrl+q  save and quit
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { compile } from "../src/lang/compile.js";
import { complete } from "../src/editor/complete.js";
import { Engine } from "../src/audio/engine.js";
import { theme as themeFor, THEME_NAMES } from "../src/themes.js";
import * as B from "./buffer.js";
import { runPane, fg, bg, RESET, BOLD, ITALIC, fit } from "./ansi.js";
import { codeLine } from "./code-ansi.js";
import { startHub } from "./link.js";
import { loadPrefs, savePrefs } from "./prefs.js";

const GUTTER = 6;
const BROADCAST_MS = 60;
const MESSAGE_MS = 4000;
const UNDO_LIMIT = 200;
const CARD_ITEMS = 7;
const CARD_W = 46;
const PLACEHOLDER = "start typing — e.g.  kick: beat fourfloor > kick      ctrl+s plays";
const KEYS = "ctrl+s play · ctrl+t stop · ctrl+f fix · tab suggest · ctrl+g theme · ctrl+z undo · ctrl+q quit";

export async function edit(file = "song.cannoli", opts = {}) {
  const filePath = path.resolve(file);
  const initial = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
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
    lastHit: 0,
    hits: [],
  };
  const engine = await makeEngine();
  const hub = startHub();

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
    const r = complete(text(), B.offsetOf(state.buf), { ...state.result.symbols, keyMode: settings.keys[0]?.mode, style: settings.style });
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
        engine.update(result.program);
        say("changes land on the next bar");
      } else {
        await engine.play(result.program);
        state.lastHit = engine.ctx.currentTime;
        say("playing");
      }
    } catch (err) {
      say(`couldn't start the sound: ${err.message}`, "bad");
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
    state.card = s ? { items: s.items.slice(0, CARD_ITEMS), from: s.from, to: s.to, selected: 0 } : null;
  }

  function acceptCard() {
    const { items, from, to, selected } = state.card;
    change(B.replaceRange(state.buf, from, to, items[selected].insert));
    state.card = null;
    if (items[selected].insert.endsWith(" ")) refreshCard();
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
    if (key.ctrl) {
      const actions = {
        s: run, t: stop, f: fixLine, q: quit,
        g: () => {
          state.themeName = THEME_NAMES[(THEME_NAMES.indexOf(state.themeName) + 1) % THEME_NAMES.length];
          savePrefs({ theme: state.themeName });
          say(`theme: ${themeFor(state.themeName).label}`);
        },
        z: () => { if (state.undo.length) [state.redo, state.buf, state.undo] = [[...state.redo, state.buf], state.undo.at(-1), state.undo.slice(0, -1)]; state.result = compile(text()); },
        y: () => { if (state.redo.length) [state.undo, state.buf, state.redo] = [[...state.undo, state.buf], state.redo.at(-1), state.redo.slice(0, -1)]; state.result = compile(text()); },
      };
      actions[k]?.();
      return;
    }
    if (key.meta) return;
    if (state.card) {
      const n = state.card.items.length;
      if (k === "up" || k === "down") {
        state.card = { ...state.card, selected: (state.card.selected + (k === "down" ? 1 : n - 1)) % n };
        return;
      }
      if (k === "tab" || k === "return" || k === "enter") return acceptCard();
      if (k === "escape") {
        state.card = null;
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
    } else if (str && !key.ctrl && [...str].every((c) => c >= " ")) change(B.insert(state.buf, str));
    if (typing) refreshCard();
    else state.card = null;
  }

  /* ---------- drawing ---------- */

  let height = 24;
  const codeHeight = () => Math.max(1, height - 5);

  function render({ width, height: h }) {
    height = h;
    const th = themeFor(state.themeName);
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
    const card = cardBox(th, width, scroll);
    const out = [titleBar(th, width), rule(th, width)];
    let offset = lines.slice(0, scroll.row).reduce((n, l) => n + l.length + 1, 0);
    for (let i = 0; i < codeHeight(); i++) {
      const r = scroll.row + i;
      if (r >= lines.length) {
        out.push(`${bg(th.bg)}${fg(th.faint)}${fit("", width)}${RESET}`);
        continue;
      }
      const lineProblems = probs.filter((p) => p.row === r);
      const gutter = gutterCell(th, r, lineProblems, r === buf.row);
      const lineOpts = { line: lines[r], offset, theme: th, symbols: state.result.symbols, problems: probs, active };
      const cardRow = card?.rows[i - card.top];
      const code = all === "" && r === 0
        ? `${bg(th.bg)}${fg(th.faint)}${ITALIC}${fit(PLACEHOLDER, codeW)}${RESET}`
        : cardRow
          ? codeLine({ ...lineOpts, colStart: scroll.col, width: card.left })
            + cardRow
            + codeLine({ ...lineOpts, colStart: scroll.col + card.left + card.width, width: codeW - card.left - card.width })
          : codeLine({ ...lineOpts, colStart: scroll.col, width: codeW });
      out.push(gutter + code);
      offset += lines[r].length + 1;
    }
    out.push(rule(th, width), hintLine(th, width, probs), `${bg(th.bg)}${fg(th.faint)}${fit(` ${KEYS}`, width)}${RESET}`);
    return {
      frame: out.join("\r\n"),
      cursor: { row: 3 + buf.row - scroll.row, col: GUTTER + 1 + buf.col - scroll.col },
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
        const line = ` ${i === selected ? "▸" : " "} ${it.label.padEnd(14)} ${it.kind}`;
        return i === selected
          ? `${bg(th.raised)}${fg(th.ink)}${BOLD}${fit(line, w)}${RESET}`
          : `${bg(th.panel)}${fg(th.soft)}${fit(line, w)}${RESET}`;
      }),
      `${bg(th.panel)}${fg(th.line)}${"─".repeat(w)}${RESET}`,
      `${bg(th.panel)}${fg(th.dim)}${fit(` ${pick.doc}`, w)}${RESET}`,
      ...(pick.example ? [`${bg(th.panel)}${fg(th.faint)}${fit(` e.g. ${pick.example}`, w)}${RESET}`] : []),
      `${bg(th.panel)}${fg(th.faint)}${fit(" ↑↓ choose · tab insert · esc close", w)}${RESET}`,
    ];
    // below the cursor if it fits, otherwise above
    const top = below + body.length <= codeHeight() ? below : Math.max(0, below - 1 - body.length);
    return { rows: body, top, left, width: w };
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
      pos ? `chord ${pos.chord}` : null,
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
    const s = suggestion();
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
  const pane = runPane({ fps: 20, render, onKey, onExit: () => hub.close() });
  if (!engine) say("no sound device found — editing still works", "bad");
  else if (!initial) say("an empty page: type a thread, then ctrl+s");
  else say(`opened ${path.basename(filePath)} — ctrl+s to play`);
}

async function makeEngine() {
  try {
    const { AudioContext } = await import("node-web-audio-api");
    return new Engine({ AudioContext });
  } catch {
    return null;
  }
}

function plain(err) {
  return { start: err.start, end: err.end, message: err.message, fix: err.fix };
}
