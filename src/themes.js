/* ============================================================
   cannoli — themes
   Three minimal palettes, shared by the web app (as CSS
   variables) and every terminal pane (as 24-bit colours).
   Each has a few roles rather than many colours:
     ink   main text        soft  the second text colour
     dim   quieter text     faint barely-there details
     accent  the one strong colour (">", the playhead, glows)
   ============================================================ */

/**
 * @typedef {{ label: string, dark: boolean, bg: string, panel: string, raised: string, line: string,
 *             ink: string, soft: string, dim: string, faint: string, accent: string,
 *             error: string, warn: string, threads: string[],
 *             glow: { core: string, mid: string, edge: string, dot: string } }} Theme
 * @type {Record<string, Theme>}
 */
export const THEMES = {
  deep: {
    label: "deep · navy, white, light blue",
    dark: true,
    bg: "#050c1b", panel: "#09152b", raised: "#0f1f3d", line: "#16284c",
    ink: "#f4f8ff", soft: "#9fd4ff", dim: "#8593ad", faint: "#3b4b6b",
    accent: "#c4ecff", error: "#ff9fb2", warn: "#f3d9a4",
    threads: ["#ffffff", "#9fd4ff", "#6fb1e8", "#c5d2ea", "#8aa3cf", "#dfe9ff"],
    glow: { core: "#ffffff", mid: "#9fe4ff", edge: "#2b6aa8", dot: "#12284c" },
  },
  rose: {
    label: "rose · black, pinks, white",
    dark: true,
    bg: "#0d0709", panel: "#170b11", raised: "#22111a", line: "#3a1a2c",
    ink: "#fff4f8", soft: "#ffb3cf", dim: "#b88a9c", faint: "#5a3546",
    accent: "#ff5c9a", error: "#ff2f6d", warn: "#ffd6a0",
    threads: ["#fff4f8", "#ffb3cf", "#ff5c9a", "#ff8fb8", "#d9a3b8", "#ffd6e5"],
    glow: { core: "#ffffff", mid: "#ffb3cf", edge: "#b0245e", dot: "#2a1520" },
  },
  bubblegum: {
    label: "bubblegum · light pink, dark pink, black",
    dark: false,
    bg: "#ffe3ee", panel: "#ffd6e6", raised: "#ffc9dd", line: "#f2aac6",
    ink: "#1a0a12", soft: "#c2185b", dim: "#8a5a6e", faint: "#d99ab4",
    accent: "#e0005f", error: "#9b0035", warn: "#8a4b00",
    threads: ["#1a0a12", "#c2185b", "#e0457f", "#7a2a4a", "#ad3a6b", "#4a1a2e"],
    glow: { core: "#ffffff", mid: "#ff8fb8", edge: "#c2185b", dot: "#f4bcd1" },
  },
};

export const THEME_NAMES = Object.keys(THEMES);
export const DEFAULT_THEME = "deep";

export function theme(name) {
  return THEMES[name] ?? THEMES[DEFAULT_THEME];
}

/** "#9fd4ff" → [159, 212, 255] */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two hex colours, t = 0 → a, 1 → b. */
export function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
