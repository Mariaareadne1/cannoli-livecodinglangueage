/* ============================================================
   cannoli — the page
   Wires the editor, the checker and real Strudel together, and
   draws the status line, problem list and thread grid.
   ============================================================ */

import { checkSong } from "../cli/strudel/check.js";
import { blocksIn } from "../cli/strudel/highlight.js";
import { WebEngine } from "./web/engine.js";
import { findStrudelSliders } from "./web/sliders.js";
import { createTimelinePanel } from "./timeline-panel.js";
import { createStudioPanel } from "./studio-panel.js";
import { createControlPanel } from "./control-panel.js";
import { createEditor } from "./editor/editor.js";
import { EXAMPLES } from "./examples.js";
import { codeFromUrl } from "./share.js";
import { THEMES, THEME_NAMES } from "./themes.js";
import { applyTheme, savedTheme } from "./apply-theme.js";
import { STYLES, STYLE_NAMES } from "./core/styles.js";

applyTheme(savedTheme());

const STORE_CODE = "cannoli-strudel-code";
const STORE_PREFS = "cannoli-prefs";
const LINT_DELAY_MS = 120;
const LIVE_DELAY_MS = 150;
const THREAD_COLORS = ["--t0", "--t1", "--t2", "--t3", "--t4", "--t5"];
const BEATS_PER_CYCLE = 4;

const $ = (id) => document.getElementById(id);
const engine = new WebEngine();
const prefs = { ...readJSON(STORE_PREFS) };
const state = { result: null, runText: null, lastActiveKey: "", tools: null };

// a song link (#code=…) wins over saved code; drop it from the URL so a reload keeps your edits
const linked = codeFromUrl();
if (linked) history.replaceState(null, "", location.pathname);

const editor = createEditor($("editor"), {
  value: linked ?? (readStore(STORE_CODE) || EXAMPLES[0].code),
  onRun: run,
  onStop: (now) => stop(now),
  onInput: (text) => {
    writeStore(STORE_CODE, text);
    clearTimeout(state.lintTimer);
    state.lintTimer = setTimeout(lint, LINT_DELAY_MS);
  },
  onSlide: playLive,
  onHear: hearPart,
});

/* Hear one cycle of the part at this place in the code, while stopped. */
function hearPart(offset) {
  if (engine.playing) return;
  const text = editor.value;
  const blocks = blocksIn(text);
  const index = blocks.findLastIndex((b) => b.start <= offset);
  if (index < 0) return;
  const body = text.slice(blocks[index].start, blocks[index + 1]?.start ?? text.length).replace(/^[A-Za-z_$][\w$]*:\s*/, "");
  engine.preview(body, text).catch(() => {});   // half-written code just stays quiet
}

/* While playing, what you change is heard straight away. */
function playLive() {
  if (!engine.playing) return;
  clearTimeout(state.liveTimer);
  state.liveTimer = setTimeout(() => {
    const result = compile(editor.value);
    if (result.errors.length) return;
    state.runText = editor.value;
    engine.update(result.program).catch((err) => say(err.message, "bad"));
  }, LIVE_DELAY_MS);
}

const timeline = createTimelinePanel({
  root: $("timeline"),
  moreButton: $("timelineMore"),
  getText: () => editor.value,
  edit: (change) => editor.edit(change),
});

const studio = createStudioPanel({
  kitRoot: $("kit"),
  mixRoot: $("mix"),
  getText: () => editor.value,
  getCaret: () => editor.caret,
  edit: (change) => editor.edit(change),
  slide: (change) => editor.slideTo(change),
  hear: hearPart,
});

const control = createControlPanel({ root: $("control") });

/* ---------- checking as you type ---------- */

function compile(text) {
  if (state.tools) return checkSong(text, state.tools);
  return { errors: [], warnings: [], symbols: {}, program: { code: text, threads: [], settings: { tempo: 120, beats: BEATS_PER_CYCLE, style: null, chords: [], keys: [] } } };
}

function lint() {
  const result = compile(editor.value);
  state.result = result;
  $("style").value = result.program.settings.style ?? "";
  const problems = [...result.errors.map((e) => problem(e, "error")), ...result.warnings.map((e) => problem(e, "warning"))];
  editor.setProblems(problems);
  renderProblems(problems);
  renderSliders();
  timeline.update();
  studio.update();
  return result;
}

function problem(err, severity) {
  return { start: err.start, end: err.end, message: err.message, fix: err.fix, severity };
}

/* ---------- sliders written in the code ---------- */

function renderSliders() {
  const sliders = findStrudelSliders(editor.value);
  const list = $("sliderList");
  $("slidersPanel").hidden = sliders.length === 0;
  // leave the row alone while it's being dragged, or it would drop out of the player's hand
  if (list.contains(document.activeElement) && list.children.length === sliders.length) return;
  list.innerHTML = sliders.map((s, i) => `<li class="slider-row">
    <label for="slider${i}">${esc(s.label)}</label>
    <input id="slider${i}" type="range" data-slider="${i}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}" />
    <output>${s.value}</output></li>`).join("");
}

$("sliderList").addEventListener("input", (e) => {
  const slider = findStrudelSliders(editor.value)[Number(e.target.dataset.slider)];
  if (!slider) return;
  const value = String(Number(Number(e.target.value).toFixed(3)));
  editor.slideTo({ start: slider.start, end: slider.end, text: value });
  e.target.nextElementSibling.textContent = value;
});

/* ---------- play / update / stop ---------- */

async function run() {
  await engine.ready;
  const result = lint();
  if (result.errors.length) {
    flash("problems");
    say(`not playing yet: ${plural(result.errors.length, "problem")} to fix${engine.playing ? ". The last version keeps playing" : ""}`, "bad");
    return;
  }
  state.runText = editor.value;
  try {
    if (engine.playing) {
      await engine.update(result.program);
      say("updated");
    } else {
      say("loading sounds…");
      await engine.play(result.program);
      say("playing");
    }
  } catch (err) {
    say(err.message, "bad");
  }
}

function stop(now) {
  if (!engine.playing) return;
  engine.stop({ now });
  if (!now) say("stopping at the end of the cycle");
}

function applyAllFixes(problems) {
  const fixes = problems.map((p) => p.fix).filter(Boolean).sort((a, b) => b.start - a.start);
  fixes.forEach((fix) => editor.applyFix(fix));
}

$("playBtn").addEventListener("click", () => run());
$("stopBtn").addEventListener("click", (e) => stop(e.shiftKey || !engine.playing));
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "." && e.target !== document.querySelector(".ed-input")) {
    e.preventDefault();
    stop(e.shiftKey);
  }
});

/* ---------- status line ---------- */

function renderStatus() {
  const pos = engine.position();
  const settings = (pos?.program ?? state.result?.program)?.settings;
  $("stKey").textContent = settings?.keys[0]?.name ?? "—";
  $("stBar").textContent = pos ? `${pos.bar + 1}.${Math.min(BEATS_PER_CYCLE, Math.floor(pos.progress * BEATS_PER_CYCLE) + 1)}` : "—";
  const wait = engine.nextChangeIn;
  $("stNext").textContent = wait === null ? "" : `stop in ${wait.toFixed(1)}s`;
  document.body.classList.toggle("is-playing", engine.playing);
  $("playBtn").querySelector("span").textContent = engine.playing ? "update" : "play";
}

/* ---------- problems panel ---------- */

function renderProblems(problems) {
  const list = $("problemList");
  $("problemCount").textContent = problems.length ? String(problems.length) : "";
  $("fixAll").hidden = !problems.some((p) => p.fix);
  if (problems.length === 0) {
    list.innerHTML = '<li class="ok">no problems</li>';
    return;
  }
  const text = editor.value;
  list.innerHTML = problems.map((p, i) => {
    const line = text.slice(0, p.start).split("\n").length;
    return `<li class="${p.severity}">
      <button type="button" class="pr-go" data-i="${i}">line ${line}</button>
      <span class="pr-msg">${esc(p.message)}</span>
      ${p.fix ? `<button type="button" class="pr-fix" data-i="${i}">${esc(p.fix.label)}</button>` : ""}
    </li>`;
  }).join("");
  list.onclick = (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const p = problems[Number(btn.dataset.i)];
    if (btn.classList.contains("pr-fix")) editor.applyFix(p.fix);
    else editor.scrollTo(p.start);
  };
}

$("fixAll").addEventListener("click", () => applyAllFixes(state.result?.warnings ?? []));

/* ---------- thread grid ---------- */

function drawThreads() {
  const canvas = $("threads");
  const pos = engine.position();
  const program = pos?.program ?? state.result?.program;
  const names = program?.threads.map((t) => t.name) ?? [];
  const rowH = 30;
  const labelW = 72;
  const height = Math.max(1, names.length) * rowH + 8;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);
  const css = getComputedStyle(document.documentElement);
  const laneW = width - labelW - 8;

  names.forEach((name, i) => {
    const y = 4 + i * rowH;
    g.fillStyle = css.getPropertyValue(THREAD_COLORS[i % THREAD_COLORS.length]);
    g.font = "12px 'IBM Plex Mono', monospace";
    g.textBaseline = "middle";
    g.fillText(name.slice(0, 9), 4, y + rowH / 2);
    g.fillStyle = css.getPropertyValue("--line");
    g.fillRect(labelW, y + rowH - 1, laneW, 1);
  });
  g.fillStyle = css.getPropertyValue("--line");
  for (let b = 0; b <= BEATS_PER_CYCLE; b++) g.fillRect(labelW + (b / BEATS_PER_CYCLE) * laneW, 0, 1, height);

  if (!pos) return;
  barNotes(pos).forEach((n) => {
    const row = n.threadIndex;
    if (row >= names.length) return;
    const y = 4 + row * rowH;
    const x = labelW + Math.max(0, n.start) * laneW;
    const w = Math.max(3, (Math.min(1, n.start + n.dur) - Math.max(0, n.start)) * laneW - 2);
    const on = pos.progress >= n.start && pos.progress < n.start + n.dur;
    g.globalAlpha = on ? 1 : 0.45;
    g.fillStyle = css.getPropertyValue(THREAD_COLORS[row % THREAD_COLORS.length]);
    if (n.midi.length === 0) {
      g.fillRect(x, y + 6, Math.max(3, w * 0.4), rowH - 12);
    } else {
      n.midi.forEach((m) => {
        const pitchY = y + rowH - 6 - ((m % 24) / 24) * (rowH - 12);
        g.fillRect(x, pitchY - 2, w, 4);
      });
    }
  });
  g.globalAlpha = 1;
  g.fillStyle = css.getPropertyValue("--accent");
  g.fillRect(labelW + pos.progress * laneW, 0, 2, height);
}

/* Notes of the current cycle, plus any held over from earlier ones (start < 0). */
function barNotes(pos) {
  const held = engine.bars
    .filter((b) => b.bar < pos.bar)
    .flatMap((b) => b.notes.map((n) => ({ ...n, start: n.start - (pos.bar - b.bar) })))
    .filter((n) => n.start + n.dur > 0);
  return [...held, ...pos.notes];
}

/* Light up the code that's sounding right now. */
function highlightSounding() {
  const pos = engine.position();
  let active = new Set();
  if (pos && editor.value === state.runText) {
    active = new Set(barNotes(pos)
      .filter((n) => pos.progress >= n.start && pos.progress < n.start + Math.max(n.dur, 0.06))
      .flatMap((n) => n.src.map((s) => s[0])));
  }
  const key = [...active].sort().join(",");
  if (key !== state.lastActiveKey) {
    state.lastActiveKey = key;
    editor.setActive(active);
  }
}

function frame() {
  const now = engine.playing ? engine.position() : null;
  timeline.setBar(now ? now.bar + 1 : 0);
  renderStatus();
  drawThreads();
  highlightSounding();
  requestAnimationFrame(frame);
}

/* ---------- examples + settings ---------- */

$("examples").innerHTML = EXAMPLES.map((ex, i) => `<option value="${i}">${ex.name}</option>`).join("");
$("examples").addEventListener("change", (e) => {
  const example = EXAMPLES[Number(e.target.value)];
  editor.setValue(example.code);
  lint();
  say(`loaded "${example.name}": ${example.note}. Ctrl+Enter to hear it.`);
});

/* theme */
$("theme").innerHTML = THEME_NAMES.map((n) => `<option value="${n}">${THEMES[n].label}</option>`).join("");
$("theme").value = savedTheme();
$("theme").addEventListener("change", (e) => {
  applyTheme(e.target.value);
  $("referenceFrame").contentWindow?.postMessage({ type: "cannoli:theme", name: e.target.value }, location.origin);
  say(`theme: ${THEMES[e.target.value].label}`);
});

/* The style picker writes (or rewrites) the style line in the code. */
$("style").innerHTML = `<option value="">no style</option>${STYLE_NAMES.map((n) => `<option value="${n}">${n}</option>`).join("")}`;
$("style").addEventListener("change", (e) => {
  const name = e.target.value;
  const text = editor.value;
  const existing = text.match(/^style\(.*\).*$/m);
  if (existing) {
    const end = existing.index + existing[0].length + (name ? 0 : 1);
    editor.applyFix({ start: existing.index, end, text: name ? `style("${name}")` : "" });
  } else if (name) {
    const firstCode = text.match(/^(?!\s*\/\/)\S/m)?.index ?? 0;
    editor.applyFix({ start: firstCode, end: firstCode, text: `style("${name}")\n` });
  }
  lint();
  say(name ? `style ${name}: ${STYLES[name].doc}` : "style removed");
});

/* ---------- the side panel ---------- */

const SIDE_DEFAULT_W = { live: "min(380px, 38vw)", kit: "min(600px, 58vw)", mix: "min(400px, 40vw)", timeline: "min(460px, 42vw)", reference: "46vw", control: "min(480px, 44vw)" };
const SIDE_TABS_REMEMBERED = ["reference", "timeline", "kit", "mix", "control"];
const DIVIDER_STEP_PX = 24;

function openSideTab(name) {
  document.querySelectorAll("[role=tab][data-side-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.sideTab === name)));
  document.querySelectorAll("[data-side-pane]").forEach((p) => { p.hidden = p.dataset.sidePane !== name; });
  $("referenceOut").hidden = name !== "reference";
  $("referenceBtn").classList.toggle("is-on", name === "reference");
  if (name === "reference" && !$("referenceFrame").src) $("referenceFrame").src = "sheet.html?embed";
  setSideWidth(prefs.sideWidth?.[name] ?? SIDE_DEFAULT_W[name]);
  savePrefs({ sideTab: name });
  if (name === "timeline") timeline.draw();
  if (name === "kit" || name === "mix") studio.open();
  if (name === "control") control.connect();
}

function currentSideTab() {
  return document.querySelector("[role=tab][aria-selected=true]")?.dataset.sideTab ?? "live";
}

function setSideWidth(width) {
  $("side").style.setProperty("--side-w", width);
}

document.querySelectorAll("[data-side-tab]").forEach((el) => el.addEventListener("click", () => openSideTab(el.dataset.sideTab)));
$("referenceBtn").addEventListener("click", () => openSideTab(currentSideTab() === "reference" ? "live" : "reference"));

/* drag (or arrow keys on) the divider; each tab remembers its own width */
function rememberWidth(px) {
  const width = `${Math.round(px)}px`;
  setSideWidth(width);
  savePrefs({ sideWidth: { ...prefs.sideWidth, [currentSideTab()]: width } });
}
$("divider").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const divider = $("divider");
  divider.setPointerCapture(e.pointerId);
  divider.classList.add("dragging");
  document.body.classList.add("resizing");
  const move = (ev) => setSideWidth(`${Math.max(260, window.innerWidth - ev.clientX)}px`);
  const up = (ev) => {
    divider.removeEventListener("pointermove", move);
    divider.classList.remove("dragging");
    document.body.classList.remove("resizing");
    rememberWidth(Math.max(260, window.innerWidth - ev.clientX));
  };
  divider.addEventListener("pointermove", move);
  divider.addEventListener("pointerup", up, { once: true });
});
$("divider").addEventListener("keydown", (e) => {
  const step = { ArrowLeft: DIVIDER_STEP_PX, ArrowRight: -DIVIDER_STEP_PX }[e.key];
  if (!step) return;
  e.preventDefault();
  rememberWidth($("side").getBoundingClientRect().width + step);
});

/* the embedded reference asks to load a song into the editor */
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "cannoli:load" || typeof e.data.code !== "string") return;
  editor.setValue(e.data.code);
  lint();
  say(`loaded "${e.data.name ?? "song"}". Ctrl+Enter to hear it (ctrl+z brings back what you had)`);
});

openSideTab(SIDE_TABS_REMEMBERED.includes(prefs.sideTab) ? prefs.sideTab : "live");

/* ---------- helpers ---------- */

let sayTimer = 0;
function say(message, tone = "") {
  const el = $("message");
  el.textContent = message;
  el.classList.toggle("bad", tone === "bad");
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { el.textContent = ""; }, 4000 + message.length * 30);
}

function flash(id) {
  const el = $(id);
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the song just won't be remembered
  }
}

function readJSON(key) {
  try {
    return JSON.parse(readStore(key) ?? "{}");
  } catch {
    return {};
  }
}

function savePrefs(change) {
  Object.assign(prefs, change);
  writeStore(STORE_PREFS, JSON.stringify(prefs));
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- start ---------- */

if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelectorAll("kbd[data-mod]").forEach((k) => { k.textContent = "⌘"; });
}

lint();
requestAnimationFrame(frame);
say("loading Strudel…");
engine.ready.then(() => {
  state.tools = { transpiler: engine.transpiler, known: engine.known };
  lint();
  say("ready: press ctrl+enter to play");
}).catch(() => say("Strudel couldn't load. Check your connection and reload the page.", "bad"));
