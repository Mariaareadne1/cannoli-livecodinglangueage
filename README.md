# loom

A live-coding language for performing music. You write a few short
**threads** (voices), then weave them with a small set of verbs, loops and
conditions. Everything shares one key and one chord progression, so threads
always fit together, and every change lands on the next downbeat.

```
key d minor
tempo 92
chords i VI III VII            # one chord per bar

theme = 0 2 4 _ 6 4

lead: theme
  > every 4 rev                # every 4th bar, backwards
  > high > tri > ghost
bass: 0 . 0 4 > low > saw > pump
pad:  chord > slow 2 > pad > bloom
kick: hits 4 16 > kick
hats: hits 7 16 > hat > gain 0.4
```

**Ctrl+Enter** plays, and applies changes at the next bar. **Ctrl+.** stops
at the end of the bar.

---

## Lines

| Line | Meaning |
|---|---|
| `key d minor` | the key every thread uses (modes: major, minor, dorian, phrygian, lydian, mixolydian, locrian, harmonic) |
| `tempo 92` | beats per minute |
| `beats 3` | beats in a bar (default 4) |
| `chords i VI III VII` | a chord progression, one chord per bar, looping (roman numerals or 1–7) |
| `key g major at 17` | change key from bar 17 (also works for `chords`) |
| `swing 0.2` | push off-beat eighths late |
| `style rave` | a feel: rave, house, funk or chill (see Styles) |
| `name: …` | a **thread**: plays |
| `name = …` | a **variable**: a pattern or a number, doesn't play |
| `def name a b = …` | a **function** you can use like a verb |
| `  > …` | a line starting with `>` continues the thread above |
| `# …` | a comment. Comment out a line to mute it. |

## Patterns

One bar is one cycle. A pattern divides the bar evenly between its steps.

| Write | Means |
|---|---|
| `0 2 4 7` | scale steps: 0 is the key's root, 7 is an octave up, -1 is below |
| `.` | rest |
| `_` | hold the step before |
| `[0 2]` | squeeze steps into one step |
| `[0,2,4]` | play together (a chord) |
| `3#` `3b` | one semitone up / down: the only way to leave the key |
| `0x3` | the same step three times |
| `chord` | the current chord |
| `hits 3 8` | 3 hits spread evenly across 8 steps (a Euclidean rhythm) |
| `run 5` | 0 1 2 3 4 |
| `walk 8` | 8 steps of a random walk, new every bar |
| `rand 4` | 4 random steps, new every bar |
| `beat tamborzao` | a named groove (see Styles) |

## Arithmetic: patterns are numbers

| Write | Means |
|---|---|
| `theme + 2` | everything 2 steps higher (stays in key) |
| `theme * 2` | intervals twice as wide |
| `run 8 * 3 % 7` | multiply, then wrap into an octave: instant melody |
| `(0 1 2 3) + (0 4)` | combine two patterns note by note: 0 5 2 7 |
| `theme x 3` | play `theme` for 3 bars |
| `a then b` | `a` for a bar, then `b` |
| `bar` | the current bar number (1, 2, 3 …) |

## Loops and conditions

```
for i 0..3 (theme + i)                    # four bars, climbing a step each bar
if bar > 8 then theme else theme * 2      # change after bar 8
lead: theme > every 4 rev                 # every 4th bar
lead: theme > when bar % 8 == 0 (fast 2)  # any condition: == != < > <= >= and or
lead: theme > maybe 0.3 shuffle           # 30% of bars
```

## Verbs (after `>`)

| Group | Verbs |
|---|---|
| order | `rev` `rot n` `mirror` `shuffle` |
| time | `fast n` `slow n` `chop n` `long` `short` |
| pitch | `up n` `down n` `oct n` `flip` `penta` `arp` |
| structure | `grow` `stack p` `mask p` |
| change over time | `every n verb` `when cond verb` `maybe p verb` `sometimes verb` `drift n` |
| range | `low` `mid` `high` |
| harmony | `free` (ignore the chord lock) `tight` (lock every note) |
| sound | `saw` `square` `tri` `sine` `pluck` `pad` `bell` `supersaw` `acid` `stab` `sub` `boom` · drums: `kick` `snare` `hat` `open` `clap` `rim` `tom` `cowbell` `shaker` |
| color | `bright n` `gain n` `pan n` |
| signature effects | `bloom` `ghost` `tape` `pump` `air` (each takes an optional amount 0–1) |

Chain verbs with `>`. Wrap several in parentheses to pass them as one:
`every 4 (rev > up 2)`.

### Functions

```
def lift n = up n > fast 2       # a new verb
def motif n = 0 2 4 + n          # a new pattern
lead: motif 1 > every 2 (lift 3)
```

## Styles

One line sets the feel. It changes the defaults (tempo, swing, drum kit,
mix) and what the suggestion cards put first. It never changes the language.

| Style | Tempo | Feel |
|---|---|---|
| `style rave` | 140 | fast, hard, driving: warehouse and hard dance |
| `style house` | 124 | four on the floor, warm and bouncy |
| `style funk` | 130 | Brazilian funk: tamborzão rhythm and booming 808s |
| `style chill` | 80 | slow and warm, swung: lo-fi and downtempo |

A `tempo` line still wins over the style's tempo. The style menu in the
header writes the `style` line for you, and each style has a starter piece.

### Grooves

`beat name` plays a named 16-step rhythm, like any other pattern:

| Groove | Pattern | |
|---|---|---|
| `fourfloor` | `x...x...x...x...` | a kick on every beat |
| `offbeat` | `..x...x...x...x.` | between the beats |
| `backbeat` | `....x.......x...` | beats 2 and 4 |
| `rolling` | `.xxx.xxx.xxx.xxx` | a rolling rave bassline |
| `gallop` | `x.xxx.xxx.xxx.xx` | hard dance |
| `shuffle` | `x.xx.xxxx.xx.xxx` | busy hats |
| `skip` | `x..x.x..x..x.x..` | syncopated |
| `tamborzao` | `x..x..x...x..x..` | baile funk's 3-3-4-3-3 |
| `tresillo` | `x..x..x.x..x..x.` | 3-3-2 |
| `batida` | `x...x.x.x...x.x.` | boom, ta-ta |
| `boombap` | `x......x..x.....` | laid-back hip-hop |
| `lazy` | `x.......x..x....` | sparse downtempo |

```
kick: beat tamborzao > kick
stab: chord > mask (beat tresillo) > stab
```

### Electronic sounds

`supersaw` (wide rave lead), `acid` (squelchy 303-style bass), `stab`
(punchy chord stab), `sub` (deep sub bass), `boom` (a pitched 808 that slides
into the note), plus drums `cowbell` and `shaker`. `sub` and `boom` sit in the
bass range on their own.

## Always sounds good

- **One key.** Numbers are steps in the key, so threads can't be in different scales.
- **Downbeat lock.** Notes on the beat snap to the nearest note of the current chord. Notes between beats stay free, so melodies still move. `free` turns this off; `tight` locks every note.
- **Ranges.** `low`, `mid` and `high` keep threads out of each other's way; notes fold back into their range.
- **Voice leading.** Chords stay close together instead of jumping.
- **Mix.** Non-bass threads are kept out of the low end, the master is warmed and limited, and a small room is always on.
- **Escape hatch.** `3#` and `free` let you be dissonant on purpose.

## Signature effects

| Effect | What it does |
|---|---|
| `bloom` | a reverb that rings at the notes of the key |
| `ghost` | echoes that climb through the current chord |
| `tape` | warmth and a slow wobble |
| `pump` | ducks on every beat, breathing with the kick |
| `air` | a soft noise layer on each note |

## Development

```
npm test
```
