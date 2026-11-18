/* cannoli — the slider(value, low, high) calls written in a song, for the side panel. */

const SLIDER_RE = /(?:\.(\w+)\(\s*)?\bslider\(\s*(-?\d*\.?\d+)\s*(?:,\s*(-?\d*\.?\d+)\s*)?(?:,\s*(-?\d*\.?\d+)\s*)?/g;
const STEPS = 100;
const DEFAULT_LOW = 0;
const DEFAULT_HIGH = 1;

/** Every slider in the song, with where its number is. */
export function findStrudelSliders(text) {
  return [...text.matchAll(SLIDER_RE)].map((m) => {
    const number = m[0].indexOf(m[2], m[0].indexOf("slider("));
    const [min, max] = [Number(m[3] ?? DEFAULT_LOW), Number(m[4] ?? DEFAULT_HIGH)];
    return { label: m[1] ?? "slider", value: Number(m[2]), min, max, step: (max - min) / STEPS, start: m.index + number, end: m.index + number + m[2].length };
  });
}
