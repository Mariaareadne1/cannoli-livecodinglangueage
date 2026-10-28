/* loom — example pieces. The first one is what a new visitor sees. */

export const EXAMPLES = [
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
