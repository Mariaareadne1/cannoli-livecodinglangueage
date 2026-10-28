/* cannoli — remembers the chosen theme between runs (~/.cannoli.json). */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FILE = path.join(os.homedir(), ".cannoli.json");

export function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function savePrefs(change) {
  try {
    fs.writeFileSync(FILE, JSON.stringify({ ...loadPrefs(), ...change }, null, 2));
  } catch {
    // not being able to remember a theme is fine
  }
}
