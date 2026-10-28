/* ============================================================
   cannoli — the visual pane
   Nothing but the creature: it drifts through the dotted sea,
   swells on every kick and lets off a bubble for each note.
   Runs on its own too; it just drifts until the editor plays.
   ============================================================ */

import { renderVisualFrame } from "./visual-frame.js";
import { runPane } from "./ansi.js";
import { connect } from "./link.js";
import { paneTheme } from "../src/themes.js";
import { loadPrefs } from "./prefs.js";

const PULSE_DECAY_PER_S = 3.5;
const NOTE_LIFE_S = 2.5;
const BUSY_NOTES_PER_S = 14;   // this many notes a second counts as full energy

export function visual(flags = {}) {
  const start = Date.now();
  const state = { themeName: flags.theme ?? loadPrefs().theme ?? "deep", pulse: 0, energy: 0, notes: [], lastFrame: Date.now() };

  connect((msg) => {
    if (!flags.theme) state.themeName = msg.theme;
    const now = Date.now();
    for (const hit of msg.hits ?? []) {
      if (hit.drum === "kick" || hit.drum === "tom") state.pulse = 1;
      state.notes.push({ thread: hit.thread, born: now });
    }
  });

  runPane({
    fps: 20,
    render: ({ width, height }) => {
      const now = Date.now();
      const dt = (now - state.lastFrame) / 1000;
      state.lastFrame = now;
      state.pulse *= Math.exp(-PULSE_DECAY_PER_S * dt);
      state.notes = state.notes.filter((n) => (now - n.born) / 1000 <= NOTE_LIFE_S);
      const recent = state.notes.filter((n) => now - n.born < 1000).length;
      state.energy += (Math.min(1, recent / BUSY_NOTES_PER_S) - state.energy) * Math.min(1, dt * 2);
      const th = paneTheme(state.themeName, "visual");
      const frame = renderVisualFrame({
        width,
        height,
        time: (now - start) / 1000,
        pulse: state.pulse,
        energy: state.energy,
        notes: state.notes.map((n) => ({ thread: n.thread, at: (now - n.born) / 1000 })),
        theme: th,
      });
      return { frame: frame.split("\n").join("\r\n"), cursor: null, theme: th };
    },
    onKey: (str) => {
      if (str === "q") process.kill(process.pid, "SIGTERM");
    },
  });
}
