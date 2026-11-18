/* ============================================================
   cannoli — real Strudel, running in the terminal
   Loads the official Strudel packages (AGPL-3.0, see LICENSE and
   https://codeberg.org/uzu/strudel) in Node, gives them the few
   browser pieces they expect, and loads the same sounds the
   strudel.cc website does. Downloaded sounds are kept on disk so
   a song that has played once still works offline.
   ============================================================ */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { register } from "node:module";

const LOG_LIMIT = 50;
const noop = () => {};

/* Strudel writes to the console, which would scribble over the editor. */
const logs = [];
function capture(...parts) {
  logs.push(parts.join(" "));
  if (logs.length > LOG_LIMIT) logs.shift();
}

function browserStubs() {
  globalThis.window ??= globalThis;
  Object.assign(globalThis, {
    addEventListener: globalThis.addEventListener ?? noop,
    removeEventListener: globalThis.removeEventListener ?? noop,
    dispatchEvent: globalThis.dispatchEvent ?? noop,
    postMessage: globalThis.postMessage ?? noop,
  });
  globalThis.document ??= {
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, querySelector: () => null, body: {},
    createElement: () => ({ getContext: () => null, style: {} }),
  };
}

/* Sounds are fetched once, then read from ~/.cannoli/cache. */
export function cachingFetch(realFetch, folder) {
  return async (url, options) => {
    const address = String(url?.url ?? url);
    if (!/^https?:/.test(address) || (options?.method && options.method !== "GET")) return realFetch(url, options);
    const file = path.join(folder, crypto.createHash("sha1").update(address).digest("hex"));
    if (fs.existsSync(file)) return new Response(fs.readFileSync(file));
    const response = await realFetch(url, options);
    if (response.ok) {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await response.clone().arrayBuffer()));
    }
    return response;
  };
}

let loaded = null;

/** Load Strudel once. Safe to call again. */
export function loadStrudel() {
  loaded ??= load();
  return loaded;
}

async function load() {
  console.log = capture;
  console.info = capture;
  console.warn = capture;
  console.debug = capture;
  browserStubs();
  register("./resolve-hook.mjs", import.meta.url);
  const folder = process.env.CANNOLI_CACHE ?? path.join(os.homedir(), ".cannoli", "cache");
  globalThis.fetch = cachingFetch(globalThis.fetch.bind(globalThis), folder);

  const core = await import("@strudel/core");
  const mini = await import("@strudel/mini");
  const tonal = await import("@strudel/tonal");
  const { transpiler } = await import("@strudel/transpiler");
  const { installExtras } = await import("./extras.js");
  const extras = installExtras(core, mini);
  await core.evalScope(Promise.resolve(core), Promise.resolve(mini), Promise.resolve(tonal), Promise.resolve(extras));
  return { core, mini, tonal, transpiler, logs, extras };
}

/** Load the audio engine and connect it to this AudioContext class. */
export async function loadAudio(AudioContextClass, native) {
  for (const [name, value] of Object.entries(native)) {
    if (/Audio|Node|Param|Wave|Worklet|Context/.test(name)) globalThis[name] = value;
  }
  globalThis.AudioContext = AudioContextClass;
  const superdough = await import("superdough");
  const webaudio = await import("@strudel/webaudio");
  const { core } = await loadStrudel();
  await core.evalScope(Promise.resolve(webaudio));
  return { superdough, webaudio };
}

/** Every sound strudel.cc has, for the terminal. */
export async function loadSounds({ superdough }) {
  const { loadSounds: load } = await import("./player.js");
  const { registerSoundfonts } = await import("@strudel/soundfonts");
  return load({ ...superdough, registerSoundfonts });
}
