/* ============================================================
   cannoli — cheat sheet
   Everything the language can do, generated from the same
   tables the language uses, so the sheet can't fall behind.
   ============================================================ */

import { VERBS, GENERATORS, VERB_GROUPS } from "./core/verbs.js";
import { STYLES, BEATS } from "./core/styles.js";
import { MODES } from "./core/harmony.js";
import { EXAMPLES } from "./examples.js";
import { highlight } from "./editor/highlight.js";
import { compile } from "./lang/compile.js";
import { codeLink } from "./share.js";

const GROUP_TITLES = {
  order: "order — rearrange the notes",
  time: "time — faster, slower, denser",
  pitch: "pitch — move the notes",
  structure: "structure — combine and reshape",
  change: "change over time — conditions and chance",
  mix: "mix — stop and isolate threads",
  range: "range — where a thread sits",
  harmony: "harmony — the chord lock",
  sound: "sound — what plays the notes",
  color: "color — loudness, tone, place",
  effect: "signature effects",
};

const ARG_WORDS = { num: "n", "num?": "[n]", step: "verb", pat: "pattern", cond: "condition", "else?": "[else verb]", word: "name" };

/* ---------- small builders ---------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function code(src) {
  const { symbols } = compile(src);
  return `<pre class="ed-hl sh-code">${highlight(src, symbols)}</pre>`;
}

function inline(src) {
  return `<code class="ed-hl sh-inline">${highlight(src, {})}</code>`;
}

function table(head, rows) {
  return `<table class="sh-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function section(id, title, body, intro = "") {
  return `<section class="sh-section" id="${id}"><h2>${title}</h2>${intro ? `<p class="sh-intro">${intro}</p>` : ""}${body}</section>`;
}

/* ---------- sections ---------- */

function lineAnatomy() {
  const parts = [
    ["lead:", "the thread's name and a colon. Each thread is one line of music."],
    ["theme", "a pattern: here a variable, or numbers like 0 2 4 (steps in the key)"],
    ["> every 4 rev", "> hands the music to a verb. This one plays it backwards every 4th bar"],
    ["> high", "puts it in the high range so it doesn't crowd the others"],
    ["> tri", "the sound"],
  ];
  return `
    <div class="sh-anatomy">
      ${code("lead: theme > every 4 rev > high > tri")}
      <ol>${parts.map(([p, d]) => `<li>${inline(p)} <span>${esc(d)}</span></li>`).join("")}</ol>
    </div>
    <p>Read a line left to right: start with a pattern, then each <code>&gt;</code> changes it a little more.
    Every bar, cannoli asks each thread "what do you play now?" and the answer goes through all its verbs again,
    so conditions like <code>every 4</code> and <code>when bar &gt; 8</code> get checked fresh each bar.</p>
    <p>Because every thread shares the key and the chords, numbers are scale steps, not exact notes:
    <code>0</code> is the root, <code>7</code> is an octave up. Notes on the beat snap to the current chord, so
    threads always fit together.</p>
    ${code("key d minor\ntempo 96\nchords i VI III VII\n\ntheme = 0 2 4 _ 6 4 . 2   # a variable: doesn't play on its own\ndef lift n = up n > fast 2  # your own verb\n\nlead: theme > every 4 rev > high > tri\nbass: 0 . 0 4 > low > saw\n  > every 2 (lift 1)           # lines starting with > continue the thread")}`;
}

function stopping() {
  return table(["do this", "what happens"], [
    [inline("# lead: theme > tri"), "a # in front comments the line out: it stops at the next bar after you press play"],
    [inline("lead: theme > mute"), "mute silences the thread but keeps your code"],
    [inline("bass: 0 4 > solo"), "only soloed threads play, to hear one on its own"],
    [inline("> when bar <= 8 mute"), "silent until bar 9: how songs build up"],
    [inline("def enter n = when bar <= n mute"), "make it a function, then write > enter 8 on any thread"],
    ["<kbd>ctrl</kbd>+<kbd>.</kbd>", "stops everything at the end of the bar (add shift to stop now)"],
    ["<kbd>ctrl</kbd>+<kbd>↵</kbd>", "plays, or applies your changes on the next bar line"],
  ]);
}

function lines() {
  return table(["write", "means"], [
    [inline("key d minor"), `the key every thread shares. Modes: ${Object.keys(MODES).join(", ")}`],
    [inline("tempo 96"), "beats per minute"],
    [inline("chords i VI III VII"), "a chord progression, one chord per bar, looping"],
    [inline("key g major at 17"), "change key (or chords) from bar 17"],
    [inline("style rave"), "a feel: sets tempo, drums, mix and suggestions"],
    [inline("beats 3"), "beats in a bar (default 4)"],
    [inline("swing 0.2"), "push off-beat eighths late"],
    [inline("name: …"), "a thread: plays"],
    [inline("name = …"), "a variable: a pattern or a number"],
    [inline("def name n = …"), "a function: a new verb or pattern"],
  ]);
}

function patterns() {
  return table(["write", "means"], [
    [inline("0 2 4 7"), "scale steps, sharing the bar evenly"],
    [inline("0 . 4 ."), "a dot is a rest"],
    [inline("0 _ _ 4"), "_ holds the step before"],
    [inline("0 [2 4]"), "squeeze steps into one step"],
    [inline("[0,2,4]"), "notes together: a chord"],
    [inline("3# 3b"), "a semitone up or down: the only way out of the key"],
    [inline("0x3"), "the same step three times"],
    [inline("theme + 2"), "everything 2 steps higher, still in key"],
    [inline("theme * 2"), "intervals twice as wide"],
    [inline("run 8 * 3 % 7"), "multiply, then wrap into an octave: a melody from arithmetic"],
    [inline("(0 1 2 3) + (0 4)"), "two patterns combined note by note: 0 5 2 7"],
    [inline("theme x 3"), "play theme for 3 bars"],
    [inline("a then b"), "a for a bar, then b"],
    [inline("for i 0..3 (theme + i)"), "a loop: four bars, one step higher each time"],
    [inline("if bar > 8 then a else b"), "choose by bar number. Conditions: == != < > <= >= and or not"],
    [inline("bar"), "the current bar number: 1, 2, 3 …"],
  ]);
}

function verbs() {
  return VERB_GROUPS.map((group) => {
    const entries = Object.entries(VERBS).filter(([, v]) => v.group === group);
    const rows = entries.map(([name, v]) => [
      `<strong class="sh-name">${esc([name, ...v.args.map((a) => ARG_WORDS[a] ?? a)].join(" "))}</strong>`,
      esc(v.doc),
      inline(v.example),
    ]);
    return `<h3>${GROUP_TITLES[group] ?? group}</h3>${table(["verb", "what it does", "example"], rows)}`;
  }).join("") + `<h3>generators — words that make a pattern</h3>${table(["write", "what it makes", "example"],
    Object.entries(GENERATORS).map(([name, g]) => [
      `<strong class="sh-name">${esc([name, ...g.args.map((a) => ARG_WORDS[a] ?? a)].join(" "))}</strong>`, esc(g.doc), inline(g.example),
    ]))}`;
}

function grooves() {
  const rows = Object.entries(BEATS).map(([name, b]) => [
    `<strong class="sh-name">${name}</strong>`,
    `<span class="sh-steps">${[...b.steps].map((c, i) => `<i class="${c === "x" ? "on" : ""}${i % 4 === 0 ? " beat" : ""}"></i>`).join("")}</span>`,
    esc(b.doc),
  ]);
  return table(["beat …", "16 steps", "feel"], rows) + code("kick: beat tamborzao > kick\nstab: chord > mask (beat tresillo) > stab");
}

function styles() {
  return table(["style", "tempo", "feel", "suggests first"], Object.entries(STYLES).map(([name, s]) => [
    inline(`style ${name}`), String(s.tempo), esc(s.doc),
    `${s.sounds.slice(0, 5).map(inline).join(" ")}<br>${s.beats.slice(0, 3).map((b) => inline(`beat ${b}`)).join(" ")}`,
  ]));
}

function songs() {
  return EXAMPLES.filter((ex) => ex.explain).map((ex) => `
    <article class="sh-song">
      <header>
        <h3>${esc(ex.name)}</h3>
        <a class="btn btn-play" href="${codeLink(ex.code)}" target="_blank" rel="noopener">open in cannoli ↗</a>
      </header>
      <p class="sh-intro">${esc(ex.note)}</p>
      <div class="sh-song-body">
        ${code(ex.code)}
        <ul class="sh-explain">${ex.explain.map(([bit, why]) => `<li>${inline(bit)}<span>${esc(why)}</span></li>`).join("")}</ul>
      </div>
    </article>`).join("");
}

/* ---------- page ---------- */

document.getElementById("sheet").innerHTML = [
  section("line", "how a line works", lineAnatomy()),
  section("stop", "starting and stopping", stopping(), "Changes, mutes and stops all land on the next bar line, so you can't fall out of time."),
  section("settings", "lines", lines()),
  section("patterns", "patterns, arithmetic, loops and conditions", patterns()),
  section("verbs", "every verb", verbs(), "Verbs go after <code>&gt;</code>. Group several in parentheses to pass them as one: <code>every 4 (rev &gt; up 2)</code>."),
  section("grooves", "grooves", grooves(), "Named 16-step rhythms for <code>beat name</code>. Each lit square is a hit; the brighter edge marks each beat."),
  section("styles", "styles", styles(), "One line at the top sets the feel. A tempo line still wins over the style's tempo."),
  section("songs", "songs to learn from", songs(), "Each one builds over time. Open it, press ctrl+enter, and watch which lines light up."),
].join("");

document.getElementById("printBtn").addEventListener("click", () => window.print());
