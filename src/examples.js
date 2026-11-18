/* cannoli — songs to start from. The first one is what a new visitor sees. All of it is Strudel, plus key, tempo and beat. */

export const EXAMPLES = [
  {
    name: "first steps",
    note: "a kick, a clap, hats, a bass and a melody",
    code: `// press ctrl+enter to play · change anything · press it again
key a minor
tempo 124

kick: beat("fourfloor").s("bd")
clap: beat("backbeat").s("cp").room(.3)
hats: s("hh*8").gain("[.5 .3]*4")

bass: n("<0 0 3 5>*2").s("sawtooth").lpf(700).octave(2).pump(.6)
lead: n("0 [2 4] <7 5> 4").s("triangle").every(4, rev).bloom(.5)`,
  },
  {
    name: "rave · 4am warehouse",
    note: "a driving kick, an acid line and a wide lead",
    code: `// 4am warehouse
key f minor
tempo 140

kick: beat("fourfloor").s("bd").gain(1.1)
hats: beat("offbeat").s("oh").gain(.5)
clap: beat("backbeat").s("cp").room(.2)
roll: beat("rolling").s("hh").gain(.3).every(8, fast(2))

acid: n("0 3 6 2 5 1 4 0").s("sawtooth").octave(2)
  .lpf(sine.range(400, 2400).slow(8)).lpq(12).shape(.3)
lead: n("<0 2 4 7>*2").s("supersaw").octave(4).gain(.45)
  .every(4, x => x.rev().add(n(2))).ghost(.3).mask("<0!8 1!8>")`,
  },
  {
    name: "house · sunday",
    note: "warm chords over a steady four on the floor",
    code: `// sunday
key c dorian
tempo 122

kick: beat("fourfloor").s("bd")
clap: beat("backbeat").s("cp").room(.4)
hats: beat("offbeat").s("hh").gain(.5)
shaker: s("sh*16").gain("[.3 .15]*8")

keys: chord("<Cm7 F7 Bb^7 Gm7>").voicing().s("piano").struct("~ x ~ x ~ ~ x ~").room(.5)
bass: n("<0 3 6 4>*2").s("triangle").octave(2).lpf(500).pump(.5)`,
  },
  {
    name: "funk · baile",
    note: "the tamborzão rhythm with a bell and a low boom",
    code: `// baile
key d minor
tempo 130

kick: beat("tamborzao").s("bd").shape(.3)
snare: beat("backbeat").s("sd").gain(.7)
bell: beat("batida").s("cb").gain(.4)
hats: s("hh*8").gain(.3)

boom: n("0 ~ ~ 0 ~ ~ 3 ~").s("sine").octave(1).gain(1.2).tape(.3)
stab: chord("<Dm Bb>").voicing().struct(groove("tresillo")).s("square").lpf(1400).gain(.35)`,
  },
  {
    name: "chill · slow water",
    note: "soft drums, a slow pad and an echoing melody",
    code: `// slow water
key e minor
tempo 78

kick: beat("lazy").s("bd").gain(.8)
rim: s("~ rim ~ rim").gain(.4).room(.5)
hats: s("hh*8").gain(perlin.range(.15, .4))

pad: chord("<Em7 C^7 Am7 B7>").voicing().s("sawtooth").lpf(800).attack(.5).release(1.5).gain(.3).bloom(.7)
lead: n("<0 2 4 ~> <~ 7 6 4>").s("sine").octave(5).ghost(.6).tape(.4).slow(2)`,
  },
];
