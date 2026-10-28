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
    label: "deep · navy",
    dark: true,
    bg: "#050c1b", panel: "#09152b", raised: "#0f1f3d", line: "#16284c",
    ink: "#f4f8ff", soft: "#9fd4ff", dim: "#8593ad", faint: "#3b4b6b",
    accent: "#c4ecff", error: "#ff9fb2", warn: "#f3d9a4",
    threads: ["#ffffff", "#9fd4ff", "#6fb1e8", "#c5d2ea", "#8aa3cf", "#dfe9ff"],
    glow: { core: "#ffffff", mid: "#9fe4ff", edge: "#2b6aa8", dot: "#12284c" },
  },
  rose: {
    label: "rose · black",
    dark: true,
    bg: "#0d0709", panel: "#170b11", raised: "#22111a", line: "#3a1a2c",
    ink: "#fff4f8", soft: "#ffb3cf", dim: "#b88a9c", faint: "#5a3546",
    accent: "#ff5c9a", error: "#ff2f6d", warn: "#ffd6a0",
    threads: ["#fff4f8", "#ffb3cf", "#ff5c9a", "#ff8fb8", "#d9a3b8", "#ffd6e5"],
    glow: { core: "#ffffff", mid: "#ffb3cf", edge: "#b0245e", dot: "#2a1520" },
  },
  bubblegum: {
    label: "rose · light pink",
    dark: false,
    bg: "#ffe3ee", panel: "#ffd6e6", raised: "#ffc9dd", line: "#f2aac6",
    ink: "#1a0a12", soft: "#c2185b", dim: "#8a5a6e", faint: "#d99ab4",
    accent: "#e0005f", error: "#9b0035", warn: "#8a4b00",
    threads: ["#1a0a12", "#c2185b", "#e0457f", "#7a2a4a", "#ad3a6b", "#4a1a2e"],
    glow: { core: "#ffffff", mid: "#ff8fb8", edge: "#c2185b", dot: "#f4bcd1" },
  },
  "deep-black": {
    label: "deep · black",
    dark: true,
    bg: "#000000", panel: "#07090d", raised: "#10141c", line: "#1a2030",
    ink: "#ffffff", soft: "#9fd4ff", dim: "#8a93a6", faint: "#333a48",
    accent: "#ffffff", error: "#ff9fb2", warn: "#f3d9a4",
    threads: ["#ffffff", "#9fd4ff", "#6fb1e8", "#c5d2ea", "#8aa3cf", "#dfe9ff"],
    glow: { core: "#ffffff", mid: "#cfe9ff", edge: "#3a5f8f", dot: "#11151d" },
  },
  "deep-white": {
    label: "deep · white",
    dark: false,
    bg: "#f5f8fd", panel: "#e9eff8", raised: "#dce6f4", line: "#c9d6ea",
    ink: "#07142b", soft: "#1f5fbf", dim: "#5d6b85", faint: "#a8b6cc",
    accent: "#1f5fbf", error: "#c0264f", warn: "#8a5a00",
    threads: ["#07142b", "#1f5fbf", "#3f86e0", "#4a5d80", "#2a4a8a", "#0b2f6b"],
    glow: { core: "#07142b", mid: "#2f6fd1", edge: "#b9d3f5", dot: "#dbe5f3" },
  },
  "rose-berry": {
    label: "rose · berry",
    dark: true,
    bg: "#4a0a26", panel: "#560d2d", raised: "#651236", line: "#7a1c45",
    ink: "#ffffff", soft: "#ffc2da", dim: "#e09ab8", faint: "#8f3a60",
    accent: "#ffffff", error: "#ffcf70", warn: "#ffe0a8",
    threads: ["#ffffff", "#ffc2da", "#ff8fb8", "#ffe0ec", "#f7a1c4", "#ffd1e3"],
    glow: { core: "#ffffff", mid: "#ffc2da", edge: "#ff5c9a", dot: "#5e1232" },
  },
};

/* A family is one colour scheme in three tones. On stage each pane gets a tone,
   so the windows read as one set without all being the same. */
export const FAMILIES = {
  deep: {
    label: "deep · navy, black and white",
    panes: { edit: "deep", guide: "deep-white", reference: "deep-black", visual: "deep-black", threads: "deep-white" },
  },
  rose: {
    label: "rose · black, light pink and berry",
    panes: { edit: "rose", guide: "bubblegum", reference: "rose-berry", visual: "rose", threads: "bubblegum" },
  },
};
export const FAMILY_NAMES = Object.keys(FAMILIES);

/**
 * The theme a pane should use. `name` may be a family (each pane gets its own tone)
 * or a single theme (every pane uses it).
 */
export function paneTheme(name, pane) {
  if (FAMILIES[name]) return THEMES[FAMILIES[name].panes[pane]] ?? THEMES[FAMILIES[name].panes.edit];
  return theme(name);
}

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
