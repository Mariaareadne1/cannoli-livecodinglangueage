/* ============================================================
   cannoli — every word in Strudel, from Strudel's own docs
   The suggestion card, guide and reference all describe the
   version that's installed. Works in the terminal and the web.
   ============================================================ */

import { EXTRA_DOCS } from "./extras.js";
import { STRUDEL_DOCS } from "./catalog-data.js";

export { parseDocs } from "./parse-docs.js";

let cached = null;

/** Every word, by name. Synonyms point at the same entry. */
export function catalog() {
  if (cached) return cached;
  const words = new Map();
  const add = (entry) => {
    for (const name of [entry.name, ...entry.synonyms]) if (!words.has(name)) words.set(name, entry);
  };
  for (const [name, extra] of Object.entries(EXTRA_DOCS)) {
    add({ name, doc: extra.doc, params: extra.args ? [extra.args] : [], example: extra.example, synonyms: [], group: "cannoli" });
  }
  STRUDEL_DOCS.forEach(add);
  cached = words;
  return words;
}
