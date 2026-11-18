/* ============================================================
   cannoli — plays Strudel in the terminal
   Strudel's own scheduler and sound engine do the playing. This
   wraps them in the shape the editor and the other panes expect,
   so the guide, threads and visual follow along.
   ============================================================ */

import { createRequire } from "node:module";
import { loadAudio, loadSounds, loadStrudel } from "./runtime.js";
import { blocksIn } from "./highlight.js";

const TICK_MS = 40;
const SCHEDULE_AHEAD_S = 0.1;
const KEEP_BARS = 3;
const SOUND_WAIT_MS = 8000;
const OUTPUT_BUFFER_S = 0.2;      // nothing here needs instant response, so a roomy buffer rides out busy moments
const LIMIT_THRESHOLD_DB = -4;
const LIMITED_LEVEL = 0.6;        // a compressor makes itself louder, and Strudel's mix is hot already
const SOFT_CLIP_DRIVE = 1.2;
const SOFT_CLIP_POINTS = 2048;
const DRUMS = { bd: "kick", sd: "snare", hh: "hat", oh: "open", cp: "clap", rim: "rim", rm: "rim", lt: "tom", mt: "tom", ht: "tom", cb: "cowbell", sh: "shaker" };

/** Which of the editor's drums a sound is, if any. */
export function drumOf(sound = "") {
  return DRUMS[sound.split(":")[0]] ?? null;
}

export class StrudelEngine {
  /** @param {{ silent?: boolean }} [opts]  silent: run everything without using the speakers */
  constructor({ silent = false } = {}) {
    this.silent = silent;
    this.ctx = null;
    this.playing = false;
    this.stopping = false;
    this.bars = [];
    this.program = null;
    this.lastError = null;
    this.quantize = "bar";
  }

  async boot() {
    const { core, transpiler } = await loadStrudel();
    const native = createRequire(import.meta.url)("node-web-audio-api");
    const { silent } = this;
    class Output extends native.AudioContext {
      constructor(options = {}) {
        super({ ...options, latencyHint: OUTPUT_BUFFER_S, ...(silent ? { sinkId: { type: "none" } } : {}) });
      }
    }
    const audio = await loadAudio(Output, native);
    this.core = core;
    this.ctx = new Output();
    audio.superdough.setAudioContext(this.ctx);
    await audio.superdough.initAudio({});
    this.output = limitOutput(this.ctx, audio.superdough.getSuperdoughAudioController().output.destinationGain);
    this.sounds = loadSounds(audio);
    this.repl = core.repl({
      defaultOutput: audio.webaudio.webaudioOutput,
      getTime: () => this.ctx.currentTime,
      transpiler,
      onEvalError: (err) => { this.lastError = err; },
    });
    return this;
  }

  /* The first play waits for the sound list, but never for long. */
  async soundsReady() {
    await Promise.race([this.sounds, new Promise((resolve) => { setTimeout(resolve, SOUND_WAIT_MS); })]);
  }

  async evaluate(program) {
    this.lastError = null;
    await this.repl.evaluate(program.code, true);
    if (this.lastError) throw this.lastError;
    this.program = program;
    this.bars = [];
  }

  async play(program) {
    await this.soundsReady();
    await this.evaluate(program);
    this.playing = true;
    this.stopping = false;
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Strudel applies a change as soon as it's evaluated. */
  update(program) {
    this.stopping = false;
    clearTimeout(this.stopTimer);
    return this.evaluate(program);
  }

  /** Stop at the end of the cycle, or right away. */
  stop({ now = false } = {}) {
    if (!this.playing) return;
    if (now) return this.halt();
    this.stopping = true;
    this.stopTimer = setTimeout(() => this.halt(), this.secondsToNextCycle * 1000);
  }

  halt() {
    clearTimeout(this.stopTimer);
    clearInterval(this.timer);
    this.timer = null;
    this.repl.stop();
    this.playing = false;
    this.stopping = false;
    this.bars = [];
  }

  get cycle() {
    const { scheduler } = this.repl;
    return scheduler.now() - (SCHEDULE_AHEAD_S + OUTPUT_BUFFER_S) * scheduler.cps;
  }

  get secondsToNextCycle() {
    const { cycle } = this;
    return (Math.ceil(cycle) - cycle) / this.repl.scheduler.cps;
  }

  /** When the stop will be heard. Changes have nothing to wait for: Strudel applies them straight away. */
  get nextChangeIn() {
    return this.playing && this.stopping ? this.secondsToNextCycle : null;
  }

  /** The bar (cycle) sounding now and how far through it is. */
  position() {
    if (!this.playing) return null;
    const { cycle } = this;
    if (cycle < 0) return null;
    const bar = this.barAt(Math.floor(cycle));
    return bar ? { ...bar, progress: cycle - bar.bar } : null;
  }

  tick() {
    if (!this.playing) return;
    const now = Math.max(0, Math.floor(this.cycle));
    this.barAt(now);
    this.barAt(now + 1);
  }

  barAt(index) {
    const known = this.bars.find((b) => b.bar === index);
    if (known) return known;
    const { scheduler } = this.repl;
    if (!scheduler.pattern) return null;
    const blocks = blocksIn(this.program.code);
    let haps = [];
    try {
      haps = scheduler.pattern.queryArc(index, index + 1, { _cps: scheduler.cps }).filter((h) => h.hasOnset());
    } catch {
      return null;   // a pattern that fails is reported when it's evaluated
    }
    const seconds = 1 / scheduler.cps;
    const notes = haps.map((hap) => noteFrom(hap, index, blocks, this.core));
    const bar = {
      bar: index, seconds, notes, program: this.program, chord: null,
      key: this.program.settings.keys[0]?.name ?? null,
      time: this.ctx.currentTime + (index - this.cycle) * seconds,
    };
    this.bars = [...this.bars, bar].sort((a, b) => a.bar - b.bar).slice(-KEEP_BARS);
    return bar;
  }
}

/*
 * Strudel doesn't limit its output, so busy songs go over full scale and crackle at the speakers.
 * The language and the mix stay Strudel's: this only catches what would otherwise clip.
 */
function limitOutput(ctx, input) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_THRESHOLD_DB;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const softClip = ctx.createWaveShaper();
  softClip.curve = Float32Array.from({ length: SOFT_CLIP_POINTS }, (_, i) => {
    const x = (i / (SOFT_CLIP_POINTS - 1)) * 2 - 1;
    return Math.tanh(x * SOFT_CLIP_DRIVE) / Math.tanh(SOFT_CLIP_DRIVE);
  });
  softClip.oversample = "2x";
  const level = ctx.createGain();
  level.gain.value = LIMITED_LEVEL;
  input.disconnect();
  input.connect(limiter).connect(level).connect(softClip).connect(ctx.destination);
  return softClip;
}

function noteFrom(hap, index, blocks, core) {
  const value = typeof hap.value === "object" && hap.value !== null ? hap.value : { note: hap.value };
  const locations = hap.context?.locations ?? [];
  const at = locations[0]?.start ?? 0;
  const threadIndex = Math.max(0, blocks.findLastIndex((b) => b.start <= at));
  const drum = drumOf(value.s);
  let midi = [];
  if (!drum) {
    try {
      const pitch = core.valueToMidi(value);
      if (Number.isFinite(pitch)) midi = [pitch];
    } catch {
      midi = [];   // a sample with no pitch
    }
  }
  return {
    start: hap.whole.begin.valueOf() - index, dur: hap.duration.valueOf(), midi, drum, threadIndex,
    src: locations.map((l) => [l.start]), props: value,
  };
}
