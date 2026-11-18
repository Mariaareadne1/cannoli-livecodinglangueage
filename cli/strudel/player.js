/* ============================================================
   cannoli — plays Strudel
   Strudel's own scheduler and sound engine do the playing. This
   wraps them in the shape the editors expect, so the status line,
   threads and visuals follow along. The terminal and the web app
   each start Strudel their own way and share everything here.
   ============================================================ */

import { blocksIn } from "./highlight.js";
import { prepareSong, readHeader } from "./dialect.js";

const TICK_MS = 40;
const KEEP_BARS = 3;
const SOUND_WAIT_MS = 8000;
const LIMIT_THRESHOLD_DB = -4;
const LIMITED_LEVEL = 0.6;        // a compressor makes itself louder, and Strudel's mix is hot already
const SOFT_CLIP_DRIVE = 1.2;
const SOFT_CLIP_POINTS = 2048;
const PREVIEW_DELAY_S = 0.05;
const SOUND_CDN = "https://strudel.b-cdn.net";
const DRUMS = { bd: "kick", sd: "snare", hh: "hat", oh: "open", cp: "clap", rim: "rim", rm: "rim", lt: "tom", mt: "tom", ht: "tom", cb: "cowbell", sh: "shaker" };

/** Which of the editor's drums a sound is, if any. */
export function drumOf(sound = "") {
  return DRUMS[sound.split(":")[0]] ?? null;
}

/* The same sounds as strudel.cc (website/src/repl/prebake.mjs). One that can't load doesn't stop the rest. */
export async function loadSounds({ samples, aliasBank, registerSynthSounds, registerZZFXSounds, registerSoundfonts }) {
  const banks = [
    ["piano.json", "piano/", {}],
    ["vcsl.json", "VCSL/", {}],
    ["tidal-drum-machines.json", "tidal-drum-machines/machines/", { tag: "drum-machines" }],
    ["uzu-drumkit.json", "uzu-drumkit/", { tag: "drum-machines" }],
    ["uzu-wavetables.json", "uzu-wavetables/", {}],
    ["mridangam.json", "mrid/", { tag: "drum-machines" }],
  ];
  const results = await Promise.allSettled([
    registerSynthSounds(),
    registerZZFXSounds?.(),
    registerSoundfonts?.(),
    ...banks.map(([json, base, options]) => samples(`${SOUND_CDN}/${json}`, `${SOUND_CDN}/${base}`, { prebake: true, ...options })),
    samples("github:tidalcycles/dirt-samples"),
  ]);
  await Promise.resolve(aliasBank?.(`${SOUND_CDN}/tidal-drum-machines-alias.json`)).catch(() => {});
  return results.filter((r) => r.status === "rejected").map((r) => r.reason?.message ?? String(r.reason));
}

export class StrudelPlayer {
  /** @param {{ leadSeconds: number }} opts  how far ahead of the speakers the scheduler runs */
  constructor({ leadSeconds }) {
    this.leadSeconds = leadSeconds;
    this.ctx = null;
    this.playing = false;
    this.stopping = false;
    this.bars = [];
    this.program = null;
    this.lastError = null;
    this.quantize = "bar";
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

  /** Sound one cycle of this code, while stopped: for hearing what you just picked. */
  async preview(code, song = "") {
    if (this.playing) return;
    const { pattern: written } = await this.core.evaluate(prepareSong(code), this.transpiler);
    if (!written) return;
    const { key } = readHeader(song);
    const pattern = key ? this.inKey(key.scale)(written) : written;
    const cps = this.repl.scheduler.cps;
    const start = this.ctx.currentTime + PREVIEW_DELAY_S;
    for (const hap of pattern.queryArc(0, 1, { _cps: cps }).filter((h) => h.hasOnset())) {
      this.output(hap, 0, hap.duration / cps, cps, start + hap.whole.begin / cps);
    }
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
    return scheduler.now() - this.leadSeconds * scheduler.cps;
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
export function limitOutput(ctx, input) {
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
