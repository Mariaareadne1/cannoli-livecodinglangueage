/* ============================================================
   cannoli — the cheat sheet's examples
   Whole lines you can copy straight into the editor, and what
   in each one is yours to change. Kept apart from the page so
   the tests can check that every example compiles.
   ============================================================ */

import { VERBS, GENERATORS } from "./core/verbs.js";

const MOTIF = "0 2 4 _ 6 4";
const DRUMS = new Set(["kick", "snare", "hat", "open", "clap", "rim", "tom", "cowbell", "shaker"]);
const BASS_SOUNDS = new Set(["sub", "boom", "acid"]);
const SOUND_FIRST = new Set(["mix", "effect", "color"]);   // these read better after the sound
const DEFAULT_SOUND = { lead: "tri", bass: "saw", pad: "pad", hats: "hat" };
const THREAD_PATTERNS = { bass: "0 . 0 4", pad: "chord", stab: "chord" };
const SAMPLE_AMOUNT = "0.6";   // shown after effects, whose amount is optional
// the example's opening word, as a pattern you can paste anywhere
const HEADS = { theme: MOTIF, lead: MOTIF, bass: "0 . 0 4", pad: "chord", hats: "hits 7 16" };

/* Lines that don't come out well from the verb's own example. */
const OVERRIDES = {
  long: "pad: chord > pad > long",
  stack: `lead: ${MOTIF} > stack (2 4 6) > tri`,
  mask: "stab: chord > mask (beat tresillo) > stab",
  arp: "arp: chord > arp > fast 2 > pluck",
  low: "bass: 0 . 0 4 > low > saw",
};

const GENERATOR_LINES = {
  hits: "kick: hits 3 8 > kick",
  run: "lead: run 8 * 3 % 7 > fast 2 > bell",
  walk: "lead: walk 8 > penta > pluck",
  rand: "lead: rand 4 > slow 2 > bell",
  beat: "kick: beat tamborzao > kick",
  chord: "pad: chord > slow 2 > pad",
};

/* What each number means, with values worth trying. */
const NUMBER_HINTS = {
  rot: "how many places: 1, 2, 3",
  fast: "how many times faster: 2, 3, 1.5",
  slow: "over how many bars: 2, 4",
  chop: "repeats per note: 2, 3, 4",
  up: "how many steps up: 1, 2, 4",
  down: "how many steps down: 1, 3, 5",
  oct: "octaves: -1 down, 1 up, 2",
  every: "every how many bars: 2, 4, 8",
  maybe: "the chance each bar, 0 to 1: 0.3, 0.5",
  drift: "how far it wanders, 0 to 1",
  bright: "0 dark … 1 bright",
  gain: "0 silent … 1 full",
  pan: "-1 left, 0 middle, 1 right",
  hits: "how many hits, then over how many steps: 5 16, 3 8",
  run: "how many notes: 4, 8, 12",
  walk: "how many notes: 4, 8, 16",
  rand: "how many notes: 2, 4, 8",
};
const ARG_HINTS = {
  "num?": "an amount from 0 to 1 (leave it out for the default)",
  step: "any verb, or several in ( ): (rev > up 2)",
  pat: "any pattern",
  cond: "any condition: bar > 8, bar % 4 == 0",
  "else?": "optional: a verb for the other bars",
  word: "any groove name from the grooves table",
};
const ARG_WORDS = { num: "n", "num?": "[n]", step: "verb", pat: "pattern", cond: "condition", "else?": "[else verb]", word: "name" };

/**
 * A whole line for a verb, where its arguments sit in it, and what each one is.
 * @returns {{ line: string, tweak: [number, number] | null, hints: [string, string][] }}
 */
export function verbLine(name) {
  const v = VERBS[name];
  const line = OVERRIDES[name] ?? buildLine(name, v);
  return { line, tweak: argSpan(line, name, v.args), hints: hints(name, v.args) };
}

export function generatorLine(name) {
  const g = GENERATORS[name];
  const line = GENERATOR_LINES[name];
  return { line, tweak: argSpan(line, name, g.args, ":"), hints: hints(name, g.args) };
}

function buildLine(name, v) {
  const [head, ...written] = v.example.split(" > ");
  const chain = v.args[0] === "num?" ? written.map((step) => (step === name ? `${name} ${SAMPLE_AMOUNT}` : step)) : written;
  const thread = DRUMS.has(name) ? (name === "hat" ? "hats" : name)
    : BASS_SOUNDS.has(name) || head === "bass" ? "bass"
    : head === "hats" ? "hats"
    : name === "pad" || name === "stab" ? name
    : head === "pad" || head === "chord" || HEADS[head] === "chord" ? "pad"
    : "lead";
  const pattern = HEADS[head] === MOTIF || head === "theme" ? THREAD_PATTERNS[thread] ?? MOTIF : HEADS[head] ?? head;
  const hasSound = v.group === "sound" || chain.some((step) => VERBS[step.split(" ")[0]]?.group === "sound");
  const sound = hasSound ? [] : [DEFAULT_SOUND[thread] ?? "tri"];
  const steps = SOUND_FIRST.has(v.group) ? [...sound, ...chain] : [...chain, ...sound];
  return `${thread}: ${[pattern, ...steps].join(" > ")}`;
}

/*
 * The characters after the name up to the next top-level ">": its arguments.
 * A condition can hold ">" itself, so there the arguments run to the closing bracket.
 */
function argSpan(line, name, args, before = ">(") {
  const at = line.search(new RegExp(`[${before}]\\s*${name}\\b`));
  if (at < 0) return null;
  const start = line.indexOf(name, at) + name.length;
  if (args.includes("cond")) {
    const close = line.indexOf(")", start);
    return close < 0 ? null : [start, close + 1];
  }
  let depth = 0;
  let end = start;
  for (; end < line.length; end++) {
    const ch = line[end];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ">" && depth === 0) break;
  }
  const span = [start, end];
  return line.slice(...span).trim() ? span : null;
}

function hints(name, args) {
  return args.map((a) => [ARG_WORDS[a] ?? a, a === "num" ? NUMBER_HINTS[name] ?? "any number" : ARG_HINTS[a] ?? "yours to change"]);
}

/* ---------- a few lines for each section, with what to change in the comments ---------- */

export const SECTION_EXAMPLES = {
  stop: `def enter n = when bar <= n mute   # "enter" is your name for it: call it anything
kick: beat fourfloor > kick
hats: hits 7 16 > hat > enter 4     # comes in at bar 5: change 4 to bring it in later
bass: 0 . 0 4 > low > saw > enter 8
# lead: ${MOTIF} > tri              # a # in front: silent
pad: chord > pad > mute             # muted: delete "> mute" to hear it`,

  settings: `style house          # or rave, funk, chill
key a minor          # any note and mode: f# dorian, eb major …
tempo 122            # any speed in beats per minute
chords i VI III VII  # any numerals, one chord per bar
swing 0.15           # 0 straight … 0.5 very swung
key c minor at 17    # change key from bar 17: any bar number`,

  patterns: `theme = ${MOTIF}                  # "theme" is your name for it: call it anything
lead: theme > tri
echo: theme + 2 > high > pluck           # + 2: any number of steps higher
arp: run 8 * 3 % 7 > fast 2 > bell       # try * 2 or % 5 for another melody
bass: for i 0..3 ((0 . 0 4) + i) > low > saw   # 0..3: four bars, a step higher each
stab: if bar > 8 then chord else [0,4] > stab  # 8: the bar where it changes`,

  verbs: `lead: ${MOTIF} > every 4 rev > high > tri        # 4: any number of bars · rev: any verb
fill: ${MOTIF} > when bar % 8 == 0 (fast 2) > pluck   # every 8th bar, twice as fast
bass: 0 . 0 4 > maybe 0.3 (up 2) > low > acid     # 0.3: the chance, 0 to 1
hats: hits 7 16 > hat > sometimes (chop 2) > gain 0.4 > pan 0.3
pad: chord > slow 2 > pad > bloom 0.8 > tape      # 0.8: how much bloom, 0 to 1`,

  grooves: `kick: beat tamborzao > kick        # tamborzao: any groove from the table
snare: beat backbeat > snare
hats: beat shuffle > hat > gain 0.3
stab: chord > mask (beat tresillo) > stab   # the chord, only on the groove's hits
bass: 0 4 > mask (beat skip) > low > sub`,

  styles: `style funk                   # swap in rave, house or chill: tempo, drums and mix follow
key c minor
kick: beat tamborzao > kick
boom: 0 . . 0 . . 0 . > boom
bell: beat batida > cowbell > gain 0.4`,
};
