/* ============================================================
   cannoli — the kit and mixer tabs
   Draws the song's drums on one grid lined up by beats, and each
   part's mute and effects. Every click and slide edits the code.
   ============================================================ */

import { readStrudelStudio as readStudio } from "../cli/strudel/studio.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* An effect the code doesn't mention is off; gain and brightness always have a level. */
const amountLabel = (effect) => (effect.written || !effect.removable ? effect.value : "off");

/**
 * @param {{ kitRoot: HTMLElement, mixRoot: HTMLElement, getText: () => string, getCaret: () => number,
 *           edit: (change: object) => void, slide: (change: object) => void, hear: (offset: number) => void }} opts
 */
export function createStudioPanel({ kitRoot, mixRoot, getText, getCaret, edit, slide, hear }) {
  let selected = null;     // the mixer's part; until one is picked it follows the cursor
  let paint = null;        // a drag along a row of steps
  let sliding = false;
  const drawn = new Map();

  /* Only replace the page if something changed: replacing a control takes the focus off it. */
  function setHtml(root, html) {
    if (drawn.get(root) === html) return;
    const key = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    drawn.set(root, html);
    root.innerHTML = html;
    if (key) root.querySelector(`[data-key="${key}"]`)?.focus();
  }

  /* ---------- the drum kit ---------- */

  function stepButton(part, on, i, perBeat) {
    const beat = Math.floor(i / perBeat) + 1;
    return `<button type="button" class="kit-step${on ? " on" : ""}${i > 0 && i % perBeat === 0 ? " beat" : ""}${i % perBeat === 0 ? " downbeat" : ""}" data-key="s${part.id}-${i}" data-part="${part.id}" data-step="${i}" aria-pressed="${on}" aria-label="${esc(part.name)}, beat ${beat}, step ${(i % perBeat) + 1}" tabindex="-1"></button>`;
  }

  function kitRow(part, studio) {
    const mute = `<button type="button" class="kit-mute${part.muted ? " on" : ""}" data-key="m${part.id}" data-mute="${part.id}" aria-pressed="${part.muted}" aria-label="mute ${esc(part.name)}" title="${part.muted ? "unmute" : "mute"}">M</button>`;
    const cells = part.steps?.length === studio.stepCount
      ? part.steps.map((on, i) => stepButton(part, on, i, studio.perBeat)).join("")
      : '<span class="kit-locked">written by hand: change this one in the code</span>';
    return `<div class="kit-row${part.muted ? " muted" : ""}"><span class="kit-name" title="${esc(part.name)}">${esc(part.name)}</span>${mute}${cells}</div>`;
  }

  function drawKit() {
    if (paint) return;
    const studio = readStudio(getText());
    const numbers = Array.from({ length: studio.stepCount }, (_, i) => {
      const isBeat = i % studio.perBeat === 0;
      return `<span class="kit-number${i > 0 && isBeat ? " beat" : ""}">${isBeat ? i / studio.perBeat + 1 : ""}</span>`;
    }).join("");
    const head = `<div class="kit-row kit-head"><span class="kit-name"></span><span class="kit-mute-space"></span>${numbers}</div>`;
    const rows = studio.drums.map((part) => kitRow(part, studio)).join("");
    const empty = studio.drums.length ? "" : '<p class="dim tl-help">No drums yet. Add one below.</p>';
    const add = studio.addable.map((k) => `<button type="button" class="btn kit-add" data-key="a${k.name}" data-add="${k.name}">+ ${k.name}</button>`).join("");
    setHtml(kitRoot, `<div class="kit">${head}${rows}</div>${empty}<div class="kit-adds">${add}</div>`);
    const first = kitRoot.querySelector(".kit-step");
    if (first && !kitRoot.querySelector('.kit-step[tabindex="0"]')) first.tabIndex = 0;
  }

  const rowSteps = (id) => [...kitRoot.querySelectorAll(`.kit-step[data-part="${id}"]`)];

  function setStep(button, on) {
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  }

  function commitSteps(id) {
    const studio = readStudio(getText());
    const change = studio.setSteps(id, rowSteps(id).map((b) => b.classList.contains("on")));
    if (!change) return;
    edit(change);
    hear(studio.parts[id].start);
  }

  kitRoot.addEventListener("mousedown", (e) => {
    const button = e.target.closest(".kit-step");
    if (!button) return;
    e.preventDefault();
    const value = !button.classList.contains("on");
    paint = { id: button.dataset.part, value };
    setStep(button, value);
  });

  kitRoot.addEventListener("mouseover", (e) => {
    const button = e.target.closest(".kit-step");
    if (paint && button?.dataset.part === paint.id) setStep(button, paint.value);
  });

  document.addEventListener("mouseup", () => {
    if (!paint) return;
    const { id } = paint;
    paint = null;
    commitSteps(Number(id));
    drawKit();
  });

  kitRoot.addEventListener("click", (e) => {
    const mute = e.target.closest("[data-mute]");
    if (mute) toggleMute(Number(mute.dataset.mute));
    const add = e.target.closest("[data-add]");
    if (add) {
      const change = readStudio(getText()).addDrum(add.dataset.add);
      edit(change);
      hear(change.start + 1);
      drawKit();
    }
  });

  kitRoot.addEventListener("keydown", (e) => {
    const button = e.target.closest(".kit-step");
    if (!button) return;
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      const rows = [...new Set([...kitRoot.querySelectorAll(".kit-step")].map((b) => b.dataset.part))];
      const part = rows[rows.indexOf(button.dataset.part) + moves[e.key][0]];
      kitRoot.querySelector(`.kit-step[data-part="${part}"][data-step="${Number(button.dataset.step) + moves[e.key][1]}"]`)?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setStep(button, !button.classList.contains("on"));
      commitSteps(Number(button.dataset.part));
      drawKit();
    }
  });

  function toggleMute(id) {
    const studio = readStudio(getText());
    const change = studio.setMute(id, !studio.parts[id].muted);
    if (change) edit(change);
    drawKit();
    drawMix();
  }

  /* ---------- the mixer ---------- */

  function effectRow(effect) {
    if (effect.locked) return `<li class="slider-row"><span>${esc(effect.word)}</span><span class="dim mix-locked">written as ${esc(effect.locked)} in the code</span></li>`;
    return `<li class="slider-row"><label for="fx-${effect.word}">${effect.word}</label>
      <input id="fx-${effect.word}" data-key="fx${effect.word}" data-fx="${effect.word}" type="range" min="${effect.min}" max="${effect.max}" step="${effect.step}" value="${effect.value}" />
      <output>${amountLabel(effect)}</output></li>`;
  }

  function drawMix() {
    if (sliding) return;
    const studio = readStudio(getText());
    if (studio.parts.length === 0) {
      setHtml(mixRoot, '<p class="dim tl-help">Write a part, like <code>kick: s("bd*4")</code>, and it appears here.</p>');
      return;
    }
    const index = Math.min(selected ?? studio.partAt(getCaret()) ?? 0, studio.parts.length - 1);
    const parts = studio.parts.map((p) => `<li class="mix-part${p.id === index ? " on" : ""}${p.muted ? " muted" : ""}">
      <button type="button" class="mix-name" data-key="p${p.id}" data-select="${p.id}" aria-pressed="${p.id === index}">${esc(p.name)}</button>
      <button type="button" class="kit-mute${p.muted ? " on" : ""}" data-key="m${p.id}" data-mute="${p.id}" aria-pressed="${p.muted}" aria-label="mute ${esc(p.name)}" title="${p.muted ? "unmute" : "mute"}">M</button></li>`).join("");
    setHtml(mixRoot, `<ul class="mix-parts">${parts}</ul>
      <h3 class="mix-title">${esc(studio.parts[index].name)} effects</h3>
      <ul class="slider-list" data-part="${index}">${studio.parts[index].effects.map(effectRow).join("")}</ul>`);
  }

  mixRoot.addEventListener("click", (e) => {
    const mute = e.target.closest("[data-mute]");
    if (mute) toggleMute(Number(mute.dataset.mute));
    const part = e.target.closest("[data-select]");
    if (part) {
      selected = Number(part.dataset.select);
      drawMix();
    }
  });

  mixRoot.addEventListener("input", (e) => {
    if (!e.target.matches("[data-fx]")) return;
    sliding = true;
    const id = Number(e.target.closest("[data-part]").dataset.part);
    const change = readStudio(getText()).setEffect(id, e.target.dataset.fx, Number(e.target.value));
    if (change) slide(change);
    const now = readStudio(getText()).parts[id].effects.find((fx) => fx.word === e.target.dataset.fx);
    e.target.nextElementSibling.textContent = amountLabel(now);
  });

  mixRoot.addEventListener("change", (e) => {
    if (!e.target.matches("[data-fx]")) return;
    sliding = false;
    const id = Number(e.target.closest("[data-part]").dataset.part);
    hear(readStudio(getText()).parts[id].start);
    drawMix();
  });

  const visible = (root) => !root.closest("[hidden]");

  return {
    /** The song changed: redraw whichever tab is showing. */
    update() {
      if (visible(kitRoot)) drawKit();
      if (visible(mixRoot)) drawMix();
    },
    /** The mixer tab was opened: start on the part under the cursor. */
    open() {
      selected = null;
      drawKit();
      drawMix();
    },
  };
}
