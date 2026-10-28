/* ============================================================
   cannoli — paint the whole terminal window
   The panes colour every cell they draw, but the terminal's own
   background still shows in the margins around them. This sets
   the window's background (and text and cursor colours) to the
   theme, and puts the originals back when the pane closes.

   macOS Terminal: via AppleScript, finding this pane's tab by
   its tty. Other terminals: the standard OSC 10/11/12 codes.
   ============================================================ */

import { execFileSync, spawn } from "node:child_process";
import { rgb } from "../src/themes.js";

const isAppleTerminal = process.env.TERM_PROGRAM === "Apple_Terminal";

export function windowPainter() {
  const tty = isAppleTerminal ? ttyName() : null;
  let current = null;
  let original = null;

  return {
    /** @param {import("../src/themes.js").Theme} th */
    paint(th) {
      if (th.bg === current) return;
      current = th.bg;
      if (tty) {
        original ??= readColors(tty);
        osascript(tabScript(tty, `set background color of t to ${appleColor(th.bg)}
          set normal text color of t to ${appleColor(th.ink)}
          set cursor color of t to ${appleColor(th.accent)}`));
      } else {
        process.stdout.write(`\x1b]11;${th.bg}\x07\x1b]10;${th.ink}\x07\x1b]12;${th.accent}\x07`);
      }
    },
    /** Put the window back the way it was. Synchronous, for exit handlers. */
    restore() {
      if (current === null) return;
      if (tty && original) {
        try {
          execFileSync("osascript", ["-e", tabScript(tty, `set background color of t to ${original.bg}
            set normal text color of t to ${original.text}
            set cursor color of t to ${original.cursor}`)], { stdio: "ignore", timeout: 2000 });
        } catch {
          // the window may already be closing
        }
      } else if (!tty) {
        process.stdout.write("\x1b]111\x07\x1b]110\x07\x1b]112\x07");
      }
    },
  };
}

function ttyName() {
  try {
    return execFileSync("tty", { stdio: ["inherit", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function readColors(tty) {
  try {
    const out = execFileSync("osascript", ["-e", tabScript(tty,
      "return ((background color of t) as string) & \"|\" & ((normal text color of t) as string) & \"|\" & ((cursor color of t) as string)")],
    { timeout: 2000 }).toString().trim();
    const [bg, text, cursor] = out.split("|").map((c) => `{${c}}`);
    return { bg, text, cursor };
  } catch {
    return null;
  }
}

/* Run `body` with `t` bound to this pane's Terminal tab. */
function tabScript(tty, body) {
  return `tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      if tty of t is "${tty}" then
        ${body}
      end if
    end repeat
  end repeat
end tell`;
}

function osascript(script) {
  const child = spawn("osascript", ["-e", script], { stdio: "ignore" });
  child.on("error", () => {});
}

/* AppleScript colours are 0–65535 per channel. */
function appleColor(hex) {
  return `{${rgb(hex).map((v) => v * 257).join(", ")}}`;
}
