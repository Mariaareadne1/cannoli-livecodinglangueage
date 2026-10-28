/* ============================================================
   loom — lexer
   Splits source into statements (a line, plus any following
   lines that start with ">") and each statement into tokens
   with character offsets.
   ============================================================ */

import { LoomError } from "./errors.js";

/**
 * @typedef {{ type: "num"|"name"|"op"|"rest"|"hold", text: string, start: number, end: number,
 *             value?: number, alt?: number, rep?: number }} Token
 * @typedef {{ tokens: Token[], start: number, end: number, line: number }} Statement
 */

const TWO_CHAR_OPS = ["==", "!=", "<=", ">=", ".."];
const ONE_CHAR_OPS = new Set([">", "<", "+", "-", "*", "/", "%", "(", ")", "[", "]", ",", "=", ":"]);
// after these a "-" followed by a digit is a negative number, not subtraction
const NEGATIVE_AFTER = new Set(["(", "[", ",", ">", "=", ":", "+", "-", "*", "/", "%", "..", "==", "!=", "<", "<=", ">="]);

/**
 * @param {string} source
 * @returns {{ statements: Statement[], errors: LoomError[] }}
 */
export function lex(source) {
  const statements = [];
  const errors = [];
  let offset = 0;
  source.split("\n").forEach((line, i) => {
    const { tokens, errors: lineErrors } = lexLine(line, offset);
    errors.push(...lineErrors);
    const continues = tokens[0]?.text === ">" && statements.length > 0;
    if (tokens.length === 0) {
      // blank or comment-only
    } else if (continues) {
      const last = statements[statements.length - 1];
      last.tokens.push(...tokens);
      last.end = tokens[tokens.length - 1].end;
    } else {
      statements.push({ tokens, start: tokens[0].start, end: tokens[tokens.length - 1].end, line: i + 1 });
    }
    offset += line.length + 1;
  });
  return { statements, errors };
}

/**
 * @param {string} line
 * @param {number} offset  offset of the line in the whole source
 */
export function lexLine(line, offset = 0) {
  const tokens = [];
  const errors = [];
  let i = 0;
  const push = (type, text, start, extra = {}) =>
    tokens.push({ type, text, start: offset + start, end: offset + start + text.length, ...extra });

  while (i < line.length) {
    const ch = line[i];
    const next = line[i + 1];
    if (/\s/.test(ch)) { i++; continue; }
    // comment to end of line ("#" right after a letter or digit is a sharp instead)
    if ((ch === "#" && !/[A-Za-z0-9]/.test(line[i - 1] ?? "")) || (ch === "/" && next === "/")) break;

    if (/\d/.test(ch) || (ch === "." && /\d/.test(next ?? "")) || (ch === "-" && /\d/.test(next ?? "") && isNegative(tokens, line, i))) {
      const [text, numText, accidental, rep] = line.slice(i).match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(#|b(?![A-Za-z]))?(x\d+)?/);
      push("num", text, i, {
        value: Number(numText),
        alt: accidental === "#" ? 1 : accidental === "b" ? -1 : 0,
        rep: rep ? Number(rep.slice(1)) : 1,
        isInt: !numText.includes("."),
      });
      i += text.length;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const text = line.slice(i).match(/^[A-Za-z][A-Za-z0-9_]*#?/)[0];
      push("name", text, i);
      i += text.length;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push("op", two, i);
      i += 2;
      continue;
    }
    if (ch === ".") { push("rest", ".", i); i++; continue; }
    if (ch === "_") { push("hold", "_", i); i++; continue; }
    if (ONE_CHAR_OPS.has(ch)) { push("op", ch, i); i++; continue; }

    errors.push(new LoomError(`"${ch}" isn't part of loom.`, { start: offset + i, end: offset + i + 1 }, {
      label: `remove "${ch}"`, start: offset + i, end: offset + i + 1, text: "",
    }));
    i++;
  }
  return { tokens, errors };
}

function isNegative(tokens, line, i) {
  const prev = tokens[tokens.length - 1];
  if (!prev) return true;
  if (prev.type === "op" && NEGATIVE_AFTER.has(prev.text)) return true;
  // "0 -1 2": space before, digit right after → a negative step
  return /\s/.test(line[i - 1] ?? "") && prev.type !== "op";
}
