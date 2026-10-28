/* ============================================================
   loom — synths
   One function per sound, plus the per-note parts of the
   signature effects (tape, pump, air). Every note builds a
   small graph:  source → tone filter → envelope → [pump] → pan
   and sends to the room and bloom buses.
   ============================================================ */

const NOTE_LEVEL = 0.22;
const LOW_CUT_HZ = 140;          // keeps non-bass threads out of the low end
const ROOM_SEND = 0.12;

const ENVELOPES = {
  saw:    { a: 0.005, d: 0.2,  s: 0.7, r: 0.15 },
  square: { a: 0.005, d: 0.2,  s: 0.6, r: 0.12 },
  tri:    { a: 0.005, d: 0.3,  s: 0.6, r: 0.2 },
  sine:   { a: 0.01,  d: 0.3,  s: 0.7, r: 0.25 },
  pluck:  { a: 0.002, d: 0.25, s: 0,   r: 0.12 },
  pad:    { a: 0.4,   d: 0.5,  s: 0.8, r: 0.9 },
  bell:   { a: 0.002, d: 1.2,  s: 0,   r: 0.8 },
};

const noiseCache = new WeakMap();

/**
 * @param {AudioContext} ctx
 * @param {{ out: AudioNode, room: AudioNode, bloom: AudioNode }} buses
 * @param {{ midi: number[], drum: string|null, time: number, seconds: number, beatTimes: number[],
 *           duckTimes: number[], props: Record<string, any>, level: number }} note
 */
export function playNote(ctx, buses, note) {
  const { props } = note;
  const pan = ctx.createStereoPanner();
  pan.pan.value = clamp(props.pan, -1, 1);
  pan.connect(buses.out);
  sendTo(ctx, pan, buses.room, ROOM_SEND);
  if (props.bloom > 0) sendTo(ctx, pan, buses.bloom, props.bloom);

  if (note.drum) {
    DRUMS[note.drum](ctx, pan, note.time, clamp(props.gain, 0, 1) * 0.9);
    return;
  }

  const end = note.time + Math.max(0.03, note.seconds);
  const env = ENVELOPES[props.sound] ?? ENVELOPES.tri;
  const level = (NOTE_LEVEL * clamp(props.gain, 0, 1.5)) / Math.sqrt(note.midi.length);

  // pump (and automatic ducking of the bass under the kick)
  const duck = ctx.createGain();
  const pumpTimes = props.pump > 0 ? note.beatTimes : props.range === "low" ? note.duckTimes : [];
  const depth = props.pump > 0 ? props.pump * 0.8 : 0.35;
  pumpTimes.filter((t) => t >= note.time - 0.01 && t < end + env.r).forEach((t) => {
    duck.gain.setValueAtTime(1 - depth, Math.max(note.time, t));
    duck.gain.linearRampToValueAtTime(1, Math.max(note.time, t) + 0.18);
  });
  duck.connect(pan);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, note.time);
  amp.gain.linearRampToValueAtTime(level, note.time + env.a);
  amp.gain.setTargetAtTime(level * env.s, note.time + env.a, Math.max(0.01, env.d / 3));
  amp.gain.setTargetAtTime(0, end, Math.max(0.01, env.r / 3));
  const stopAt = end + env.r * 3 + 0.05;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 300 * Math.pow(2, clamp(props.bright, 0, 1) * 5.3);
  tone.Q.value = 0.7;
  let head = tone;
  if (props.range !== "low") {
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = "highpass";
    lowCut.frequency.value = LOW_CUT_HZ;
    tone.connect(lowCut);
    head = lowCut;
  }
  if (props.tape > 0) head = tapeSaturate(ctx, head, props.tape);
  head.connect(amp).connect(duck);

  if (props.sound === "pluck") {
    tone.frequency.setValueAtTime(tone.frequency.value * 2.5, note.time);
    tone.frequency.setTargetAtTime(tone.frequency.value * 0.5, note.time, 0.08);
  }

  const sources = note.midi.flatMap((m) => SOURCES[props.sound in SOURCES ? props.sound : "tri"](ctx, tone, mtof(m), note.time, stopAt));
  if (props.tape > 0) wobble(ctx, sources, props.tape, note.time, stopAt);
  if (props.air > 0) addAir(ctx, amp, props.air, note.time, stopAt);
}

/* ---------- sound sources: each returns its oscillators ---------- */

const SOURCES = {
  saw: (ctx, dest, f, t, stop) => [-7, 7].map((cents) => osc(ctx, dest, "sawtooth", f, t, stop, cents, 0.5)),
  square: (ctx, dest, f, t, stop) => [osc(ctx, dest, "square", f, t, stop, 0, 0.45)],
  tri: (ctx, dest, f, t, stop) => [osc(ctx, dest, "triangle", f, t, stop, 0, 1)],
  sine: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sine", f, t, stop, 0, 1)],
  pluck: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sawtooth", f, t, stop, 0, 0.7), osc(ctx, dest, "triangle", f * 2, t, stop, 0, 0.3)],
  pad: (ctx, dest, f, t, stop) => [-10, 0, 10].map((cents) => osc(ctx, dest, "sawtooth", f, t, stop, cents, 0.35)),
  bell: (ctx, dest, f, t, stop) => {
    const carrier = osc(ctx, dest, "sine", f, t, stop, 0, 1);
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 2, t);
    index.gain.setTargetAtTime(f * 0.2, t, 0.3);
    mod.connect(index).connect(carrier.frequency);
    startStop([mod], t, stop);
    return [carrier];
  },
};

function osc(ctx, dest, type, freq, t, stop, cents, gain) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = cents;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(g).connect(dest);
  startStop([o], t, stop);
  return o;
}

/* ---------- drums ---------- */

const DRUMS = {
  kick: (ctx, out, t, v) => sweep(ctx, out, t, v * 1.4, 150, 45, 0.11, 0.32),
  tom: (ctx, out, t, v) => sweep(ctx, out, t, v, 220, 110, 0.18, 0.35),
  snare: (ctx, out, t, v) => {
    sweep(ctx, out, t, v * 0.5, 210, 180, 0.05, 0.09);
    burst(ctx, out, t, v * 0.9, "bandpass", 1900, 0.8, 0.16);
  },
  hat: (ctx, out, t, v) => burst(ctx, out, t, v * 0.55, "highpass", 7500, 0.7, 0.045),
  open: (ctx, out, t, v) => burst(ctx, out, t, v * 0.45, "highpass", 7000, 0.7, 0.3),
  clap: (ctx, out, t, v) => [0, 0.012, 0.024].forEach((d, i) => burst(ctx, out, t + d, v * 0.8, "bandpass", 1200, 1.2, i === 2 ? 0.14 : 0.02)),
  rim: (ctx, out, t, v) => burst(ctx, out, t, v * 1.6, "bandpass", 1700, 6, 0.03),
};

function sweep(ctx, out, t, v, from, to, glide, decay) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + glide);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, v), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  startStop([o], t, t + decay + 0.02);
}

function burst(ctx, out, t, v, type, hz, q, decay) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, v), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(out);
  startStop([src], t, t + decay + 0.02);
}

/* ---------- signature effects, per note ---------- */

/* tape: soft saturation … */
function tapeSaturate(ctx, input, amount) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve(1 + amount * 4);
  shaper.oversample = "2x";
  input.connect(shaper);
  return shaper;
}

/* … and a slow pitch wobble. */
function wobble(ctx, sources, amount, t, stop) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.6;
  const depth = ctx.createGain();
  depth.gain.value = amount * 14;
  lfo.connect(depth);
  sources.forEach((s) => depth.connect(s.detune));
  startStop([lfo], t, stop);
}

/* air: a breath of filtered noise that follows the note. */
function addAir(ctx, dest, amount, t, stop) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const g = ctx.createGain();
  g.gain.value = amount * 0.6;
  src.connect(hp).connect(g).connect(dest);
  startStop([src], t, stop);
}

/* ---------- helpers ---------- */

export function saturationCurve(drive) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

function sendTo(ctx, from, bus, amount) {
  const g = ctx.createGain();
  g.gain.value = amount;
  from.connect(g).connect(bus);
}

function startStop(nodes, t, stop) {
  nodes.forEach((n) => {
    n.start(t);
    n.stop(stop);
  });
}

export function noise(ctx) {
  if (!noiseCache.has(ctx)) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return noiseCache.get(ctx);
}

export function mtof(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
