/* ============================================================
   loom — parser
   Statements → syntax trees. Each statement is parsed on its
   own, so one mistake doesn't hide the others.

     statement := setting | def | binding | thread
     chain     := concat ('>' step)*
     concat    := repeat ('then' repeat)*
     repeat    := arith ('x' num)*
     arith     := term (('+'|'-') term)*
     term      := seq (('*'|'/'|'%') seq)*
     seq       := item+
     item      := number | . | _ | name args* | [seq, seq …] | (chain)
                | for i a..b (chain) | if cond then arith else arith
     step      := verb args* | (step > step …)
   ============================================================ */

import { LoomError, closest } from "./errors.js";
import { VERBS, GENERATORS } from "../core/verbs.js";
import { BEATS } from "../core/styles.js";

export const SETTINGS = ["key", "tempo", "beats", "chords", "swing", "style"];
export const KEYWORDS = ["def", "then", "x", "for", "if", "else", "and", "or", "not", "bar", "at"];
const SEQ_STOP_OPS = new Set([">", ")", "]", ",", "+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">=", ".."]);
const SEQ_STOP_NAMES = new Set(["then", "x", "else", "and", "or"]);
const CMP_OPS = new Set(["==", "!=", "<", ">", "<=", ">=", "="]);

/**
 * @param {import("./lexer.js").Statement} statement
 * @param {{ defs: Map<string, { params: string[], transformer: boolean }> }} known
 */
export function parseStatement(statement, known) {
  const p = new Parser(statement, known);
  return p.statement();
}

/** Names declared with `def`, found before parsing so they can be used anywhere. */
export function scanDefs(statements) {
  const defs = new Map();
  for (const { tokens } of statements) {
    if (tokens[0]?.text !== "def" || tokens[1]?.type !== "name") continue;
    const eq = tokens.findIndex((t) => t.text === "=");
    if (eq === -1) continue;
    const params = tokens.slice(2, eq).map((t) => t.text);
    const first = tokens[eq + 1];
    const transformer = Boolean(first) && (VERBS[first.text] !== undefined
      || (first.text === "(" && VERBS[tokens[eq + 2]?.text] !== undefined));
    defs.set(tokens[1].text, { params, transformer });
  }
  // a def whose body starts with another transformer def is a transformer too
  for (const { tokens } of statements) {
    if (tokens[0]?.text !== "def") continue;
    const eq = tokens.findIndex((t) => t.text === "=");
    const first = tokens[eq + 1]?.text;
    if (defs.get(first)?.transformer && defs.has(tokens[1]?.text)) defs.get(tokens[1].text).transformer = true;
  }
  return defs;
}

class Parser {
  constructor(statement, known) {
    this.t = statement.tokens;
    this.i = 0;
    this.known = known;
    this.statement_ = statement;
  }

  /* ---------- token helpers ---------- */

  peek(k = 0) { return this.t[this.i + k]; }
  next() { return this.t[this.i++]; }
  atEnd() { return this.i >= this.t.length; }
  is(text, k = 0) { return this.peek(k)?.text === text; }
  endRange() {
    const last = this.t[this.t.length - 1];
    return { start: last.end, end: last.end + 1 };
  }
  expect(text, message) {
    if (this.is(text)) return this.next();
    const at = this.peek();
    const range = at ?? this.endRange();
    throw new LoomError(message, range, { label: `insert "${text}"`, start: range.start, end: range.start, text: at ? `${text} ` : ` ${text}` });
  }

  /* ---------- statements ---------- */

  statement() {
    const [a, b] = this.t;
    if (a.text === "def") return this.def();
    if (SETTINGS.includes(a.text) && b?.text !== ":" && b?.text !== "=") return this.setting();
    if (a.type === "name" && b?.text === ":") return this.binding("thread");
    if (a.type === "name" && b?.text === "=") return this.binding("var");
    if (a.type === "name" && this.t.length > 1) {
      throw new LoomError(`A line starts with a thread name and a colon, like  ${a.text}: 0 2 4`, a, {
        label: `add ":" after ${a.text}`, start: a.end, end: a.end, text: ":",
      });
    }
    const guess = a.type === "name" ? closest(a.text, SETTINGS) : null;
    throw new LoomError(`I don't know what "${a.text}" starts. A line can be a thread (lead: 0 2 4), a variable (theme = 0 2 4) or a setting (key, tempo, chords).`,
      a, guess ? { label: `change to "${guess}"`, start: a.start, end: a.end, text: guess } : undefined);
  }

  binding(kind) {
    const name = this.next();
    this.next(); // : or =
    // thread names are never referenced, so `pad:` or `kick:` is fine; variables must not shadow words
    const reserved = KEYWORDS.includes(name.text) || SETTINGS.includes(name.text)
      || (kind === "var" && (VERBS[name.text] || GENERATORS[name.text]));
    if (reserved) {
      throw new LoomError(`"${name.text}" already means something in loom. Pick another name.`, name);
    }
    if (this.atEnd()) {
      const r = this.endRange();
      throw new LoomError(`"${name.text}" needs a pattern after the ${kind === "thread" ? "colon" : "="}, like  0 2 4`, r,
        { label: "add a pattern", start: r.start, end: r.start, text: " 0 2 4" });
    }
    const body = this.chain();
    this.finish();
    return { k: kind, name: name.text, src: name, body };
  }

  def() {
    this.next();
    const name = this.next();
    if (name?.type !== "name") throw new LoomError("Give the function a name, like  def lift n = up n > fast 2", name ?? this.endRange());
    const params = [];
    while (!this.atEnd() && !this.is("=")) {
      const tok = this.next();
      if (tok.type !== "name") throw new LoomError(`Parameters are names, like n or k — not "${tok.text}".`, tok);
      params.push(tok.text);
    }
    this.expect("=", `Write "=" before the body, like  def ${name.text} n = up n`);
    const transformer = this.known.defs.get(name.text)?.transformer ?? false;
    const body = transformer ? this.steps() : this.chain();
    this.finish();
    return { k: "def", name: name.text, params, transformer, body, src: name };
  }

  setting() {
    const word = this.next();
    if (["tempo", "beats", "swing"].includes(word.text)) {
      if (this.atEnd()) throw this.missingArg("num", word);
      const value = this.numExpr();
      this.finish();
      return { k: "setting", name: word.text, value, src: word };
    }
    const args = [];
    let at = null;
    while (!this.atEnd()) {
      if (this.is("at")) {
        this.next();
        at = this.numExpr();
        break;
      }
      args.push(this.next());
    }
    this.finish();
    return { k: "setting", name: word.text, args, at, src: word };
  }

  finish() {
    if (!this.atEnd()) {
      const tok = this.peek();
      const hint = tok.text === ")" ? 'There is a ")" without a matching "(".' : `I didn't expect "${tok.text}" here.`;
      throw new LoomError(hint, tok, { label: `remove "${tok.text}"`, start: tok.start, end: tok.end, text: "" });
    }
  }

  /* ---------- pattern expressions ---------- */

  chain() {
    const expr = this.concat();
    const steps = [];
    while (this.is(">")) {
      const arrow = this.next();
      if (this.atEnd() || this.is(">")) {
        throw new LoomError('">" needs a verb after it, like rev or fast 2.', arrow, {
          label: 'add "rev"', start: arrow.end, end: arrow.end, text: " rev",
        });
      }
      steps.push(this.step());
    }
    return steps.length ? { k: "chain", expr, steps } : expr;
  }

  concat() {
    let left = this.repeat();
    while (this.is("then")) {
      this.next();
      left = { k: "then", left, right: this.repeat() };
    }
    return left;
  }

  repeat() {
    let expr = this.arith();
    while (this.is("x")) {
      const x = this.next();
      if (this.atEnd()) throw new LoomError('"x" needs a count, like  theme x 4', x, { label: "add 2", start: x.end, end: x.end, text: " 2" });
      expr = { k: "times", expr, count: this.numAtom() };
    }
    return expr;
  }

  arith() {
    let left = this.term();
    while (this.is("+") || this.is("-")) {
      const op = this.next();
      left = { k: "bin", op: op.text, left, right: this.term(), src: op };
    }
    return left;
  }

  term() {
    let left = this.seq();
    while (this.is("*") || this.is("/") || this.is("%")) {
      const op = this.next();
      left = { k: "bin", op: op.text, left, right: this.seq(), src: op };
    }
    return left;
  }

  seq() {
    const items = [];
    while (!this.atEnd() && !this.stopsSeq(this.peek())) items.push(this.item());
    if (items.length === 0) {
      const at = this.peek() ?? this.endRange();
      throw new LoomError("Expected some notes here, like 0 2 4.", at);
    }
    return items.length === 1 ? items[0] : { k: "seq", items };
  }

  stopsSeq(tok) {
    return (tok.type === "op" && SEQ_STOP_OPS.has(tok.text)) || (tok.type === "name" && SEQ_STOP_NAMES.has(tok.text));
  }

  item() {
    const tok = this.next();
    if (tok.type === "num") return { k: "num", value: tok.value, alt: tok.alt, rep: tok.rep, isInt: tok.isInt, src: tok };
    if (tok.type === "rest") return { k: "rest", src: tok };
    if (tok.type === "hold") return { k: "hold", src: tok };
    if (tok.text === "[") return this.group(tok);
    if (tok.text === "(") {
      const inner = this.chain();
      this.expect(")", 'This "(" is missing its ")".');
      return inner;
    }
    if (tok.text === "for") return this.forLoop(tok);
    if (tok.text === "if") return this.ifExpr(tok);
    if (tok.type === "name") return this.nameItem(tok);
    throw new LoomError(`I didn't expect "${tok.text}" here.`, tok, { label: `remove "${tok.text}"`, start: tok.start, end: tok.end, text: "" });
  }

  group(open) {
    const seqs = [this.seqOrHolds()];
    while (this.is(",")) {
      this.next();
      seqs.push(this.seqOrHolds());
    }
    this.expect("]", 'This "[" is missing its "]".');
    return { k: "group", seqs, src: open };
  }

  seqOrHolds() {
    const items = [];
    while (!this.atEnd() && !this.is("]") && !this.is(",")) items.push(this.item());
    if (items.length === 0) throw new LoomError("An empty [ ] has nothing to play.", this.peek() ?? this.endRange());
    return items.length === 1 ? items[0] : { k: "seq", items };
  }

  nameItem(tok) {
    const generator = GENERATORS[tok.text];
    // generator arguments are single numbers, so `run 8 * 3` means (run 8) * 3
    if (generator) return { k: "gen", name: tok.text, args: this.args(generator.args, tok, true), src: tok };
    const def = this.known.defs.get(tok.text);
    if (def && !def.transformer) {
      return { k: "call", name: tok.text, args: def.params.map(() => this.numAtomArg(tok)), src: tok };
    }
    return { k: "name", name: tok.text, src: tok };
  }

  forLoop(tok) {
    const v = this.next();
    if (v?.type !== "name") throw new LoomError("Name the counter, like  for i 0..3 (theme + i)", v ?? tok);
    const from = this.numAtom();
    this.expect("..", "Write the range with two dots, like  for i 0..3 (theme + i)");
    const to = this.numAtom();
    const open = this.expect("(", "Put the loop body in parentheses, like  for i 0..3 (theme + i)");
    const body = this.chain();
    this.expect(")", 'This "(" is missing its ")".');
    void open;
    return { k: "for", name: v.text, from, to, body, src: tok };
  }

  ifExpr(tok) {
    const cond = this.cond();
    this.expect("then", 'Write "then" after the condition, like  if bar > 8 then theme else 0');
    const yes = this.arith();
    let no = null;
    if (this.is("else")) {
      this.next();
      no = this.arith();
    }
    return { k: "if", cond, yes, no, src: tok };
  }

  /* ---------- steps (after ">") ---------- */

  steps() {
    const list = [this.step()];
    while (this.is(">")) {
      this.next();
      list.push(this.step());
    }
    return list.length === 1 ? list[0] : { k: "steps", steps: list };
  }

  step() {
    const tok = this.next();
    if (tok.text === "(") {
      const inner = this.steps();
      this.expect(")", 'This "(" is missing its ")".');
      return inner;
    }
    if (tok.type !== "name") {
      throw new LoomError(`After ">" comes a verb, like rev or fast 2 — not "${tok.text}".`, tok);
    }
    const v = VERBS[tok.text];
    if (v) return { k: "verb", name: tok.text, args: this.args(v.args, tok), src: tok };
    const def = this.known.defs.get(tok.text);
    if (def?.transformer) return { k: "callverb", name: tok.text, args: def.params.map(() => this.numAtomArg(tok)), src: tok };
    const guess = closest(tok.text, [...Object.keys(VERBS), ...[...this.known.defs].filter(([, d]) => d.transformer).map(([n]) => n)]);
    throw new LoomError(`"${tok.text}" isn't a verb.${guess ? ` Did you mean "${guess}"?` : ""}`, tok,
      guess ? { label: `change to "${guess}"`, start: tok.start, end: tok.end, text: guess } : undefined);
  }

  args(kinds, owner, atomsOnly = false) {
    return kinds.map((kind) => {
      if (kind === "num?") return this.startsNumber() ? this.numExpr() : null;
      if (kind === "else?") {
        if (!this.is("else")) return null;
        this.next();
        return this.step();
      }
      if (this.atEnd() || this.is(">") || this.is(")")) throw this.missingArg(kind, owner);
      if (kind === "num") return atomsOnly ? this.numAtom() : this.numExpr();
      if (kind === "word") return this.word(owner);
      if (kind === "cond") return this.cond();
      if (kind === "step") return this.step();
      return this.item();
    });
  }

  /* A plain name argument, checked against the generator's list (beat fourfloor). */
  word(owner) {
    const tok = this.next();
    const options = Object.keys(BEATS);
    if (tok.type === "name" && options.includes(tok.text)) return tok.text;
    const guess = tok.type === "name" ? closest(tok.text, options) : null;
    throw new LoomError(`"${tok.text}" isn't a groove. Try: ${options.join(", ")}.`, tok,
      guess ? { label: `change to "${guess}"`, start: tok.start, end: tok.end, text: guess } : undefined);
  }

  missingArg(kind, owner) {
    const example = VERBS[owner.text]?.example ?? GENERATORS[owner.text]?.example ?? "";
    const fill = { step: " rev", pat: " (0 4)", cond: " bar > 4", num: " 2", word: " fourfloor" }[kind];
    const what = { step: "a verb", pat: "a pattern", cond: "a condition", num: "a number", word: "a groove name" }[kind];
    const at = this.t[this.i - 1].end;
    return new LoomError(`"${owner.text}" needs ${what} here, like  ${example}`, { start: owner.start, end: owner.end },
      { label: `add${fill}`, start: at, end: at, text: fill });
  }

  numAtomArg(owner) {
    if (this.atEnd() || this.is(">") || this.is(")")) {
      throw new LoomError(`"${owner.text}" needs a number here.`, owner, { label: "add 1", start: owner.end, end: owner.end, text: " 1" });
    }
    return this.numAtom();
  }

  startsNumber() {
    const tok = this.peek();
    return Boolean(tok) && (tok.type === "num" || tok.text === "(" || (tok.text === "-" && this.peek(1)?.type === "num"));
  }

  /* ---------- numbers and conditions ---------- */

  numExpr() {
    let left = this.numTerm();
    while (this.is("+") || this.is("-")) {
      const op = this.next().text;
      left = { k: "nbin", op, left, right: this.numTerm() };
    }
    return left;
  }

  numTerm() {
    let left = this.numAtom();
    while (this.is("*") || this.is("/") || this.is("%")) {
      const op = this.next().text;
      left = { k: "nbin", op, left, right: this.numAtom() };
    }
    return left;
  }

  numAtom() {
    const tok = this.next();
    if (!tok) throw new LoomError("Expected a number here.", this.endRange());
    if (tok.type === "num") return { k: "nnum", value: tok.value, src: tok };
    if (tok.text === "-") return { k: "nneg", x: this.numAtom() };
    if (tok.text === "(") {
      const inner = this.numExpr();
      this.expect(")", 'This "(" is missing its ")".');
      return inner;
    }
    if (tok.type === "name") return { k: "nname", name: tok.text, src: tok };
    throw new LoomError(`Expected a number here, not "${tok.text}".`, tok);
  }

  cond() {
    let left = this.condAnd();
    while (this.is("or")) {
      this.next();
      left = { k: "or", left, right: this.condAnd() };
    }
    return left;
  }

  condAnd() {
    let left = this.condNot();
    while (this.is("and")) {
      this.next();
      left = { k: "and", left, right: this.condNot() };
    }
    return left;
  }

  condNot() {
    if (this.is("not")) {
      this.next();
      return { k: "not", x: this.condNot() };
    }
    const left = this.numExpr();
    const op = this.peek();
    if (!op || !CMP_OPS.has(op.text)) {
      const at = op ?? this.endRange();
      throw new LoomError("A condition compares two numbers, like  bar > 8  or  bar % 4 == 0", at);
    }
    this.next();
    return { k: "cmp", op: op.text === "=" ? "==" : op.text, left, right: this.numExpr() };
  }
}
