/* ============================================================
   cannoli — what the guide pane says
   Pure: from the editor's state, explain the line you're on,
   list problems and suggestions, and build the reference.
   Returns plain-text lines tagged with a colour role.
   ============================================================ */

import { classifyLine } from "../src/editor/highlight.js";
import { complete } from "../src/editor/complete.js";
import { VERBS, GENERATORS, VERB_GROUPS } from "../src/core/verbs.js";
import { STYLES, BEATS } from "../src/core/styles.js";
import { MODES } from "../src/core/harmony.js";

/** @typedef {{ text: string, role: "ink"|"soft"|"dim"|"faint"|"accent"|"error"|"warn"|"head" }} Line */

const SETTING_DOCS = {
  key: "the key every thread shares",
  tempo: "beats per minute",
  chords: "a chord progression, one chord per bar, looping",
  style: "the feel: tempo, drums, mix and what gets suggested",
  beats: "beats in a bar",
  swing: "pushes off-beat eighths late",
};

/** Explain the line under the cursor. */
export function explainLine(msg) {
  const lines = (msg.text ?? "").split("\n");
  const row = msg.cursor?.row ?? 0;
  const line = lines[row] ?? "";
  const trimmed = line.trim();
  const out = [];
  if (!trimmed) return [{ text: "an empty line — start a thread with a name and a colon, like  kick: beat fourfloor > kick", role: "dim" }];
  if (/^(#|\/\/)/.test(trimmed)) return [{ text: "a comment: nothing on this line plays (delete the # to bring it back)", role: "dim" }];

  const offset = lines.slice(0, row).reduce((n, l) => n + l.length + 1, 0);
  const { tokens } = classifyLine(line, offset, msg.symbols ?? {});
  const [first, second] = tokens;
  if (first && second?.text === ":") out.push({ text: `${first.text}: a thread — it plays every bar`, role: "ink" });
  else if (first?.text === "def") out.push({ text: `def ${tokens[1]?.text ?? ""}: a function you're defining — use it like a verb`, role: "ink" });
  else if (first && second?.text === "=") out.push({ text: `${first.text} = a variable — it doesn't play until a thread uses it`, role: "ink" });
  else if (first?.text === ">") out.push({ text: "> continues the thread above", role: "ink" });
  else if (SETTING_DOCS[first?.text]) out.push({ text: `${first.text}: ${SETTING_DOCS[first.text]}`, role: "ink" });

  const seen = new Set();
  const nums = tokens.filter((t) => t.type === "num");
  for (const tok of tokens) {
    const w = tok.text;
    if (seen.has(w)) continue;
    seen.add(w);
    if (VERBS[w] && tok !== first) out.push({ text: `${w} — ${VERBS[w].doc}`, role: "soft" });
    else if (GENERATORS[w] && !(w === "beat" && tokens.some((t) => BEATS[t.text]))) out.push({ text: `${w} — ${GENERATORS[w].doc}`, role: "soft" });
    else if (BEATS[w]) out.push({ text: `${w}  ${BEATS[w].steps}  ${BEATS[w].doc}`, role: "soft" });
    else if (STYLES[w] && first?.text === "style") out.push({ text: `${w} — ${STYLES[w].doc}, ${STYLES[w].tempo} bpm`, role: "soft" });
    else if (MODES[w]) out.push({ text: `${w} — the mode of the key`, role: "soft" });
  }
  if (nums.length && !SETTING_DOCS[first?.text]) {
    out.push({ text: "numbers are steps in the key: 0 is the root, 7 an octave up · . rests · _ holds", role: "dim" });
  }
  return out;
}

/** The whole assistant page. */
export function assistant(msg) {
  const out = [{ text: "this line", role: "head" }, ...explainLine(msg), { text: "", role: "dim" }];

  const problems = msg.problems ?? [];
  out.push({ text: problems.length ? `problems · ${problems.length}` : "problems · none", role: "head" });
  for (const p of problems.slice(0, 6)) {
    out.push({ text: `line ${p.row + 1}  ${p.message}`, role: p.severity === "error" ? "error" : "warn" });
    if (p.fix) out.push({ text: `        ctrl+f on that line: ${p.fix}`, role: "dim" });
  }
  out.push({ text: "", role: "dim" });

  const sugg = complete(msg.text ?? "", msg.cursor?.offset ?? 0, { ...(msg.symbols ?? {}), keyMode: msg.keyMode, style: msg.style }, { force: true });
  if (sugg.items.length) {
    out.push({ text: "try next", role: "head" });
    for (const s of sugg.items.slice(0, 6)) out.push({ text: `${s.label.padEnd(12)} ${s.doc}`, role: "soft" });
    out.push({ text: "", role: "dim" });
  }

  out.push({ text: "now", role: "head" });
  out.push({
    text: msg.playing
      ? `bar ${msg.bar} · chord ${msg.chord ?? "—"} · ${msg.key ?? ""} · ${Math.round(msg.tempo ?? 0)} bpm${msg.style ? ` · ${msg.style}` : ""}`
      : "stopped — ctrl+s in the editor plays",
    role: msg.playing ? "accent" : "dim",
  });
  return out;
}

/** Everything the language can do, as a scrollable list. */
export function reference() {
  const out = [];
  const head = (t) => out.push({ text: "", role: "dim" }, { text: t, role: "head" });
  head("keys (editor)");
  [["ctrl+s", "play, or apply changes on the next bar"], ["ctrl+t", "stop at the end of the bar (twice: now)"],
    ["ctrl+f", "apply the fix on this line"], ["tab", "accept the suggestion"], ["ctrl+g", "next theme"], ["ctrl+q", "save and quit"]]
    .forEach(([k, d]) => out.push({ text: `${k.padEnd(10)} ${d}`, role: "soft" }));
  head("a line");
  out.push(
    { text: "lead: theme > every 4 rev > high > tri", role: "ink" },
    { text: "name: pattern, then each > changes it a little more", role: "dim" },
    { text: "# at the start mutes a line · > mute · > solo · > when bar <= 8 mute", role: "dim" },
  );
  head("patterns");
  [["0 2 4 7", "scale steps"], [". _", "rest · hold"], ["[0 2]", "squeeze into one step"], ["[0,2,4]", "a chord"],
    ["3# 3b", "a semitone up/down"], ["0x3", "repeat a step"], ["theme + 2", "up 2 steps"], ["theme * 2", "wider intervals"],
    ["run 8 * 3 % 7", "a melody from arithmetic"], ["theme x 3", "3 bars"], ["a then b", "a then b"],
    ["for i 0..3 (a + i)", "a loop"], ["if bar > 8 then a else b", "a condition"]]
    .forEach(([c, d]) => out.push({ text: `${c.padEnd(24)} ${d}`, role: "soft" }));
  for (const group of VERB_GROUPS) {
    head(`verbs · ${group}`);
    Object.entries(VERBS).filter(([, v]) => v.group === group)
      .forEach(([name, v]) => out.push({ text: `${[name, ...v.args.map((a) => (a.startsWith("num") ? "n" : a))].join(" ").padEnd(16)} ${v.doc}`, role: "soft" }));
  }
  head("generators");
  Object.entries(GENERATORS).forEach(([name, g]) => out.push({ text: `${name.padEnd(16)} ${g.doc}`, role: "soft" }));
  head("grooves · beat name");
  Object.entries(BEATS).forEach(([name, b]) => out.push({ text: `${name.padEnd(11)} ${b.steps.replace(/x/g, "■").replace(/\./g, "·")}  ${b.doc}`, role: "soft" }));
  head("styles");
  Object.entries(STYLES).forEach(([name, s]) => out.push({ text: `${name.padEnd(7)} ${String(s.tempo).padEnd(4)} ${s.doc}`, role: "soft" }));
  return out;
}

/** Wrap tagged lines to a width, indenting continuations. */
export function wrap(lines, width) {
  return lines.flatMap(({ text, role }) => {
    if (text.length <= width) return [{ text, role }];
    const words = text.split(" ");
    const rows = [];
    let current = "";
    for (const w of words) {
      if (current && current.length + 1 + w.length > width) {
        rows.push(current);
        current = `    ${w}`;
      } else {
        current = current ? `${current} ${w}` : w;
      }
    }
    if (current) rows.push(current);
    return rows.map((t) => ({ text: t.slice(0, width), role }));
  });
}
