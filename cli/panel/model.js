/* ============================================================
   cannoli — what each tool's panel shows and does
   Turns a tool into rows of cells and sliders, and a pressed
   cell into an edit. Pure: cli/panel/layout.js places the rows
   and cli/edit.js draws them.
   ============================================================ */

import { toggleNote, holdNote, finer } from "../../src/editor/melody-grid.js";
import { setChord, removeBar } from "../../src/editor/chord-picker.js";

const MOST_MELODY_COLUMNS = 32;
const MOST_STEPS = 32;
const RING_WIDTH = 17;
const RING_HEIGHT = 7;
const BARS_PER_GROUP = 4;
const MORE_BARS = 8;

const cell = (id, text, extra = {}) => ({ id, text, ...extra });
const title = (text) => ({ text, role: "dim" });

function verbRows(tool) {
  const plain = (s) => s.replace(/^\(\s*|\s*\)$/g, "").replace(/\s+/g, " ").trim();
  return tool.groups.map((group) => ({
    label: group.title,
    cells: group.choices.map((c) => cell(`verb:${c.code}`, c.code, { on: plain(tool.verb) === plain(c.code), doc: c.doc })),
  }));
}

function grooveRows(tool, current) {
  return tool.grooves.map((g) => ({
    cells: [cell(`groove:${g.name}`, g.name.padEnd(10), { on: current(g), doc: g.doc + (g.fits ? " · fits this style" : "") }),
      ...[cell(`groove:${g.name}:steps`, g.steps.map((hit) => (hit ? "█" : "·")).join(""), { dim: true, alias: `groove:${g.name}`, doc: g.doc })]],
  }));
}

function ringArt(pattern) {
  const grid = Array.from({ length: RING_HEIGHT }, () => Array(RING_WIDTH).fill(" "));
  pattern.forEach((hit, i) => {
    const angle = (i / pattern.length) * 2 * Math.PI - Math.PI / 2;
    const x = Math.round((RING_WIDTH - 1) / 2 + ((RING_WIDTH - 1) / 2) * Math.cos(angle));
    const y = Math.round((RING_HEIGHT - 1) / 2 + ((RING_HEIGHT - 1) / 2) * Math.sin(angle));
    grid[y][x] = hit ? "●" : "·";
  });
  return grid.map((row) => row.join(""));
}

const selectedPart = (tool, view) => Math.min(view.part ?? tool.cursorPart ?? 0, tool.parts.length - 1);

const BUILD = {
  beat(tool, view) {
    if (view.grooves) {
      const steps = tool.steps.join();
      return { title: `${tool.name}: pick a groove`, rows: [...grooveRows(tool, (g) => g.steps.join() === steps), { cells: [cell("view:grid", "back to the steps")] }] };
    }
    const numbers = tool.steps.map((_, i) => cell(`n${i}`, i % tool.perBeat === 0 ? String(i / tool.perBeat + 1).padEnd(2) : "  ", { label: true, gap: i > 0 && i % tool.perBeat === 0 }));
    const steps = tool.steps.map((on, i) => cell(`step:${i}`, on ? "██" : "░░", { on, gap: i > 0 && i % tool.perBeat === 0, doc: `beat ${Math.floor(i / tool.perBeat) + 1}, step ${(i % tool.perBeat) + 1}` }));
    const actions = tool.grooves.length ? [cell("view:grooves", "grooves")] : [];
    return { title: `${tool.name} plays ${tool.drum}`, rows: [{ cells: numbers }, { cells: steps }, ...(actions.length ? [{ cells: actions }] : [])] };
  },
  bars(tool) {
    return {
      title: `bars where ${tool.verb || "it"} happens`,
      rows: [{ cells: tool.bars.map((on, i) => cell(`bar:${i}`, String(i + 1).padStart(2), { on, gap: i > 0 && i % BARS_PER_GROUP === 0 })) }, ...verbRows(tool)],
    };
  },
  verb(tool) {
    const chance = tool.chance === null ? [] : [{ slider: { id: "slide:chance", label: "chance", min: 0, max: 1, step: 0.01, value: tool.chance } }];
    return { title: `${tool.word}: what happens`, rows: [...chance, ...verbRows(tool)] };
  },
  slider(tool) {
    const actions = [cell("close", "keep this number"), ...(tool.canAddToCode && !tool.inCode ? [cell("slider:add", "add a slider to the code")] : [])];
    return { title: tool.word, rows: [{ slider: { id: "slide:value", label: tool.word, min: tool.min, max: tool.max, step: tool.step, value: tool.value } }, { cells: actions }] };
  },
  melody(tool) {
    const { cells, rows } = tool;
    const perBeat = cells.length % 4 === 0 ? cells.length / 4 : cells.length;
    const sounding = (column) => {
      for (let i = column; i >= 0; i--) if (Array.isArray(cells[i])) return cells[i];
      return [];
    };
    const grid = rows.map((row) => ({
      label: `${row.note.padEnd(3)}${row.step}`, home: row.home,
      cells: cells.map((c, column) => {
        const on = Array.isArray(c) && c.includes(row.step);
        const held = c === "hold" && sounding(column).includes(row.step);
        return cell(`note:${row.step}:${column}`, on ? "██" : held ? "▓▓" : "░░", { on: on || held, gap: column > 0 && column % perBeat === 0 });
      }),
    }));
    return { title: `${tool.name}: space adds a note, + holds it`, rows: [...grid, { cells: [cell("finer", "more steps")] }] };
  },
  chords(tool, view) {
    const slot = Math.min(view.slot ?? 0, Math.max(0, tool.words.length - 1));
    const next = new Set(tool.next(slot).map((o) => o.word));
    return {
      title: "pick a bar, then a chord",
      rows: [
        { label: "bars", cells: [...tool.words.map((w, i) => cell(`slot:${i}`, tool.nameOf(w).padEnd(5), { on: i === slot })), cell("add", "+ bar"), ...(tool.words.length > 1 ? [cell("remove", "- bar")] : [])] },
        { label: "chords", cells: tool.options.map((o) => cell(`chord:${o.word}`, o.name.padEnd(5), { accent: next.has(o.word), doc: next.has(o.word) ? "usually comes next" : o.word })) },
        ...tool.progressions.slice(0, 5).map((p, i) => ({ label: i === 0 ? "ready" : "", cells: [cell(`prog:${i}`, p.names, { doc: p.doc + (p.fits ? " · fits this style" : "") })] })),
      ],
    };
  },
  key(tool) {
    return {
      title: "the home note and the mood",
      rows: [
        { label: "note", cells: tool.notes.map((n) => cell(`note:${n.name}`, n.label.padEnd(2), { on: tool.note !== null && tool.same(n.name, tool.note) })) },
        { label: "mood", cells: tool.modes.map((m) => cell(`mode:${m.name}`, m.name, { on: m.name === tool.mode, doc: m.doc })) },
        title(`notes   ${tool.details.scale.join(" ")}`),
        title(`chords  ${tool.details.chords.join(" ")}`),
      ],
    };
  },
  sound(tool) {
    return {
      title: `${tool.thread ?? "this"} plays ${tool.current}`,
      rows: tool.groups.map((g) => ({ label: g.title.split(" ")[0], cells: g.sounds.map((s) => cell(`sound:${s.word}`, s.word, { on: s.word === tool.current, accent: s.fits, doc: s.doc })) })),
    };
  },
  groove(tool) {
    return { title: `${tool.thread ?? "this"}: pick a groove`, rows: grooveRows(tool, (g) => g.name === tool.name) };
  },
  euclid(tool) {
    const values = { hits: tool.hits, steps: tool.steps, rotation: tool.rotation };
    const name = tool.nameOf(values);
    return {
      title: `${values.hits} hits over ${values.steps} steps${name ? ` · ${name}` : ""}`,
      rows: [
        ...ringArt(tool.pattern(values)).map((line) => ({ text: line, role: "accent" })),
        { slider: { id: "slide:hits", label: "hits", min: 0, max: values.steps, step: 1, value: values.hits } },
        { slider: { id: "slide:steps", label: "steps", min: 1, max: MOST_STEPS, step: 1, value: values.steps } },
        ...(tool.word === "hits" ? [] : [{ slider: { id: "slide:rotation", label: "rotate", min: 0, max: Math.max(1, values.steps - 1), step: 1, value: values.rotation } }]),
      ],
    };
  },
  kit(tool) {
    if (tool.drums.length === 0 && tool.addable.length === 0) return { title: "drum kit", rows: [title("Name a part kick:, snare: or hats: and it appears here.")] };
    const gapAt = (i) => i > 0 && i % tool.perBeat === 0;
    const numbers = Array.from({ length: tool.stepCount }, (_, i) => cell(`n${i}`, i % tool.perBeat === 0 ? String(i / tool.perBeat + 1).padEnd(2) : "  ", { label: true, gap: gapAt(i) }));
    const rows = tool.drums.map((part, r) => {
      const mute = cell(`mute:${r}`, part.muted ? "[M]" : "[ ]", { on: part.muted, doc: `${part.muted ? "unmute" : "mute"} ${part.name}` });
      if (part.steps?.length !== tool.stepCount) return { label: part.name, cells: [mute, cell(`locked:${r}`, "written by hand: change this one in the code", { label: true })] };
      const hit = part.muted ? "▒▒" : "██";
      const steps = part.steps.map((on, i) => cell(`step:${r}:${i}`, on ? hit : "░░", { on, gap: gapAt(i), doc: `${part.name}: beat ${Math.floor(i / tool.perBeat) + 1}, step ${(i % tool.perBeat) + 1}` }));
      return { label: part.name, cells: [mute, ...steps] };
    });
    const add = tool.addable.length ? [{ label: "add", cells: tool.addable.map((k) => cell(`add:${k.name}`, `+ ${k.name}`, { doc: `adds a ${k.name} part to the code` })) }] : [];
    return { title: "drum kit: every beat lines up", rows: [{ label: "", cells: [cell("mute-head", "   ", { label: true }), ...numbers] }, ...rows, ...add] };
  },
  mix(tool, view) {
    if (tool.parts.length === 0) return { title: "mixer", rows: [title("Name a part, like kick: or lead:, and it appears here.")] };
    const index = selectedPart(tool, view);
    const part = tool.parts[index];
    const effects = part.effects.map((e) => (e.locked
      ? title(`${e.word} is written as ${e.locked}: change it in the code`)
      : { slider: { id: `fx:${e.word}`, label: e.word, min: e.min, max: e.max, step: e.step, value: e.value } }));
    return {
      title: "mixer: every move rewrites the code",
      rows: [
        { label: "part", cells: tool.parts.map((p, i) => cell(`part:${i}`, p.muted ? `${p.name} (muted)` : p.name, { on: i === index })) },
        { label: "mute", cells: [cell(`mute:${part.id}`, part.muted ? `unmute ${part.name}` : `mute ${part.name}`, { on: part.muted })] },
        ...effects,
      ],
    };
  },
  timeline(tool) {
    const numbers = Array.from({ length: tool.bars }, (_, i) => cell(`n${i}`, i % BARS_PER_GROUP === 0 ? String(i + 1).padEnd(2) : "  ", { label: true, gap: i > 0 && i % BARS_PER_GROUP === 0 }));
    return {
      title: "song timeline: when each part plays",
      rows: [
        { label: "", cells: numbers },
        ...tool.rows.map((row, r) => ({ label: row.name, cells: row.on.map((on, i) => cell(`bar:${r}:${i}`, on ? "██" : "░░", { on, gap: i > 0 && i % BARS_PER_GROUP === 0 })) })),
        { cells: [cell("more", "+ 8 bars")] },
      ],
    };
  },
};

/** What a tool's panel shows. */
export function buildPanel(tool, view = {}) {
  return BUILD[tool.kind](tool, view);
}

const flip = (list, i) => list.map((v, k) => (k === i ? !v : v));

/**
 * What pressing a cell does.
 * @returns {{ change?: object, view?: object, close?: boolean, quiet?: boolean }}
 */
export function perform(tool, id, view = {}, extra = {}) {
  const [name, a, b] = id.split(":");
  const rest = id.slice(name.length + 1);
  if (name === "close") return { close: true };
  switch (tool.kind) {
    case "beat":
      if (name === "view") return { view: { ...view, grooves: a === "grooves" } };
      if (name === "groove") return { change: tool.applyGroove(a), view: { ...view } };
      return name === "step" ? { change: tool.apply(flip(tool.steps, Number(a))) } : {};
    case "bars":
      if (name === "bar") return { change: tool.apply(flip(tool.bars, Number(a))) };
      return name === "verb" ? { change: tool.applyVerb(rest) } : {};
    case "verb":
      if (name === "slide") return { change: tool.applyChance(extra.value) };
      return name === "verb" ? { change: tool.apply(rest) } : {};
    case "slider":
      if (name === "slide") return { change: tool.apply(extra.value) };
      return name === "slider" ? { change: tool.addToCode(tool.value) } : {};
    case "melody":
      if (name === "finer") return tool.cells.length * 2 > MOST_MELODY_COLUMNS ? {} : { view: { ...view, minColumns: tool.cells.length * 2 } };
      if (name === "hold") return { change: tool.apply(holdNote(tool.cells, extra.from, Number(a))) };
      return name === "note" ? { change: tool.apply(toggleNote(tool.cells, Number(a), Number(b))) } : {};
    case "chords": {
      const slot = Math.min(view.slot ?? 0, Math.max(0, tool.words.length - 1));
      if (name === "slot") return { view: { ...view, slot: Number(a) } };
      if (name === "chord") return { change: tool.apply(setChord(tool.words, slot, rest)), view: { ...view, slot: Math.min(slot + 1, Math.max(0, tool.words.length - 1)) } };
      if (name === "add") { const words = tool.added(tool.words); return { change: tool.apply(words), view: { ...view, slot: words.length - 1 } }; }
      if (name === "remove") return { change: tool.apply(removeBar(tool.words, slot)) };
      return name === "prog" ? { change: tool.apply(tool.progressions[Number(a)].words), view: { ...view, slot: 0 } } : {};
    }
    case "key":
      if (name === "note") return { change: tool.apply({ note: rest }) };
      return name === "mode" ? { change: tool.apply({ mode: a }) } : {};
    case "sound":
      return name === "sound" ? { change: tool.apply(a) } : {};
    case "groove":
      return name === "groove" ? { change: tool.apply(a) } : {};
    case "euclid": {
      if (name !== "slide") return {};
      const values = { hits: tool.hits, steps: tool.steps, rotation: tool.rotation, [a]: extra.value };
      return { change: tool.apply({ steps: values.steps, hits: Math.min(values.hits, values.steps), rotation: values.rotation % values.steps }) };
    }
    case "kit": {
      const part = tool.drums[Number(a)];
      if (name === "add") return { change: tool.addDrum(a) };
      if (name === "mute") return { change: tool.setMute(part.id, !part.muted), quiet: true };
      if (name !== "step") return {};
      const steps = part.steps.map((on, i) => (i === Number(b) ? extra.value ?? !on : on));
      return { change: tool.setSteps(part.id, steps) };
    }
    case "mix": {
      if (name === "part") return { view: { ...view, part: Number(a) } };
      if (name === "mute") return { change: tool.setMute(Number(a), !tool.parts[Number(a)].muted), quiet: true };
      return name === "fx" ? { change: tool.setEffect(selectedPart(tool, view), a, extra.value) } : {};
    }
    case "timeline":
      if (name === "more") return { view: { ...view, extraBars: (view.extraBars ?? 0) + MORE_BARS } };
      if (name === "bar") {
        const row = tool.rows[Number(a)];
        const on = row.on.map((v, i) => (i === Number(b) ? extra.value ?? !v : v));
        return { change: tool.apply(row.id, on) };
      }
      return {};
    default:
      return {};
  }
}
