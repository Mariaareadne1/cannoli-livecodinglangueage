import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "../src/examples.js";
import { loadLanguage } from "../cli/languages.js";
import { prepareSong, readHeader } from "../cli/strudel/dialect.js";
import { readStrudelStudio } from "../cli/strudel/studio.js";
import { findStrudelSliders } from "../src/web/sliders.js";

const language = await loadLanguage("a.strudel");
const { core, transpiler, extras } = await (await import("../cli/strudel/runtime.js")).loadStrudel();

for (const song of EXAMPLES) {
  test(`"${song.name}" is clean and plays notes`, async () => {
    const { errors, warnings } = language.compile(song.code);
    assert.deepEqual([errors, warnings], [[], []]);
    const { key } = readHeader(song.code);
    const labelled = prepareSong(song.code).replace(/^([A-Za-z_]\w*):/gm, "$:");
    const { pattern } = await core.evaluate(`stack(${labelled.split(/^\$:/m).slice(1).map((part) => part.replace(/\/\/.*$/gm, "").trim()).join(",\n")})`, transpiler);
    const haps = extras.inKey(key.scale)(pattern).queryArc(8, 10).filter((h) => h.hasOnset());
    assert.ok(haps.length > 8, `${haps.length} notes`);
  });
}

test("the kit reads a Euclidean rhythm on its grid", () => {
  const song = 'hats: s("hh(3,8)")\n';
  const studio = readStrudelStudio(song);
  assert.equal(studio.drums[0].steps.filter(Boolean).length, 3);
  const steps = studio.drums[0].steps.map((on, i) => (i === 1 ? true : on));
  const c = studio.setSteps(0, steps);
  assert.match(song.slice(0, c.start) + c.text + song.slice(c.end), /^hats: s\("hh hh/);
});

test("finds sliders written in the code", () => {
  const [slider] = findStrudelSliders('lead: n("0").gain(slider(0.5, 0, 2))');
  assert.deepEqual([slider.label, slider.value, slider.min, slider.max], ["gain", 0.5, 0, 2]);
  assert.equal('lead: n("0").gain(slider(0.5, 0, 2))'.slice(slider.start, slider.end), "0.5");
});
