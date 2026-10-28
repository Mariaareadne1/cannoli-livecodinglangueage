/* ============================================================
   cannoli — terminal key decoding
   Turns raw bytes from the terminal into keys. Node's built-in
   reader holds Esc back until the next key and then merges
   them, which lost Esc (closing the suggestion card) and keys
   pressed right after it. This decoder treats each on its own.
   ============================================================ */

/** @typedef {{ name: string, ctrl?: boolean, meta?: boolean, str?: string }} Key */

const SEQUENCES = {
  "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left",
  "\x1bOA": "up", "\x1bOB": "down", "\x1bOC": "right", "\x1bOD": "left",
  "\x1b[H": "home", "\x1b[F": "end", "\x1bOH": "home", "\x1bOF": "end",
  "\x1b[1~": "home", "\x1b[4~": "end", "\x1b[7~": "home", "\x1b[8~": "end",
  "\x1b[3~": "delete", "\x1b[5~": "pageup", "\x1b[6~": "pagedown", "\x1b[Z": "shift-tab",
};
const CSI_RE = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Z])/;

/**
 * @param {string} chunk  what the terminal sent in one read
 * @returns {Key[]}
 */
export function parseKeys(chunk) {
  const keys = [];
  let i = 0;
  while (i < chunk.length) {
    const rest = chunk.slice(i);
    const ch = chunk[i];
    if (ch === "\x1b") {
      const csi = rest.match(CSI_RE);
      if (csi) {
        keys.push({ name: SEQUENCES[csi[0]] ?? "unknown" });
        i += csi[0].length;
        continue;
      }
      keys.push({ name: "escape" });
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") keys.push({ name: "return" });
    else if (ch === "\t") keys.push({ name: "tab" });
    else if (ch === "\x7f" || ch === "\b") keys.push({ name: "backspace" });
    else if (ch < " ") keys.push({ name: String.fromCharCode(ch.charCodeAt(0) + 96), ctrl: true });
    else {
      const codePoint = String.fromCodePoint(rest.codePointAt(0));
      keys.push({ name: codePoint, str: codePoint });
      i += codePoint.length;
      continue;
    }
    i += 1;
  }
  return keys;
}
