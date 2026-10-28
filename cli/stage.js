/* ============================================================
   cannoli — stage: open every pane side by side
   With tmux: one window split into panes. On a Mac without
   tmux: Terminal windows arranged across the screen, editor on
   the left. Otherwise: print the commands to run.

     ┌──────────────┬─────────┐        --all: five panes
     │              │  guide  │        ┌──────────┬─────────┬─────────┐
     │    editor    ├─────────┤        │          │  guide  │ visual  │
     │              │ visual  │        │  editor  ├─────────┼─────────┤
     │              ├─────────┤        │          │reference│ threads │
     │              │ threads │        └──────────┴─────────┴─────────┘
     └──────────────┴─────────┘
   ============================================================ */

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cannoli.js", import.meta.url));
const EDITOR_SHARE = 0.56;          // editor width with up to three panes beside it
const EDITOR_SHARE_GRID = 0.42;     // …and with four, in a 2 × 2 grid

export async function stage(file = "song.cannoli", flags = {}) {
  const extra = flags.theme ? ` --theme=${flags.theme}` : "";
  const cmd = (pane) => `${shellQuote(process.execPath)} ${shellQuote(CLI)} ${pane}${extra}`;
  const panes = flags.all
    ? ["guide", "visual", "reference", "threads"]
    : ["guide", ...(flags.reference ? ["reference"] : []), "visual", ...(flags.threads ? ["threads"] : [])];
  const editorCmd = `${cmd("edit")} ${shellQuote(path.resolve(file))}`;

  if (flags.dry) {
    process.stdout.write(`${terminalScript(screenBounds(), panes.map(cmd))}\n\nthen this window runs:\n  ${editorCmd}\n`);
    return;
  }
  if (has("tmux")) return tmuxStage(editorCmd, panes.map(cmd));
  if (process.platform === "darwin") return terminalStage(file, panes.map(cmd), flags);
  printInstructions(editorCmd, panes.map(cmd));
}

/* ---------- tmux ---------- */

function tmuxStage(editorCmd, paneCmds) {
  const session = `cannoli-${process.pid}`;
  const t = (...args) => execFileSync("tmux", args, { stdio: "ignore" });
  t("new-session", "-d", "-s", session, editorCmd);
  t("split-window", "-h", "-t", session, "-p", String(Math.round((1 - EDITOR_SHARE) * 100)), paneCmds[0]);
  paneCmds.slice(1).forEach((c, i) => t("split-window", "-v", "-t", `${session}:0.${i + 1}`, c));
  t("select-pane", "-t", `${session}:0.0`);
  spawnSync("tmux", ["attach", "-t", session], { stdio: "inherit" });
}

/* ---------- macOS Terminal windows ---------- */

async function terminalStage(file, paneCmds, flags) {
  try {
    execFileSync("osascript", ["-e", terminalScript(screenBounds(), paneCmds)], { stdio: "ignore" });
  } catch {
    printInstructions(`cannoli edit ${file}`, paneCmds);
    return;
  }
  // this window becomes the editor
  const { edit } = await import("./edit.js");
  await edit(file, flags);
}

/**
 * Where each window goes: [editor, ...panes] as {left, top, right, bottom}.
 * Up to three panes stack on the right; four make a 2 × 2 grid.
 */
export function layout([left, top, right, bottom], paneCount) {
  const grid = paneCount === 4;
  const split = Math.round(left + (right - left) * (grid ? EDITOR_SHARE_GRID : EDITOR_SHARE));
  const editor = { left, top, right: split, bottom };
  if (grid) {
    const mid = Math.round((split + right) / 2);
    const half = Math.round((top + bottom) / 2);
    // guide, visual, reference, threads → top-middle, top-right, bottom-middle, bottom-right
    return [editor,
      { left: split, top, right: mid, bottom: half }, { left: mid, top, right, bottom: half },
      { left: split, top: half, right: mid, bottom }, { left: mid, top: half, right, bottom }];
  }
  const rowH = Math.round((bottom - top) / Math.max(1, paneCount));
  return [editor, ...Array.from({ length: paneCount }, (_, i) => ({ left: split, top: top + i * rowH, right, bottom: top + (i + 1) * rowH }))];
}

/** AppleScript that puts this window on the left and opens a window per pane around it. */
export function terminalScript(bounds, paneCmds) {
  const [editor, ...rects] = layout(bounds, paneCmds.length);
  const box = (r) => `{${r.left}, ${r.top}, ${r.right}, ${r.bottom}}`;
  return [
    'tell application "Terminal"',
    "  set editorWindow to front window",
    `  set bounds of editorWindow to ${box(editor)}`,
    ...paneCmds.flatMap((c, i) => [
      `  do script ${appleQuote(c)}`,
      `  set bounds of front window to ${box(rects[i])}`,
    ]),
    "  set index of editorWindow to 1",
    "  activate",
    "end tell",
  ].join("\n");
}

/* The usable screen area (below the menu bar), read directly so Finder doesn't need permission. */
function screenBounds() {
  const jxa = 'ObjC.import("AppKit"); const f = $.NSScreen.mainScreen.visibleFrame; const full = $.NSScreen.mainScreen.frame;'
    + ' [f.origin.x, full.size.height - f.origin.y - f.size.height, f.origin.x + f.size.width, full.size.height - f.origin.y].join(",")';
  try {
    const [l, t, r, b] = execFileSync("osascript", ["-l", "JavaScript", "-e", jxa]).toString().split(",").map(Number);
    if ([l, t, r, b].every(Number.isFinite)) return [l, t, r, b];
  } catch {
    // fall through to a safe default
  }
  return [0, 25, 1440, 900];
}

/* ---------- anywhere else ---------- */

function printInstructions(editorCmd, paneCmds) {
  process.stdout.write(`Open a terminal for each pane and run:\n\n  ${editorCmd}\n${paneCmds.map((c) => `  ${c}`).join("\n")}\n\n`
    + "Start them in any order — the panes connect to the editor by themselves.\n");
}

function has(bin) {
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0;
}

function shellQuote(s) {
  return /^[\w./=-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

function appleQuote(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
