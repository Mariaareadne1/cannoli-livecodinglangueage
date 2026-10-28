/* ============================================================
   cannoli — synths
   One function per sound, plus the per-note parts of the
   signature effects (tape, pump, air). Every note builds a
   small graph:  source → tone filter → envelope → [pump] → [pan]
   into a shared bus: "low" for bass, "upper" (which cuts the low end)
   for everything else; the engine sends those buses to the room. Nodes
   that would do nothing (no pump, centre pan) are left out. When its sounds have
   ended, the note disconnects that graph: some Web Audio
   engines (the terminal's) keep computing finished nodes until
   the garbage collector frees them, and that builds up into
   crackles.
   ============================================================ */

const NOTE_LEVEL = 0.22;
export const LOW_CUT_HZ = 140;   // keeps non-bass threads out of the low end (the engine's "upper" bus)
export const ROOM_SEND = 0.12;   // how much of every note goes to the room (sent once, from the buses)

const ENVELOPES = {
  saw:    { a: 0.005, d: 0.2,  s: 0.7, r: 0.15 },
  square: { a: 0.005, d: 0.2,  s: 0.6, r: 0.12 },
  tri:    { a: 0.005, d: 0.3,  s: 0.6, r: 0.2 },
  sine:   { a: 0.01,  d: 0.3,  s: 0.7, r: 0.25 },
  pluck:  { a: 0.002, d: 0.25, s: 0,   r: 0.12 },
  pad:    { a: 0.4,   d: 0.5,  s: 0.8, r: 0.9 },
  bell:   { a: 0.002, d: 1.2,  s: 0,   r: 0.8 },
  supersaw: { a: 0.01, d: 0.3, s: 0.8, r: 0.25 },
  acid:   { a: 0.003, d: 0.2,  s: 0.5, r: 0.08 },
  stab:   { a: 0.002, d: 0.18, s: 0,   r: 0.1 },
  sub:    { a: 0.005, d: 0.2,  s: 0.9, r: 0.1 },
  boom:   { a: 0.002, d: 1.2,  s: 0.4, r: 0.4 },
};
// sounds whose filter snaps open then closes on each note: [opening, closing time, resonance]
const FILTER_SWEEP = { pluck: [2.5, 0.08, 0.7], acid: [5, 0.12, 14], stab: [3, 0.06, 2] };

const noiseCache = new WeakMap();
const RAW = Symbol("the real AudioContext");

/**
 * @param {AudioContext} ctx
 * @param {{ low: AudioNode, upper: AudioNode, bloom: AudioNode }} buses
 * @param {{ midi: number[], drum: string|null, time: number, seconds: number, beatTimes: number[],
 *           duckTimes: number[], props: Record<string, any>, level: number }} note
 */
export function playNote(audio, buses, note) {
  const { ctx, made } = tracking(audio);
  buildNote(ctx, buses, note);
  releaseWhenDone(made);
}

function buildNote(ctx, buses, note) {
  const { props } = note;
  const out = noteOutput(ctx, buses, props, note.drum || props.range === "low" ? buses.low : buses.upper);

  if (note.drum) {
    DRUMS[note.drum](ctx, out, note.time, clamp(props.gain, 0, 1) * 0.9, KITS[props.kit] ?? KITS.house);
    return;
  }

  const end = note.time + Math.max(0.03, note.seconds);
  const env = ENVELOPES[props.sound] ?? ENVELOPES.tri;
  const level = (NOTE_LEVEL * clamp(props.gain, 0, 1.5)) / Math.sqrt(note.midi.length);

  // pump (and automatic ducking of the bass under the kick)
  const pumpTimes = (props.pump > 0 ? note.beatTimes : props.range === "low" ? note.duckTimes : [])
    .filter((t) => t >= note.time - 0.01 && t < end + env.r);
  const depth = props.pump > 0 ? props.pump * 0.8 : 0.35;
  let duck = out;
  if (pumpTimes.length) {
    duck = ctx.createGain();
    pumpTimes.forEach((t) => {
      duck.gain.setValueAtTime(1 - depth, Math.max(note.time, t));
      duck.gain.linearRampToValueAtTime(1, Math.max(note.time, t) + 0.18);
    });
    duck.connect(out);
  }

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
  if (props.tape > 0) head = tapeSaturate(ctx, head, props.tape);
  head.connect(amp).connect(duck);

  const sweep = FILTER_SWEEP[props.sound];
  if (sweep) {
    const [open, close, q] = sweep;
    tone.Q.value = q;
    tone.frequency.setValueAtTime(Math.min(18000, tone.frequency.value * open), note.time);
    tone.frequency.setTargetAtTime(tone.frequency.value * 0.5, note.time, close);
  }

  const sources = note.midi.flatMap((m) => SOURCES[props.sound in SOURCES ? props.sound : "tri"](ctx, tone, mtof(m), note.time, stopAt));
  if (props.tape > 0) wobble(ctx, sources, props.tape, note.time, stopAt);
  if (props.air > 0) addAir(ctx, amp, props.air, note.time, stopAt);
}

/* Where a note's sound leaves: a panner only when it's off centre, and a bloom send when asked for. */
function noteOutput(ctx, buses, props, bus) {
  const panAt = clamp(props.pan, -1, 1);
  let out = bus;
  if (panAt) {
    out = ctx.createStereoPanner();
    out.pan.value = panAt;
    out.connect(bus);
  }
  if (props.bloom > 0) {
    // the send needs its own node to tap: a gain in front of the bus
    const tap = ctx.createGain();
    tap.connect(out);
    sendTo(ctx, tap, buses.bloom, props.bloom);
    out = tap;
  }
  return out;
}

/* ---------- cleaning up after a note ---------- */

/* A view of the context that remembers every node a note makes. */
function tracking(ctx) {
  const made = [];
  const view = new Proxy(ctx, {
    get(target, prop) {
      if (prop === RAW) return target;
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (typeof prop === "string" && prop.startsWith("create") && prop !== "createBuffer") {
        return (...args) => {
          const node = value.apply(target, args);
          made.push(node);
          return node;
        };
      }
      return value.bind(target);
    },
  });
  return { ctx: view, made };
}

/* Once every source in the note has stopped, disconnect all of its nodes. */
function releaseWhenDone(made) {
  const sources = made.filter((n) => typeof n.stop === "function");
  let playing = sources.length;
  sources.forEach((src) => {
    src.onended = () => {
      playing -= 1;
      if (playing > 0) return;
      made.forEach((n) => n.disconnect());
      sources.forEach((s) => { s.onended = null; });
      made.length = 0;   // let go, so the nodes can be freed
    };
  });
}

/* ---------- sound sources: each returns its oscillators ---------- */

const SOURCES = {
  saw: (ctx, dest, f, t, stop) => detuned(ctx, dest, "sawtooth", f, t, stop, [-7, 7], 0.5),
  square: (ctx, dest, f, t, stop) => [osc(ctx, dest, "square", f, t, stop, 0, 0.45)],
  tri: (ctx, dest, f, t, stop) => [osc(ctx, dest, "triangle", f, t, stop, 0, 1)],
  sine: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sine", f, t, stop, 0, 1)],
  pluck: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sawtooth", f, t, stop, 0, 0.7), osc(ctx, dest, "triangle", f * 2, t, stop, 0, 0.3)],
  pad: (ctx, dest, f, t, stop) => detuned(ctx, dest, "sawtooth", f, t, stop, [-10, 0, 10], 0.35),
  supersaw: (ctx, dest, f, t, stop) => detuned(ctx, dest, "sawtooth", f, t, stop, [-24, -14, -6, 0, 6, 14, 24], 0.2),
  acid: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sawtooth", f, t, stop, 0, 0.8)],
  stab: (ctx, dest, f, t, stop) => detuned(ctx, dest, "sawtooth", f, t, stop, [-8, 0, 8], 0.4),
  sub: (ctx, dest, f, t, stop) => [osc(ctx, dest, "sine", f, t, stop, 0, 1), osc(ctx, dest, "triangle", f, t, stop, 0, 0.15)],
  boom: (ctx, dest, f, t, stop) => {
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(3);
    shaper.connect(dest);
    const o = osc(ctx, shaper, "sine", f, t, stop, 0, 1.2);
    o.frequency.setValueAtTime(f * 2.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    return [o];
  },
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

/* Several oscillators a few cents apart, sharing one level. */
function detuned(ctx, dest, type, freq, t, stop, cents, gain) {
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(dest);
  return cents.map((c) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = c;
    o.connect(g);
    startStop([o], t, stop);
    return o;
  });
}

function osc(ctx, dest, type, freq, t, stop, cents, gain) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = cents;
  if (gain === 1) {
    o.connect(dest);
  } else {
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
  }
  startStop([o], t, stop);
  return o;
}

/* ---------- drums ---------- */

/* Each style's drum kit: kick pitch sweep and decay, how bright and long the noise drums are. */
const KITS = {
  house: { kick: [150, 45, 0.11, 0.32, 1.4], snareHz: 1900, snareDecay: 0.16, hatDecay: 0.045, hatLevel: 0.55, clapDecay: 0.14, click: 0 },
  hard:  { kick: [190, 48, 0.08, 0.45, 1.7], snareHz: 2200, snareDecay: 0.2, hatDecay: 0.05, hatLevel: 0.7, clapDecay: 0.22, click: 0.6 },
  funk:  { kick: [120, 38, 0.16, 0.7, 1.6], snareHz: 2600, snareDecay: 0.1, hatDecay: 0.035, hatLevel: 0.5, clapDecay: 0.1, click: 0.3 },
  soft:  { kick: [110, 50, 0.1, 0.25, 0.9], snareHz: 900, snareDecay: 0.22, hatDecay: 0.03, hatLevel: 0.35, clapDecay: 0.12, click: 0 },
};

const DRUMS = {
  kick: (ctx, out, t, v, kit) => {
    const [from, to, glide, decay, level] = kit.kick;
    sweep(ctx, out, t, v * level, from, to, glide, decay);
    if (kit.click) burst(ctx, out, t, v * kit.click, "highpass", 3000, 0.7, 0.012);
  },
  tom: (ctx, out, t, v) => sweep(ctx, out, t, v, 220, 110, 0.18, 0.35),
  snare: (ctx, out, t, v, kit) => {
    sweep(ctx, out, t, v * 0.5, 210, 180, 0.05, 0.09);
    burst(ctx, out, t, v * 0.9, "bandpass", kit.snareHz, 0.8, kit.snareDecay);
  },
  hat: (ctx, out, t, v, kit) => burst(ctx, out, t, v * kit.hatLevel, "highpass", 7500, 0.7, kit.hatDecay),
  open: (ctx, out, t, v, kit) => burst(ctx, out, t, v * kit.hatLevel * 0.8, "highpass", 7000, 0.7, 0.3),
  clap: (ctx, out, t, v, kit) => [0, 0.012, 0.024].forEach((d, i) =>
    burst(ctx, out, t + d, v * 0.8, "bandpass", 1200, 1.2, i === 2 ? kit.clapDecay : 0.02)),
  rim: (ctx, out, t, v) => burst(ctx, out, t, v * 1.6, "bandpass", 1700, 6, 0.03),
  cowbell: (ctx, out, t, v) => {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 800;
    band.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, v * 0.6), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    band.connect(g).connect(out);
    [540, 800].forEach((hz) => osc(ctx, band, "square", hz, t, t + 0.27, 0, 0.5));
  },
  shaker: (ctx, out, t, v) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.35, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(band).connect(g).connect(out);
    startStop([src], t, t + 0.1);
  },
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

export function noise(view) {
  const ctx = view[RAW] ?? view;   // one buffer per context, not per note
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
