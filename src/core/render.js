/* ============================================================
   cannoli — render
   One bar of a program → the notes to play, in MIDI, with every
   "always sounds good" rule applied: pentatonic snapping, the
   downbeat chord lock, ranges, close voicings, swing, and the
   ghost effect's chord-climbing echoes.
   ============================================================ */

import { DRUM_NAMES } from "./verbs.js";
import { chordTones, lockToChord, snapPenta, toMidi, voiceChord } from "./harmony.js";
import { STYLES } from "./styles.js";

const EPS = 1e-6;
const DEFAULTS = { sound: "tri", range: "mid", lock: "beat", gain: 0.7, bright: 0.6, pan: 0, len: 1,
  bloom: 0, ghost: 0, tape: 0, pump: 0, air: 0 };
const BASS_SOUNDS = ["sub", "boom"];   // these default to the low range
const GHOST_REPEATS = 3;
const GHOST_STEP_BEATS = 0.75;   // a dotted eighth
const GHOST_DECAY = 0.55;

/**
 * @typedef {{ thread: string, threadIndex: number, start: number, dur: number,
 *             midi: number[], drum: string|null, props: typeof DEFAULTS, src: number[][] }} Note
 */

/** The key and chord in force at a bar (0-based). */
export function harmonyAt(settings, bar) {
  const key = [...settings.keys].reverse().find((k) => k.at <= bar);
  const line = [...settings.chords].reverse().find((c) => c.at <= bar);
  const index = (bar - line.at) % line.degrees.length;
  return { key, degree: line.degrees[index], chordName: line.names[index] };
}

/**
 * @param {import("../lang/compile.js").Program} program
 * @param {number} bar 0-based
 * @returns {Note[]} start/dur as fractions of the bar (echoes may run past 1)
 */
export function renderBar(program, bar) {
  const { settings, threads } = program;
  const { key, degree } = harmonyAt(settings, bar);
  const chord = chordTones(degree);
  const ctx = { bar, chord, vars: {}, seed: 0 };
  const kit = STYLES[settings.style]?.kit ?? "house";

  const queried = threads.map((thread) => thread.pattern.query(bar, ctx));
  // if anything is soloed this bar, only soloed threads play
  const soloing = queried.some((events) => events.some((e) => e.props.solo));

  return threads.flatMap((thread, threadIndex) =>
    queried[threadIndex]
      .filter((e) => !soloing || e.props.solo)
      .filter((e) => e.start >= -EPS && e.start < 1 - EPS)
      .flatMap((e) => {
        const props = { ...DEFAULTS, kit, ...e.props };
        if (!e.props.range && BASS_SOUNDS.includes(props.sound)) props.range = "low";
        const start = swing(e.start, settings);
        const base = { thread: thread.name, threadIndex, start, dur: e.dur * props.len, props, src: e.src };
        if (DRUM_NAMES.includes(props.sound)) return [{ ...base, midi: [], drum: props.sound }];

        const strong = Math.abs(e.start * settings.beats - Math.round(e.start * settings.beats)) < EPS;
        const degs = e.notes.map((n) => {
          let deg = props.penta ? snapPenta(n.deg, key.mode) : n.deg;
          if (n.alt === 0 && (props.lock === "tight" || (props.lock === "beat" && strong))) deg = lockToChord(deg, chord);
          return { deg, alt: n.alt };
        });
        const midis = degs.map((d) => toMidi(d.deg, d.alt, key, props.range));
        const note = { ...base, midi: midis.length > 1 ? voiceChord(midis, key, props.range) : midis, drum: null };
        return props.ghost > 0 ? [note, ...ghostEchoes(note, degs, chord, key, settings)] : [note];
      }));
}

/* Echoes that climb one chord tone each repeat, getting quieter. */
function ghostEchoes(note, degs, chord, key, settings) {
  const step = GHOST_STEP_BEATS / settings.beats;
  return Array.from({ length: GHOST_REPEATS }, (_, i) => {
    const k = i + 1;
    const climbed = degs.map((d) => climbChord(d.deg, chord, k));
    return {
      ...note,
      start: note.start + step * k,
      dur: Math.min(note.dur, step),
      midi: climbed.map((deg) => toMidi(deg, 0, key, note.props.range)),
      props: { ...note.props, gain: note.props.gain * note.props.ghost * GHOST_DECAY ** k, ghost: 0 },
      src: [],
      echo: true,
    };
  });
}

function climbChord(deg, chord, k) {
  let d = lockToChord(deg, chord);
  for (let i = 0; i < k; i++) {
    d += 1;
    while (!chord.some((t) => (((t - d) % 7) + 7) % 7 === 0)) d += 1;
  }
  return d;
}

function swing(start, settings) {
  if (!settings.swing) return start;
  const eighths = start * settings.beats * 2;
  const isOffbeat = Math.abs(eighths - Math.round(eighths)) < EPS && Math.round(eighths) % 2 === 1;
  return isOffbeat ? start + settings.swing / (settings.beats * 2) : start;
}

export { DEFAULTS as NOTE_DEFAULTS };
