import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { playNote } from "../src/audio/synths.js";

const { OfflineAudioContext } = createRequire(import.meta.url)("node-web-audio-api");
const SAMPLE_RATE = 48000;
const FFT_SIZE = 1 << 15;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(step * k), s = Math.sin(step * k), u = i + k, v = u + len / 2;
        const tr = re[v] * c - im[v] * s, ti = re[v] * s + im[v] * c;
        re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti;
      }
    }
  }
}

async function renderNote({ sound, midi, seconds = 1.2, ...props }, extra = {}) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(SAMPLE_RATE * (seconds + 0.2)), sampleRate: SAMPLE_RATE });
  const buses = { low: ctx.destination, upper: ctx.destination, bloom: ctx.destination };
  playNote(ctx, buses, {
    midi: [midi], drum: null, time: 0, seconds, beatTimes: [], duckTimes: [],
    props: { sound, gain: 1, pan: 0, bright: 1, bloom: 0, pump: 0, tape: 0, air: 0, range: "mid", ...props }, ...extra,
  });
  return (await ctx.startRendering()).getChannelData(0);
}

/* Energy that isn't a harmonic of the note, relative to the energy that is. */
function aliasingDb(data, freq) {
  const start = SAMPLE_RATE * 0.3;
  const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) re[i] = data[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  fft(re, im);
  let harmonic = 0, other = 0;
  for (let k = 1; k < FFT_SIZE / 2; k++) {
    const hz = (k * SAMPLE_RATE) / FFT_SIZE, near = Math.round(hz / freq);
    const power = re[k] ** 2 + im[k] ** 2;
    if (near >= 1 && Math.abs(hz - near * freq) < 12) harmonic += power;
    else other += power;
  }
  return 10 * Math.log10((other + 1e-20) / (harmonic + 1e-20));
}

for (const sound of ["saw", "square", "tri", "pad", "supersaw", "stab"]) {
  test(`${sound} doesn't add scratchy aliasing to a high note`, async () => {
    const detuned = ["saw", "pad", "supersaw", "stab"].includes(sound);
    const data = await renderNote({ sound, midi: 84 });
    if (!detuned) assert.ok(aliasingDb(data, 1046.5) < -55, `aliasing ${aliasingDb(data, 1046.5).toFixed(1)} dB`);
    // detuned stacks have energy beside each harmonic on purpose, so check above the last one that fits
    const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) re[i] = data[SAMPLE_RATE * 0.3 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
    fft(re, im);
    let total = 0, top = 0;
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      const power = re[k] ** 2 + im[k] ** 2, hz = (k * SAMPLE_RATE) / FFT_SIZE;
      total += power;
      if (hz > 21000) top += power;
    }
    assert.ok(10 * Math.log10((top + 1e-20) / (total + 1e-20)) < -70, "energy above the highest harmonic");
  });
}

test("pump dips the volume without a click", async () => {
  const beatTimes = [0.6, 1.2];
  const data = await renderNote({ sound: "sine", midi: 45, seconds: 1.6, pump: 1, range: "low" }, { beatTimes });
  for (const beat of beatTimes) {
    const at = Math.round(beat * SAMPLE_RATE);
    let jump = 0;
    for (let i = at - 48; i < at + 96; i++) jump = Math.max(jump, Math.abs(data[i] - 2 * data[i - 1] + data[i - 2]));
    assert.ok(jump < 0.0015, `second difference ${jump.toFixed(5)} at ${beat}s`);
  }
});

test("a note built twice shares one wave instead of rebuilding it", async () => {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: SAMPLE_RATE, sampleRate: SAMPLE_RATE });
  let built = 0;
  const original = ctx.createPeriodicWave.bind(ctx);
  ctx.createPeriodicWave = (...args) => { built += 1; return original(...args); };
  const buses = { low: ctx.destination, upper: ctx.destination, bloom: ctx.destination };
  const note = { midi: [60], drum: null, time: 0, seconds: 0.1, beatTimes: [], duckTimes: [], props: { sound: "saw", gain: 1, pan: 0, bright: 1, bloom: 0, pump: 0, tape: 0, air: 0, range: "mid" } };
  playNote(ctx, buses, note);
  playNote(ctx, buses, note);
  assert.equal(built, 1);
});
