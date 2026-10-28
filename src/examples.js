/* loom — example pieces. The first one is what a new visitor sees. */

export const EXAMPLES = [
  {
    name: "rave · warehouse",
    note: "supersaw lead, an acid line built from arithmetic, rolling hats",
    code: `# rave — Ctrl+Enter to play, Ctrl+. to stop
style rave
key f minor
chords i VI III VII

riff = 0 2 4 7
lead: riff > fast 2
  > every 4 (rev > up 2)
  > high > supersaw > ghost 0.3
acid: run 8 * 3 % 7 > low > acid > drift 0.2 > bright 0.5
kick: beat fourfloor > kick
hats: beat offbeat > open > gain 0.5
clap: beat backbeat > clap
roll: beat rolling > hat > gain 0.3 > when bar % 8 == 0 (fast 2)`,
  },
  {
    name: "funk · baile",
    note: "Brazilian funk: tamborzão drums, a booming 808, stabs on the tresillo",
    code: `# Brazilian funk — Ctrl+Enter to play, Ctrl+. to stop
style funk
key c minor
chords i i iv iv

kick: beat tamborzao > kick
snare: beat backbeat > snare > every 2 (chop 2)
bell: beat batida > cowbell > gain 0.4
boom: 0 . . 0 . . 0 . . . 3 . . 0 . . > boom
stab: chord > mask (beat tresillo) > stab > high > gain 0.5`,
  },
  {
    name: "house · late club",
    note: "chord stabs on a skipping rhythm, offbeat sub bass, shuffling hats",
    code: `# house — Ctrl+Enter to play, Ctrl+. to stop
style house
key a minor
chords ii V I vi

stabs: chord > mask (beat skip) > stab > bloom 0.3
bass: beat offbeat > sub
kick: beat fourfloor > kick
hats: beat shuffle > hat > gain 0.4
shaker: hits 16 16 > shaker > gain 0.3
lead: 4 _ 2 . 0 _ . . > every 2 (up 2) > high > pluck > ghost`,
  },
  {
    name: "chill · late night",
    note: "slow and warm: tape pads, a bell melody that rotates with the bar number",
    code: `# chill — Ctrl+Enter to play, Ctrl+. to stop
style chill
key e dorian
chords ii V I IV

theme = 0 2 4 6 4 2
keys: chord > slow 2 > pad > bloom > tape 0.4
melody: theme > rot bar % 3 > slow 2 > high > bell > ghost 0.5 > maybe 0.4 rev
bass: 0 _ . 4 > sub
kick: beat boombap > kick
snare: beat backbeat > snare > gain 0.6
hats: hits 6 8 > hat > gain 0.3`,
  },
  {
    name: "first light",
    note: "a variable, a function, every, when, and all five threads",
    code: `# loom — Ctrl+Enter to play, Ctrl+. to stop
key d minor
tempo 96
chords i VI III VII

theme = 0 2 4 _ 6 4 . 2
def lift n = up n > fast 2

lead: theme
  > every 4 rev
  > when bar > 8 (lift 2)
  > high > tri > ghost

bass: 0 . 0 [. 0] > low > saw > pump
pad: chord > slow 2 > pad > bloom > gain 0.5
kick: hits 4 16 > kick
hats: hits 7 16 > hat > gain 0.35 > maybe 0.3 (fast 2)`,
  },
  {
    name: "counting machine",
    note: "arithmetic makes the melody: multiply, then wrap",
    code: `key a minor
tempo 112
chords i iv v i

notes: run 16 * 3 % 9 > penta > high > pluck > ghost 0.4
bass: for i 0..3 (0 + i * 2) > low > saw
kick: hits 3 8 > kick
clap: . 0 . 0 > clap > gain 0.5`,
  },
  {
    name: "fractal",
    note: "grow turns three notes into nine, self-similar",
    code: `key e phrygian
tempo 84

seed = 0 2 4
fractal: seed > grow > high > bell > bloom
  > every 2 flip
drone: 0 > slow 4 > low > pad > tape
pulse: hits 5 16 > rim > gain 0.5`,
  },
  {
    name: "drift garden",
    note: "drift keeps the melody evolving on its own",
    code: `key g lydian
tempo 72

melody = 0 4 2 6 _ 4
lead: melody > drift 0.25 > high > sine > bloom > tape 0.3
shadow: melody > rot 2 > slow 2 > tri > ghost > gain 0.4
bass: 0 _ _ 4 > low > tri
air: hits 3 8 > open > gain 0.25`,
  },
  {
    name: "conditions",
    note: "if, then and else decide the music by bar number",
    code: `key c dorian
tempo 100
chords i IV i v

riff = 0 2 3 4
lead: if bar % 4 == 0 then riff * 2 else riff
  > every 2 (rot 1)
  > square > bright 0.4
bass: 0 x 3 then 4 > low > saw > pump 0.4
beat: hits 4 16 > kick
snare: . 0 . 0 > snare`,
  },
];
