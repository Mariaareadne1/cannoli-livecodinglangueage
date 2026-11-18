/* ============================================================
   cannoli — suggestions for Strudel code
   After a dot: every function, described by Strudel's own docs.
   Inside s("…"): the sounds. After a name and a colon: a few
   whole lines for that kind of part, which fit the song.
   ============================================================ */

import { catalog } from "./catalog.js";
import { readHeader } from "./dialect.js";

const MAX_ITEMS = 40;
export const SOUNDS = [
  ["bd", "bass drum"], ["sd", "snare"], ["hh", "closed hi-hat"], ["oh", "open hi-hat"], ["cp", "clap"], ["rim", "rimshot"],
  ["lt", "low tom"], ["mt", "mid tom"], ["ht", "high tom"], ["cb", "cowbell"], ["cr", "crash"], ["rd", "ride"], ["sh", "shaker"], ["tb", "tambourine"], ["perc", "percussion"],
  ["sine", "a pure tone"], ["triangle", "soft and round"], ["square", "hollow and reedy"], ["sawtooth", "bright and buzzy"], ["supersaw", "wide and detuned"],
  ["piano", "a sampled grand piano"], ["white", "white noise"], ["pink", "pink noise"], ["brown", "brown noise"],
];
const BANKS = ["RolandTR909", "RolandTR808", "RolandTR707", "AkaiLinn", "LinnDrum", "BossDR110", "AlesisHR16"];
const MODES = ["major", "minor", "dorian", "mixolydian", "lydian", "phrygian", "locrian", "minor:pentatonic", "major:pentatonic"];
const NOTES = ["C", "D", "E", "F", "G", "A", "B", "Bb", "Eb", "F#"];
const STARTERS = [
  ["key a minor", "key", "cannoli: every n() in the song follows this key"],
  ["tempo 120", "tempo", "cannoli: the speed, in beats a minute"],
  ['beat("fourfloor").s("bd")', "beat", "cannoli: plays on a named rhythm"],
  ['s("bd*4")', "s", "plays a sound or drum pattern"],
  ['note("c3 e3 g3")', "note", "plays notes by name"],
  ['n("0 2 4").scale("C:minor")', "n", "plays steps of a scale"],
  ['stack(s("bd*4"), s("hh*8"))', "stack", "plays patterns at the same time"],
  ['chord("<Am C F G>").voicing()', "chord", "plays chords, voiced for you"],
  ["setcpm(120/4)", "setcpm", "sets the tempo: 120 beats a minute, 4 to a cycle"],
  ['style("funk")', "style", "cannoli: sets the tempo of a style"],
  ['$: s("bd*4")', "$:", "starts a pattern that plays alongside the others"],
];

const IDEAS = [
  { words: ["kick", "bd", "drum"], lines: () => [['beat("fourfloor").s("bd")', "four on the floor"], ['s("bd(3,8)")', "a syncopated Euclidean kick"], ['beat("tamborzao").s("bd")', "cannoli's baile funk rhythm"], ['s("bd [~ bd] ~ bd")', "a broken kick"]] },
  { words: ["snare", "sd"], lines: () => [['beat("backbeat").s("sd")', "beats 2 and 4"], ['s("~ sd ~ [sd sd]")', "a little fill at the end"], ['s("sd(3,8,2)").gain(.6)', "syncopated and quieter"]] },
  { words: ["clap", "cp"], lines: () => [['s("~ cp ~ cp")', "beats 2 and 4"], ['s("~ cp ~ cp").room(.4)', "with some space around it"]] },
  { words: ["hat", "hh"], lines: () => [['s("hh*8").gain(.5)', "steady eighth notes"], ['s("hh*16").gain("[.5 .25]*8")', "sixteenths with an accent"], ['s("~ oh ~ oh ~ oh ~ oh").gain(.5)', "open hats between the beats"]] },
  { words: ["bass"], lines: ({ scale }) => [[`n("0 ~ 0 4").scale("${scale}").s("sawtooth").lpf(600).octave(2)`, "a filtered bassline"], [`n("<0 3 4 2>").scale("${scale}").s("supersaw").lpf(400).octave(2)`, "one wide note a cycle"], [`n("0*8").scale("${scale}").s("sawtooth").lpf(sine.range(300, 1500).slow(4)).octave(2)`, "a pulsing, opening filter"]] },
  { words: ["lead", "melody", "riff", "hook"], lines: ({ scale }) => [[`n("0 2 4 <6 7>").scale("${scale}").s("triangle").delay(.3)`, "a simple line with an echo"], [`n("0 [2 4] <7 5> 4").scale("${scale}").s("sawtooth").lpf(1800).room(.3)`, "a brighter melody"], [`n(run(8)).scale("${scale}").s("square").every(4, rev).gain(.5)`, "up the scale, backwards every 4th cycle"]] },
  { words: ["arp"], lines: ({ scale }) => [[`n("0 2 4 7").fast(2).scale("${scale}").s("triangle").delay(.4)`, "a quick arpeggio"], ['chord("<Am F C G>").voicing().arp("0 1 2 3").s("sawtooth").lpf(1500)', "arpeggiated chords"], [`n("0 2 4 7").palindrome().fast(2).scale("${scale}").s("sine").room(.5)`, "up and back down"]] },
  { words: ["chord", "pad", "keys", "piano"], lines: () => [['chord("<Am F C G>").voicing().s("sawtooth").lpf(900).room(.6)', "a soft held progression"], ['chord("<Am7 Dm7 G7 C^7>").voicing().s("piano")', "jazzy chords on piano"], ['chord("<Am F>").voicing().s("supersaw").attack(.4).release(1).gain(.5)', "a slow wide pad"]] },
  { words: ["synth"], lines: ({ scale }) => [[`n("0 3 5 7").scale("${scale}").s("supersaw").lpf(1200).gain(.5)`, "a wide synth line"], [`n("<0 2>*4").scale("${scale}").s("square").lpf(sine.range(400, 2000).slow(8))`, "a slowly opening square"]] },
];
const ANY_PART = ({ scale }) => [[`n("0 2 4 7").scale("${scale}").s("triangle")`, "a melody"], ['chord("<Am F>").voicing().s("sawtooth").lpf(900)', "chords"], ['s("bd(3,8), hh*8")', "a beat"]];

function item(label, kind, detail, doc, insert, extra = {}) {
  return { label, kind, detail, doc, example: "", insert, ...extra };
}

/* A whole call, taken from the docs' example: .fast(2) from  s("bd").fast(2) */
function callFromExample(name, example) {
  const at = example.indexOf(`.${name}(`);
  if (at < 0) return "";
  let depth = 0;
  for (let i = at + name.length + 1; i < example.length; i++) {
    if (example[i] === "(") depth++;
    else if (example[i] === ")" && --depth === 0) return example.slice(at + 1, i + 1);
  }
  return "";
}

function methods() {
  return [...catalog().entries()].map(([name, entry]) => {
    const call = callFromExample(name, entry.example);
    return item(name, entry.group, `${name}(${entry.params.join(", ")})`, entry.doc || `the ${name} function`, `${name}(`, {
      example: entry.example.split("\n")[0], ...(call ? { fill: call } : {}),
    });
  });
}

function insideString(before) {
  const quotes = [...before.matchAll(/["'`]/g)];
  if (quotes.length % 2 === 0) return null;
  return before.slice(0, quotes.at(-1).index).match(/\.?(\w+)\(\s*$/)?.[1] ?? "";
}

function stringItems(func) {
  if (func === "s" || func === "sound") return SOUNDS.map(([name, doc]) => item(name, "sound", name, doc, name));
  if (func === "bank") return BANKS.map((name) => item(name, "drum machine", name, "a classic drum machine", name));
  if (func === "scale") return NOTES.flatMap((n) => MODES.map((mode) => item(`${n}:${mode}`, "scale", `${n}:${mode}`, `the ${mode.replace(":", " ")} scale on ${n}`, `${n}:${mode}`)));
  return [];
}

/** Whole lines for a part with this name. */
export function strudelIdeas(name, text) {
  const lower = name.toLowerCase();
  const { key } = readHeader(text);
  const scale = text.match(/\.scale\(\s*["']([^"']+)["']/)?.[1] ?? "C:minor";
  const part = IDEAS.find((idea) => idea.words.some((w) => (w.length < 3 ? lower === w : lower.includes(w))));
  // with a key line, the scale goes without saying
  const fitted = (part ? part.lines({ scale }) : ANY_PART({ scale })).map(([line, doc]) => [key ? line.replace(`.scale("${scale}")`, "") : line, doc]);
  return fitted.filter(([line]) => !text.includes(line));
}

/**
 * @param {string} text
 * @param {number} cursor
 * @returns {{ from: number, to: number, lineEnd: number, items: object[] }}
 */
export function completeStrudel(text, cursor) {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const newline = text.indexOf("\n", cursor);
  const lineEnd = newline < 0 ? text.length : newline;
  const before = text.slice(lineStart, cursor);
  const word = before.match(/[\w:#]*$/)[0];
  const from = cursor - word.length;
  const head = before.slice(0, before.length - word.length);
  const none = { from: cursor, to: cursor, lineEnd, items: [] };
  if (/(^|\s)\/\//.test(before)) return none;

  const label = before.match(/^\s*([A-Za-z_$][\w$]*):\s*$/);
  if (label) {
    const gap = before.endsWith(":") ? " " : "";
    const items = strudelIdeas(label[1], text).map(([line, doc]) => item(line, "fill in", before + gap + line, doc, gap + line));
    return { from: cursor, to: cursor, lineEnd, items };
  }
  const inString = insideString(before);
  let items = [];
  if (inString !== null) items = stringItems(inString);
  else if (head.endsWith(".")) items = methods();
  else if (word && /(^|[\s(,:])$/.test(head)) items = STARTERS.map(([code, name, doc]) => item(name, "start", code, doc, code));
  const lower = word.toLowerCase();
  // the shortest match first: typing "fa" should offer fast before fastChunk
  const matching = items.filter((s) => s.label.toLowerCase().startsWith(lower) && s.label !== word)
    .sort((a, b) => (word ? a.label.length - b.label.length : 0));
  return { from, to: cursor, lineEnd, items: matching.slice(0, MAX_ITEMS).map((s) => (s.fill ? { ...s, preview: head + s.fill } : s)) };
}
