/* ============================================================
   cannoli — the guide pane
   Talks to you while you play: explains the line you're on,
   shows problems and fixes as you type, suggests what to try.
   Tab switches to the full reference (↑ ↓ to scroll).
   ============================================================ */

import { runPane, fg, bg, RESET, BOLD, fit } from "./ansi.js";
import { connect } from "./link.js";
import { assistant, reference, wrap } from "./guide-text.js";
import { theme as themeFor } from "../src/themes.js";
import { loadPrefs } from "./prefs.js";

export function guide(flags = {}) {
  const state = { msg: null, connected: false, mode: "assistant", scroll: 0 };
  connect((m) => { state.msg = m; }, (c) => { state.connected = c; });
  const ref = reference();

  runPane({
    fps: 10,
    render: ({ width, height }) => {
      const th = themeFor(flags.theme ?? state.msg?.theme ?? loadPrefs().theme);
      const tabs = state.mode === "assistant" ? "[assistant]  reference" : " assistant  [reference]";
      const title = `${bg(th.panel)}${fg(th.ink)}${BOLD} cannoli${fg(th.accent)}~${RESET}${bg(th.panel)}${fg(th.dim)}${fit(` guide   ${tabs}   tab switches`, width - 9)}${RESET}`;
      const rule = `${bg(th.bg)}${fg(th.line)}${"─".repeat(width)}${RESET}`;
      const body = height - 2;

      let lines;
      if (state.mode === "reference") lines = ref;
      else if (state.msg) lines = assistant(state.msg);
      else lines = [{ text: state.connected ? "" : "waiting for the editor…  (run: cannoli edit)", role: "dim" }];

      const wrapped = wrap(lines, width - 3);
      const maxScroll = Math.max(0, wrapped.length - body);
      state.scroll = state.mode === "reference" ? Math.min(state.scroll, maxScroll) : 0;
      const visible = wrapped.slice(state.scroll, state.scroll + body);
      const rows = visible.map(({ text, role }) => {
        const color = role === "head" ? th.dim : th[role] ?? th.ink;
        const style = role === "head" ? BOLD : "";
        return `${bg(th.bg)}${fg(color)}${style}${fit(`  ${role === "head" ? text.toUpperCase() : text}`, width)}${RESET}`;
      });
      while (rows.length < body) rows.push(`${bg(th.bg)}${fit("", width)}${RESET}`);
      return { frame: [title, rule, ...rows].join("\r\n"), cursor: null };
    },
    onKey: (str, key) => {
      if (str === "q") return process.kill(process.pid, "SIGTERM");
      if (key.name === "tab") {
        state.mode = state.mode === "assistant" ? "reference" : "assistant";
        state.scroll = 0;
      }
      const step = { up: -1, down: 1, pageup: -10, pagedown: 10 }[key.name];
      if (step) state.scroll = Math.max(0, state.scroll + step);
    },
  });
}
