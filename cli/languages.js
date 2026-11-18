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
import { renderBar } from "../src/core/render.js";
import { readTimeline, applyTimeline, timelineLength } from "../src/editor/timeline.js";
import { threadOfLine } from "../src/editor/sound-picker.js";
import { cannoliToolAt } from "./panel/cannoli-tools.js";
import { strudelPickerAt, readStrudelTimeline, applyStrudelTimeline } from "./strudel/pickers.js";
import { blocksIn } from "./strudel/highlight.js";

const NO_STYLE = "none";
const STRUDEL_TIMELINE_BARS = 16;
const PREVIEW_SEARCH_BARS = 32;

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
  toolAt: cannoliToolAt,
  timeline: (text, extraBars) => {
    const bars = timelineLength(text) + extraBars;
    return { kind: "timeline", bars, rows: readTimeline(text, bars).map((r) => ({ ...r, id: r.name })), apply: (id, on) => applyTimeline(text, id, on) };
  },
  /* One bar of the thread under the cursor. */
  preview(engine, text, offset) {
    const thread = threadOfLine(text, text.lastIndexOf("\n", offset - 1) + 1);
    const { errors, program } = compile(text);
    if (!thread || errors.length) return;
    for (let bar = 0; bar < PREVIEW_SEARCH_BARS; bar++) {
      const list = renderBar(program, bar).filter((n) => n.thread === thread);
      if (list.length) { engine.previewBar({ list, settings: program.settings }); return; }
    }
  },
  apply: (engine, program) => engine.live(program),
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
    toolAt: strudelPickerAt,
    timeline: (text, extraBars) => {
      const bars = STRUDEL_TIMELINE_BARS + extraBars;
      return { kind: "timeline", bars, rows: readStrudelTimeline(text, bars), apply: (id, on) => applyStrudelTimeline(text, id, on) };
    },
    /* One cycle of the pattern under the cursor. */
    preview(engine, text, offset) {
      const blocks = blocksIn(text);
      const index = blocks.findLastIndex((b) => b.start <= offset);
      if (index < 0) return engine.preview(text).catch(() => {});
      const body = text.slice(blocks[index].start, blocks[index + 1]?.start ?? text.length).replace(/^[A-Za-z_$][\w$]*:\s*/, "");
      return engine.preview(body).catch(() => {});
    },
    apply: (engine, program) => engine.update(program),
    makeEngine: (opts) => new StrudelEngine(opts).boot(),
  };
}

/** The language for a file, ready to use. */
export async function loadLanguage(file) {
  return languageOf(file) === "cannoli" ? cannoli : strudel();
}

export { NO_STYLE, STYLES };
