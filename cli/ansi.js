/* ============================================================
   cannoli — terminal drawing helpers
   24-bit colour codes, screen control and a small "pane" that
   owns the whole terminal: alternate screen, raw keys, resize,
   a frame loop, and a clean exit.
   ============================================================ */

import readline from "node:readline";
import { rgb } from "../src/themes.js";

const CSI = "\x1b[";

export const RESET = `${CSI}0m`;
export const BOLD = `${CSI}1m`;
export const ITALIC = `${CSI}3m`;
export const UNDERLINE = `${CSI}4m`;

export function fg(hex) {
  const [r, g, b] = rgb(hex);
  return `${CSI}38;2;${r};${g};${b}m`;
}

export function bg(hex) {
  const [r, g, b] = rgb(hex);
  return `${CSI}48;2;${r};${g};${b}m`;
}

export const moveTo = (row, col) => `${CSI}${row};${col}H`;

const ANSI_RE = /\x1b\[[0-9;:?]*[A-Za-z]/g;
export const strip = (s) => s.replace(ANSI_RE, "");
export const visibleLength = (s) => [...strip(s)].length;

/** Plain text cut or padded to exactly `width` cells. */
export function fit(text, width) {
  const chars = [...text];
  if (chars.length <= width) return text + " ".repeat(width - chars.length);
  return chars.slice(0, Math.max(0, width - 1)).join("") + "…";
}

/** A full-width row: coloured text on a background, padded to the edge. */
export function row(text, width, { color, background, style = "" }) {
  return `${bg(background)}${fg(color)}${style}${fit(text, width)}${RESET}`;
}

/**
 * Take over the terminal for a full-screen pane.
 * @param {{ fps?: number, render: (size: { width: number, height: number }) => { frame: string, cursor?: { row: number, col: number } | null },
 *           onKey?: (str: string, key: object) => void, onExit?: () => void }} opts
 */
export function runPane({ fps = 15, render, onKey, onExit }) {
  const out = process.stdout;
  let last = "";
  let timer = null;

  const draw = () => {
    const width = out.columns || 80;
    const height = out.rows || 24;
    const { frame, cursor } = render({ width, height });
    const cursorCode = cursor ? `${moveTo(cursor.row, cursor.col)}${CSI}?25h` : `${CSI}?25l`;
    const next = `${CSI}?25l${moveTo(1, 1)}${frame}${cursorCode}`;
    if (next !== last) {
      out.write(next);
      last = next;
    }
  };

  const exit = (code = 0) => {
    clearInterval(timer);
    out.write(`${RESET}${CSI}?25h${CSI}?1049l`);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    onExit?.();
    process.exit(code);
  };

  out.write(`${CSI}?1049h${CSI}2J`);
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }
  process.stdin.on("keypress", (str, key = {}) => {
    if (key.ctrl && key.name === "c") return exit(0);
    onKey?.(str, key);
    draw();
  });
  out.on("resize", () => {
    last = "";
    out.write(`${CSI}2J`);
    draw();
  });
  process.on("SIGTERM", () => exit(0));
  timer = setInterval(draw, Math.round(1000 / fps));
  draw();
  return { exit, redraw: draw };
}
