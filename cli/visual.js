/* ============================================================
   cannoli — the visual pane
   Nothing but the picture. Two layers:
     the creature  drifts through the dotted sea, swells on every
                   kick and lets off a bubble for each note
     the beat      kicks send ripples out from it, each thread
                   pushes up its band of the tide along the bottom,
                   and the dots flash on every beat
   v cycles: both layers → creature only → beat only.
   Runs on its own too; it just drifts until the editor plays.
   ============================================================ */

import { renderVisualFrame } from "./visual-frame.js";
import { runPane } from "./ansi.js";
import { connect } from "./link.js";
import { paneTheme } from "../src/themes.js";
import { loadPrefs } from "./prefs.js";

const PULSE_DECAY_PER_S = 3.5;
const NOTE_LIFE_S = 2.5;
const BUSY_NOTES_PER_S = 14;    // this many notes a second counts as full energy
const RIPPLE_LIFE_S = 1.4;
const TIDE_PUSH = 0.55;         // how far one note lifts its thread's band
const TIDE_DECAY_PER_S = 3.2;
const LAYER_MODES = [
  { shark: true, beat: true },
  { shark: true, beat: false },
  { shark: false, beat: true },
];

export function visual(flags = {}) {
  const start = Date.now();
  const state = {
    themeName: flags.theme ?? loadPrefs().theme ?? "deep",
    pulse: 0, energy: 0, notes: [], ripples: [], tide: [],
    beat: null, mode: 0, lastFrame: Date.now(),
  };

  connect((msg) => {
    if (!flags.theme) state.themeName = msg.theme;
    const now = Date.now();
    state.tide = (msg.threads ?? []).map((_, i) => state.tide[i] ?? 0);
    for (const hit of msg.hits ?? []) {
      if (hit.drum === "kick" || hit.drum === "tom") {
        state.pulse = 1;
        state.ripples.push(now);
      }
      state.notes.push({ thread: hit.thread, born: now });
      if (hit.thread < state.tide.length) state.tide[hit.thread] = Math.min(1, state.tide[hit.thread] + TIDE_PUSH);
    }
    state.beat = msg.playing ? { progress: msg.progress, beats: msg.beats ?? 4 } : null;
  });

  runPane({
    fps: 20,
    render: ({ width, height }) => {
      const now = Date.now();
      const dt = (now - state.lastFrame) / 1000;
      state.lastFrame = now;
      state.pulse *= Math.exp(-PULSE_DECAY_PER_S * dt);
      state.tide = state.tide.map((level) => level * Math.exp(-TIDE_DECAY_PER_S * dt));
      state.notes = state.notes.filter((n) => (now - n.born) / 1000 <= NOTE_LIFE_S);
      state.ripples = state.ripples.filter((born) => (now - born) / 1000 < RIPPLE_LIFE_S);
      const recent = state.notes.filter((n) => now - n.born < 1000).length;
      state.energy += (Math.min(1, recent / BUSY_NOTES_PER_S) - state.energy) * Math.min(1, dt * 2);

      const beatPos = state.beat ? state.beat.progress * state.beat.beats : null;
      const th = paneTheme(state.themeName, "visual");
      const frame = renderVisualFrame({
        width,
        height,
        time: (now - start) / 1000,
        pulse: state.pulse,
        energy: state.energy,
        notes: state.notes.map((n) => ({ thread: n.thread, at: (now - n.born) / 1000 })),
        ripples: state.ripples.map((born) => (now - born) / 1000),
        tide: state.tide,
        beatPhase: beatPos === null ? undefined : beatPos % 1,
        downbeat: beatPos !== null && Math.floor(beatPos) === 0,
        layers: LAYER_MODES[state.mode],
        theme: th,
      });
      return { frame: frame.split("\n").join("\r\n"), cursor: null, theme: th };
    },
    onKey: (str) => {
      if (str === "q") process.kill(process.pid, "SIGTERM");
      if (str === "v") state.mode = (state.mode + 1) % LAYER_MODES.length;
    },
  });
}
