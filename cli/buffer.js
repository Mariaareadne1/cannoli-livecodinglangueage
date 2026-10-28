/* ============================================================
   cannoli — text buffer for the terminal editor
   Pure functions: each takes a buffer { lines, row, col } and
   returns a new one, so undo is just keeping old buffers.
   ============================================================ */

const INDENT = "  ";

/** @typedef {{ lines: string[], row: number, col: number }} Buffer */

export function fromText(text) {
  return { lines: text.split("\n"), row: 0, col: 0 };
}

export function toText(buf) {
  return buf.lines.join("\n");
}

/** Character offset of the cursor in the whole text. */
export function offsetOf(buf) {
  return buf.lines.slice(0, buf.row).reduce((n, l) => n + l.length + 1, 0) + buf.col;
}

export function positionOf(lines, offset) {
  let rest = offset;
  for (let row = 0; row < lines.length; row++) {
    if (rest <= lines[row].length) return { row, col: rest };
    rest -= lines[row].length + 1;
  }
  const last = lines.length - 1;
  return { row: last, col: lines[last].length };
}

export function insert(buf, text) {
  if (text.includes("\n")) return text.split("\n").reduce((b, part, i) => (i === 0 ? insert(b, part) : insert(newline(b, { indent: false }), part)), buf);
  const line = buf.lines[buf.row];
  const lines = [...buf.lines];
  lines[buf.row] = line.slice(0, buf.col) + text + line.slice(buf.col);
  return { lines, row: buf.row, col: buf.col + text.length };
}

/** Split the line at the cursor, keeping the indentation (so "> …" lines line up). */
export function newline(buf, { indent = true } = {}) {
  const line = buf.lines[buf.row];
  const lead = indent ? line.match(/^\s*/)[0] : "";
  // after a thread line, indent so the next line can continue the chain with ">"
  const extra = indent && /^\w[\w-]*\s*:\s*\S/.test(line) && buf.col === line.length ? INDENT : "";
  const lines = [...buf.lines];
  lines.splice(buf.row, 1, line.slice(0, buf.col), lead + extra + line.slice(buf.col).trimStart());
  return { lines, row: buf.row + 1, col: lead.length + extra.length };
}

export function backspace(buf) {
  if (buf.col > 0) {
    const line = buf.lines[buf.row];
    // inside leading spaces, delete a whole indent step
    const width = /^\s+$/.test(line.slice(0, buf.col)) && buf.col % INDENT.length === 0 ? INDENT.length : 1;
    const lines = [...buf.lines];
    lines[buf.row] = line.slice(0, buf.col - width) + line.slice(buf.col);
    return { lines, row: buf.row, col: buf.col - width };
  }
  if (buf.row === 0) return buf;
  const lines = [...buf.lines];
  const prev = lines[buf.row - 1];
  lines.splice(buf.row - 1, 2, prev + lines[buf.row]);
  return { lines, row: buf.row - 1, col: prev.length };
}

export function deleteForward(buf) {
  const line = buf.lines[buf.row];
  if (buf.col < line.length) {
    const lines = [...buf.lines];
    lines[buf.row] = line.slice(0, buf.col) + line.slice(buf.col + 1);
    return { ...buf, lines };
  }
  if (buf.row === buf.lines.length - 1) return buf;
  const lines = [...buf.lines];
  lines.splice(buf.row, 2, line + lines[buf.row + 1]);
  return { ...buf, lines };
}

export function move(buf, dir, steps = 1) {
  const { lines } = buf;
  let { row, col } = buf;
  for (let i = 0; i < steps; i++) {
    if (dir === "left") {
      if (col > 0) col -= 1;
      else if (row > 0) [row, col] = [row - 1, lines[row - 1].length];
    } else if (dir === "right") {
      if (col < lines[row].length) col += 1;
      else if (row < lines.length - 1) [row, col] = [row + 1, 0];
    } else if (dir === "up") {
      row = Math.max(0, row - 1);
    } else if (dir === "down") {
      row = Math.min(lines.length - 1, row + 1);
    }
  }
  return { ...buf, row, col: Math.min(col, lines[row].length) };
}

export function home(buf) {
  const indent = buf.lines[buf.row].match(/^\s*/)[0].length;
  return { ...buf, col: buf.col === indent ? 0 : indent };
}

export function end(buf) {
  return { ...buf, col: buf.lines[buf.row].length };
}

/** Replace characters [start, end) of the whole text; the cursor lands after the new text. */
export function replaceRange(buf, start, endAt, text) {
  const all = toText(buf);
  const next = all.slice(0, start) + text + all.slice(endAt);
  const lines = next.split("\n");
  return { lines, ...positionOf(lines, start + text.length) };
}
