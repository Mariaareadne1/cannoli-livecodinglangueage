/* ============================================================
   cannoli — what cannoli adds to Strudel
   Strudel's language is untouched. These are extra words, built
   from Strudel's own controls, that bring cannoli's signature
   effects, named grooves and styles into Strudel code.
   ============================================================ */

import { BEATS, STYLES } from "../../src/core/styles.js";

const BEATS_PER_CYCLE = 4;

/* Strudel's picture functions draw on a web page; in the terminal the visual pane does that job. */
const WEB_VISUALS = ["pianoroll", "punchcard", "scope", "tscope", "fscope", "spectrum", "spiral", "pitchwheel", "wordfall", "markcss"];

/** What each extra does, for the suggestion card, guide and reference. */
export const EXTRA_DOCS = {
  bloom: { args: "amount", doc: "cannoli: a big reverb that blooms around the sound (0 to 1)", example: 'note("c3 g3").s("sawtooth").bloom(.7)' },
  ghost: { args: "amount", doc: "cannoli: quiet echoes that trail behind each note (0 to 1)", example: 'note("c4 eb4").s("triangle").ghost(.5)' },
  tape: { args: "amount", doc: "cannoli: warmth and a slow wobble, like an old tape (0 to 1)", example: 'note("c3 e3").s("sawtooth").tape(.6)' },
  pump: { args: "amount", doc: "cannoli: ducks on every beat, breathing with the kick (0 to 1)", example: 'note("c2").s("sawtooth").pump(.7)' },
  air: { args: "amount", doc: "cannoli: a soft layer of noise on each note (0 to 1)", example: 'note("c4").s("sine").air(.4)' },
  mirror: { args: "", doc: "cannoli: plays the cycle forwards then backwards, twice as fast", example: 'note("c3 e3 g3").mirror()' },
  beat: { args: "name", doc: `cannoli: a named rhythm to play on: ${Object.keys(BEATS).join(", ")}`, example: 'beat("fourfloor").s("bd")' },
  groove: { args: "name", doc: `cannoli: plays on a named rhythm: ${Object.keys(BEATS).join(", ")}`, example: 's("bd").groove("tamborzao")' },
  style: { args: "name", doc: `cannoli: sets the tempo of a style: ${Object.keys(STYLES).join(", ")}`, example: 'style("funk")' },
};

const DRUM_SOUNDS = new Set(["bd", "sd", "hh", "oh", "cp", "rim", "rm", "lt", "mt", "ht", "cb", "cr", "rd", "sh", "tb", "perc"]);

/* A step of the scale that hasn't been given a pitch yet, on a sound that can play one. */
function followsKey(value) {
  if (typeof value !== "object" || value === null || value.n === undefined || value.note !== undefined) return false;
  return !DRUM_SOUNDS.has(String(value.s ?? "").split(":")[0]);
}

/** The rhythm of a named groove, as mini-notation. */
export function grooveSteps(name) {
  const beat = BEATS[name];
  if (!beat) throw new Error(`"${name}" isn't a groove. Try: ${Object.keys(BEATS).join(", ")}`);
  return [...beat.steps].map((c) => (c === "x" ? "x" : "~")).join(" ");
}

/**
 * Add the extras to Strudel.
 * @returns {object} the words to add to Strudel's scope
 */
export function installExtras(core, { mini }) {
  const { Pattern, fastcat, silence, reify, stack, pure } = core;
  // words in quotes reach us as patterns
  const word = (value) => (value?._Pattern || value?.firstCycleValues ? value.firstCycleValues[0] : value);
  const method = (name, build) => {
    Pattern.prototype[name] = function extra(...args) { return build(this, ...args); };
  };
  method("bloom", (pat, x = 0.5) => pat.room(x).roomsize(6));
  method("ghost", (pat, x = 0.5) => pat.delay(x).delaytime(0.1875).delayfeedback(0.55));
  method("tape", (pat, x = 0.5) => pat.shape(reify(x).mul(0.35)).vib(5).vibmod(reify(x).mul(0.12)));
  method("pump", (pat, x = 0.6) => pat.tremolosync(BEATS_PER_CYCLE).tremolodepth(x).tremoloshape("ramp"));
  method("air", (pat, x = 0.4) => pat.noise(x));
  method("mirror", (pat) => fastcat(pat, pat.rev()));
  method("groove", (pat, name) => pat.struct(mini(grooveSteps(word(name)))));
  // Strudel's own .beat(positions, steps) still works: only a groove's name means something new
  const strudelBeat = Pattern.prototype.beat;
  Pattern.prototype.beat = function beat(first, ...rest) {
    return rest.length === 0 && BEATS[word(first)] ? this.struct(mini(grooveSteps(word(first)))) : strudelBeat.call(this, first, ...rest);
  };
  for (const name of WEB_VISUALS) {
    for (const visual of [name, `_${name}`]) {
      if (!Pattern.prototype[visual]) method(visual, (pat) => pat);
    }
  }
  return {
    groove: (name) => mini(grooveSteps(word(name))),
    beat: (first, ...rest) => (rest.length === 0 && BEATS[word(first)]
      ? pure({}).struct(mini(grooveSteps(word(first))))
      : core.beat(first, ...rest)),
    /* The key line: scale steps follow the song's key, while drums keep their sample numbers. */
    inKey: (scale) => (pat) => stack(pat.filterValues(followsKey).scale(scale), pat.filterValues((v) => !followsKey(v))),
    // a slider in the code is its number here; the editors draw the slider
    sliderWithID: (_id, value) => pure(value),
    style(name) {
      const chosen = STYLES[word(name)];
      if (!chosen) throw new Error(`"${word(name)}" isn't a style. Try: ${Object.keys(STYLES).join(", ")}`);
      globalThis.setcpm?.(chosen.tempo / BEATS_PER_CYCLE);
      return silence;
    },
  };
}
