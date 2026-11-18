import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { controlApi, commandFor, listSongs } from "../scripts/control-api.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const opened = [];
let server;
let port;

before(async () => {
  let api;
  server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  api = controlApi({ root: ROOT, port, platform: "darwin", open: async (c) => { opened.push(c); } });
});
after(() => server.close());

function call(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers: { host: `localhost:${port}`, ...headers } }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text || "null") }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const song = listSongs(ROOT)[0];
const post = (request, headers = {}) => call("POST", "/api/open", {
  headers: { origin: `http://localhost:${port}`, "content-type": "application/json", ...headers },
  body: JSON.stringify(request),
});

test("lists the songs and says it can open windows", async () => {
  const { status, body } = await call("GET", "/api/control");
  assert.equal(status, 200);
  assert.equal(body.data.canOpen, true);
  assert.ok(body.data.songs.includes(song));
});

test("opens a listed window on a listed song", async () => {
  const { status, body } = await post({ pane: "edit", song, look: "plain" });
  assert.equal(status, 200);
  assert.equal(body.data.opened, true);
  assert.match(opened.at(-1), /cannoli\.js edit .*songs\/.* --theme=plain$/);
});

test("refuses other websites and other host names", async () => {
  assert.equal((await post({ pane: "guide" }, { origin: "https://example.com" })).status, 403);
  assert.equal((await post({ pane: "guide" }, { origin: "" })).status, 403);
  assert.equal((await call("GET", "/api/control", { headers: { host: "evil.example" } })).status, 403);
});

test("refuses anything that isn't JSON", async () => {
  assert.equal((await post({ pane: "guide" }, { "content-type": "text/plain" })).status, 415);
});

test("refuses windows, songs and looks it doesn't know", async () => {
  const before = opened.length;
  for (const request of [
    { pane: "rm -rf /" },
    { pane: "edit", song: "../../etc/passwd" },
    { pane: "edit", song: `${song}"; do shell script "whoami` },
    { pane: "guide", look: "deep; whoami" },
  ]) assert.equal((await post(request)).status, 400, JSON.stringify(request));
  assert.equal(opened.length, before);
});

test("the command quotes a song path safely", () => {
  const { command } = commandFor(ROOT, { pane: "stage", song, look: "" });
  assert.match(command, / stage .* --all$/);
  assert.equal(commandFor(ROOT, { pane: "guide", look: "" }).error, undefined);
});

test("stops after too many windows in a minute", async () => {
  let last;
  for (let i = 0; i < 25; i++) last = await post({ pane: "guide", look: "" });
  assert.equal(last.status, 429);
});
