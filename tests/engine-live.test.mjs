import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Engine } from "../src/audio/engine.js";
import { compile } from "../src/lang/compile.js";

const real = createRequire(import.meta.url)("node-web-audio-api");
class Silent extends real.AudioContext {
  constructor(o = {}) { super({ ...o, sinkId: { type: "none" } }); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const program = (gain, tempo = 120) => compile(`tempo ${tempo}\na: 0 0 0 0 0 0 0 0 > triangle > gain ${gain}\n`).program;

test("a live change reaches notes in the bar that's already playing, and never plays one twice", async () => {
  const engine = new Engine({ AudioContext: Silent });
  await engine.play(program(0.1));
  await wait(400);
  assert.ok(engine.queue.length > 0, "notes wait in the queue until they're due");
  assert.ok(engine.queue.every((n) => n.time > engine.playedUntil), "nothing queued has played");
  const before = engine.playedUntil;
  engine.live(program(0.9));
  assert.equal(engine.playedUntil, before);
  assert.ok(engine.queue.length > 0);
  assert.ok(engine.queue.every((n) => n.note.props.gain === 0.9), "the rest of the bar uses the new value");
  assert.ok(engine.queue.every((n) => n.time > before), "notes already started aren't repeated");
  assert.equal(engine.pending, null);
  engine.stop({ now: true });
  await engine.ctx.close();
});

test("a tempo change still waits for the bar line", async () => {
  const engine = new Engine({ AudioContext: Silent });
  await engine.play(program(0.5));
  engine.live(program(0.5, 90));
  assert.ok(engine.pending, "it lands on the next bar");
  engine.stop({ now: true });
  assert.equal(engine.queue.length, 0);
  await engine.ctx.close();
});

test("a chord change reaches notes that haven't played yet", async () => {
  const song = (chords) => compile(`tempo 120\nkey c major\nchords ${chords}\na: chord > free\nb: 0 0 0 0 0 0 0 0 > free\n`).program;
  const engine = new Engine({ AudioContext: Silent });
  await engine.play(song("I"));
  await wait(300);
  engine.live(song("V"));
  const chord = engine.bars.at(-1).notes.find((n) => n.thread === "a");
  assert.ok(chord.midi.map((m) => m % 12).includes(7) && chord.midi.map((m) => m % 12).includes(11), "the bar now holds a V chord");
  engine.stop({ now: true });
  await engine.ctx.close();
});

test("a key change shows straight away, not at the next bar", async () => {
  const song = (key) => compile(`tempo 120\nkey ${key}\na: 0 0 0 0 > free\n`).program;
  const engine = new Engine({ AudioContext: Silent });
  await engine.play(song("c major"));
  await wait(300);
  engine.live(song("a minor"));
  assert.equal(engine.position().key, "a minor");
  engine.stop({ now: true });
  await engine.ctx.close();
});
