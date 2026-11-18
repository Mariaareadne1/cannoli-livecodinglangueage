/* ============================================================
   cannoli — the control center's helper
   Lets the web page open terminal windows on this computer. It
   only answers this computer's own pages, and it only runs the
   cannoli windows listed here, on songs in the songs folder.
   ============================================================ */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shellQuote, appleQuote } from "../cli/stage.js";

const CLI = fileURLToPath(new URL("../cli/cannoli.js", import.meta.url));
const PANES = ["stage", "edit", "guide", "reference", "visual", "threads"];
const NEEDS_SONG = new Set(["stage", "edit"]);
const LOOKS = ["", "plain", "deep", "rose"];
const SONG_RE = /\.(cannoli|strudel)$/;
const MAX_BODY_BYTES = 2048;
const MAX_OPENS_PER_MINUTE = 20;
const MINUTE_MS = 60_000;
const PERMISSION_HELP = "macOS blocked it. In System Settings > Privacy & Security > Automation, let the app running npm run web control Terminal, then try again.";

const send = (res, status, data, error = null) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ success: error === null, data, error }));
};

/** The songs the control center can open. */
export function listSongs(root) {
  try {
    return fs.readdirSync(path.join(root, "songs")).filter((name) => SONG_RE.test(name)).sort();
  } catch {
    return [];
  }
}

/** The full command for a window, or an error to show. */
export function commandFor(root, { pane, song, look }) {
  if (!PANES.includes(pane)) return { error: "That isn't one of the cannoli windows." };
  if (!LOOKS.includes(look ?? "")) return { error: "That isn't one of the looks." };
  if (NEEDS_SONG.has(pane) && !listSongs(root).includes(song)) return { error: "That song isn't in the songs folder." };
  const parts = [process.execPath, CLI, pane, ...(NEEDS_SONG.has(pane) ? [path.join(root, "songs", song)] : []), ...(pane === "stage" ? ["--all"] : []), ...(look ? [`--theme=${look}`] : [])];
  return { command: parts.map(shellQuote).join(" ") };
}

/* Open a new Terminal window running this command. */
function openInTerminal(command) {
  const script = `tell application "Terminal"\n  do script ${appleQuote(command)}\n  activate\nend tell`;
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 15000 }, (err) => (err ? reject(err) : resolve()));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) reject(new Error("too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * @param {{ root: string, port: number, platform?: string, open?: (command: string) => Promise<void> }} opts
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<boolean>}
 *          answers /api requests, and says whether it did
 */
export function controlApi({ root, port, platform = process.platform, open = openInTerminal }) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  let opens = [];

  return async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    if (!pathname.startsWith("/api/")) return false;
    // a website can point its own name at this address, so only this computer's names are answered
    if (!hosts.has(req.headers.host)) { send(res, 403, null, "This helper only answers this computer."); return true; }
    const canOpen = platform === "darwin";

    if (req.method === "GET" && pathname === "/api/control") {
      send(res, 200, { canOpen, songs: listSongs(root) });
      return true;
    }
    if (req.method !== "POST" || pathname !== "/api/open") { send(res, 404, null, "Not found."); return true; }

    // only the page served from here may open windows
    if (req.headers.origin !== `http://${req.headers.host}`) { send(res, 403, null, "Only the cannoli page can open windows."); return true; }
    if (!req.headers["content-type"]?.startsWith("application/json")) { send(res, 415, null, "Send JSON."); return true; }
    const now = Date.now();
    opens = opens.filter((t) => now - t < MINUTE_MS);
    if (opens.length >= MAX_OPENS_PER_MINUTE) { send(res, 429, null, "That's a lot of windows. Wait a minute and try again."); return true; }

    let request;
    try {
      request = JSON.parse(await readBody(req));
    } catch {
      send(res, 400, null, "That request couldn't be read.");
      return true;
    }
    const { command, error } = commandFor(root, request ?? {});
    if (error) { send(res, 400, null, error); return true; }
    opens = [...opens, now];
    if (!canOpen) { send(res, 200, { opened: false, command }); return true; }
    try {
      await open(command);
      send(res, 200, { opened: true, command });
    } catch {
      send(res, 500, { opened: false, command }, PERMISSION_HELP);
    }
    return true;
  };
}
