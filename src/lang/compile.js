/* ============================================================
   cannoli — compiler
   Source → a program: settings plus one pattern per thread.
   Collects every error (with a fix when there is one) instead
   of stopping at the first, and a few "this might clash"
   warnings.
   ============================================================ */

import { lex } from "./lexer.js";
import { parseStatement, scanDefs } from "./parser.js";
import { CannoliError, closest } from "./errors.js";
import { VERBS, GENERATORS, DRUM_NAMES } from "../core/verbs.js";
import {
  Pattern, pure, silence, sequence, stack, chordOf, then, times, choose, mapNotes, sorted, mod,
} from "../core/pattern.js";
import { MODES, pitchClass, chordDegree } from "../core/harmony.js";
import { STYLES, STYLE_NAMES } from "../core/styles.js";

export const DEFAULT_KEY = { at: 0, root: 2, mode: "minor", name: "d minor" };
const DEFAULT_TEMPO = 100;

/**
 * @typedef {{ tempo: number, beats: number, swing: number,
 *             keys: { at: number, root: number, mode: string, name: string }[],
 *             chords: { at: number, degrees: number[], names: string[] }[] }} Settings
 * @typedef {{ name: string, pattern: Pattern, start: number, end: number }} Thread
 * @typedef {{ settings: Settings, threads: Thread[] }} Program
 */

/**
 * @param {string} source
 * @returns {{ program: Program, errors: CannoliError[], warnings: CannoliError[],
 *             symbols: { vars: string[], defs: string[], threads: string[] } }}
 */
export function compile(source) {
  const { statements, errors } = lex(source);
  const defs = scanDefs(statements);
  const asts = [];
  for (const st of statements) {
    try {
      asts.push({ ...parseStatement(st, { defs }), statement: st });
    } catch (err) {
      errors.push(asCannoliError(err, st));
    }
  }
  return new Compiler(asts, errors).run();
}

class Compiler {
  constructor(asts, errors) {
    this.asts = asts;
    this.errors = errors;
    this.warnings = [];
    this.vars = new Map(asts.filter((a) => a.k === "var").map((a) => [a.name, a]));
    this.defs = new Map(asts.filter((a) => a.k === "def").map((a) => [a.name, a]));
    this.memo = new Map();
    this.compiling = new Set();
  }

  run() {
    const settings = this.settings();
    for (const v of this.vars.values()) this.guard(v, () => this.variable(v.name, v.src));
    const threads = [];
    for (const a of this.asts.filter((x) => x.k === "thread")) {
      this.guard(a, () => threads.push({ name: a.name, pattern: this.expr(a.body, emptyEnv()), start: a.statement.start, end: a.statement.end }));
    }
    this.rangeWarnings();
    return {
      program: { settings, threads },
      errors: dedupe(this.errors),
      warnings: this.warnings,
      symbols: { vars: [...this.vars.keys()], defs: [...this.defs.keys()], threads: threads.map((t) => t.name) },
    };
  }

  guard(ast, fn) {
    try {
      fn();
    } catch (err) {
      this.errors.push(asCannoliError(err, ast.statement));
    }
  }

  /* ---------- settings ---------- */

  settings() {
    const s = { tempo: null, beats: 4, swing: null, style: null, keys: [], chords: [] };
    for (const a of this.asts.filter((x) => x.k === "setting")) {
      this.guard(a, () => {
        if (a.value) {
          const v = this.num(a.value, emptyEnv())({ bar: 0, vars: {} });
          const limits = { tempo: [20, 300], beats: [1, 16], swing: [0, 0.5] }[a.name];
          if (!(v >= limits[0] && v <= limits[1])) {
            throw new CannoliError(`${a.name} should be between ${limits[0]} and ${limits[1]}.`, a.src);
          }
          s[a.name] = a.name === "beats" ? Math.round(v) : v;
          return;
        }
        if (a.name === "style") {
          s.style = this.style(a);
          return;
        }
        const at = a.at ? Math.max(1, Math.round(this.num(a.at, emptyEnv())({ bar: 0, vars: {} }))) - 1 : 0;
        if (a.name === "key") s.keys.push({ at, ...this.key(a) });
        else s.chords.push({ at, ...this.chordLine(a) });
      });
    }
    const style = STYLES[s.style];
    s.tempo ??= style?.tempo ?? DEFAULT_TEMPO;
    s.swing ??= style?.swing ?? 0;
    if (!s.keys.some((k) => k.at === 0)) s.keys.push(DEFAULT_KEY);
    if (!s.chords.some((c) => c.at === 0)) s.chords.push({ at: 0, degrees: [0], names: ["i"] });
    s.keys.sort((x, y) => x.at - y.at);
    s.chords.sort((x, y) => x.at - y.at);
    return s;
  }

  key(a) {
    const [note, mode] = a.args;
    if (!note) throw new CannoliError("Name the key, like  key d minor", a.src, { label: "add d minor", start: a.src.end, end: a.src.end, text: " d minor" });
    const root = pitchClass(note.text);
    if (root === null) throw new CannoliError(`"${note.text}" isn't a note name. Use a–g, with # or b: c, f#, bb.`, note);
    const modeName = mode?.text ?? "major";
    if (!MODES[modeName]) {
      const guess = closest(modeName, Object.keys(MODES));
      throw new CannoliError(`"${modeName}" isn't a mode. Try: ${Object.keys(MODES).join(", ")}.`, mode,
        guess ? { label: `change to "${guess}"`, start: mode.start, end: mode.end, text: guess } : undefined);
    }
    return { root, mode: modeName, name: `${note.text} ${modeName}` };
  }

  style(a) {
    const [word] = a.args;
    if (!word) throw new CannoliError(`Name a style: ${STYLE_NAMES.join(", ")}.`, a.src, { label: "add rave", start: a.src.end, end: a.src.end, text: " rave" });
    if (STYLES[word.text]) return word.text;
    const guess = closest(word.text, STYLE_NAMES);
    throw new CannoliError(`"${word.text}" isn't a style. Try: ${STYLE_NAMES.join(", ")}.`, word,
      guess ? { label: `change to "${guess}"`, start: word.start, end: word.end, text: guess } : undefined);
  }

  chordLine(a) {
    if (a.args.length === 0) throw new CannoliError("List the chords, like  chords i VI III VII", a.src, { label: "add i VI III VII", start: a.src.end, end: a.src.end, text: " i VI III VII" });
    const degrees = a.args.map((tok) => {
      const d = chordDegree(tok.text);
      if (d === null) throw new CannoliError(`"${tok.text}" isn't a chord. Use roman numerals (i to vii) or 1 to 7.`, tok);
      return d;
    });
    return { degrees, names: a.args.map((t) => t.text) };
  }

  /* ---------- variables and functions ---------- */

  variable(name, src) {
    if (this.memo.has(name)) return this.memo.get(name);
    if (this.compiling.has(name)) throw new CannoliError(`"${name}" refers to itself, so it would never end.`, src);
    this.compiling.add(name);
    try {
      const p = this.expr(this.vars.get(name).body, emptyEnv());
      this.memo.set(name, p);
      return p;
    } finally {
      this.compiling.delete(name);
    }
  }

  /** A variable that's just a number (n = 3) can be used where numbers go. */
  numericVar(name) {
    const v = this.vars.get(name);
    if (!v || !isNumeric(v.body)) return null;
    return this.num(v.body, emptyEnv());
  }

  callDef(ast, env) {
    const def = this.defs.get(ast.name);
    if (env.depth > MAX_CALL_DEPTH) throw new CannoliError(`"${ast.name}" keeps calling itself, so it would never end.`, ast.src);
    const nums = new Map(def.params.map((p, i) => [p, this.num(ast.args[i], env)]));
    return { def, env: { ...env, depth: env.depth + 1, nums: new Map([...env.nums, ...nums]) } };
  }

  /* ---------- patterns ---------- */

  expr(ast, env) {
    switch (ast.k) {
      case "num": return this.note(ast);
      case "rest": return silence;
      case "hold": throw new CannoliError('"_" holds the step before it, so it can\'t come first.', ast.src);
      case "seq": return this.seq(ast.items, env);
      case "group": return this.group(ast, env);
      case "name": return this.name(ast, env);
      case "gen": return GENERATORS[ast.name].make(this.args(GENERATORS[ast.name].args, ast.args, env), range(ast.src), ast.src.start);
      case "call": {
        const { def, env: inner } = this.callDef(ast, env);
        return this.expr(def.body, inner);
      }
      case "bin": return this.arith(ast, env);
      case "then": return then(this.expr(ast.left, env), this.expr(ast.right, env));
      case "times": {
        const count = Math.round(this.num(ast.count, env)({ bar: 0, vars: {} }));
        if (!(count >= 1 && count <= 64)) throw new CannoliError("Repeat a pattern 1 to 64 times.", ast.count.src ?? { start: 0, end: 0 });
        return times(this.expr(ast.expr, env), count);
      }
      case "for": return this.forLoop(ast, env);
      case "if": {
        const test = this.cond(ast.cond, env);
        const yes = this.expr(ast.yes, env);
        const no = ast.no ? this.expr(ast.no, env) : silence;
        return choose((c, ctx) => (test(ctx) ? yes : no), Math.max(yes.len, no.len));
      }
      case "chain": return ast.steps.reduce((p, step) => this.step(step, p, env), this.expr(ast.expr, env));
      default: throw new CannoliError("I couldn't read this.", { start: 0, end: 1 });
    }
  }

  note(ast) {
    if (!ast.isInt) {
      throw new CannoliError(`Steps are whole numbers (scale steps) — "${ast.src.text}" isn't.`, ast.src,
        { label: `change to ${Math.round(ast.value)}`, start: ast.src.start, end: ast.src.end, text: String(Math.round(ast.value)) });
    }
    return pure([{ deg: ast.value, alt: ast.alt }], range(ast.src));
  }

  seq(items, env) {
    const steps = [];
    for (const item of items) {
      if (item.k === "hold") {
        if (steps.length === 0) throw new CannoliError('"_" holds the step before it, so it can\'t come first.', item.src);
        steps[steps.length - 1].weight += 1;
        continue;
      }
      const pattern = item.k === "num" ? this.note(item) : this.expr(item, env);
      const count = item.k === "num" ? item.rep : 1;
      for (let i = 0; i < count; i++) steps.push({ pattern, weight: 1 });
    }
    return sequence(steps);
  }

  group(ast, env) {
    const parts = ast.seqs.map((s) => this.expr(s.k === "seq" ? s : { k: "seq", items: [s] }, env));
    if (parts.length === 1) return parts[0];
    const simple = ast.seqs.every((s) => s.k !== "seq");
    return simple ? chordOf(parts) : stack(parts);
  }

  name(ast, env) {
    const n = ast.name;
    if (this.vars.has(n)) return this.variable(n, ast.src);
    const numeric = this.numName(n, env);
    if (numeric) return dynamicNote(numeric, range(ast.src));
    if (this.defs.has(n)) throw new CannoliError(`"${n}" is a verb you defined — use it after ">", like  0 2 4 > ${n}`, ast.src);
    if (VERBS[n]) {
      throw new CannoliError(`"${n}" is a verb, so it goes after ">", like  0 2 4 > ${n}`, ast.src,
        { label: `add ">" before ${n}`, start: ast.src.start, end: ast.src.start, text: "> " });
    }
    const options = [...this.vars.keys(), ...Object.keys(GENERATORS), ...env.nums.keys()];
    const guess = closest(n, options);
    throw new CannoliError(`I don't know "${n}".${guess ? ` Did you mean "${guess}"?` : " Define it first, like  " + n + " = 0 2 4"}`, ast.src,
      guess ? { label: `change to "${guess}"`, start: ast.src.start, end: ast.src.end, text: guess } : undefined);
  }

  arith(ast, env) {
    const left = this.expr(ast.left, env);
    const op = OPS[ast.op];
    if (isNumeric(ast.right)) {
      const k = this.num(ast.right, env);
      return mapNotes(left, (note, ctx) => ({ ...note, deg: op(note.deg, Math.round(k(ctx))) }));
    }
    const right = this.expr(ast.right, env);
    return new Pattern((c, ctx) => {
      const values = sorted(right.query(c, ctx)).flatMap((e) => e.notes.map((nt) => nt.deg));
      if (values.length === 0) return left.query(c, ctx);
      return sorted(left.query(c, ctx)).map((e, i) => ({
        ...e, notes: e.notes.map((nt) => ({ ...nt, deg: op(nt.deg, values[i % values.length]) })),
      }));
    }, Math.max(left.len, right.len));
  }

  forLoop(ast, env) {
    const at = { bar: 0, vars: {} };
    const from = Math.round(this.num(ast.from, env)(at));
    const to = Math.round(this.num(ast.to, env)(at));
    const count = Math.abs(to - from) + 1;
    if (count > 64) throw new CannoliError("A loop can run at most 64 times.", ast.src);
    const loopEnv = { ...env, loops: new Set([...env.loops, ast.name]) };
    const body = this.expr(ast.body, loopEnv);
    const dir = to >= from ? 1 : -1;
    const passes = Array.from({ length: count }, (_, i) => {
      const value = from + i * dir;
      return new Pattern((c, ctx) => body.query(c, { ...ctx, vars: { ...ctx.vars, [ast.name]: value } }), body.len);
    });
    return passes.reduce((acc, p) => then(acc, p));
  }

  /* ---------- steps ---------- */

  step(ast, p, env) {
    if (ast.k === "steps") return ast.steps.reduce((q, s) => this.step(s, q, env), p);
    if (ast.k === "callverb") {
      const { def, env: inner } = this.callDef(ast, env);
      return this.step(def.body, p, inner);
    }
    const v = VERBS[ast.name];
    return v.apply(p, this.args(v.args, ast.args, env), ast.src.start);
  }

  args(kinds, asts, env) {
    return kinds.map((kind, i) => {
      const a = asts[i];
      if (a === null || a === undefined) return null;
      if (kind === "num" || kind === "num?") return this.num(a, env);
      if (kind === "word") return a;
      if (kind === "step" || kind === "else?") return (q) => this.step(a, q, env);
      if (kind === "cond") return this.cond(a, env);
      return this.expr(a, env);
    });
  }

  /* ---------- numbers and conditions ---------- */

  num(ast, env) {
    switch (ast.k) {
      case "nnum": return () => ast.value;
      case "nneg": { const x = this.num(ast.x, env); return (ctx) => -x(ctx); }
      case "nbin": {
        const l = this.num(ast.left, env);
        const r = this.num(ast.right, env);
        const op = NUM_OPS[ast.op];
        return (ctx) => op(l(ctx), r(ctx));
      }
      case "nname": {
        const fn = this.numName(ast.name, env);
        if (fn) return fn;
        const options = ["bar", ...env.nums.keys(), ...env.loops, ...[...this.vars.keys()].filter((n) => this.numericVar(n))];
        const guess = closest(ast.name, options);
        throw new CannoliError(`"${ast.name}" isn't a number I know.${guess ? ` Did you mean "${guess}"?` : ""}`, ast.src,
          guess ? { label: `change to "${guess}"`, start: ast.src.start, end: ast.src.end, text: guess } : undefined);
      }
      // a pattern AST used as a number, e.g. a lone `3`
      case "num": return () => ast.value;
      case "name": return this.num({ k: "nname", name: ast.name, src: ast.src }, env);
      default: throw new CannoliError("Expected a number here.", ast.src ?? { start: 0, end: 1 });
    }
  }

  numName(name, env) {
    if (name === "bar") return (ctx) => ctx.bar + 1;
    if (env.nums.has(name)) return env.nums.get(name);
    if (env.loops.has(name)) return (ctx) => ctx.vars[name] ?? 0;
    return this.numericVar(name);
  }

  cond(ast, env) {
    if (ast.k === "and") { const l = this.cond(ast.left, env); const r = this.cond(ast.right, env); return (ctx) => l(ctx) && r(ctx); }
    if (ast.k === "or") { const l = this.cond(ast.left, env); const r = this.cond(ast.right, env); return (ctx) => l(ctx) || r(ctx); }
    if (ast.k === "not") { const x = this.cond(ast.x, env); return (ctx) => !x(ctx); }
    const l = this.num(ast.left, env);
    const r = this.num(ast.right, env);
    const cmp = CMP[ast.op];
    return (ctx) => cmp(l(ctx), r(ctx));
  }

  /* ---------- warnings ---------- */

  rangeWarnings() {
    const melodic = this.asts.filter((a) => a.k === "thread" && !usesVerb(a.body, DRUM_NAMES));
    const unplaced = melodic.filter((a) => !usesVerb(a.body, ["low", "mid", "high", "sub", "boom"]));
    unplaced.slice(1).forEach((a, i) => {
      const end = a.statement.end;
      const other = unplaced[i].name;
      this.warnings.push(new CannoliError(`"${a.name}" and "${other}" both sit in the middle range and may crowd each other. Try moving one with > high or > low.`,
        { start: a.statement.start, end: a.statement.start + a.name.length }, { label: 'add "> high"', start: end, end, text: " > high" }));
    });
  }
}

/* ---------- helpers ---------- */

const OPS = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => (b === 0 ? a : Math.floor(a / b)),
  "%": (a, b) => (b === 0 ? a : mod(a, b)),
};
const NUM_OPS = { ...OPS, "/": (a, b) => (b === 0 ? a : a / b) };
const CMP = {
  "==": (a, b) => a === b, "!=": (a, b) => a !== b,
  "<": (a, b) => a < b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, ">=": (a, b) => a >= b,
};

const MAX_CALL_DEPTH = 16;

function emptyEnv() {
  return { nums: new Map(), loops: new Set(), depth: 0 };
}

function isNumeric(ast) {
  if (ast.k === "num") return ast.rep === 1 && ast.alt === 0;
  if (ast.k === "bin") return isNumeric(ast.left) && isNumeric(ast.right);
  return ast.k === "nnum" || ast.k === "nbin" || ast.k === "nname" || ast.k === "nneg";
}

function dynamicNote(fn, src) {
  return new Pattern((c, ctx) => [{ start: 0, dur: 1, notes: [{ deg: Math.round(fn(ctx)), alt: 0 }], props: {}, src: [src] }]);
}

function usesVerb(ast, names) {
  if (!ast || typeof ast !== "object") return false;
  if ((ast.k === "verb") && names.includes(ast.name)) return true;
  return Object.values(ast).some((v) => (Array.isArray(v) ? v.some((x) => usesVerb(x, names)) : v && typeof v === "object" && v.k && usesVerb(v, names)));
}

function range(tok) {
  return [tok.start, tok.end];
}

function asCannoliError(err, statement) {
  if (err instanceof CannoliError) return err;
  return new CannoliError(`Something went wrong reading this line: ${err.message}`, { start: statement.start, end: statement.end });
}

function dedupe(errors) {
  const seen = new Set();
  return errors.filter((e) => {
    const key = `${e.start}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { mod };
