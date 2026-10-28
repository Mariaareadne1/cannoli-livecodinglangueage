/* ============================================================
   cannoli — the page
   Wires the editor, the compiler and the engine together, and
   draws the status line, problem list and thread grid.
   ============================================================ */

import { compile } from "./lang/compile.js";
import { Engine } from "./audio/engine.js";
import { createEditor } from "./editor/editor.js";
import { EXAMPLES } from "./examples.js";
import { codeFromUrl } from "./share.js";
import { THEMES, THEME_NAMES } from "./themes.js";
import { applyTheme, savedTheme } from "./apply-theme.js";

applyTheme(savedTheme());
import { STYLES, STYLE_NAMES } from "./core/styles.js";

const STORE_CODE = "cannoli-code";
const OLD_STORE_CODES = ["pretzel-code", "loom-code"];   // saved under the language's earlier names
const STORE_PREFS = "cannoli-prefs";
const LINT_DELAY_MS = 120;
const THREAD_COLORS = ["--t0", "--t1", "--t2", "--t3", "--t4", "--t5"];

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const prefs = { quantize: "bar", autofix: false, ...readJSON(STORE_PREFS) };
const state = { result: null, runText: null, lastActiveKey: "" };

// a song link (#code=…) wins over saved code; drop it from the URL so a reload keeps your edits
const linked = codeFromUrl();
if (linked) history.replaceState(null, "", location.pathname);

const editor = createEditor($("editor"), {
  value: linked ?? (readStore(STORE_CODE) || OLD_STORE_CODES.map(readStore).find(Boolean) || EXAMPLES[0].code),
  onRun: run,
  onStop: (now) => stop(now),
  onInput: (text) => {
    writeStore(STORE_CODE, text);
    clearTimeout(state.lintTimer);
    state.lintTimer = setTimeout(lint, LINT_DELAY_MS);
  },
});

/* ---------- checking as you type ---------- */

function lint() {
  const result = compile(editor.value);
  state.result = result;
  const { settings } = result.program;
  editor.setSymbols({ ...result.symbols, keyMode: settings.keys[0]?.mode, style: settings.style });
  $("style").value = settings.style ?? "";
  const problems = [
    ...result.errors.map((e) => problem(e, "error")),
    ...result.warnings.map((e) => problem(e, "warning")),
  ];
  editor.setProblems(problems);
  renderProblems(problems);
  return result;
}

function problem(err, severity) {
  return { start: err.start, end: err.end, message: err.message, fix: err.fix, severity };
}

/* ---------- play / update / stop ---------- */

async function run() {
  let result = lint();
  if (result.errors.length && prefs.autofix) {
    const fixed = applyAllFixes(result.errors);
    if (fixed) result = lint();
  }
  if (result.errors.length) {
    flash("problems");
    say(`not playing yet: ${plural(result.errors.length, "problem")} to fix${engine.playing ? " — the last version keeps playing" : ""}`, "bad");
    return;
  }
  state.runText = editor.value;
  engine.quantize = prefs.quantize;
  if (engine.playing) {
    engine.update(result.program);
    say(`changes land on the next ${prefs.quantize === "phrase" ? "phrase" : "bar"}`);
  } else {
    await engine.play(result.program);
    say("playing");
  }
}

function stop(now = false) {
  engine.stop({ now });
  if (!now) say("stopping at the end of the bar");
}

function applyAllFixes(errors) {
  const fixes = errors.map((e) => e.fix).filter(Boolean).sort((a, b) => b.start - a.start);
  fixes.forEach((fix) => editor.applyFix(fix));
  return fixes.length > 0;
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
  $("stKey").textContent = pos?.key ?? settings?.keys[0]?.name ?? "—";
  $("stChord").textContent = pos?.chord ?? settings?.chords[0]?.names[0] ?? "—";
  if (pos) {
    const beats = pos.program.settings.beats;
    $("stBar").textContent = `${pos.bar + 1}.${Math.min(beats, Math.floor(pos.progress * beats) + 1)}`;
  } else {
    $("stBar").textContent = "—";
  }
  const wait = engine.nextChangeIn;
  $("stNext").textContent = wait === null ? "" : `${engine.stopping ? "stop" : "change"} in ${wait.toFixed(1)}s`;
  document.body.classList.toggle("is-playing", engine.playing);
  $("playBtn").querySelector("span").textContent = engine.playing ? "update" : "play";
}

/* ---------- problems panel ---------- */

function renderProblems(problems) {
  const list = $("problemList");
  $("problemCount").textContent = problems.length ? String(problems.length) : "";
  $("fixAll").hidden = !problems.some((p) => p.fix && p.severity === "error");
  if (problems.length === 0) {
    list.innerHTML = `<li class="ok">no problems</li>`;
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

$("fixAll").addEventListener("click", () => applyAllFixes(state.result?.errors ?? []));

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
  const beats = program?.settings.beats ?? 4;

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
  for (let b = 0; b <= beats; b++) g.fillRect(labelW + (b / beats) * laneW, 0, 1, height);

  if (!pos) return;
  barNotes(pos).forEach((n) => {
    const row = names.indexOf(n.thread);
    if (row === -1) return;
    const y = 4 + row * rowH;
    const x = labelW + Math.max(0, n.start) * laneW;
    const w = Math.max(3, (Math.min(1, n.start + n.dur) - Math.max(0, n.start)) * laneW - 2);
    const on = pos.progress >= n.start && pos.progress < n.start + n.dur;
    g.globalAlpha = on ? 1 : 0.45;
    g.fillStyle = css.getPropertyValue(THREAD_COLORS[row % THREAD_COLORS.length]);
    if (n.drum) {
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

/* Notes of the current bar, plus any held over from earlier bars (start < 0). */
function barNotes(pos) {
  const held = engine.bars
    .filter((b) => b.bar < pos.bar)
    .flatMap((b) => b.notes.map((n) => ({ ...n, start: n.start - (pos.bar - b.bar) })))
    .filter((n) => n.start + n.dur > 0);
  return [...held, ...pos.notes].filter((n) => !n.echo);
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
  renderStatus();
  drawThreads();
  highlightSounding();
  requestAnimationFrame(frame);
}

/* ---------- examples + settings ---------- */

$("examples").innerHTML = EXAMPLES.map((ex, i) => `<option value="${i}">${ex.name}</option>`).join("");
$("examples").addEventListener("change", (e) => {
  editor.setValue(EXAMPLES[Number(e.target.value)].code);
  lint();
  say(`loaded "${EXAMPLES[Number(e.target.value)].name}" — ${EXAMPLES[Number(e.target.value)].note}. Ctrl+Enter to hear it.`);
});

/* theme */
$("theme").innerHTML = THEME_NAMES.map((n) => `<option value="${n}">${THEMES[n].label}</option>`).join("");
$("theme").value = savedTheme();
$("theme").addEventListener("change", (e) => {
  applyTheme(e.target.value);
  say(`theme: ${THEMES[e.target.value].label}`);
});

/* The style picker writes (or rewrites) the `style` line in the code. */
$("style").innerHTML = `<option value="">no style</option>${STYLE_NAMES.map((n) => `<option value="${n}">${n}</option>`).join("")}`;
$("style").addEventListener("change", (e) => {
  const name = e.target.value;
  const text = editor.value;
  const existing = text.match(/^style\b.*$/m);
  if (existing) {
    const start = existing.index;
    const end = start + existing[0].length + (name ? 0 : 1);
    editor.applyFix({ start, end, text: name ? `style ${name}` : "" });
  } else if (name) {
    const firstCode = text.match(/^(?!\s*#)\S/m)?.index ?? 0;
    editor.applyFix({ start: firstCode, end: firstCode, text: `style ${name}\n` });
  }
  lint();
  const starter = EXAMPLES.find((ex) => ex.name.startsWith(`${name} ·`));
  say(name
    ? `style ${name}: ${STYLES[name].doc}. Suggestions now favour it.${starter ? ` For a starting point, load "${starter.name}".` : ""}`
    : "no style: back to the neutral defaults");
});

$("quantize").value = prefs.quantize;
$("quantize").addEventListener("change", (e) => savePrefs({ quantize: e.target.value }));
$("autofix").checked = prefs.autofix;
$("autofix").addEventListener("change", (e) => savePrefs({ autofix: e.target.checked }));

function savePrefs(change) {
  Object.assign(prefs, change);
  writeStore(STORE_PREFS, JSON.stringify(prefs));
}

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
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}
function readJSON(key) {
  try { return JSON.parse(readStore(key) ?? "{}"); } catch { return {}; }
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelectorAll("kbd[data-mod]").forEach((k) => { k.textContent = "⌘"; });
}
lint();
editor.focus();
requestAnimationFrame(frame);
