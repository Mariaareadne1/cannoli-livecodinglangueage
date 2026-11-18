/* ============================================================
   cannoli — starts Strudel in the terminal
   Connects Strudel's sound engine to the computer's speakers.
   The playing itself is in player.js.
   ============================================================ */

import { createRequire } from "node:module";
import { loadAudio, loadSounds, loadStrudel } from "./runtime.js";
import { StrudelPlayer, limitOutput, drumOf } from "./player.js";
import { withHeader } from "./dialect.js";

export { drumOf };

const SCHEDULE_AHEAD_S = 0.1;
const OUTPUT_BUFFER_S = 0.2;      // nothing here needs instant response, so a roomy buffer rides out busy moments

export class StrudelEngine extends StrudelPlayer {
  /** @param {{ silent?: boolean }} [opts]  silent: run everything without using the speakers */
  constructor({ silent = false } = {}) {
    super({ leadSeconds: SCHEDULE_AHEAD_S + OUTPUT_BUFFER_S });
    this.silent = silent;
  }

  async boot() {
    const { core, transpiler, extras } = await loadStrudel();
    const native = createRequire(import.meta.url)("node-web-audio-api");
    const { silent } = this;
    class Output extends native.AudioContext {
      constructor(options = {}) {
        super({ ...options, latencyHint: OUTPUT_BUFFER_S, ...(silent ? { sinkId: { type: "none" } } : {}) });
      }
    }
    const audio = await loadAudio(Output, native);
    this.core = core;
    this.inKey = extras.inKey;
    this.ctx = new Output();
    audio.superdough.setAudioContext(this.ctx);
    await audio.superdough.initAudio({});
    this.limited = limitOutput(this.ctx, audio.superdough.getSuperdoughAudioController().output.destinationGain);
    this.sounds = loadSounds(audio);
    this.transpiler = transpiler;
    this.output = audio.webaudio.webaudioOutput;
    this.repl = core.repl({
      defaultOutput: audio.webaudio.webaudioOutput,
      getTime: () => this.ctx.currentTime,
      transpiler: withHeader(transpiler),
      onEvalError: (err) => { this.lastError = err; },
    });
    return this;
  }
}
