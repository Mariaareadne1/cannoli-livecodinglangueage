/* cannoli — example pieces. The first one is what a new visitor sees. */

export const EXAMPLES = [
  {
    name: "rave · 4am warehouse",
    note: "a rave track that builds: drums first, then hats, then the supersaw lead",
    code: `# 4am Warehouse — rave
style rave
key f minor
chords i VI III VII

riff = 0 2 4 7
def enter n = when bar <= n mute

kick: beat fourfloor > kick
acid: run 8 * 3 % 7 > acid > low > drift 0.2
  > when bar > 16 (fast 2)
hats: beat offbeat > open > gain 0.5 > enter 4
clap: beat backbeat > clap > enter 4
lead: riff > fast 2 > every 4 (rev > up 2)
  > high > supersaw > ghost 0.3 > enter 8
roll: beat rolling > hat > gain 0.3 > every 8 (fast 2) > enter 8`,
    explain: [
      ["def enter n = when bar <= n mute", "a function you made: the thread stays silent until bar n, so the song builds"],
      ["acid: run 8 * 3 % 7", "the acid line is arithmetic: count 0–7, multiply by 3, wrap at 7 → 0 3 6 2 5 1 4 0"],
      ["> drift 0.2", "a few notes wander each bar, so the acid line never repeats exactly"],
      ["> when bar > 16 (fast 2)", "after bar 16 the acid doubles in speed: the drop"],
      ["> every 4 (rev > up 2)", "every 4th bar the riff plays backwards, two steps higher"],
      ["> enter 8", "the lead comes in at bar 9"],
    ],
  },
  {
    name: "funk · baile no morro",
    note: "Brazilian funk: tamborzão drums, a booming 808, stabs on the tresillo",
    code: `# Baile no Morro — Brazilian funk
style funk
key c minor
chords i i iv iv

def enter n = when bar <= n mute

kick: beat tamborzao > kick
boom: 0 . . 0 . . 0 . . . 3 . . 0 . . > boom
  > every 4 (up 2)
bell: beat batida > cowbell > gain 0.4 > enter 2
snare: beat backbeat > snare > every 2 (chop 2) > enter 2
stab: chord > mask (beat tresillo) > stab > high > gain 0.5 > enter 4
vox: 4 . 4 2 . 0 . . > square > high > short > enter 8
  > maybe 0.5 rev`,
    explain: [
      ["kick: beat tamborzao", "the tamborzão: baile funk's signature 3-3-4-3-3 kick pattern"],
      ["boom: 0 . . 0 …", "a pitched 808: the dots are rests, the numbers are notes in C minor"],
      ["> every 4 (up 2)", "every 4th bar the 808 line jumps up a third"],
      ["> every 2 (chop 2)", "every other bar each snare becomes a quick double hit"],
      ["chord > mask (beat tresillo)", "the chord is cut into stabs on the 3-3-2 tresillo rhythm"],
      ["> maybe 0.5 rev", "the vocal-chop line flips backwards in about half the bars"],
    ],
  },
  {
    name: "house · sunday morning club",
    note: "chord stabs on a skipping rhythm, an offbeat sub bass, a plucked hook",
    code: `# Sunday Morning Club — house
style house
key a minor
chords ii V I vi

hook = 4 _ 2 . 0 _ . .
def enter n = when bar <= n mute

kick: beat fourfloor > kick
hats: beat shuffle > hat > gain 0.4 > enter 2
bass: beat offbeat > sub > enter 2
stabs: chord > mask (beat skip) > stab > bloom 0.3 > enter 4
lead: hook > every 2 (up 2) > high > pluck > ghost > enter 8
  > when bar % 16 == 0 (fast 2)
shaker: hits 16 16 > shaker > gain 0.25 > enter 8`,
    explain: [
      ["chords ii V I vi", "a deep-house progression; every thread follows it automatically"],
      ["bass: beat offbeat > sub", "the bass bounces between the kicks: the classic house push"],
      ["chord > mask (beat skip)", "the chords become syncopated stabs"],
      ["hook = 4 _ 2 . 0 _ . .", "a variable: _ holds the note before, . is a rest"],
      ["> when bar % 16 == 0 (fast 2)", "every 16th bar the hook doubles up, a fill before the next section"],
      ["hits 16 16", "16 hits in 16 steps: a shaker on every sixteenth"],
    ],
  },
  {
    name: "chill · rain on the window",
    note: "slow and warm: tape pads, a bell melody that turns with the bar number",
    code: `# Rain on the Window — chill
style chill
key e dorian
chords ii V I IV

theme = 0 2 4 6 4 2

keys: chord > slow 2 > pad > bloom > tape 0.4
melody: theme > rot bar % 3 > slow 2 > high > bell > ghost 0.5
  > maybe 0.4 rev
bass: 0 _ . 4 > sub
kick: beat boombap > kick
snare: beat backbeat > snare > gain 0.6
hats: hits 6 8 > hat > gain 0.3 > sometimes (chop 2)`,
    explain: [
      ["style chill", "80 bpm, swung, soft drums and a warm lo-fi mix"],
      ["chord > slow 2 > pad", "each chord is held for two bars"],
      ["> bloom > tape 0.4", "a reverb that rings in key, plus warmth and wobble"],
      ["rot bar % 3", "the melody's starting note shifts with the bar number: 1, 2, 0, 1, 2 …"],
      ["> ghost 0.5", "echoes that climb up through the current chord"],
      ["> sometimes (chop 2)", "in about half the bars the hats double up"],
    ],
  },
  {
    name: "first light",
    note: "a variable, a function, every, when, and all five threads",
    code: `# cannoli — Ctrl+Enter to play, Ctrl+. to stop
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
