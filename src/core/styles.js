/* ============================================================
   loom — styles
   A style is a feel: default tempo and swing, which drum kit
   and mix to use, and what the suggestion cards should put
   first. It never changes how the language works.
   ============================================================ */

/**
 * @typedef {{ doc: string, tempo: number, swing: number, kit: string, mix: string,
 *             sounds: string[], beats: string[], progressions: [string, string][] }} Style
 * @type {Record<string, Style>}
 */
export const STYLES = {
  rave: {
    doc: "fast, hard, driving: warehouse and hard dance",
    tempo: 140, swing: 0, kit: "hard", mix: "hard",
    sounds: ["supersaw", "acid", "stab", "sub", "kick", "clap", "open", "hat"],
    beats: ["fourfloor", "offbeat", "rolling", "backbeat", "gallop"],
    progressions: [["i VI III VII", "euphoric anthem"], ["i i VI VII", "driving minor"], ["i VII VI V", "tension that resolves"], ["i iv i v", "hypnotic"]],
  },
  house: {
    doc: "four on the floor, warm and bouncy",
    tempo: 124, swing: 0.08, kit: "house", mix: "clean",
    sounds: ["stab", "pluck", "sub", "pad", "kick", "clap", "hat", "shaker"],
    beats: ["fourfloor", "offbeat", "backbeat", "shuffle", "skip"],
    progressions: [["ii V I vi", "deep house"], ["i iv i v", "soulful minor"], ["I vi IV V", "piano house"], ["vi IV I V", "uplifting"]],
  },
  funk: {
    doc: "Brazilian funk (baile funk): tamborzão rhythm and booming 808s",
    tempo: 130, swing: 0.04, kit: "funk", mix: "hard",
    sounds: ["boom", "sub", "stab", "kick", "snare", "clap", "cowbell", "tom"],
    beats: ["tamborzao", "tresillo", "batida", "backbeat", "offbeat"],
    progressions: [["i i iv iv", "dark baile loop"], ["i VII VI VII", "rolling minor"], ["i iv v i", "classic minor"], ["i i i i", "one-chord groove"]],
  },
  chill: {
    doc: "slow and warm: lo-fi, downtempo, late night",
    tempo: 80, swing: 0.16, kit: "soft", mix: "lofi",
    sounds: ["pad", "bell", "sine", "pluck", "tri", "kick", "snare", "hat", "shaker"],
    beats: ["boombap", "lazy", "backbeat", "skip"],
    progressions: [["ii V I IV", "jazzy"], ["I vi IV V", "warm and nostalgic"], ["i VI III VII", "bittersweet"], ["IV iii ii I", "falling, gentle"]],
  },
};

/* Named 16-step grooves for `beat name`. x = hit. */
export const BEATS = {
  fourfloor: { steps: "x...x...x...x...", doc: "a kick on every beat: dance music's heartbeat" },
  offbeat:   { steps: "..x...x...x...x.", doc: "between the beats: open hats or a bouncing bass" },
  backbeat:  { steps: "....x.......x...", doc: "beats 2 and 4: the snare or clap" },
  rolling:   { steps: ".xxx.xxx.xxx.xxx", doc: "a rolling rave bassline that skips each beat" },
  gallop:    { steps: "x.xxx.xxx.xxx.xx", doc: "galloping, for hard dance hats or bass" },
  shuffle:   { steps: "x.xx.xxxx.xx.xxx", doc: "busy shuffling hats" },
  skip:      { steps: "x..x.x..x..x.x..", doc: "a skipping, syncopated feel" },
  tamborzao: { steps: "x..x..x...x..x..", doc: "the tamborzão: baile funk's 3-3-4-3-3 drum rhythm" },
  tresillo:  { steps: "x..x..x.x..x..x.", doc: "3-3-2, the root of funk carioca and reggaeton" },
  batida:    { steps: "x...x.x.x...x.x.", doc: "a funk 'batida': boom, ta-ta" },
  boombap:   { steps: "x......x..x.....", doc: "hip-hop kick: laid back, with room to breathe" },
  lazy:      { steps: "x.......x..x....", doc: "a slow, sparse kick for downtempo" },
};

export const STYLE_NAMES = Object.keys(STYLES);
