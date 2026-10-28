/* cannoli — puts a theme from themes.js onto the page as CSS variables. */

import { theme as themeFor, DEFAULT_THEME } from "./themes.js";

const STORE = "cannoli-theme";

export function savedTheme() {
  try {
    return localStorage.getItem(STORE) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(name) {
  const t = themeFor(name);
  const vars = {
    "--bg": t.bg, "--bg-2": t.panel, "--bg-3": t.raised, "--line": t.line,
    "--ink": t.ink, "--soft": t.soft, "--ink-dim": t.dim, "--ink-faint": t.faint,
    "--accent": t.accent, "--ok": t.soft, "--err": t.error, "--warn": t.warn,
    ...Object.fromEntries(t.threads.map((c, i) => [`--t${i}`, c])),
  };
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.theme = name;
  root.style.colorScheme = t.dark ? "dark" : "light";
  try {
    localStorage.setItem(STORE, name);
  } catch {
    // private mode: the theme just won't be remembered
  }
}
