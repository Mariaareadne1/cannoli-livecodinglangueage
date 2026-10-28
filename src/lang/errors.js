/* cannoli — errors with a source range and an optional one-click fix. */

/**
 * @typedef {{ label: string, start: number, end: number, text: string }} Fix
 */
export class CannoliError extends Error {
  /**
   * @param {string} message  plain-language explanation
   * @param {{ start: number, end: number }} range  character offsets in the source
   * @param {Fix} [fix]
   */
  constructor(message, range, fix) {
    super(message);
    this.name = "CannoliError";
    this.start = range.start;
    this.end = Math.max(range.end, range.start + 1);
    this.fix = fix ?? null;
  }
}

/** Edit distance where swapping two neighbouring letters counts as one edit (fsat → fast). */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The closest word in `options`, if it's close enough to be a likely typo. */
export function closest(word, options) {
  let best = null;
  let bestDist = Infinity;
  for (const opt of options) {
    const d = distance(word.toLowerCase(), opt.toLowerCase());
    if (d < bestDist) [best, bestDist] = [opt, d];
  }
  const allowed = word.length <= 3 ? 1 : word.length <= 7 ? 2 : 3;
  return best !== null && bestDist <= allowed ? best : null;
}
