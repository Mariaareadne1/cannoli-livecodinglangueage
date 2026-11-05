/* ============================================================
   cannoli — ideas for a thread you've just named
   Type a name and a colon, and the card offers a few whole lines
   for that kind of part. "kick" gets kicks, "arp" gets arps, and
   the rest of the name changes them: "slowlead" is a slow lead.
   They fit the song: the style's grooves, your melody, your kick.
   ============================================================ */

import { STYLES } from "../core/styles.js";

const MOTIF = "0 2 4 _ 6 4";
const MAX_IDEAS = 5;
const FALLBACK_GROOVES = ["fourfloor", "skip", "tresillo"];

/* Words in a name that change the line, and the step each adds. "first" steps go straight after the pattern. */
const MODIFIERS = {
  slow: { step: "slow 2", first: true, instead: "fast" }, fast: { step: "fast 2", first: true, instead: "slow" },
  soft: { step: "gain 0.5" }, quiet: { step: "gain 0.3" },
  dark: { step: "bright 0.3" }, bright: { step: "bright 0.9" },
  high: { step: "high", instead: "low" }, low: { step: "low", instead: "high" },
  short: { step: "short", instead: "long" }, long: { step: "long", instead: "short" },
  dreamy: { step: "bloom 0.7" }, dirty: { step: "tape 0.7" },
};

/* The parts, each with the words that call it up. Words under 3 letters must be the whole name. */
const PARTS = [
  { words: ["kick", "kik", "bd", "drum", "drums"], ideas: ({ grooves }) => [
    [`beat ${grooves[0]} > bd`, "the main groove of this style"],
    [`beat ${grooves[1]} > bd`, "another groove that fits this style"],
    ["euclid 5 16 > bd", "five hits spread out: a broken, rolling kick"],
    ["0 . . 0 . . 0 . > bd", "a 3-3-2 kick: it pushes against the beat"],
    ["0 . 0 . > bd > every 4 (ply 2)", "half-time, with a double hit every 4th bar"],
  ] },
  { words: ["snare", "sd"], ideas: () => [
    ["beat backbeat > sd", "beats 2 and 4"],
    ["beat backbeat > sd > every 4 (ply 2)", "beats 2 and 4, with a roll every 4th bar"],
    ["euclid 3 8 > sd > gain 0.6", "a syncopated snare, a little quieter"],
    [". . . . 0 . . 0 > sd", "beat 2, then a late hit that leads back round"],
  ] },
  { words: ["clap", "cp"], ideas: () => [
    ["beat backbeat > cp", "beats 2 and 4"],
    ["beat backbeat > cp > bloom 0.3", "a clap that rings out a little"],
    ["euclid 3 8 > cp > gain 0.5", "offbeat, quieter claps"],
  ] },
  { words: ["open", "oh"], ideas: () => [
    ["beat offbeat > oh > gain 0.5", "between the beats: the classic dance open hat"],
    ["euclid 3 8 > oh > gain 0.4", "a looser, syncopated open hat"],
    [". . . 0 > oh > gain 0.5", "one open hat at the end of each bar"],
  ] },
  { words: ["hat", "hats", "hihat", "hh"], ideas: () => [
    ["euclid 7 16 > hh > gain 0.4", "quiet, busy hats spread across the bar"],
    ["0 0 0 0 0 0 0 0 > hh > gain 0.4", "steady eighth notes"],
    ["beat shuffle > hh > gain 0.3", "a busy, skipping pattern"],
    ["beat offbeat > hh > gain 0.5", "only between the beats, so it bounces"],
    ["euclid 11 16 > hh > gain 0.3 > pan 0.3", "dense and off to one side"],
  ] },
  { words: ["rim"], ideas: () => [
    ["euclid 3 8 > rim > gain 0.5", "a syncopated click"],
    ["euclid 5 16 > rim > gain 0.4", "sparse, rolling clicks"],
    ["beat skip > rim > gain 0.4", "a skipping pattern"],
  ] },
  { words: ["tom", "mt"], ideas: () => [
    ["euclid 3 16 > mt > gain 0.6", "three scattered tom hits"],
    [". . . . . . 0 0 > mt", "a small fill at the end of each bar"],
    ["euclid 5 16 > mt > every 4 (ply 2) > gain 0.5", "rolling toms, doubling every 4th bar"],
  ] },
  { words: ["shaker", "sh"], ideas: () => [
    ["0 0 0 0 0 0 0 0 > sh > gain 0.4", "steady eighth notes"],
    ["beat shuffle > sh > gain 0.3", "a busy, skipping shaker"],
    ["euclid 7 16 > sh > gain 0.4 > pan -0.3", "uneven and off to one side"],
  ] },
  { words: ["cowbell", "cb"], ideas: () => [
    ["beat batida > cb > gain 0.4", "the baile funk bell: boom, ta-ta"],
    ["euclid 3 8 > cb > gain 0.4", "a 3-3-2 bell"],
    ["beat offbeat > cb > gain 0.3", "only between the beats"],
  ] },
  { words: ["bass"], ideas: ({ kick, style }) => [
    ["0 . 0 4 > low > sawtooth > pump", "a bassline that breathes with the kick"],
    kick && [`0 > mask (beat ${kick}) > low > sub`, `plays only when your kick does (beat ${kick}), so they lock together`],
    style === "funk" && ["0 . . 0 . . 0 . > boom", "a booming 808 line in the baile rhythm"],
    style === "rave" && ["run 8 * 3 % 7 > low > acid > drift 0.2", "a squelchy acid line that keeps evolving"],
    ["0 0 3 4 > low > sub", "a deep, simple four-note line"],
    ["walk 8 > penta > low > sawtooth", "a walking line that changes every bar"],
  ] },
  { words: ["sub"], ideas: ({ kick }) => [
    ["0 . 0 . > sub", "a deep note on beats 1 and 3"],
    kick && [`0 > mask (beat ${kick}) > sub`, `plays only when your kick does (beat ${kick})`],
    ["chord > arp > slow 2 > sub", "follows the chords, slowly"],
    ["0 _ _ 4 > sub", "long notes that move once a bar"],
  ] },
  { words: ["acid"], ideas: () => [
    ["run 8 * 3 % 7 > acid > low > drift 0.2", "a melody from arithmetic that keeps evolving"],
    ["0 0 7 0 3 0 5 0 > acid > low", "a pulsing line with octave jumps"],
    ["walk 16 > penta > acid > low", "sixteen wandering notes, new each bar"],
  ] },
  { words: ["lead", "melody"], ideas: ({ melody, added }) => [
    [`${melody} > every 4 rev > high > triangle`, "the melody up high, backwards every 4th bar"],
    [`${added} > high > pluck`, "the melody two steps higher, so it harmonises"],
    ["walk 8 > penta > high > square > ghost 0.3", "a new melody each bar, with climbing echoes"],
    [`${melody} > fast 2 > every 4 (scaleTranspose 2) > high > supersaw`, "twice as fast and wide, lifting every 4th bar"],
    [`${melody} > mirror > high > bell`, "forwards then backwards, on a bell"],
  ] },
  { words: ["arp", "arpeggio"], ideas: () => [
    ["chord > arp > fast 2 > high > pluck", "the chord one note at a time, twice over"],
    ["chord > arp > fast 4 > bell > ghost 0.4", "fast and glittering, with climbing echoes"],
    ["chord > arp > every 4 rev > high > triangle", "up the chord, and down it every 4th bar"],
    ["chord > arp > slow 2 > high > sine > bloom", "slow and floating"],
    ["run 8 > tight > high > pluck", "eight notes all locked to the chord"],
  ] },
  { words: ["chord"], ideas: ({ grooves }) => [
    ["chord > slow 2 > pad > bloom", "held for two bars, ringing in the key"],
    ["chord > stab > high > gain 0.5", "a short hit on each bar"],
    [`chord > mask (beat ${grooves[0]}) > stab > high > gain 0.5`, "stabs on this style's groove"],
    ["chord > pluck > long", "plucked, and left to ring"],
  ] },
  { words: ["pad"], ideas: () => [
    ["chord > slow 2 > pad > bloom", "the chords, held for two bars, ringing in the key"],
    ["chord > slow 4 > pad > tape > bloom 0.7", "slow and worn, like an old tape"],
    ["chord > pad > pump", "breathes with the beat"],
    ["chord > sine > long > bloom", "soft and pure"],
  ] },
  { words: ["stab"], ideas: ({ kick, grooves }) => [
    [`chord > mask (beat ${grooves[0]}) > stab > high > gain 0.5`, "stabs on this style's groove"],
    kick && kick !== grooves[0] && [`chord > mask (beat ${kick}) > stab > high > gain 0.5`, `stabs that hit with your kick (beat ${kick})`],
    ["chord > mask (beat tresillo) > stab > gain 0.5", "a 3-3-2 stab"],
    ["chord > mask (euclid 3 8) > stab > high", "three spread stabs"],
    ["chord > stab > every 4 (ply 2) > gain 0.5", "one stab, doubling every 4th bar"],
  ] },
  { words: ["synth"], ideas: ({ melody }) => [
    [`${melody} > supersaw > high > gain 0.5`, "the melody on a wide rave synth"],
    ["chord > arp > sawtooth > high > short", "short notes up the chord"],
    ["walk 8 > penta > square > short", "a new, chippy line each bar"],
    [`${melody} > fast 2 > pluck > ghost 0.3`, "quick, plucked, with climbing echoes"],
  ] },
  { words: ["keys", "piano"], ideas: ({ melody }) => [
    ["chord > mask (beat offbeat) > pluck", "chords between the beats"],
    ["chord > arp > pluck > long", "the chord rolled out, left to ring"],
    [`${melody} > pluck > bloom 0.3`, "the melody in a small room"],
  ] },
  { words: ["pluck"], ideas: ({ melody }) => [
    [`${melody} > pluck > high`, "the melody, plucked"],
    ["euclid 5 8 > penta > pluck > high", "a little rhythm on the safest notes"],
    ["chord > arp > fast 2 > pluck", "the chord, picked out"],
  ] },
  { words: ["bell"], ideas: ({ melody }) => [
    [`${melody} > slow 2 > bell > high > bloom`, "the melody at half speed, ringing"],
    ["chord > arp > slow 2 > bell", "the chord, one bell at a time"],
    ["walk 4 > penta > bell > high > ghost 0.4", "a few wandering notes, with echoes"],
  ] },
  { words: ["vox", "voice", "vocal"], ideas: ({ melody }) => [
    [`${melody} > square > high > short`, "short, voice-like chops of the melody"],
    ["4 . 4 2 . 0 . . > square > high > short > someCyclesBy 0.5 rev", "a call that sometimes answers backwards"],
    ["chord > arp > square > high > short", "chopped notes from the chord"],
  ] },
  { words: ["drone"], ideas: () => [
    ["0 > slow 4 > pad > low > tape", "one low note, slowly wobbling"],
    ["[0,4] > slow 4 > pad > bloom", "an open fifth that never stops ringing"],
    ["0 > slow 2 > sine > low > long", "a pure low hum"],
  ] },
  { words: ["riff", "hook"], ideas: ({ melody }) => [
    ["0 2 4 7 > fast 2 > pluck > high", "four notes, twice a bar"],
    [`${melody} > fast 2 > every 4 rev > square`, "your melody, doubled and flipped every 4th bar"],
    ["run 8 * 3 % 7 > tight > supersaw > high", "a melody from arithmetic, locked to the chords"],
  ] },
  { words: ["echo", "counter", "answer"], ideas: ({ added, melody }) => [
    [`${added} > high > ghost`, "the melody two steps up, with climbing echoes"],
    [`${melody} > rev > high > sine`, "the melody backwards"],
    [`${melody} > rot 2 > high > bell`, "the same rhythm, with the notes shifted along"],
  ] },
  { words: ["fx", "riser", "noise"], ideas: () => [
    ["run 16 > high > sine > air > gain 0.2 > when bar % 8 != 0 hush", "a run up that only plays every 8th bar"],
    ["0 > slow 8 > air > high > gain 0.2", "a long breath of air"],
    ["rand 4 > high > sine > ghost 0.6 > gain 0.2", "random blips with long echoes"],
  ] },
];

/* A name nothing above recognises: one of each role. */
const ANY_PART = ({ melody }) => [
  [`${melody} > high > triangle`, "a melody"],
  ["chord > slow 2 > pad", "the chords, held"],
  ["chord > arp > fast 2 > pluck", "the chord, one note at a time"],
  ["euclid 5 16 > rim > gain 0.5", "a rhythm"],
];

/**
 * A few whole lines for a thread called `name`.
 * @param {string} name
 * @param {string} text  the whole song
 * @param {{ style?: string, vars?: string[] }} symbols
 * @returns {[string, string][]}  [line, why it fits]
 */
export function threadIdeas(name, text, symbols = {}) {
  const lower = name.toLowerCase();
  const part = findPart(lower);
  const song = songContext(text, symbols);
  const written = new Set(text.split("\n").map((l) => l.match(/^\s*[A-Za-z]\w*:\s*(.*?)\s*$/)?.[1]).filter(Boolean));
  const modifiers = modifiersIn(lower.replace(part?.word ?? "", ""));
  const ideas = (part ? part.ideas(song) : ANY_PART(song)).filter(Boolean).map(([body, why]) => [modified(body, modifiers), why]);
  return ideas.filter(([body]) => !written.has(body)).slice(0, MAX_IDEAS);
}

/* The modifier words in what's left of the name, longest first, so "slow" doesn't also count as "low". */
function modifiersIn(rest) {
  const words = Object.keys(MODIFIERS).sort((a, b) => b.length - a.length);
  return words.reduce(({ left, found }, word) => (left.includes(word)
    ? { left: left.replace(word, ""), found: [...found, word] }
    : { left, found }), { left: rest, found: [] }).found;
}

/* The longest word that matches wins, so "cowbell" is a cowbell rather than a bell. */
function findPart(lower) {
  let best = null;
  for (const { words, ideas } of PARTS) {
    for (const word of words) {
      const matches = word.length < 3 ? lower === word : lower.includes(word);
      if (matches && (!best || word.length > best.word.length)) best = { word, ideas };
    }
  }
  return best;
}

function songContext(text, symbols) {
  const lines = text.split("\n");
  const numeric = (v) => lines.some((l) => new RegExp(`^${v}\\s*=\\s*-?[\\d.]+\\s*$`).test(l));
  const written = lines.map((l) => l.match(/^([A-Za-z]\w*)\s*=\s*\S/)?.[1]).filter(Boolean);
  const variable = [...(symbols.vars ?? []), ...written].find((v) => !numeric(v));
  const kickLine = lines.find((l) => /^[A-Za-z]\w*:.*>\s*(bd|kick)\b/.test(l));
  return {
    style: symbols.style,
    grooves: [...(STYLES[symbols.style]?.beats ?? []), ...FALLBACK_GROOVES],
    melody: variable ?? MOTIF,
    added: variable ? `${variable} + 2` : `(${MOTIF}) + 2`,
    kick: kickLine?.match(/\bbeat\s+(\w+)/)?.[1] ?? null,
  };
}

function modified(body, words) {
  return words.reduce((line, word) => {
    const { step, first, instead } = MODIFIERS[word];
    const verb = step.split(" ")[0];
    const parts = line.split(" > ").filter((p) => p.split(" ")[0] !== instead);
    if (parts.some((p) => p.split(" ")[0] === verb)) {
      return parts.map((p) => (p.split(" ")[0] === verb ? step : p)).join(" > ");
    }
    return (first ? [parts[0], step, ...parts.slice(1)] : [...parts, step]).join(" > ");
  }, body);
}
