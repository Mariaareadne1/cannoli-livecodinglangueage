/* ============================================================
   cannoli — the link between terminal panes
   The editor pane runs a tiny local server; the guide, visual
   and threads panes connect to it and receive the editor's
   state as one JSON message per line. Panes can start in any
   order: they keep retrying until the editor is up.
   ============================================================ */

import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const SOCKET = path.join(os.tmpdir(), "cannoli.sock");
const RETRY_MS = 1000;

/** Start the hub. Returns broadcast(message) and how many panes are listening. */
export function startHub(onClientCount = () => {}) {
  const clients = new Set();
  if (fs.existsSync(SOCKET)) fs.unlinkSync(SOCKET); // a leftover from a closed editor
  const server = net.createServer((socket) => {
    clients.add(socket);
    onClientCount(clients.size);
    const drop = () => {
      clients.delete(socket);
      onClientCount(clients.size);
    };
    socket.on("close", drop);
    socket.on("error", drop);
  });
  server.on("error", (err) => {
    process.stderr.write(`cannoli: the pane link couldn't start (${err.message}); the other panes won't update.\n`);
  });
  server.listen(SOCKET);
  return {
    broadcast(message) {
      if (clients.size === 0) return;
      const line = `${JSON.stringify(message)}\n`;
      clients.forEach((c) => c.write(line));
    },
    get count() {
      return clients.size;
    },
    close() {
      clients.forEach((c) => c.destroy());
      server.close();
      if (fs.existsSync(SOCKET)) fs.unlinkSync(SOCKET);
    },
  };
}

/**
 * Connect to the editor, retrying until it's there.
 * @param {(message: object) => void} onMessage
 * @param {(connected: boolean) => void} [onStatus]
 */
export function connect(onMessage, onStatus = () => {}) {
  let buffered = "";
  const attempt = () => {
    const socket = net.createConnection(SOCKET);
    socket.on("connect", () => onStatus(true));
    socket.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop();
      // only the newest state matters
      const last = lines.filter(Boolean).at(-1);
      if (!last) return;
      try {
        onMessage(JSON.parse(last));
      } catch {
        // a torn message; the next one will arrive in a moment
      }
    });
    const retry = () => {
      onStatus(false);
      buffered = "";
      setTimeout(attempt, RETRY_MS);
    };
    socket.on("error", () => {});
    socket.on("close", retry);
  };
  attempt();
}
