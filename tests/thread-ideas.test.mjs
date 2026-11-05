import { test } from "node:test";
import assert from "node:assert/strict";
import { threadIdeas } from "../src/editor/thread-ideas.js";
import { complete } from "../src/editor/complete.js";
import { compile } from "../src/lang/compile.js";

const bodies = (name, text = "", symbols = {}) => threadIdeas(name, text, symbols).map(([body]) => body);
const NAMES = ["kick", "bd", "drums", "snare", "sd", "clap", "cp", "hh", "hats", "hihat", "open", "rim", "tom", "shaker", "cowbell",
  "bass", "sub", "acid", "lead", "melody", "slowlead", "fastlead", "softsynth", "synth", "arp", "darkarp", "chord", "pad", "pads", "stab", "keys", "piano",
  "pluck", "bell", "vox", "drone", "riff", "hook", "echo", "counter", "fx", "riser", "banana"];

test("every name gets a few different whole lines", () => {
  for (const name of NAMES) {
    const ideas = bodies(name);
    assert.ok(ideas.length >= 3 && ideas.length <= 5, `${name}: ${ideas.length}`);
    assert.equal(new Set(ideas).size, ideas.length, `${name} repeats itself`);
  }
});

test("every idea compiles, with or without a song around it", () => {
  const song = "style funk\nkey c minor\ntheme = 0 2 4 7\nkick: beat tamborzao > bd\n";
  for (const name of NAMES) {
    for (const body of [...bodies(name), ...bodies(name, song, { style: "funk", vars: ["theme"] })]) {
      assert.deepEqual(compile(`${song}${name}: ${body}\n`).errors, [], `${name}: ${body}`);
    }
  }
});

test("each word gets its own kind of line", () => {
  assert.ok(bodies("kick").every((b) => /> bd\b/.test(b)));
  assert.ok(bodies("snare").every((b) => /> sd\b/.test(b)));
  assert.ok(bodies("hh").every((b) => /> (hh|oh)\b/.test(b)));
  assert.ok(bodies("arp").every((b) => /\barp\b|tight/.test(b)));
  assert.ok(bodies("pad").every((b) => /^chord|^0/.test(b)));
  assert.ok(bodies("bass").every((b) => /low|sub|boom|acid/.test(b)));
  assert.notDeepEqual(bodies("kick"), bodies("arp"));
});

test("the rest of the name changes the line: slowlead is a slow lead", () => {
  assert.ok(bodies("slowlead").every((b) => /> slow 2\b/.test(b)));
  assert.ok(bodies("fastarp").every((b) => /fast/.test(b)));
  assert.ok(bodies("softsynth").every((b) => /gain 0\.5/.test(b)));
  assert.ok(bodies("slowlead").every((b) => !/> low\b/.test(b)), "slow isn't low");
  assert.ok(bodies("slowlead").every((b) => !/> fast\b/.test(b)), "a slow lead isn't also fast");
  assert.ok(bodies("lowlead").every((b) => /> low\b/.test(b) && !/> high\b/.test(b)));
});

test("they fit the song: the style's grooves, your melody, your kick", () => {
  assert.ok(bodies("kick", "", { style: "funk" })[0].includes("tamborzao"));
  assert.ok(bodies("kick", "", { style: "house" })[0].includes("fourfloor"));
  assert.ok(bodies("lead", "theme = 0 2 4\n", { vars: ["theme"] })[0].startsWith("theme >"));
  assert.ok(bodies("bass", "kick: beat batida > bd\n").some((b) => b.includes("mask (beat batida)")));
  assert.ok(bodies("stab", "kick: beat batida > bd\n").some((b) => b.includes("beat batida")));
});

test("it doesn't suggest what the song already has", () => {
  const first = bodies("hats")[0];
  assert.ok(!bodies("hats", `hats: ${first}\n`).includes(first));
});

test("the card opens right after the colon, and fills in with the space", () => {
  const r = complete("kick:", 5, { style: "funk" });
  assert.equal(r.items[0].insert, " beat tamborzao > bd");
  assert.equal(r.items[0].label, "beat tamborzao > bd");
  assert.equal(r.items[0].detail, "kick: beat tamborzao > bd");
  assert.equal(complete("arp: ", 5).items[0].insert.startsWith("chord"), true);
  assert.deepEqual(complete("key:", 4).items, []);
});
