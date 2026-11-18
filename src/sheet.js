/* ============================================================
   cannoli — the reference
   Every word comes from Strudel's own documentation or from
   cannoli's list of additions, so the page can't fall behind.
   ============================================================ */

import { catalog } from "../cli/strudel/catalog.js";
import { EXTRA_DOCS } from "../cli/strudel/extras.js";
import { BEATS, STYLES } from "./core/styles.js";
import { EXAMPLES } from "./examples.js";
import { highlightStrudel } from "./web/highlight.js";
import { codeLink } from "./share.js";
import { applyTheme, savedTheme } from "./apply-theme.js";

applyTheme(savedTheme());

// inside the app's side panel: compact, follows the app's theme, and songs load into the editor beside it
const embedded = new URLSearchParams(location.search).has("embed") && window.parent !== window;
if (embedded) {
  document.body.classList.add("embedded");
  window.addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data?.type === "cannoli:theme") applyTheme(e.data.name);
  });
}

const GROUPS = [["patterns", "Changing patterns"], ["rhythm", "Rhythm"], ["sound", "Sound and effects"], ["harmony", "Notes and chords"], ["signals", "Moving values"], ["picking", "Choosing between patterns"]];
const MINI = [
  ['s("bd sd")', "play these in turn, filling the cycle"],
  ['s("bd*4")', "repeat four times"],
  ['s("bd!3 sd")', "write it three times, as separate steps"],
  ['s("bd [sd sd]")', "squeeze steps into one"],
  ['s("<bd sd>")', "one each cycle"],
  ['s("bd ~ sd ~")', "~ is a rest"],
  ['s("bd, hh*8")', "a comma plays both at once"],
  ['s("bd(3,8)")', "3 hits spread over 8 steps"],
  ['s("bd@3 sd")', "make a step three times as long"],
  ['s("hh*8?")', "? plays each one only sometimes"],
];
const OURS = [
  ["key a minor", "A line of its own. Every n() in the song follows this key, so parts always fit. Change it once and the whole song moves."],
  ["tempo 120", "A line of its own. The speed in beats a minute."],
  ...Object.entries(EXTRA_DOCS).map(([name, entry]) => [entry.example, entry.doc.replace(/^cannoli: /, "")]),
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const code = (text) => `<code class="sh-inline">${highlightStrudel(text)}</code>`;
const copyable = (text) => `<div class="sh-copy"><pre class="ed-hl sh-code">${highlightStrudel(text)}</pre><button type="button" class="btn" data-copy="${esc(text)}">copy</button></div>`;
const table = (rows) => `<table class="sh-table"><tbody>${rows.map(([left, right]) => `<tr><td>${code(left)}</td><td>${esc(right)}</td></tr>`).join("")}</tbody></table>`;
const section = (id, title, intro, body) => `<section class="sh-section" id="${id}"><h2>${title}</h2>${intro ? `<p class="sh-intro">${intro}</p>` : ""}${body}</section>`;

function grooves() {
  const rows = Object.entries(BEATS).map(([name, beat]) => `<tr><td>${code(`beat("${name}")`)}</td><td class="sh-steps">${[...beat.steps].map((c) => (c === "x" ? "█" : "·")).join("")}</td><td>${esc(beat.doc)}</td></tr>`).join("");
  return `<table class="sh-table"><tbody>${rows}</tbody></table>`;
}

function words() {
  const all = [...new Set(catalog().values())].filter((entry) => entry.group !== "cannoli");
  const groups = GROUPS.map(([group, title]) => {
    const list = all.filter((entry) => entry.group === group).sort((a, b) => a.name.localeCompare(b.name));
    return `<h3>${title}</h3>${list.map((entry) => `<article class="sh-word" data-word="${esc(`${entry.name} ${entry.synonyms.join(" ")} ${entry.doc}`.toLowerCase())}">
      <h4>${esc(entry.name)}${entry.params.length ? `<span>(${esc(entry.params.join(", "))})</span>` : ""}</h4>
      <p>${esc(entry.doc)}</p>${entry.example ? copyable(entry.example) : ""}</article>`).join("")}`;
  }).join("");
  return `<label class="sh-search">find a word <input type="search" id="wordSearch" placeholder="reverb, fast, chord…" /></label><div id="wordList">${groups}</div>`;
}

function songs() {
  return `<ul class="sh-songs">${EXAMPLES.map((song, i) => `<li><strong>${esc(song.name)}</strong><span>${esc(song.note)}</span>${embedded
    ? `<button type="button" class="btn" data-load="${i}">load into the editor</button>`
    : `<a class="btn" href="${codeLink(song.code)}">open in the editor</a>`}</li>`).join("")}</ul>`;
}

document.getElementById("sheet").innerHTML = [
  section("line", "A line", "A song is a few named parts. Each part is a pattern with changes chained after it. This is real Strudel, so anything from strudel.cc works here.",
    copyable('key a minor\ntempo 120\n\nkick: beat("fourfloor").s("bd")\nhats: s("hh*8").gain(.4)\nlead: n("0 2 4 7").s("sawtooth").lpf(900).every(4, rev)\n_pad: chord("<Am F>").voicing()   // _ in front mutes a part')),
  section("patterns", "Patterns", "What goes inside the quotes.", table(MINI)),
  section("cannoli", "What cannoli adds", "These work here and in the terminal, but not on strudel.cc.", table(OURS)),
  section("grooves", "Named beats", `Use them with ${code('beat("name").s("bd")')}. Styles set the tempo: ${Object.keys(STYLES).map((s) => code(`style("${s}")`)).join(" ")}.`, grooves()),
  section("words", "Every word", "From Strudel's own documentation.", words()),
  section("songs", "Songs to learn from", "", songs()),
].join("");

document.addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.textContent = "copied";
    } catch {
      copy.textContent = "select it to copy";
    }
    setTimeout(() => { copy.textContent = "copy"; }, 1500);
  }
  const load = e.target.closest("[data-load]");
  if (load) {
    const song = EXAMPLES[Number(load.dataset.load)];
    window.parent.postMessage({ type: "cannoli:load", code: song.code, name: song.name }, location.origin);
  }
});

document.getElementById("wordSearch").addEventListener("input", (e) => {
  const query = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".sh-word").forEach((word) => { word.hidden = Boolean(query) && !word.dataset.word.includes(query); });
});
