#!/usr/bin/env node
/* ============================================================
   cannoli — saves Strudel's own documentation for the editors
   Run it after updating the Strudel packages:
     npm run strudel-docs
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocs } from "../cli/strudel/parse-docs.js";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT = path.join(ROOT, "cli/strudel/catalog-data.js");
const SOURCES = [
  ["patterns", "@strudel/core/pattern.mjs"],
  ["sound", "@strudel/core/controls.mjs"],
  ["signals", "@strudel/core/signal.mjs"],
  ["picking", "@strudel/core/pick.mjs"],
  ["rhythm", "@strudel/core/euclid.mjs"],
  ["harmony", "@strudel/tonal/tonal.mjs"],
  ["harmony", "@strudel/tonal/voicings.mjs"],
];

const entries = SOURCES.flatMap(([group, file]) => parseDocs(fs.readFileSync(path.join(ROOT, "node_modules", file), "utf8"), group));
fs.writeFileSync(OUTPUT, `/* Made by scripts/build-strudel-docs.js from Strudel's own documentation (AGPL-3.0). Don't edit by hand. */\nexport const STRUDEL_DOCS = ${JSON.stringify(entries)};\n`);
process.stdout.write(`${entries.length} words saved\n`);
