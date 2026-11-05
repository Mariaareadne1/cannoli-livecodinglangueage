/* ============================================================
   cannoli — the song timeline
   One row per thread, one column per bar: when each part plays.
   Reads and writes the step at the end of a thread that silences
   it, like  > when bar <= 8 hush  or a song's own  > enter 8.
   Conditions it doesn't recognise are left alone. The last column
   carries on: a song has no end, so what it says keeps going.
   No drawing here.
   ============================================================ */

const CLAUSE = String.raw`bar\s*(?:<=|<|>=|>|==)\s*\d+`;
const CONDITION = String.raw`${CLAUSE}(?:\s+(?:and|or)\s+${CLAUSE})*`;
const SILENT = String.raw`(?:hush|mute)`;
const THREAD_RE = /^([A-Za-z]\w*):/;
const HELPER_RE = /^def\s+(\w+)\s+(\w+)\s*=\s*when\s+bar\s*<=\s*\2\s+(?:hush|mute)\s*$/gm;
const SHORTEST = 16;
const ROUND_TO = 8;

const COMPARE = {
  "<=": (a, b) => a <= b, "<": (a, b) => a < b, ">=": (a, b) => a >= b, ">": (a, b) => a > b, "==": (a, b) => a === b,
};

/* ---------- finding threads ---------- */

/* Comments blanked out at the same length, so offsets still line up. */
function withoutComments(text) {
  return text.split("\n").map((line) => {
    const at = line.search(/(^|\s)#/);
    return at < 0 ? line : line.slice(0, at) + " ".repeat(line.length - at);
  }).join("\n");
}

/* Each thread and the text it covers, continuation lines included. */
function threadsIn(text) {
  const masked = withoutComments(text);
  const lines = masked.split("\n");
  const threads = [];
  let offset = 0;
  lines.forEach((line) => {
    const name = line.match(THREAD_RE)?.[1];
    if (name) threads.push({ name, start: offset, end: offset + line.length });
    else if (/^\s*>/.test(line) && threads.length && threads.at(-1).end === offset - 1) threads.at(-1).end = offset + line.length;
    offset += line.length + 1;
  });
  return threads.map((t) => ({ ...t, body: masked.slice(t.start, t.end) }));
}

function helpersIn(text) {
  return [...withoutComments(text).matchAll(HELPER_RE)].map((m) => m[1]);
}

/* The step that silences this thread, if there's one it understands. */
function ruleIn(body, helpers) {
  const named = helpers.length ? `|(${helpers.join("|")})\\s+(\\d+)` : "";
  const re = new RegExp(String.raw`\s*>\s*(?:when\s+(${CONDITION})\s+${SILENT}|(${SILENT})${named})(?=\s*(?:$|>))`);
  const match = body.match(re);
  if (!match) return null;
  const [whole, condition, always, helper, count] = match;
  const opening = whole.match(/^\s*>\s*/)[0];
  return { at: match.index, length: whole.length, opening, condition, always: Boolean(always), helper, count: Number(count) };
}

function silentAt(rule, bar) {
  if (!rule) return false;
  if (rule.always) return true;
  if (rule.helper) return bar <= rule.count;
  return rule.condition.split(/\s+or\s+/).some((any) => any.split(/\s+and\s+/).every((clause) => {
    const [, op, n] = clause.match(/bar\s*(<=|<|>=|>|==)\s*(\d+)/);
    return COMPARE[op](bar, Number(n));
  }));
}

/* ---------- reading ---------- */

/**
 * @param {string} text
 * @param {number} bars
 * @returns {{ name: string, on: boolean[] }[]}
 */
export function readTimeline(text, bars) {
  const helpers = helpersIn(text);
  return threadsIn(text).map((thread) => {
    const rule = ruleIn(thread.body, helpers);
    return { name: thread.name, on: Array.from({ length: bars }, (_, i) => !silentAt(rule, i + 1)) };
  });
}

/** Enough bars to show everything the song's rules mention. */
export function timelineLength(text) {
  const helpers = helpersIn(text);
  const named = helpers.length ? `|(?:${helpers.join("|")})\\s+(\\d+)` : "";
  const numbers = [...withoutComments(text).replace(HELPER_RE, "").matchAll(new RegExp(String.raw`bar\s*(?:<=|<|>=|>|==)\s*(\d+)${named}`, "g"))]
    .map((m) => Number(m[1] ?? m[2]));
  const last = Math.max(0, ...numbers);
  return Math.max(SHORTEST, Math.ceil((last + 1) / ROUND_TO) * ROUND_TO);
}

/* ---------- writing ---------- */

/* The runs of silent bars: [first, last], 1-based. */
function silentRuns(on) {
  const runs = [];
  on.forEach((playing, i) => {
    if (playing) return;
    if (runs.length && runs.at(-1)[1] === i) runs.at(-1)[1] = i + 1;
    else runs.push([i + 1, i + 1]);
  });
  return runs;
}

/* The step that plays only these bars, or null if it plays them all. */
function writeStep(on, helpers) {
  const runs = silentRuns(on);
  if (runs.length === 0) return null;
  if (runs.length === 1 && runs[0][0] === 1 && runs[0][1] === on.length) return "hush";
  if (runs.length === 1 && runs[0][0] === 1 && helpers.length) return `${helpers[0]} ${runs[0][1]}`;
  const clauses = runs.map(([first, last]) => {
    if (last === on.length) return `bar > ${first - 1}`;    // the last column carries on
    if (first === 1) return `bar <= ${last}`;
    if (first === last) return `bar == ${first}`;
    return `bar > ${first - 1} and bar <= ${last}`;
  });
  return `when ${clauses.join(" or ")} hush`;
}

/**
 * The edit that makes a thread play these bars, or null if nothing needs to change.
 * @returns {{ start: number, end: number, text: string } | null}
 */
export function applyTimeline(text, name, on) {
  const helpers = helpersIn(text);
  const thread = threadsIn(text).find((t) => t.name === name);
  if (!thread) return null;
  const rule = ruleIn(thread.body, helpers);
  const now = Array.from({ length: on.length }, (_, i) => !silentAt(rule, i + 1));
  if (now.every((v, i) => v === on[i])) return null;
  const step = writeStep(on, helpers);
  if (rule) {
    const start = thread.start + rule.at;
    return { start, end: start + rule.length, text: step ? `${rule.opening}${step}` : "" };
  }
  const end = thread.start + thread.body.trimEnd().length;
  return { start: end, end, text: ` > ${step}` };
}
