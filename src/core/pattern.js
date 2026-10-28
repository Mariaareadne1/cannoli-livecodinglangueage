/* ============================================================
   cannoli — patterns
   A pattern answers one question: "what plays in cycle c?"
   It returns events with start/dur as fractions of the cycle.
   `len` is how many cycles the pattern lasts before it repeats
   (used by `then`, `x` and `for`).
   ============================================================ */

/**
 * @typedef {{ deg: number, alt: number }} Note
 * @typedef {{ start: number, dur: number, notes: Note[], props: Record<string, any>, src: number[][] }} Event
 * @typedef {{ bar: number, chord: number[], vars: Record<string, number>, seed: number }} Ctx
 *          bar is 0-based internally; chord is the current chord as scale steps
 */

export class Pattern {
  /**
   * @param {(cycle: number, ctx: Ctx) => Event[]} query
   * @param {number} [len]
   */
  constructor(query, len = 1) {
    this.query = query;
    this.len = len;
  }
}

const EPS = 1e-9;
export const silence = new Pattern(() => []);

/** A single step that fills the whole cycle. */
export function pure(notes, src) {
  return new Pattern(() => [{ start: 0, dur: 1, notes, props: {}, src: src ? [src] : [] }]);
}

/* ---------- building ---------- */

/**
 * Steps share the cycle by weight (a step followed by `_` holds get more).
 * @param {{ pattern: Pattern, weight: number }[]} steps
 */
export function sequence(steps) {
  const total = steps.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return silence;
  return new Pattern((c, ctx) => {
    const out = [];
    let at = 0;
    for (const step of steps) {
      const span = step.weight / total;
      for (const e of step.pattern.query(c, ctx)) out.push({ ...e, start: at + e.start * span, dur: e.dur * span });
      at += span;
    }
    return out;
  });
}

export function stack(patterns) {
  return new Pattern((c, ctx) => patterns.flatMap((p) => p.query(c, ctx)), Math.max(1, ...patterns.map((p) => p.len)));
}

/** Notes from all the given single-note patterns, sounding together. */
export function chordOf(patterns) {
  return new Pattern((c, ctx) => {
    const events = patterns.flatMap((p) => p.query(c, ctx));
    if (events.length === 0) return [];
    return [{ ...events[0], notes: events.flatMap((e) => e.notes), src: events.flatMap((e) => e.src) }];
  });
}

/** Play `a` for its length, then `b`. */
export function then(a, b) {
  const len = a.len + b.len;
  return new Pattern((c, ctx) => {
    const m = mod(c, len);
    return m < a.len ? a.query(m, ctx) : b.query(m - a.len, ctx);
  }, len);
}

/** Keep the same music but count it as `times` × as long. */
export function times(p, count) {
  return new Pattern((c, ctx) => p.query(mod(c, p.len), ctx), p.len * count);
}

/** Choose a pattern per cycle. */
export function choose(pick, len = 1) {
  return new Pattern((c, ctx) => pick(c, ctx).query(c, ctx), len);
}

/* ---------- time ---------- */

/** Events whose start falls in [from, to), in absolute cycles. */
function span(p, from, to, ctx) {
  const out = [];
  for (let cyc = Math.floor(from); cyc < to; cyc++) {
    for (const e of p.query(cyc, ctx)) {
      const at = cyc + e.start;
      if (at >= from - EPS && at < to - EPS) out.push({ ...e, start: at });
    }
  }
  return out;
}

/** n times as fast. `n` may change per cycle. */
export function fast(p, n) {
  return new Pattern((c, ctx) => {
    const k = n(ctx);
    if (!(k > 0)) return [];
    return span(p, c * k, (c + 1) * k, ctx).map((e) => ({ ...e, start: e.start / k - c, dur: e.dur / k }));
  }, p.len);
}

export function slow(p, n) {
  return fast(p, (ctx) => 1 / n(ctx));
}

/* ---------- per-event transforms ---------- */

export function mapEvents(p, fn) {
  return new Pattern((c, ctx) => fn(p.query(c, ctx), c, ctx), p.len);
}

export function mapNotes(p, fn) {
  return mapEvents(p, (events, c, ctx) => events.map((e, i) => ({ ...e, notes: e.notes.map((n) => fn(n, ctx, i)) })));
}

export function setProps(p, props) {
  return mapEvents(p, (events, c, ctx) =>
    events.map((e) => ({ ...e, props: { ...e.props, ...resolveProps(props, ctx) } })));
}

function resolveProps(props, ctx) {
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, typeof v === "function" ? v(ctx) : v]));
}

/** Pick `transform(p)` instead of `p` in cycles where `test(ctx)` holds. */
export function when(p, test, transform, otherwise = (x) => x) {
  const yes = transform(p);
  const no = otherwise(p);
  return new Pattern((c, ctx) => (test(ctx) ? yes : no).query(c, ctx), p.len);
}

export function sorted(events) {
  return [...events].sort((a, b) => a.start - b.start);
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

/** Deterministic random in [0, 1) from a few integers. */
export function rand(...seeds) {
  let h = 2166136261;
  for (const s of seeds) {
    h ^= Math.floor(s * 1000) + 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}
