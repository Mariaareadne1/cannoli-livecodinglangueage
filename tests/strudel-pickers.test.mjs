import { test } from "node:test";
import assert from "node:assert/strict";
import { strudelPickerAt as at, writeBeat, writeBars, readStrudelTimeline, applyStrudelTimeline, STRUDEL_VERBS, callsIn } from "../cli/strudel/pickers.js";
import { loadLanguage } from "../cli/languages.js";

const language = await loadLanguage("a.strudel");
const { core, transpiler } = await (await import("../cli/strudel/runtime.js")).loadStrudel();
const edit = (text, c) => text.slice(0, c.start) + c.text + text.slice(c.end);
const on = (text, word) => at(text, text.indexOf(word) + 1);
const grid = (steps) => steps.map((v) => (v ? "x" : ".")).join("");
const cells = (s) => [...s].map((c) => c === "x");
const clean = (code) => assert.deepEqual([language.compile(code).errors, language.compile(code).warnings], [[], []], code);
async function onsets(code, from = 0, to = 1) {
  const { pattern } = await core.evaluate(code, transpiler);
  return pattern.queryArc(from, to).filter((h) => h.hasOnset());
}

test("it finds each call and its arguments", () => {
  const [a, b] = callsIn('s("a)b").every(4, fast(2))');
  assert.deepEqual([a.name, a.args, b.name, b.args], ["s", '"a)b"', "every", "4, fast(2)"]);
});

test("beat grid: reads drum patterns and writes simple Strudel", () => {
  assert.equal(grid(on('kick: s("bd*4")', "bd").steps), "x...x...x...x...");
  assert.equal(grid(on('s("bd ~ ~ bd")', "bd").steps), "x...........x...");
  assert.equal(grid(on('s("hh*8")', "hh").steps), "x.x.x.x.x.x.x.x.");
  assert.equal(grid(on('s("bd").groove("backbeat")', "bd").steps), "....x.......x...");
  assert.equal(on('s("bd sd")', "bd"), null, "two sounds can't be one row");
  assert.equal(writeBeat("bd", cells("x...x...x...x...")), "bd*4");
  assert.equal(writeBeat("bd", cells("x...............")), "bd");
  assert.equal(writeBeat("bd", cells("x..x..x.........")), "bd ~ ~ bd ~ ~ bd ~ ~ ~ ~ ~ ~ ~ ~ ~");
  assert.equal(writeBeat("bd", cells("................")), "~");
  const text = 'kick: s("bd*4").gain(.8)';
  assert.equal(edit(text, on(text, "bd").apply(cells("x.......x......."))), 'kick: s("bd*2").gain(.8)');
});

test("beat grid: every pattern it writes plays those steps", async () => {
  for (const pattern of ["x...x...x...x...", "x..x..x...x..x..", "................", "xxxxxxxxxxxxxxxx", "....x.......x..."]) {
    const code = `s("${writeBeat("bd", cells(pattern))}")`;
    assert.deepEqual((await onsets(code)).map((h) => h.whole.begin * 16), [...pattern].flatMap((c, i) => (c === "x" ? [i] : [])), code);
  }
});

test("beat grid: grooves and blank drum lines", async () => {
  const text = 's("bd*4")';
  const written = edit(text, on(text, "bd").applyGroove("tamborzao"));
  assert.equal(written, 's("bd").groove("tamborzao")');
  assert.equal((await onsets(written)).length, 5);
  assert.equal(edit(written, on(written, "bd").apply(cells("x...x...x...x..."))), 's("bd*4")');
  const blank = at("kick: ", 6);
  assert.ok(blank.blank);
  assert.equal(edit("kick: ", blank.apply(cells("x...x...x...x..."))), 'kick: s("bd*4")');
  assert.equal(edit("hats:", at("hats:", 5).apply(cells("x.x.x.x.x.x.x.x."))), 'hats: s("hh*8")');
});

test("melody grid: reads n patterns, and names the song's notes", () => {
  const text = 'lead: n("0 [2 4] ~ 7").scale("D:minor")';
  const p = on(text, "0 [");
  assert.equal(p.kind, "melody");
  assert.deepEqual(p.cells, [[0], "hold", [2], [4], null, null, [7], "hold"]);
  assert.equal(p.rows.find((r) => r.step === 5).note, "Bb");
  assert.equal(edit(text, p.apply([[1], [3]])), 'lead: n("1 3").scale("D:minor")');
  assert.equal(edit(text, p.apply([[0], null, [4], "hold"])), 'lead: n("0 ~ 4 _").scale("D:minor")');
  assert.equal(on('n("<0 2>")', "0"), null, "patterns it can't draw stay closed");
  assert.equal(at("lead: ", 6).kind, "melody");
  assert.equal(edit("lead: ", at("lead: ", 6).apply([[0], [2]])), 'lead: n("0 2").scale("C:minor")');
  assert.equal(at('lead: n("0 2")', 9, { minColumns: 16 }).cells.length, 16);
});

test("melody grid: what it writes plays those notes", async () => {
  const text = 'n("0").scale("C:major")';
  const code = edit(text, on(text, "0").apply([[0], "hold", [2], [4]]));
  const notes = await onsets(code);
  assert.deepEqual(notes.map((h) => h.value.note), ["C3", "E3", "G3"]);
  assert.deepEqual(notes.map((h) => h.duration.valueOf()), [0.5, 0.25, 0.25]);
});

test("sliders: numbers in calls, the innermost first", () => {
  const p = on('s("bd").gain(.5)', "gain");
  assert.deepEqual([p.kind, p.value, p.max], ["slider", 0.5, 1.5]);
  const text = 's("bd").every(4, fast(2)).lpf(800)';
  assert.equal(on(text, "fast").word, "fast");
  assert.equal(edit(text, on(text, "lpf").apply(1200)), 's("bd").every(4, fast(2)).lpf(1200)');
  assert.equal(on('s("bd").gain("[.5 .3]*4")', "gain"), null);
  assert.equal(edit("setcpm(30)", on("setcpm(30)", "setcpm").apply(32.5)), "setcpm(32.5)");
});

test("bars: every, lastOf and when read and write the cycles they fire on", async () => {
  const fired = (p) => p.bars.flatMap((v, i) => (v ? [i + 1] : []));
  assert.deepEqual(fired(on('s("bd").every(4, rev)', "every")), [1, 5, 9, 13], "Strudel's every is the first of each 4");
  assert.deepEqual(fired(on('s("bd").lastOf(4, rev)', "lastOf")), [4, 8, 12, 16]);
  assert.deepEqual(fired(on('s("bd").when("<0 1>", rev)', "when")), [2, 4, 6, 8, 10, 12, 14, 16]);
  const barsOf = (list) => Array.from({ length: 16 }, (_, i) => list.includes(i + 1));
  assert.equal(writeBars(barsOf([1, 9]), "rev"), "every(8, rev)");
  assert.equal(writeBars(barsOf([8, 16]), "rev"), "lastOf(8, rev)");
  assert.equal(writeBars(barsOf([2, 6, 10, 14]), "rev"), 'when("<0 1 0 0>", rev)');
  for (const list of [[1, 5, 9, 13], [4, 8, 12, 16], [2, 6, 10, 14], [1, 2, 9, 10], [3, 7, 11, 15]]) {
    const code = `s("bd").${writeBars(barsOf(list), "x=>silence")}`;
    const silent = [];
    for (let bar = 0; bar < 16; bar++) if ((await onsets(code, bar, bar + 1)).length === 0) silent.push(bar + 1);
    assert.deepEqual(silent, list, code);
  }
  const text = 's("bd").every(4, rev).gain(.5)';
  assert.equal(edit(text, on(text, "every").applyVerb("fast(2)")), 's("bd").every(4, fast(2)).gain(.5)');
  assert.equal(on(text, "every").apply(barsOf([])), null);
});

test("the verb menu: chance words, and every choice really runs", async () => {
  const text = 's("bd").sometimesBy(.3, rev).gain(.5)';
  const p = on(text, "sometimesBy");
  assert.deepEqual([p.kind, p.verb, p.chance], ["verb", "rev", 0.3]);
  assert.equal(edit(text, p.apply("ply(2)")), 's("bd").sometimesBy(.3, ply(2)).gain(.5)');
  assert.equal(edit(text, p.applyChance(0.75)), 's("bd").sometimesBy(0.75, rev).gain(.5)');
  assert.equal(on('s("bd").sometimes(rev)', "sometimes").chance, null);
  for (const { code } of STRUDEL_VERBS.flatMap((g) => g.choices)) {
    assert.ok((await onsets(`note("c3 e3").every(1, ${code})`)).length >= 0, code);
    clean(`note("c3 e3").every(1, ${code})`);
  }
});

test("rings: euclid in patterns and as a method", async () => {
  const text = 's("bd(3,8)").gain(.5)';
  const p = on(text, "bd");
  assert.deepEqual([p.kind, p.hits, p.steps, p.rotation], ["euclid", 3, 8, 0]);
  assert.equal(grid(p.pattern(p)), "x..x..x.");
  assert.equal(p.nameOf(p), "tresillo");
  assert.equal(edit(text, p.apply({ hits: 5, steps: 8, rotation: 2 })), 's("bd(5,8,2)").gain(.5)');
  const m = 's("bd").euclid(3, 8)';
  assert.equal(edit(m, on(m, "euclid").apply({ hits: 3, steps: 8, rotation: 2 })), 's("bd").euclidRot(3, 8, 2)');
  const ours = on('s("bd(3,8,2)")', "bd");
  assert.deepEqual((await onsets('s("bd(3,8,2)")')).map((h) => h.whole.begin * 8), ours.pattern(ours).flatMap((v, i) => (v ? [i] : [])));
});

test("chords: real names, what comes next, progressions", () => {
  const text = 'chord("<Am F C G>").voicing().s("piano")';
  const p = on(text, "Am");
  assert.deepEqual(p.words, ["Am", "F", "C", "G"]);
  assert.deepEqual(p.options.map((o) => o.word), ["Am", "Bdim", "C", "Dm", "Em", "F", "G"]);
  assert.equal(edit(text, p.apply(["Dm", "G"])), 'chord("<Dm G>").voicing().s("piano")');
  assert.ok(p.next(1).length > 0);
  assert.ok(p.progressions.every((x) => x.words.every((w) => typeof w === "string")));
  for (const prog of p.progressions) clean(`chord("<${prog.words.join(" ")}>").voicing()`);
  assert.ok(on('n("0").scale("D:minor")\nchord("<Dm>")', "Dm>").options.some((o) => o.word === "Bb"));
});

test("key: the note and mode move every part together", () => {
  const text = 'a: n("0").scale("D:minor")\nb: n("2").scale("D4:minor")';
  const p = on(text, "D:minor");
  assert.deepEqual([p.kind, p.note, p.mode], ["key", "d", "minor"]);
  assert.deepEqual(p.details.scale, ["D", "E", "F", "G", "A", "Bb", "C"]);
  assert.equal(edit(text, p.apply({ note: "f#" })), 'a: n("0").scale("F#:minor")\nb: n("2").scale("F#4:minor")');
  assert.equal(edit(text, p.apply({ mode: "harmonic" })), 'a: n("0").scale("D:harmonic:minor")\nb: n("2").scale("D4:harmonic:minor")');
  assert.equal(on('n("0").scale("D:harmonic:minor")', "D:h").mode, "harmonic");
  for (const { name } of p.modes) clean(edit(text, p.apply({ mode: name })));
});

test("sounds and grooves swap one word", () => {
  const text = 'note("c3").s("sawtooth").gain(.5)';
  const p = on(text, "sawtooth");
  assert.deepEqual([p.kind, p.current, p.groups[0].title], ["sound", "sawtooth", "melodic sounds"]);
  assert.equal(edit(text, p.apply("square")), 'note("c3").s("square").gain(.5)');
  const g = 's("bd").struct(groove("tresillo"))';
  assert.equal(edit(g, on(g, "tresillo").apply("skip")), 's("bd").struct(groove("skip"))');
});

test("the timeline reads and writes when each pattern plays", async () => {
  const song = 'kick: s("bd*4")\n$: s("hh*8") // hats\n\nbass: s("sd")\n';
  assert.deepEqual(readStrudelTimeline(song, 4).map((r) => [r.name, grid(r.on)]), [["kick", "xxxx"], ["$", "xxxx"], ["bass", "xxxx"]]);
  const one = edit(song, applyStrudelTimeline(song, 1, cells("..xx")));
  assert.equal(one, 'kick: s("bd*4")\n$: s("hh*8").mask("<0!2 1!2>") // hats\n\nbass: s("sd")\n');
  assert.equal(grid(readStrudelTimeline(one, 4)[1].on), "..xx");
  assert.equal(edit(one, applyStrudelTimeline(one, 1, cells("xxxx"))), song);
  assert.equal(applyStrudelTimeline(song, 0, cells("xxxx")), null);
  const heard = [];
  const code = 's("bd").mask("<0!2 1!2>")';
  for (let bar = 0; bar < 4; bar++) heard.push((await onsets(code, bar, bar + 1)).length > 0);
  assert.equal(grid(heard), "..xx");
});

test("nothing opens in comments or on other lines", () => {
  assert.equal(at('// s("bd*4")', 6), null);
  assert.equal(at('s("bd*4") // gain(.5)', 16), null);
  assert.equal(at("", 0), null);
  assert.equal(at("pad: ", 5), null);
});
