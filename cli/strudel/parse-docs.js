/* ============================================================
   cannoli — reads Strudel's documentation comments
   Used by scripts/build-strudel-docs.js, which saves the result
   so the web app can show it without reading the packages.
   ============================================================ */

const COMMENT_RE = /\/\*\*([\s\S]*?)\*\/(?=\s*([^\n]*))/g;

function clean(comment) {
  return comment.split("\n").map((line) => line.replace(/^\s*\*\s?/, "")).join("\n").trim();
}

function nameFrom(body, nextLine) {
  const tagged = body.match(/@name\s+(\w+)/)?.[1];
  if (tagged) return tagged;
  return nextLine.match(/Pattern\.prototype\.(\w+)/)?.[1] ?? nextLine.match(/(?:const|function)\s+\{?\s*(\w+)/)?.[1] ?? nextLine.match(/register\(\s*\[?\s*['"](\w+)['"]/)?.[1] ?? null;
}

/* Every name a line of code defines:  export const { firstOf, every } = register(['firstOf', 'every'], … */
function namesIn(line) {
  const destructured = line.match(/\{([\w\s,]+)\}\s*=/)?.[1] ?? "";
  const registered = line.match(/register\(\s*\[([^\]]+)\]/)?.[1]?.replace(/['"]/g, "") ?? "";
  return `${destructured},${registered}`.split(/[,\s]+/).filter((word) => /^[a-zA-Z]\w*$/.test(word));
}

/** The documented words in one source file. */
export function parseDocs(source, group) {
  const entries = [];
  for (const [, comment, nextLine] of source.matchAll(COMMENT_RE)) {
    const body = clean(comment);
    const name = nameFrom(body, nextLine);
    if (!name || name.startsWith("_") || /@(private|noAutocomplete)\b/.test(body)) continue;
    const doc = body.split(/\n\s*@/)[0].replace(/<[^>]+>|\*\*|`/g, "").replace(/\s+/g, " ").trim();
    const params = [...body.matchAll(/@param\s+(?:\{[^}]*\}\s*)?\[?(\w+)/g)].map((m) => m[1]);
    const example = body.match(/@example\s*\n([\s\S]*?)(?=\n\s*@|$)/)?.[1].trim() ?? "";
    const tagged = (body.match(/@(?:synonyms|alias)\s+([^\n]+)/)?.[1] ?? "").split(/[,\s]+/).filter(Boolean);
    const synonyms = [...new Set([...tagged, ...namesIn(nextLine)])].filter((word) => word !== name);
    entries.push({ name, doc, params, example, synonyms, group });
  }
  return entries;
}
