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

  if (has("tmux")) return tmuxStage(editorCmd, panes.map(cmd));
  if (process.platform === "darwin") return terminalStage(file, panes.map(cmd));
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

async function terminalStage(file, paneCmds) {
  const [left, top, right, bottom] = screenBounds();
  const split = Math.round(left + (right - left) * EDITOR_SHARE);
  const rowH = Math.round((bottom - top) / paneCmds.length);
  const script = [
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
  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore" });
  } catch {
    printInstructions(`cannoli edit ${file}`, paneCmds);
    return;
  }
  // this window becomes the editor
  const { edit } = await import("./edit.js");
  await edit(file, {});
}

function screenBounds() {
  try {
    const out = execFileSync("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop']).toString();
    const [l, t, r, b] = out.split(",").map((n) => Number(n.trim()));
    return [l, Math.max(t, 25), r, b];
  } catch {
    return [0, 25, 1440, 900];
  }
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
