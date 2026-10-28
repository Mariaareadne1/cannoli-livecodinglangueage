/* ============================================================
   cannoli — visual frame
   One frame of the terminal visual: a glowing shark drifting
   through a dark, dotted sea. Pure: the same state always gives
   the same string, so it can be tested and replayed.

   Geometry works in "physical" units where one unit is one
   terminal column; rows are two units tall, which corrects for
   cells being roughly twice as tall as they are wide.
   ============================================================ */

import { rgb, mix } from "../src/themes.js";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const DEEP_GLYPHS = "X8S0X8S0xs";   // cells well inside the body
const EDGE_GLYPHS = "xso.xsoS..";   // cells near the outline
const BUBBLE_LIFE = 2.5;            // seconds a note bubble lives
const BUBBLE_RISE = 5;              // physical units per second
const ROW_UNITS = 2;                // physical height of one row
const DOT_EVERY_COL = 4;
const DOT_EVERY_ROW = 2;
// the beat layer
const RIPPLE_LIFE = 1.4;            // seconds a kick ripple spreads
const RIPPLE_SPEED = 26;            // physical units per second
const RIPPLE_WIDTH = 1.6;           // ring thickness, physical units
const TIDE_SHARE = 0.22;            // the tide uses up to this much of the pane's height

/* ---------- small numeric helpers ---------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic hash of three integers → [0, 1). */
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const lerp3 = (a, b, t) => {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

const sgn = (v) => (v < 0 ? -1 : 1);

/** Signed distance from (px, py) to triangle a-b-c (negative inside). */
function sdTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy;
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy;
  const k0 = clamp01((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y));
  const k1 = clamp01((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y));
  const k2 = clamp01((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y));
  const q0x = v0x - e0x * k0, q0y = v0y - e0y * k0;
  const q1x = v1x - e1x * k1, q1y = v1y - e1y * k1;
  const q2x = v2x - e2x * k2, q2y = v2y - e2y * k2;
  const s = sgn(e0x * e2y - e0y * e2x);
  const d = Math.min(q0x * q0x + q0y * q0y, q1x * q1x + q1y * q1y, q2x * q2x + q2y * q2y);
  const inside = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x));
  return -Math.sqrt(d) * sgn(inside);
}

/* ---------- the creature ---------- */

/** Size of the shark for a pane: body length L and half-thickness H (physical units). */
function creatureSize(width, height) {
  const length = Math.max(8, Math.min(width * 0.48, height * 3.4));
  return { length, thick: length * 0.16 };
}

/** Where the shark is at a given time: centre, heading angle and the wrap period. */
function creaturePose(time, width, height, size) {
  const period = width + size.length * 1.3;
  const speed = Math.max(2.5, width / 18);
  const travel = (((time * speed) % period) + period) % period;
  const phase = travel / period;
  const mid = height;                                   // physical middle of the pane
  const amp = Math.max(0, height - size.thick * 3.4) * 0.6;
  const bob = Math.sin(time * 0.7) * size.thick * 0.25;
  const x = travel - size.length * 0.62;
  const y = mid + amp * Math.sin(phase * Math.PI * 2 - 1.2) + bob;
  const slope = (amp * Math.PI * 2 * Math.cos(phase * Math.PI * 2 - 1.2)) / period;
  const angle = Math.max(-0.14, Math.min(0.14, Math.atan(slope) * 0.8));
  return { x, y, period, cos: Math.cos(angle), sin: Math.sin(angle) };
}

/** Half-thickness profile along the body, t = 0 at the tail root, 1 at the snout. */
function bodyHalf(t, thick) {
  const tc = clamp01(t);
  return thick * Math.max(0.16, Math.sin(Math.PI * Math.pow(tc, 1.6)));
}

/** Fin triangles in body-local coordinates (x toward the snout, y down). Built once per frame. */
function finShapes(L, H) {
  const half = L / 2;
  const at = (t) => L * (t - 0.5);
  const root = -half + L * 0.03;
  return [
    // tail: upper lobe, joint, lower lobe
    [root, -0.18 * H, -half - 0.19 * L, -1.45 * H, -half - 0.05 * L, 0.05 * H],
    [root, -0.18 * H, -half - 0.05 * L, 0.05 * H, root, 0.2 * H],
    [root, 0.15 * H, -half - 0.05 * L, 0, -half - 0.11 * L, 0.95 * H],
    // dorsal fin, leaning back
    [at(0.63), -bodyHalf(0.63, H) * 0.7, at(0.42), -bodyHalf(0.45, H) * 0.7, at(0.40), -bodyHalf(0.5, H) - 1.05 * H],
    // pectoral fin, below and swept back
    [at(0.70), bodyHalf(0.7, H) * 0.5, at(0.60), bodyHalf(0.6, H) * 0.5, at(0.50), bodyHalf(0.6, H) + 0.6 * H],
  ];
}

/** Signed distance (physical units) from a body-local point to the shark. */
function sharkDistance(lx, ly, L, H, fins, wag) {
  const t = (lx + L / 2) / L;
  const tw = t < -0.35 ? -0.35 : t > 1 ? 1 : t;
  const y = ly - wag * (1 - tw) * (1 - tw);
  const h = bodyHalf(t, H);
  const vy = y < 0 ? -y - h : y - h * 0.82;              // flatter belly than back
  const outX = Math.max(-L / 2 - lx, lx - L / 2, 0);
  let d = outX > 0 ? Math.hypot(outX, Math.max(vy, 0)) : vy;
  for (const f of fins) {
    const df = sdTriangle(lx, y, f[0], f[1], f[2], f[3], f[4], f[5]);
    if (df < d) d = df;
  }
  return d;
}

/* ---------- note bubbles ---------- */

/** Map of cell index → { ch, fg } for bubbles spawned by recent notes. */
function placeBubbles(state, size, colours) {
  const { width, height, time, notes = [] } = state;
  const out = new Map();
  notes.forEach((note, i) => {
    const age = Number(note.at);
    if (!(age >= 0) || age > BUBBLE_LIFE) return;
    const thread = ((note.thread | 0) % colours.threads.length + colours.threads.length) % colours.threads.length;
    const born = time - age;
    const seed = Math.round(born * 1000) + i * 7919;
    const pose = creaturePose(born, width, height, size);
    const along = (hash3(seed, thread, 1) - 0.4) * size.length * 0.8;
    const startY = pose.y - size.thick * (0.6 + hash3(seed, thread, 2) * 1.4);
    const px = pose.x + along + Math.sin(age * 2.2 + thread) * 1.2;
    const py = startY - age * BUBBLE_RISE;
    const col = Math.floor(((px % pose.period) + pose.period) % pose.period);
    const row = Math.floor(py / ROW_UNITS);
    if (col < 0 || col >= width || row < 0 || row >= height) return;
    const ch = age < 0.6 ? "o" : age < 1.4 ? "°" : ".";
    const fade = clamp01(age / BUBBLE_LIFE);
    out.set(row * width + col, { ch, fg: colours.threads[thread], fade });
  });
  return out;
}

/* ---------- output ---------- */

const toInts = (c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
const pack = (c) => (c[0] << 16) | (c[1] << 8) | c[2];

/** Line builder that only emits colour codes when they change. */
function lineWriter() {
  let s = "", bgKey = -1, fgKey = -1;
  return {
    put(ch, bg, fg) {
      const b = toInts(bg);
      const bk = pack(b);
      if (bk !== bgKey) { s += `${ESC}48;2;${b[0]};${b[1]};${b[2]}m`; bgKey = bk; }
      if (ch !== " ") {
        const f = toInts(fg);
        const fk = pack(f);
        if (fk !== fgKey) { s += `${ESC}38;2;${f[0]};${f[1]};${f[2]}m`; fgKey = fk; }
      }
      s += ch;
    },
    done: () => s + RESET,
  };
}

/** Background colour for a cell inside the body, k = 0 at the outline, 1 deep inside. */
function glowColour(k, c) {
  return k < 0.5 ? lerp3(c.edge, c.mid, k * 2) : lerp3(c.mid, c.core, (k - 0.5) * 2);
}

function paletteFor(theme) {
  return {
    sea: rgb(theme.bg),
    core: rgb(theme.glow.core),
    mid: rgb(theme.glow.mid),
    edge: rgb(theme.glow.edge),
    dot: rgb(theme.glow.dot),
    ink: rgb(mix(theme.glow.edge, theme.bg, 0.35)),     // dark glyph tint
    light: rgb(mix(theme.glow.mid, theme.glow.core, 0.5)), // light glyph tint
    threads: theme.threads.map(rgb),
  };
}

/** Glyph and colour for a cell inside the shark. */
function bodyCell(cx, cy, k, bg, time, flickerRate, c) {
  const r = hash3(cx, cy, 11);
  const step = Math.floor(time * flickerRate * (0.6 + 0.8 * r) + r * 17);
  const pick = hash3(cx, cy, step);
  const set = k > 0.35 ? DEEP_GLYPHS : EDGE_GLYPHS;
  const ch = pick < 0.08 && k > 0.15 ? " " : set[Math.floor(hash3(cy, cx, step) * set.length)];
  const tint = hash3(cx + 31, cy, step >> 1);
  let fg;
  if (tint < 0.12) fg = c.threads[Math.floor(hash3(cx, cy + 5, step) * c.threads.length)];
  else if (k > 0.55) fg = lerp3(bg, c.ink, 0.55 + tint * 0.3);
  else fg = lerp3(bg, c.light, 0.5 + tint * 0.4);
  return { ch, fg };
}

/* ---------- the beat layer ---------- */

/* How strongly a cell sits on a kick ripple's ring (0 = not at all). Rings spread from the creature. */
function rippleAt(ripples, x, y, centre, period) {
  let best = 0;
  for (const age of ripples) {
    let dx = (((x - centre.x) % period) + period) % period;
    if (dx > period / 2) dx -= period;
    const dist = Math.hypot(dx, y - centre.y);
    const radius = age * RIPPLE_SPEED;
    const onRing = 1 - Math.abs(dist - radius) / RIPPLE_WIDTH;
    if (onRing > 0) best = Math.max(best, onRing * (1 - age / RIPPLE_LIFE));
  }
  return best;
}

/* The tide: one band of glyph columns per thread along the bottom, each as tall as its thread is busy. */
function tideHeights(levels, width, height) {
  const rows = Math.max(2, Math.floor(height * TIDE_SHARE));
  const bands = Math.max(1, levels.length);
  if (!levels.some((l) => l > 0.01)) return null;
  return {
    cell(cx, cy, time) {
      const fromBottom = height - 1 - cy;
      if (fromBottom >= rows) return null;
      const band = Math.min(bands - 1, Math.floor((cx / width) * bands));
      const level = levels[band] ?? 0;
      const wobble = 0.7 + 0.3 * Math.sin(cx * 0.9 + time * 3 + band);
      const columnHeight = level * rows * wobble;
      if (fromBottom >= columnHeight) return null;
      return { band, top: fromBottom >= columnHeight - 1, k: clamp01(1 - fromBottom / Math.max(1, columnHeight)) };
    },
  };
}

function tideColours(cell, c, cx, cy, time) {
  const colour = c.threads[cell.band % c.threads.length];
  const bg = lerp3(c.sea, c.edge, 0.35 + cell.k * 0.4);
  const step = Math.floor(time * 6 + hash3(cx, cy, 3) * 9);
  const ch = DEEP_GLYPHS[Math.floor(hash3(cx, cy, step) * DEEP_GLYPHS.length)];
  return { bg: cell.top ? lerp3(bg, c.mid, 0.5) : bg, ch, fg: cell.top ? c.core : lerp3(colour, bg, 0.15) };
}

/**
 * Render one frame of the visual.
 * @param {{ width: number, height: number, time: number, pulse: number, energy: number,
 *           notes: { thread: number, at: number }[],
 *           theme: import("../src/themes.js").Theme,
 *           ripples?: number[],      // ages in seconds of recent kick ripples
 *           tide?: number[],         // 0–1 level per thread, for the glyph tide at the bottom
 *           beatPhase?: number,      // 0–1 position inside the current beat (dots flash on the beat)
 *           downbeat?: boolean,      // true on the first beat of the bar (a bigger flash)
 *           layers?: { shark?: boolean, beat?: boolean } }} state
 * @returns {string} `height` lines of exactly `width` cells, joined by "\n".
 */
export function renderVisualFrame(state) {
  const width = Math.max(0, Math.floor(state.width));
  const height = Math.max(0, Math.floor(state.height));
  const time = Number(state.time) || 0;
  const pulse = clamp01(Number(state.pulse) || 0);
  const energy = clamp01(Number(state.energy) || 0);
  const c = paletteFor(state.theme);

  const size = creatureSize(width, height);
  const L = size.length, H = size.thick;
  const pose = creaturePose(time, width, height, size);
  const fins = finShapes(L, H);
  const wag = Math.sin(time * 1.7) * H * 0.45;
  const halo = (1.6 + L * 0.03) * (1 + pulse * 0.9);
  const depthScale = H * 0.75;
  const flickerRate = 3 + energy * 6;
  const reach = L * 0.75 + halo;
  const showShark = state.layers?.shark !== false;
  const showBeat = state.layers?.beat !== false;
  const bubbles = showShark ? placeBubbles({ ...state, width, height, time }, size, c) : new Map();
  const ripples = showBeat ? (state.ripples ?? []).filter((a) => a >= 0 && a < RIPPLE_LIFE) : [];
  const flash = showBeat && state.beatPhase !== undefined ? (1 - clamp01(state.beatPhase)) ** 3 * (state.downbeat ? 1 : 0.55) : 0;
  const tide = showBeat ? tideHeights(state.tide ?? [], width, height) : null;
  const centre = { x: pose.x + L * 0.1, y: pose.y };

  const lines = new Array(height);
  for (let cy = 0; cy < height; cy++) {
    const w = lineWriter();
    const py = cy * ROW_UNITS + ROW_UNITS / 2;
    for (let cx = 0; cx < width; cx++) {
      let dx = (((cx + 0.5 - pose.x) % pose.period) + pose.period) % pose.period;
      if (dx > pose.period / 2) dx -= pose.period;
      const dy = py - pose.y;
      let d = Infinity;
      if (showShark && Math.abs(dx) < reach && Math.abs(dy) < reach) {
        const lx = dx * pose.cos + dy * pose.sin;
        const ly = -dx * pose.sin + dy * pose.cos;
        d = sharkDistance(lx, ly, L, H, fins, wag);
      }

      let bg = flash ? lerp3(c.sea, c.edge, flash * 0.12) : c.sea, ch = " ", fg = c.dot;
      const tideCell = tide && tide.cell(cx, cy, time);
      if (tideCell) {
        ({ bg, ch, fg } = tideColours(tideCell, c, cx, cy, time));
      } else if (d < 0) {
        const k = clamp01(-d / depthScale + pulse * 0.35);
        bg = glowColour(k, c);
        ({ ch, fg } = bodyCell(cx, cy, k, bg, time, flickerRate, c));
      } else {
        if (d < halo) {
          const f = 1 - d / halo;
          bg = lerp3(c.sea, c.edge, f * f * (0.55 + 0.35 * pulse));
        }
        if (cx % DOT_EVERY_COL === 0 && cy % DOT_EVERY_ROW === 0) {
          ch = "·";
          fg = d < halo ? lerp3(c.dot, c.edge, 0.5) : lerp3(c.dot, c.mid, flash);
        }
        const ring = rippleAt(ripples, cx + 0.5, py, centre, pose.period);
        if (ring > 0) {
          bg = lerp3(bg, c.edge, ring * 0.45);
          ch = ring > 0.6 ? "o" : ring > 0.3 ? "·" : ch;
          fg = lerp3(c.edge, c.mid, ring);
        }
      }

      const bubble = bubbles.get(cy * width + cx);
      if (bubble) {
        ch = bubble.ch;
        fg = bubble.fade < 0.05 ? bubble.fg : lerp3(bubble.fg, bg, bubble.fade * 0.8);
      }
      w.put(ch, bg, fg);
    }
    lines[cy] = w.done();
  }
  return lines.join("\n");
}
