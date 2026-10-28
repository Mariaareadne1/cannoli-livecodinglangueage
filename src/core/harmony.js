/* ============================================================
   loom — harmony
   One key for everything. Scale steps → MIDI notes, the
   downbeat chord lock, ranges, pentatonic snapping and close
   chord voicings. This is what keeps every thread in tune with
   every other thread.
   ============================================================ */

export const MODES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian:    [0, 1, 3, 5, 6, 8, 10],
  harmonic:   [0, 2, 3, 5, 7, 8, 11],
};

const PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
// root MIDI note for scale step 0 in each range (C2, C4, C5), adjusted per key
const RANGE_BASE = { low: 36, mid: 60, high: 72 };
const RANGE_BELOW = 5;     // semitones a range reaches below its root
const RANGE_ABOVE = 19;    // and above
const SCALE_LEN = 7;

/** "f#" → 6, "bb" → 10, "D" → 2; null if not a note name. */
export function pitchClass(name) {
  const m = name.toLowerCase().match(/^([a-g])(#|b)?$/);
  if (!m) return null;
  return mod(PITCH[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0), 12);
}

/** "VI" → 5, "iv" → 3, "5" → 4; null if not a chord name. */
export function chordDegree(word) {
  if (/^[1-7]$/.test(word)) return Number(word) - 1;
  const i = ROMAN.indexOf(word.toLowerCase());
  return i === -1 ? null : i;
}

/** Scale steps of the triad built on a degree: root, third, fifth. */
export function chordTones(degree) {
  return [degree, degree + 2, degree + 4];
}

/** Move a scale step to the nearest note of the chord (ties go down). */
export function lockToChord(deg, chord) {
  const tones = new Set(chord.map((d) => mod(d, SCALE_LEN)));
  for (let dist = 0; dist <= 3; dist++) {
    if (tones.has(mod(deg - dist, SCALE_LEN))) return deg - dist;
    if (tones.has(mod(deg + dist, SCALE_LEN))) return deg + dist;
  }
  return deg;
}

/** Snap to the 5 safest notes of the key (the pentatonic inside it). */
export function snapPenta(deg, mode) {
  const isMajor = MODES[mode][2] === 4;
  const safe = isMajor ? [0, 1, 2, 4, 5] : [0, 2, 3, 4, 6];
  const pos = mod(deg, SCALE_LEN);
  if (safe.includes(pos)) return deg;
  return safe.includes(pos - 1) ? deg - 1 : deg + 1;
}

/** The MIDI note the root (step 0) sits on for a range. */
export function rangeRoot(root, range) {
  const base = RANGE_BASE[range] ?? RANGE_BASE.mid;
  return base + (root > 6 ? root - 12 : root);
}

/** Scale step → MIDI, folded back into the thread's range. */
export function toMidi(deg, alt, key, range) {
  const scale = MODES[key.mode];
  const octave = Math.floor(deg / SCALE_LEN);
  const top = rangeRoot(key.root, range);
  let midi = top + scale[mod(deg, SCALE_LEN)] + 12 * octave + alt;
  while (midi > top + RANGE_ABOVE) midi -= 12;
  while (midi < top - RANGE_BELOW) midi += 12;
  return midi;
}

/** Close voicing: every chord note within an octave of the range centre, so chords move smoothly. */
export function voiceChord(midis, key, range) {
  const centre = rangeRoot(key.root, range) + 7;
  const placed = midis.map((m) => {
    let n = m;
    while (n > centre + 6) n -= 12;
    while (n < centre - 6) n += 12;
    return n;
  });
  return [...new Set(placed)].sort((a, b) => a - b);
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}
