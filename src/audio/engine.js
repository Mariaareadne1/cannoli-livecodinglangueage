/* ============================================================
   cannoli — engine
   Schedules one whole bar at a time, just before it starts.
   That makes every change land on a downbeat: a new program
   waits in `pending` until the next bar (or the next 4-bar
   phrase) is scheduled. Stopping also waits for the bar line.

   Master: notes → warm saturation → compressor → limiter, with
   a small room always on and the "bloom" reverb, whose tail is
   tuned to the notes of the current key.
   ============================================================ */

import { renderBar, harmonyAt } from "../core/render.js";
import { MODES } from "../core/harmony.js";
import { STYLES } from "../core/styles.js";
import { playNote, saturationCurve, noise, mtof, LOW_CUT_HZ, ROOM_SEND } from "./synths.js";

const TICK_MS = 25;
const LOOKAHEAD_S = 0.3;
const START_DELAY_S = 0.08;
const PHRASE_BARS = 4;
const FADE_S = 0.25;
const RESONATOR_OCTAVES = [3, 4, 5, 6];
const KEEP_BARS = 3;
const MASTER_LEVEL = 0.85;
// each style's mix: saturation drive, glue compressor threshold (dB), and master tone (Hz)
const MIXES = {
  clean: { drive: 1.4, threshold: -18, tone: 20000 },
  hard:  { drive: 2.4, threshold: -22, tone: 20000 },
  lofi:  { drive: 1.9, threshold: -20, tone: 6500 },
};   // headroom so kick transients that slip past the limiter don't clip

export class Engine {
  /**
   * @param {{ AudioContext?: typeof AudioContext, latencyHint?: string }} [opts]
   *   AudioContext: pass one in to run outside a browser
   *   latencyHint: "playback" trades a few ms of delay for a bigger, steadier buffer
   */
  constructor({ AudioContext: Ctx, latencyHint = "interactive" } = {}) {
    this.AudioContextClass = Ctx ?? null;
    this.latencyHint = latencyHint;
    this.ctx = null;
    this.program = null;
    this.pending = null;
    this.quantize = "bar";
    this.playing = false;
    this.stopping = false;
    this.nextBar = 0;
    this.nextBarTime = 0;
    this.bars = [];          // recently scheduled bars, for the visuals
    this.listeners = new Set();
  }

  /* ---------- public ---------- */

  async play(program) {
    await this.ensureContext();
    if (this.playing) return this.update(program);
    this.program = program;
    this.pending = null;
    this.playing = true;
    this.stopping = false;
    this.nextBar = 0;
    this.nextBarTime = this.ctx.currentTime + START_DELAY_S;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(MASTER_LEVEL, this.ctx.currentTime);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Swap in a new program at the next bar (or phrase). */
  update(program) {
    if (!this.playing) return this.play(program);
    this.pending = program;
    this.stopping = false;
    this.emit();
  }

  /** Stop at the next bar line, or right away. */
  stop({ now = false } = {}) {
    if (!this.playing) return;
    if (now) {
      this.halt(this.ctx.currentTime);
      return;
    }
    this.stopping = true;
    this.pending = null;
    this.emit();
  }

  /** When the next change (update or stop) will be heard, in seconds from now. */
  get nextChangeIn() {
    if (!this.playing || (!this.pending && !this.stopping)) return null;
    let bar = this.nextBar;
    let time = this.nextBarTime;
    while (this.pending && this.quantize === "phrase" && bar % PHRASE_BARS !== 0) {
      time += this.barSeconds(this.program);
      bar += 1;
    }
    return Math.max(0, time - this.ctx.currentTime);
  }

  /** Bar and position (0–1) that is sounding now. */
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    const current = [...this.bars].reverse().find((b) => b.time <= now);
    if (!current) return null;
    return { ...current, progress: Math.min(1, (now - current.time) / current.seconds) };
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /* ---------- scheduling ---------- */

  tick() {
    if (!this.playing) return;
    while (this.nextBarTime < this.ctx.currentTime + LOOKAHEAD_S) {
      if (this.stopping) {
        this.halt(this.nextBarTime);
        return;
      }
      this.scheduleBar();
    }
  }

  scheduleBar() {
    const bar = this.nextBar;
    if (this.pending && (this.quantize === "bar" || bar % PHRASE_BARS === 0)) {
      this.program = this.pending;
      this.pending = null;
    }
    const program = this.program;
    const seconds = this.barSeconds(program);
    const time = this.nextBarTime;
    const beat = seconds / program.settings.beats;
    const notes = safeRender(program, bar);
    const beatTimes = Array.from({ length: program.settings.beats * 2 }, (_, i) => time + i * beat);
    const duckTimes = notes.filter((n) => n.drum === "kick").map((n) => time + n.start * seconds);

    this.tuneBloom(program, bar, time);
    this.applyMix(STYLES[program.settings.style]?.mix ?? "clean", time);
    for (const n of notes) {
      playNote(this.ctx, this.buses, {
        midi: n.midi,
        drum: n.drum,
        time: time + n.start * seconds,
        seconds: n.dur * seconds,
        beatTimes,
        duckTimes,
        props: n.props,
      });
    }
    const { key, chordName } = harmonyAt(program.settings, bar);
    this.bars = [...this.bars, { bar, time, seconds, notes, key: key.name, chord: chordName, program }].slice(-KEEP_BARS);
    this.nextBar += 1;
    this.nextBarTime += seconds;
    this.emit();
  }

  barSeconds(program) {
    return (program.settings.beats * 60) / program.settings.tempo;
  }

  halt(at) {
    clearInterval(this.timer);
    this.playing = false;
    this.stopping = false;
    this.pending = null;
    const g = this.master.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0, at + FADE_S);
    const delay = Math.max(0, at - this.ctx.currentTime) + FADE_S + 0.1;
    setTimeout(() => {
      if (!this.playing) this.bars = [];
      this.emit();
    }, delay * 1000);
    this.emit();
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  /* ---------- audio graph ---------- */

  async ensureContext() {
    if (!this.ctx) {
      const Ctx = this.AudioContextClass ?? (globalThis.AudioContext || globalThis.webkitAudioContext);
      this.ctx = new Ctx({ latencyHint: this.latencyHint });
      this.build();
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  build() {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const warm = ctx.createWaveShaper();
    warm.curve = saturationCurve(1.4);
    warm.oversample = "2x";
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_LEVEL;
    const masterTone = ctx.createBiquadFilter();
    masterTone.type = "lowpass";
    masterTone.frequency.value = 20000;
    masterTone.Q.value = 0.5;
    input.connect(warm).connect(masterTone).connect(glue).connect(limiter).connect(this.master).connect(ctx.destination);
    this.mixNodes = { input, warm, glue, masterTone };
    this.mix = "clean";

    const room = ctx.createConvolver();
    room.buffer = impulse(ctx, 1.1, 3);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.5;
    room.connect(roomOut).connect(input);

    // bloom: long reverb → a bank of resonators tuned to the key
    const bloom = ctx.createGain();
    const bloomVerb = ctx.createConvolver();
    bloomVerb.buffer = impulse(ctx, 4.5, 2);
    const bloomOut = ctx.createGain();
    bloomOut.gain.value = 0.9;
    bloom.connect(bloomVerb);
    bloomVerb.connect(bloomOut);
    this.resonators = Array.from({ length: 7 * RESONATOR_OCTAVES.length }, () => {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 40;
      const g = ctx.createGain();
      g.gain.value = 2.2;
      bloomVerb.connect(f).connect(g).connect(bloomOut);
      return f;
    });
    bloomOut.connect(input);

    // every note lands on one of two buses, which share a single send to the room
    const low = ctx.createGain();
    low.connect(input);
    const roomSend = ctx.createGain();
    roomSend.gain.value = ROOM_SEND;
    low.connect(roomSend).connect(room);
    const upper = ctx.createBiquadFilter();
    upper.type = "highpass";
    upper.frequency.value = LOW_CUT_HZ;
    upper.connect(low);

    this.buses = { low, upper, bloom };
  }

  applyMix(name, time) {
    if (name === this.mix) return;
    this.mix = name;
    const mix = MIXES[name];
    const { input, warm, glue, masterTone } = this.mixNodes;
    // a fresh saturator rather than a new curve: some Web Audio implementations allow setting a curve only once
    const next = this.ctx.createWaveShaper();
    next.curve = saturationCurve(mix.drive);
    next.oversample = "2x";
    input.connect(next).connect(masterTone);
    input.disconnect(warm);
    this.mixNodes = { ...this.mixNodes, warm: next };
    glue.threshold.setValueAtTime(mix.threshold, time);
    masterTone.frequency.setTargetAtTime(mix.tone, time, 0.2);
  }

  tuneBloom(program, bar, time) {
    const { key } = harmonyAt(program.settings, bar);
    const scale = MODES[key.mode];
    this.resonators.forEach((f, i) => {
      const octave = RESONATOR_OCTAVES[Math.floor(i / 7)];
      f.frequency.setValueAtTime(mtof(12 * (octave + 1) + key.root + scale[i % 7]), time);
    });
  }
}

function safeRender(program, bar) {
  try {
    return renderBar(program, bar);
  } catch (err) {
    console.error("cannoli: couldn't render bar", bar, err);
    return [];
  }
}

function impulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  const src = noise(ctx).getChannelData(0);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = src[(i * (ch + 1) * 7) % src.length] * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}
