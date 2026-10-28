/* ============================================================
   cannoli — verbs and generators
   Every word that goes after ">" (a verb) or makes a pattern on
   its own (a generator). Each entry documents itself: the
   editor's suggestion cards read `doc` and `example` from here.

   Argument kinds:  num  a number (may use bar, loop counters …)
                    num? an optional number
                    step a verb, or (verb > verb …)
                    pat  a pattern
   ============================================================ */

import { BEATS } from "./styles.js";
import {
  Pattern, sequence, stack, fast, slow, mapEvents, mapNotes, setProps, when, sorted, mod, rand, pure, silence,
} from "./pattern.js";

const SOUNDS = ["saw", "square", "tri", "sine", "pluck", "pad", "bell", "supersaw", "acid", "stab", "sub", "boom"];
const DRUMS = ["kick", "snare", "hat", "open", "clap", "rim", "tom", "cowbell", "shaker"];
const SOUND_DOCS = {
  supersaw: "a wide stack of detuned saws: the classic rave lead",
  acid: "a squelchy resonant bass, 303-style",
  stab: "a short, punchy chord stab",
  sub: "a deep, clean sub bass",
  boom: "a pitched 808 boom that slides down into the note",
};
const EFFECT_DEFAULT = { bloom: 0.5, ghost: 0.5, tape: 0.5, pump: 0.6, air: 0.4 };

/** @type {Record<string, { group: string, args: string[], doc: string, example: string, apply: Function }>} */
export const VERBS = {
  /* order */
  rev: verb("order", [], "plays the bar backwards", "theme > rev", (p) =>
    mapEvents(p, (events) => sorted(events.map((e) => ({ ...e, start: 1 - e.start - e.dur }))))),
  rot: verb("order", ["num"], "rotates the notes n places, keeping the rhythm", "theme > rot 1", (p, [n]) =>
    mapEvents(p, (events, c, ctx) => {
      const ev = sorted(events);
      const k = Math.round(n(ctx));
      return ev.map((e, i) => ({ ...e, notes: ev[mod(i + k, ev.length)].notes }));
    })),
  mirror: verb("order", [], "plays the bar forwards then backwards, twice as fast", "theme > mirror", (p) =>
    sequence([{ pattern: p, weight: 1 }, { pattern: VERBS.rev.apply(p, []), weight: 1 }])),
  shuffle: verb("order", [], "mixes up the order of the notes, differently each bar", "theme > shuffle", (p, args, seed) =>
    mapEvents(p, (events, c, ctx) => {
      const ev = sorted(events);
      const order = ev.map((_, i) => i).sort((a, b) => rand(ctx.bar, a, seed) - rand(ctx.bar, b, seed));
      return ev.map((e, i) => ({ ...e, notes: ev[order[i]].notes }));
    })),

  /* time */
  fast: verb("time", ["num"], "n times as fast: more notes in the bar", "theme > fast 2", (p, [n]) => fast(p, n)),
  slow: verb("time", ["num"], "n times as slow: the pattern stretches over n bars", "chord > slow 2", (p, [n]) => slow(p, n)),
  chop: verb("time", ["num"], "repeats every note n times inside its own length", "theme > chop 3", (p, [n]) =>
    mapEvents(p, (events, c, ctx) => {
      const k = Math.max(1, Math.round(n(ctx)));
      return events.flatMap((e) => Array.from({ length: k }, (_, i) => ({ ...e, start: e.start + (i * e.dur) / k, dur: e.dur / k })));
    })),
  long: verb("time", [], "lets each note ring twice as long", "pad > long", (p) => scaleLength(p, 2)),
  short: verb("time", [], "makes each note short and detached", "theme > short", (p) => scaleLength(p, 0.4)),

  /* pitch */
  up: verb("pitch", ["num"], "moves every note n steps up the scale (stays in key)", "theme > up 2", (p, [n]) =>
    mapNotes(p, (note, ctx) => ({ ...note, deg: note.deg + Math.round(n(ctx)) }))),
  down: verb("pitch", ["num"], "moves every note n steps down the scale", "theme > down 3", (p, [n]) =>
    mapNotes(p, (note, ctx) => ({ ...note, deg: note.deg - Math.round(n(ctx)) }))),
  oct: verb("pitch", ["num"], "moves every note n octaves (negative for down)", "theme > oct -1", (p, [n]) =>
    mapNotes(p, (note, ctx) => ({ ...note, deg: note.deg + 7 * Math.round(n(ctx)) }))),
  flip: verb("pitch", [], "turns the melody upside down: up becomes down", "theme > flip", (p) =>
    mapNotes(p, (note) => ({ ...note, deg: 0 - note.deg || 0 }))),
  penta: verb("pitch", [], "keeps only the five safest notes of the key (pentatonic)", "walk 8 > penta", (p) =>
    setProps(p, { penta: true })),
  arp: verb("pitch", [], "spreads chords out into single notes, low to high", "chord > arp", (p) =>
    mapEvents(p, (events) => events.flatMap((e) => {
      const notes = [...e.notes].sort((a, b) => a.deg - b.deg);
      return notes.map((note, i) => ({ ...e, notes: [note], start: e.start + (i * e.dur) / notes.length, dur: e.dur / notes.length }));
    }))),

  /* structure */
  grow: verb("structure", [], "every note becomes the whole pattern, started on that note: a fractal", "0 2 4 > grow", (p) =>
    mapEvents(p, (events) => {
      const ev = sorted(events);
      return ev.flatMap((outer) => ev.map((inner) => ({
        ...inner,
        start: outer.start + inner.start * outer.dur,
        dur: inner.dur * outer.dur,
        notes: inner.notes.map((n) => ({ ...n, deg: n.deg + (outer.notes[0]?.deg ?? 0) })),
        src: [...inner.src, ...outer.src],
      })));
    })),
  stack: verb("structure", ["pat"], "plays another pattern at the same time", "theme > stack (theme + 4)", (p, [q]) => stack([p, q])),
  mask: verb("structure", ["pat"], "a gate: notes only sound where the other pattern has hits, cut to fit them", "chord > mask (beat tresillo)", (p, [q]) =>
    new Pattern((c, ctx) => {
      const gates = q.query(c, ctx);
      return p.query(c, ctx).flatMap((e) => gates.flatMap((g) => {
        const start = Math.max(e.start, g.start);
        const end = Math.min(e.start + e.dur, g.start + g.dur);
        return end - start > 1e-9 ? [{ ...e, start, dur: end - start }] : [];
      }));
    }, p.len)),

  /* change over time */
  every: verb("change", ["num", "step"], "applies a verb every nth bar (bar n, 2n, 3n …)", "theme > every 4 rev", (p, [n, step]) =>
    when(p, (ctx) => mod(ctx.bar + 1, Math.max(1, Math.round(n(ctx)))) === 0, step)),
  maybe: verb("change", ["num", "step"], "applies a verb in a random share of bars (0–1)", "theme > maybe 0.3 shuffle", (p, [n, step], seed) =>
    when(p, (ctx) => rand(ctx.bar, seed) < n(ctx), step)),
  when: verb("change", ["cond", "step", "else?"], "applies a verb in bars where a condition is true (else: another verb)", "theme > when bar > 8 (fast 2)", (p, [test, step, other]) =>
    when(p, test, step, other ?? undefined)),
  sometimes: verb("change", ["step"], "applies a verb in about half the bars", "theme > sometimes (fast 2)", (p, [step], seed) =>
    when(p, (ctx) => rand(ctx.bar, seed) < 0.5, step)),
  drift: verb("change", ["num"], "nudges some notes up or down each bar, so the line keeps evolving (0–1)", "theme > drift 0.3", (p, [n], seed) =>
    mapNotes(p, (note, ctx, i) => {
      if (rand(ctx.bar, i, seed) >= n(ctx)) return note;
      const moves = [-2, -1, 1, 2];
      return { ...note, deg: note.deg + moves[Math.floor(rand(seed, i, ctx.bar, 7) * moves.length)] };
    })),

  /* mixing a performance */
  mute: verb("mix", [], "silences the thread (try it with when: > when bar <= 8 mute)", "lead > mute", (p) =>
    mapEvents(p, () => [])),
  solo: verb("mix", [], "only soloed threads play, so you can hear one on its own", "bass > solo", (p) =>
    setProps(p, { solo: true })),

  /* range + harmony */
  low: verb("range", [], "puts the thread in the bass register", "bass > low", (p) => setProps(p, { range: "low" })),
  mid: verb("range", [], "puts the thread in the middle register (the default)", "theme > mid", (p) => setProps(p, { range: "mid" })),
  high: verb("range", [], "puts the thread up high, above the others", "lead > high", (p) => setProps(p, { range: "high" })),
  free: verb("harmony", [], "turns off the downbeat lock: notes play exactly as written", "theme > free", (p) => setProps(p, { lock: "free" })),
  tight: verb("harmony", [], "locks every note to the current chord, not just downbeats", "walk 8 > tight", (p) => setProps(p, { lock: "tight" })),

  /* color */
  bright: verb("color", ["num"], "how bright the tone is, 0 (dark) to 1 (bright)", "lead > bright 0.8", (p, [n]) => setProps(p, { bright: n })),
  gain: verb("color", ["num"], "how loud, 0 to 1", "hats > gain 0.4", (p, [n]) => setProps(p, { gain: n })),
  pan: verb("color", ["num"], "left (-1) to right (1)", "lead > pan -0.5", (p, [n]) => setProps(p, { pan: n })),
};

for (const name of [...SOUNDS, ...DRUMS]) {
  const isDrum = DRUMS.includes(name);
  VERBS[name] = verb("sound", [], isDrum ? `plays a ${name} on every note` : SOUND_DOCS[name] ?? `plays the notes with the ${name} sound`,
    isDrum ? `hits 4 16 > ${name}` : `theme > ${name}`, (p) => setProps(p, { sound: name }));
}

const EFFECT_DOCS = {
  bloom: "a reverb that rings at the notes of the key",
  ghost: "echoes that climb through the current chord",
  tape: "warmth and a slow wobble",
  pump: "ducks on every beat, breathing with the kick",
  air: "adds a soft noise layer to each note",
};
for (const [name, doc] of Object.entries(EFFECT_DOCS)) {
  VERBS[name] = verb("effect", ["num?"], `${doc} (amount 0–1, default ${EFFECT_DEFAULT[name]})`, `lead > ${name}`, (p, [n]) =>
    setProps(p, { [name]: n ?? (() => EFFECT_DEFAULT[name]) }));
}

/* ---------- generators: words that make a pattern ---------- */

/** @type {Record<string, { args: string[], doc: string, example: string, make: Function }>} */
export const GENERATORS = {
  hits: gen(["num", "num"], "k hits spread as evenly as possible over n steps (a Euclidean rhythm)", "hits 3 8 > kick", ([k, n], src) =>
    perCycle((ctx) => {
      const steps = Math.max(1, Math.round(n(ctx)));
      const count = Math.max(0, Math.min(steps, Math.round(k(ctx))));
      return Array.from({ length: steps }, (_, i) => ((i * count) % steps < count ? note(0, src) : silence));
    })),
  run: gen(["num"], "counts up: run 5 is 0 1 2 3 4", "run 8 * 3 % 7", ([n], src) =>
    perCycle((ctx) => Array.from({ length: Math.max(1, Math.round(n(ctx))) }, (_, i) => note(i, src)))),
  walk: gen(["num"], "n notes that wander up and down by a step, new every bar", "walk 8 > penta", ([n], src, seed) =>
    perCycle((ctx) => {
      let deg = 0;
      return Array.from({ length: Math.max(1, Math.round(n(ctx))) }, (_, i) => {
        if (i > 0) deg += rand(ctx.bar, i, seed) < 0.5 ? -1 : 1;
        return note(Math.max(-7, Math.min(14, deg)), src);
      });
    })),
  rand: gen(["num"], "n random notes from the key, new every bar", "rand 4 > slow 2", ([n], src, seed) =>
    perCycle((ctx) => Array.from({ length: Math.max(1, Math.round(n(ctx))) }, (_, i) =>
      note(Math.floor(rand(ctx.bar, i, seed, 3) * 8), src)))),
  beat: gen(["word"], `a named groove: ${Object.keys(BEATS).join(", ")}`, "beat tamborzao > kick", ([name], src) => {
    const steps = BEATS[name].steps;
    return sequence([...steps].map((c) => ({ pattern: c === "x" ? note(0, src) : silence, weight: 1 })));
  }),
  chord: gen([], "the current chord from the chords line, all at once", "chord > slow 2 > pad", (args, src) =>
    new Pattern((c, ctx) => [{ start: 0, dur: 1, notes: ctx.chord.map((deg) => ({ deg, alt: 0 })), props: {}, src: [src] }])),
};

/* ---------- helpers ---------- */

function verb(group, args, doc, example, apply) {
  return { group, args, doc, example, apply };
}

function gen(args, doc, example, make) {
  return { args, doc, example, make };
}

function note(deg, src) {
  return pure([{ deg, alt: 0 }], src);
}

/* A sequence rebuilt every cycle (its size can depend on bar). */
function perCycle(build) {
  return new Pattern((c, ctx) => sequence(build(ctx).map((pattern) => ({ pattern, weight: 1 }))).query(c, ctx));
}

function scaleLength(p, factor) {
  return mapEvents(p, (events) => events.map((e) => ({ ...e, props: { ...e.props, len: (e.props.len ?? 1) * factor } })));
}

export const SOUND_NAMES = SOUNDS;
export const DRUM_NAMES = DRUMS;
export const VERB_GROUPS = ["order", "time", "pitch", "structure", "change", "mix", "range", "harmony", "sound", "color", "effect"];
