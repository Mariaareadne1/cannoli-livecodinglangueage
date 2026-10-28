/* ============================================================
   cannoli — the threads pane
   The plain beat grid: one row per thread, the current bar
   across the width, a playhead sweeping through it.
   ============================================================ */

import { runPane, fg, bg, RESET, BOLD, fit } from "./ansi.js";
import { connect } from "./link.js";
import { theme as themeFor } from "../src/themes.js";
import { loadPrefs } from "./prefs.js";

const NAME_W = 10;

export function threads(flags = {}) {
  let msg = null;
  let connected = false;
  connect((m) => { msg = m; }, (c) => { connected = c; });

  runPane({
    fps: 20,
    render: ({ width, height }) => {
      const th = themeFor(flags.theme ?? msg?.theme ?? loadPrefs().theme);
      const blank = `${bg(th.bg)}${fit("", width)}${RESET}`;
      const title = msg?.bar
        ? `bar ${msg.bar}  ·  chord ${msg.chord ?? "—"}  ·  ${msg.key ?? ""}`
        : connected ? "stopped — ctrl+s in the editor" : "waiting for the editor…";
      const lines = [
        `${bg(th.panel)}${fg(th.ink)}${BOLD} cannoli${fg(th.accent)}~${RESET}${bg(th.panel)}${fg(th.dim)}${fit(` threads   ${title}`, width - 9)}${RESET}`,
        blank,
      ];
      const lane = Math.max(4, width - NAME_W - 2);
      const beats = msg?.beats ?? 4;
      const head = Math.floor((msg?.progress ?? 0) * lane);
      (msg?.threads ?? []).forEach((name, i) => {
        const color = th.threads[i % th.threads.length];
        const cells = Array.from({ length: lane }, (_, c) => ({ ch: c % Math.round(lane / beats) === 0 ? "┆" : "·", color: th.faint }));
        for (const n of msg.notes.filter((x) => x.thread === i)) {
          const from = Math.max(0, Math.floor(n.start * lane));
          const to = Math.min(lane, Math.max(from + 1, Math.floor((n.start + (n.drum ? 0.03 : n.dur)) * lane)));
          const on = msg.progress >= n.start && msg.progress < n.start + Math.max(n.dur, 0.05);
          for (let c = from; c < to; c++) cells[c] = { ch: n.drum ? "█" : c === from ? "▐" : "█", color: on ? color : mixDim(th, color) };
        }
        if (msg.playing && head < lane) cells[head] = { ch: cells[head].ch === "·" || cells[head].ch === "┆" ? "│" : cells[head].ch, color: th.accent };
        let row = `${bg(th.bg)}${fg(color)}${BOLD}${fit(` ${name}`, NAME_W)}${RESET}${bg(th.bg)} `;
        let prev = "";
        for (const cell of cells) {
          if (cell.color !== prev) { row += fg(cell.color); prev = cell.color; }
          row += cell.ch;
        }
        lines.push(`${row} ${RESET}`, blank);
      });
      while (lines.length < height) lines.push(blank);
      return { frame: lines.slice(0, height).join("\r\n"), cursor: null };
    },
    onKey: (str) => {
      if (str === "q") process.kill(process.pid, "SIGTERM");
    },
  });
}

function mixDim(th, color) {
  return th.dark ? th.dim : color;
}
