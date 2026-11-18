/* ============================================================
   cannoli — the languages the terminal speaks
   .strudel files are exactly Strudel; .cannoli files are the
   cannoli language. The editor asks this for everything that
   differs between them.
   ============================================================ */

import path from "node:path";
import { compile } from "../src/lang/compile.js";
import { complete } from "../src/editor/complete.js";
import { classifyLine } from "../src/editor/highlight.js";
import { Engine } from "../src/audio/engine.js";
import { STYLES } from "../src/core/styles.js";

const NO_STYLE = "none";

/** Which language a file is written in. */
export function languageOf(file) {
  return path.extname(file) === ".cannoli" ? "cannoli" : "strudel";
}

/* Write, replace or remove the song's style line. */
function restyled(all, name, pattern, write) {
  const existing = all.match(pattern);
  if (existing) {
    const end = existing.index + existing[0].length + (name === NO_STYLE && all[existing.index + existing[0].length] === "\n" ? 1 : 0);
    return { start: existing.index, end, text: name === NO_STYLE ? "" : write(name) };
  }
  if (name === NO_STYLE) return null;
  const firstCode = all.match(/^(?!\s*(#|\/\/))\S/m)?.index ?? 0;
  return { start: firstCode, end: firstCode, text: `${write(name)}\n` };
}

const cannoli = {
  name: "cannoli",
  placeholder: "start typing — e.g.  kick: beat fourfloor > bd      ctrl+s plays",
  emptyMessage: "an empty page: type a thread, then ctrl+s",
  updateMessage: "changes land on the next bar",
  compile,
  complete: (text, cursor, symbols) => complete(text, cursor, symbols),
  classifier: () => classifyLine,
  restyle: (all, name) => restyled(all, name, /^style\b.*$/m, (n) => `style ${n}`),
  async makeEngine() {
    const { AudioContext } = await import("node-web-audio-api");
    // changes land on the next bar anyway, so a bigger buffer costs nothing and rides out busy moments
    return new Engine({ AudioContext, latencyHint: "playback" });
  },
};

async function strudel() {
  const [{ loadStrudel }, { checkSong }, { completeStrudel }, { lineClassifier }, { StrudelEngine }, { catalog }] = await Promise.all([
    import("./strudel/runtime.js"), import("./strudel/check.js"), import("./strudel/complete.js"),
    import("./strudel/highlight.js"), import("./strudel/engine.js"), import("./strudel/catalog.js"),
  ]);
  const { core, transpiler } = await loadStrudel();
  const known = new Set([...Object.getOwnPropertyNames(core.Pattern.prototype), ...catalog().keys()]);
  return {
    name: "strudel",
    placeholder: 'start typing — e.g.  $: s("bd*4, hh*8")      ctrl+s plays',
    emptyMessage: 'an empty page: try  $: s("bd*4"), then ctrl+s',
    updateMessage: "updated",
    compile: (text) => checkSong(text, { transpiler, known }),
    complete: (text, cursor) => completeStrudel(text, cursor),
    classifier: (text) => lineClassifier(text),
    restyle: (all, name) => restyled(all, name, /^style\(.*\).*$/m, (n) => `style("${n}")`),
    makeEngine: (opts) => new StrudelEngine(opts).boot(),
  };
}

/** The language for a file, ready to use. */
export async function loadLanguage(file) {
  return languageOf(file) === "cannoli" ? cannoli : strudel();
}

export { NO_STYLE, STYLES };
