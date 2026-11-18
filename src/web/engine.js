/* ============================================================
   cannoli — starts Strudel in the browser
   Uses the official @strudel/web package: from this project when
   it's installed, otherwise from the public npm CDN. The playing
   itself is shared with the terminal, in cli/strudel/player.js.
   ============================================================ */

import { StrudelPlayer, limitOutput, loadSounds } from "../../cli/strudel/player.js";
import { withHeader } from "../../cli/strudel/dialect.js";
import { installExtras } from "../../cli/strudel/extras.js";
import { catalog } from "../../cli/strudel/catalog.js";

const STRUDEL_VERSION = "1.3.0";
const LOCAL_PACKAGE = new URL("../../node_modules/@strudel/web/dist/index.mjs", import.meta.url).href;
const CDN_PACKAGE = `https://cdn.jsdelivr.net/npm/@strudel/web@${STRUDEL_VERSION}/dist/index.mjs`;
const SCHEDULE_AHEAD_S = 0.1;

async function loadPackage() {
  try {
    return await import(/* webpackIgnore: true */ LOCAL_PACKAGE);
  } catch {
    return import(/* webpackIgnore: true */ CDN_PACKAGE);
  }
}

export class WebEngine extends StrudelPlayer {
  constructor() {
    super({ leadSeconds: SCHEDULE_AHEAD_S });
    this.ready = this.load();
    this.audio = null;
  }

  /* The language: enough to check code as you type, before any sound is allowed. */
  async load() {
    const strudel = await loadPackage();
    const extras = installExtras(strudel, strudel);
    await strudel.evalScope(Promise.resolve(strudel), Promise.resolve(extras));
    this.core = strudel;
    this.inKey = extras.inKey;
    this.transpiler = strudel.transpiler;
    this.known = new Set([...Object.getOwnPropertyNames(strudel.Pattern.prototype), ...catalog().keys()]);
    return this;
  }

  /* Browsers only allow sound after a click or a key, so this waits for the first one. */
  startAudio() {
    this.audio ??= this.connect();
    return this.audio;
  }

  async connect() {
    await this.ready;
    const strudel = this.core;
    await strudel.initAudio();
    this.ctx = strudel.getAudioContext();
    await this.ctx.resume();
    this.limited = limitOutput(this.ctx, strudel.getSuperdoughAudioController().output.destinationGain);
    this.sounds = loadSounds(strudel);
    this.output = strudel.webaudioOutput;
    this.repl = strudel.webaudioRepl({
      transpiler: withHeader(strudel.transpiler),
      onEvalError: (err) => { this.lastError = err; },
    });
  }

  async play(program) {
    await this.startAudio();
    return super.play(program);
  }

  async preview(code, song) {
    await this.startAudio();
    await this.soundsReady();
    return super.preview(code, song);
  }
}
