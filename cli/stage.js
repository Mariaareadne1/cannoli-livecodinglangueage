/* ============================================================
   cannoli — stage: open every pane side by side
   With tmux: one window split into panes. On a Mac without
   tmux: Terminal windows arranged across the screen, editor on
   the left. Otherwise: print the commands to run.

     ┌──────────────┬─────────┐
     │              │  guide  │
     │    editor    ├─────────┤
     │              │ visual  │
     │              ├─────────┤
     │              │ threads │  (with --threads)
     └──────────────┴─────────┘
   ============================================================ */

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cannoli.js", import.meta.url));
const EDITOR_SHARE = 0.56;

export async function stage(file = "song.cannoli", flags = {}) {
  const extra = flags.theme ? ` --theme=${flags.theme}` : "";
  const cmd = (pane) => `${shellQuote(process.execPath)} ${shellQuote(CLI)} ${pane}${extra}`;
  const panes = ["guide", "visual", ...(flags.threads ? ["threads"] : [])];
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

/** AppleScript that puts this window on the left and opens one window per pane, stacked on the right. */
export function terminalScript([left, top, right, bottom], paneCmds) {
  const split = Math.round(left + (right - left) * EDITOR_SHARE);
  const rowH = Math.round((bottom - top) / paneCmds.length);
  return [
    'tell application "Terminal"',
    "  set editorWindow to front window",
    `  set bounds of editorWindow to {${left}, ${top}, ${split}, ${bottom}}`,
    ...paneCmds.flatMap((c, i) => [
      `  do script ${appleQuote(c)}`,
      `  set bounds of front window to {${split}, ${top + i * rowH}, ${right}, ${top + (i + 1) * rowH}}`,
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
