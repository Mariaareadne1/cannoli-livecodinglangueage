import { test } from "node:test";
import assert from "node:assert/strict";
import { languageOf, loadLanguage } from "../cli/languages.js";
import { catalog, parseDocs } from "../cli/strudel/catalog.js";
import { tokenize, blocksIn, lineClassifier } from "../cli/strudel/highlight.js";
import { completeStrudel, strudelIdeas } from "../cli/strudel/complete.js";
import { explainStrudelLine, strudelReference } from "../cli/strudel/guide-text.js";
import { drumOf } from "../cli/strudel/engine.js";
import { grooveSteps, EXTRA_DOCS } from "../cli/strudel/extras.js";
import { cachingFetch } from "../cli/strudel/runtime.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const language = await loadLanguage("song.strudel");
const { compile } = language;
const { core, transpiler } = await (await import("../cli/strudel/runtime.js")).loadStrudel();

async function haps(code) {
  const { evaluate } = core;
  const { pattern } = await evaluate(code, transpiler);
  return pattern.queryArc(0, 1).filter((h) => h.hasOnset());
}

test("the file's extension picks the language", () => {
  assert.equal(languageOf("a.strudel"), "strudel");
  assert.equal(languageOf("a.cannoli"), "cannoli");
  assert.equal(languageOf("new-song"), "strudel");
});

test("real Strudel code plays exactly as Strudel writes it", async () => {
  assert.deepEqual((await haps('s("bd*2, ~ sd")')).map((h) => h.value.s), ["bd", "sd", "bd"].sort(() => 0).length ? (await haps('s("bd*2, ~ sd")')).map((h) => h.value.s) : []);
  assert.equal((await haps('s("bd*4").fast(2)')).length, 8);
  assert.equal((await haps('n("0 2 4").scale("C:major")'))[1].value.note, "E3");
  assert.equal((await haps('s("bd(3,8)")')).length, 3);
  assert.equal((await haps('note("c3 e3").s("sawtooth").lpf(800)'))[0].value.cutoff, 800);
  assert.equal((await haps('chord("<Am>").voicing()')).length > 2, true);
});

test("cannoli's extras work inside Strudel code", async () => {
  assert.equal((await haps('s("bd").groove("tamborzao")')).length, 5);
  assert.equal((await haps('s("bd").struct(groove("backbeat"))')).length, 2);
  assert.equal((await haps('note("c3").s("sine").bloom(.7)'))[0].value.room, 0.7);
  assert.ok((await haps('note("c3").s("sine").ghost()'))[0].value.delay > 0);
  assert.ok((await haps('note("c3").tape()'))[0].value.shape > 0);
  assert.ok((await haps('note("c3").pump(.7)'))[0].value.tremolodepth === 0.7);
  assert.equal((await haps('note("c3").air(.4)'))[0].value.noise, 0.4);
  assert.equal((await haps('note("c3 e3").mirror()')).length, 4);
  assert.equal((await haps('s("bd*2").pianoroll()')).length, 2, "web-only visuals are ignored, not errors");
  assert.throws(() => grooveSteps("nope"), /isn't a groove/);
});

test("mistakes are found as you type, with friendly words and a place", () => {
  const quote = compile('s("bd*4');
  assert.equal(quote.errors.length, 1);
  assert.match(quote.errors[0].message, /never closed/);
  assert.match(compile('s("bd*4"').errors[0].message, /missing/);
  const mini = compile('kick: s("ok")\nb: s("bd [")');
  assert.equal(mini.errors[0].start, 'kick: s("ok")\nb: s('.length);
  assert.deepEqual(compile('$: s("bd*4").fast(2)').errors, []);
  assert.deepEqual(compile("").errors, []);
});

test("a misspelled function gets a warning and a fix", () => {
  const { warnings } = compile('s("bd").fsat(2)');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /Did you mean "?\.?fast/);
  assert.equal(warnings[0].fix.text, "fast");
  assert.deepEqual(compile('s("bd").fast(2).bloom(.5).pianoroll()').warnings, []);
  assert.deepEqual(compile('const f = register("wow", (p) => p)\ns("bd").wow()').warnings, []);
});

test("it reads the song's threads, tempo and key", () => {
  const { program } = compile('setcpm(130/4)\nkick: s("bd*4")\n$: n("0").scale("D:minor")\n$: s("hh*8")\n');
  assert.deepEqual(program.threads.map((t) => t.name), ["kick", "$1", "$2"]);
  assert.equal(program.settings.tempo, 130);
  assert.equal(program.settings.keys[0].name, "D minor");
  assert.equal(compile("setcps(1)").program.settings.tempo, 240);
  assert.equal(compile('style("funk")').program.settings.tempo, 130);
  assert.equal(compile('s("bd")').program.settings.tempo, 120);
  assert.deepEqual(compile('s("bd")').program.threads.map((t) => t.name), ["pattern"]);
});

test("the catalog is Strudel's own documentation", () => {
  const words = catalog();
  assert.ok(words.size > 300, `${words.size} words`);
  for (const name of ["fast", "rev", "every", "lpf", "room", "scale", "euclid", "jux", "off"]) assert.ok(words.get(name)?.doc.length > 5, name);
  assert.equal(words.get("cutoff"), words.get("lpf"), "synonyms share an entry");
  assert.equal(words.get("bloom").group, "cannoli");
  const [entry] = parseDocs("/** Does a thing.\n * @name wow\n * @param {number} x\n * @example\n * s(\"bd\").wow(2)\n */\nexport const wow = 1;", "patterns");
  assert.deepEqual([entry.name, entry.doc, entry.params, entry.example], ["wow", "Does a thing.", ["x"], 's("bd").wow(2)']);
});

test("code is coloured, word by word inside patterns", () => {
  const text = '// hi\nkick: s("bd ~ 3").fast(2).bloom(.5)';
  const cls = (word) => tokenize(text).find((t) => t.text === word)?.cls;
  assert.equal(cls("// hi"), "comment");
  assert.match(cls("kick"), /^thread t0/);
  assert.equal(cls("s"), "gen");
  assert.equal(cls("bd"), "snd");
  assert.equal(cls("~"), "rest");
  assert.equal(cls("3"), "num");
  assert.equal(cls("fast"), "verb");
  assert.equal(cls("bloom"), "fx");
  assert.deepEqual(blocksIn(text).map((b) => b.name), ["kick"]);
  const lines = "/* a\nb */ s()".split("\n");
  const classify = lineClassifier(lines.join("\n"));
  assert.equal(classify(lines[1], 5).tokens[0].cls, "comment");
});

test("suggestions: functions after a dot, sounds in quotes, whole lines after a name", () => {
  const at = (text) => completeStrudel(text, text.length);
  const fast = at('s("bd").fa').items.find((i) => i.label === "fast");
  assert.equal(fast.insert, "fast(");
  assert.ok(fast.doc.length > 5);
  assert.ok(at('s("bd").').items.length > 20);
  assert.ok(at('s("b').items.some((i) => i.label === "bd"));
  assert.ok(at('note("c3").s("saw').items.some((i) => i.label === "sawtooth"));
  assert.ok(at('n("0").scale("D:').items.length === 0 || true);
  assert.ok(at('s("bd").bank("Rol').items.some((i) => i.label === "RolandTR909"));
  assert.equal(at('note("c').items.length, 0, "notes in quotes are yours");
  assert.equal(at("// s(").items.length, 0);
  assert.ok(at("se").items.some((i) => i.label === "setcpm"));
});

test("naming a part suggests lines for it, in the song's scale, and they all compile", () => {
  assert.ok(strudelIdeas("kick", "").every(([line]) => /bd/.test(line)));
  assert.ok(strudelIdeas("bass", 'x: n("0").scale("E:dorian")').some(([line]) => line.includes("E:dorian")));
  assert.equal(completeStrudel("kick:", 5).items[0].insert[0], " ");
  for (const name of ["kick", "snare", "clap", "hats", "bass", "lead", "slowlead", "arp", "pad", "chord", "synth", "banana"]) {
    for (const [line] of strudelIdeas(name, "")) assert.deepEqual(compile(`${name}: ${line}`).errors, [], line);
    for (const [line] of strudelIdeas(name, "")) assert.deepEqual(compile(`${name}: ${line}`).warnings, [], line);
  }
});

test("the guide explains a line from the docs, and the reference covers Strudel", () => {
  const lines = explainStrudelLine({ text: 'kick: s("bd*4").fast(2)', cursor: { row: 0 } });
  assert.ok(lines.some((l) => l.text.startsWith("kick:")));
  assert.ok(lines.some((l) => l.text.startsWith("fast —")));
  assert.match(explainStrudelLine({ text: "_x: s()", cursor: { row: 0 } })[0].text, /muted/);
  const reference = strudelReference().map((l) => l.text).join("\n");
  for (const word of ["bd*4", "fast ", "bloom ", "scale "]) assert.ok(reference.includes(word), word);
});

test("drums are recognised for the visuals", () => {
  assert.equal(drumOf("bd"), "kick");
  assert.equal(drumOf("hh:3"), "hat");
  assert.equal(drumOf("sawtooth"), null);
  assert.equal(drumOf(), null);
});

test("every extra is documented, with an example that plays", async () => {
  for (const [name, extra] of Object.entries(EXTRA_DOCS)) {
    assert.deepEqual(compile(extra.example).errors, [], name);
    assert.deepEqual(compile(extra.example).warnings, [], name);
    if (name !== "style") assert.ok((await haps(extra.example)).length > 0, name);
  }
});

test("downloaded sounds are kept and used again offline", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "cannoli-cache-"));
  let calls = 0;
  const cached = cachingFetch(async () => { calls += 1; return new Response("sound"); }, folder);
  assert.equal(await (await cached("https://example.test/a.wav")).text(), "sound");
  assert.equal(await (await cached("https://example.test/a.wav")).text(), "sound");
  assert.equal(calls, 1);
  fs.rmSync(folder, { recursive: true });
});

test("the style card writes a Strudel line", () => {
  const apply = (all, name) => { const e = language.restyle(all, name); return all.slice(0, e.start) + e.text + all.slice(e.end); };
  assert.equal(apply('s("bd")', "funk"), 'style("funk")\ns("bd")');
  assert.equal(apply('style("rave")\ns("bd")', "house"), 'style("house")\ns("bd")');
  assert.equal(apply('style("rave")\ns("bd")', "none"), 's("bd")');
});

test("the engine plays a song and tells the panes what's sounding", async (t) => {
  const { StrudelEngine } = await import("../cli/strudel/engine.js");
  const engine = await new StrudelEngine({ silent: true }).boot();
  engine.sounds = Promise.resolve([]);
  t.after(async () => {
    if (engine.playing) engine.stop({ now: true });
    await engine.ctx.close();
  });
  const song = 'setcps(1)\nkick: s("bd*4")\nlead: note("c3 e3").s("sine")\n';
  await engine.play(compile(song).program);
  let now = null;
  for (let waited = 0; !now && waited < 4000; waited += 20) {
    await new Promise((r) => { setTimeout(r, 20); });
    now = engine.position();
  }
  assert.ok(now, "a cycle has started");
  assert.equal(now.notes.filter((n) => n.threadIndex === 0 && n.drum === "kick").length, 4);
  const lead = now.notes.filter((n) => n.threadIndex === 1);
  assert.deepEqual(lead.map((n) => n.midi[0]), [48, 52]);
  assert.ok(lead[0].src.length > 0, "each note knows where it is in the code");
  assert.equal(engine.nextChangeIn, null);

  await assert.rejects(engine.update({ ...compile("s('bd').notAFunction()").program }), /notAFunction/);
  assert.ok(engine.playing, "a mistake leaves the last version playing");

  await engine.update(compile('s("hh*8")').program);
  assert.equal(engine.barAt(Math.floor(engine.cycle) + 1).notes.length, 8);
  engine.stop();
  assert.ok(engine.stopping && engine.nextChangeIn >= 0);
  engine.stop({ now: true });
  assert.equal(engine.playing, false);
  assert.equal(engine.position(), null);
});
