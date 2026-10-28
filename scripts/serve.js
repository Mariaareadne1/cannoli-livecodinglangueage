#!/usr/bin/env node
/* ============================================================
   cannoli — serve the web app locally
   The app is plain files, but browsers only load its modules
   over http, so this serves the project folder.
     npm run web            http://localhost:5460
     npm run web -- 8080    another port
   ============================================================ */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2]) || 5460;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".cannoli": "text/plain",
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  });
}).on("error", (err) => {
  process.stderr.write(err.code === "EADDRINUSE"
    ? `port ${PORT} is already in use: try  npm run web -- ${PORT + 1}\n`
    : `couldn't start the server: ${err.message}\n`);
  process.exit(1);
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`cannoli is at http://localhost:${PORT}  (ctrl+c to stop)\n`);
});
