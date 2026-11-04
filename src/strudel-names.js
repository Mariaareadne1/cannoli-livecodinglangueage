/* ============================================================
   cannoli — how cannoli's words line up with Strudel's
   Read by the cheat sheet. A test checks that every verb and
   generator is listed here, so the manual can't fall behind.
   Checked against the Strudel docs at strudel.cc/learn.
   ============================================================ */

/* The same name, doing the same thing. Only the punctuation differs: > fast 2 here, .fast(2) there. */
export const SAME_NAMES = [
  "rev", "fast", "slow", "ply", "clip", "scaleTranspose", "stack", "firstOf", "lastOf", "someCycles", "someCyclesBy",
  "hush", "gain", "run", "euclid",
  "sine", "square", "sawtooth", "triangle", "supersaw",
  "bd", "sd", "hh", "oh", "cp", "rim", "mt", "cb", "sh",
];

/* The same name, but it behaves differently: the ones to watch. */
export const SAME_NAME_DIFFERENT = [
  ["every", "<code>every 4 rev</code> fires on the <em>last</em> of each 4 bars (bars 4, 8, 12). Strudel's <code>every(4, rev)</code> fires on the <em>first</em> (its cycles 0, 4, 8).", "use <code>firstOf</code> or <code>lastOf</code>: they match exactly"],
  ["when", "takes a condition on the bar number: <code>when bar &gt; 8 rev</code>. Strudel's takes a pattern of true and false: <code>.when(\"&lt;0 1&gt;\", rev)</code>.", ""],
  ["pan", "runs from -1 (left) to 1 (right), with 0 in the middle. Strudel's runs from 0 to 1.", "<code>pan -0.5</code> here is <code>.pan(0.25)</code> there"],
  ["arp", "takes no arguments and plays the chord low to high. Strudel's takes a pattern saying which notes to pick: <code>.arp(\"0 [0,2] 1\")</code>.", ""],
  ["mask", "cuts notes to fit the other pattern's hits. Strudel's silences them where the mask is 0, and keeps the note lengths.", "<code>struct</code> is the nearest in Strudel for playing a rhythm"],
  ["rand", "<code>rand 4</code> makes 4 random notes, new each bar. Strudel's <code>rand</code> is a continuous signal from 0 to 1.", "<code>irand</code> is the closest in Strudel"],
];

/* cannoli's own words, and the nearest thing in Strudel when there is one. */
export const CANNOLI_ONLY = [
  ["beat", "a named 16-step groove, such as <code>beat tamborzao</code>", "write the rhythm out: <code>s(\"bd ~ ~ bd\")</code>"],
  ["chord", "the current chord from the <code>chords</code> line", "<code>chord(\"&lt;Am C&gt;\").voicing()</code>"],
  ["walk", "notes that wander up and down by a step", ""],
  ["rot", "keeps the rhythm and moves the notes along it", ""],
  ["mirror", "forwards then backwards, inside one bar", "<code>palindrome</code> alternates whole cycles instead"],
  ["shuffle", "mixes up the notes, differently each bar", ""],
  ["long", "shorthand for <code>clip 2</code>", "<code>clip(2)</code>"],
  ["short", "shorthand for <code>clip 0.4</code>", "<code>clip(.4)</code>"],
  ["up", "shorthand for <code>scaleTranspose</code>, upwards", "<code>scaleTranspose(2)</code>"],
  ["down", "shorthand for <code>scaleTranspose</code>, downwards", "<code>scaleTranspose(-2)</code>"],
  ["oct", "moves notes by octaves", "<code>transpose(12)</code>"],
  ["flip", "turns the melody upside down", ""],
  ["penta", "keeps the five safest notes of the key", ""],
  ["grow", "every note becomes the whole pattern", ""],
  ["drift", "nudges some notes each bar", ""],
  ["solo", "only soloed threads play", ""],
  ["low", "the bass register: notes fold into it", ""],
  ["mid", "the middle register", ""],
  ["high", "up above the others", ""],
  ["free", "turns off the lock to the chord", ""],
  ["tight", "locks every note to the chord", ""],
  ["bright", "tone from 0 (dark) to 1 (bright)", "<code>lpf</code>, in hertz"],
  ["pump", "ducks on every beat", "<code>duckorbit</code>"],
  ["bloom", "reverb that rings at the notes of the key", "<code>room</code> is plain reverb"],
  ["ghost", "echoes that climb through the chord", "<code>delay</code> and <code>echo</code> repeat the same note"],
  ["tape", "warmth and a slow wobble", ""],
  ["air", "a soft noise layer on each note", ""],
  ["pluck", "a short plucked synth", ""],
  ["pad", "a slow, soft stack of saws", ""],
  ["bell", "a bell tone", ""],
  ["acid", "a squelchy 303-style bass", ""],
  ["stab", "a short chord stab", ""],
  ["sub", "a deep sub bass", ""],
  ["boom", "a pitched 808 that slides into the note", ""],
];

/* How the language itself is written differently. */
export const WRITTEN_DIFFERENTLY = [
  ["<code>lead: 0 2 4 &gt; fast 2 &gt; triangle</code>", "<code>$: n(\"0 2 4\").fast(2).s(\"triangle\")</code>", "a name and a colon, then <code>&gt;</code> between steps"],
  ["<code>0 . 4</code>", "<code>\"0 ~ 4\"</code>", "a dot is a rest, with no quotes"],
  ["<code>0 2 &gt; bd</code>", "<code>s(\"bd bd\")</code>", "the drum is a step at the end, and the numbers give the rhythm"],
  ["<code>key d minor</code> and <code>chords i VI</code>", "<code>.scale(\"D:minor\")</code> on each pattern", "one key and one set of chords for every thread"],
  ["<code>bar</code>", "cycles, counted from 0", "bars count from 1"],
];
