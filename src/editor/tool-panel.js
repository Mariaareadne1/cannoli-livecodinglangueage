/* ============================================================
   cannoli — draws a click-to-edit tool on the web page
   The terminal and the web share what each tool shows and does
   (cli/panel/model.js). This turns those rows into buttons.
   ============================================================ */

import { buildPanel } from "../../cli/panel/model.js";

const BLOCKS_RE = /^[█▓▒░]+$/;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function cellHtml(cell) {
  const gap = cell.gap ? " gap" : "";
  if (cell.label) return `<span class="tp-number${gap}">${esc(cell.text.trim())}</span>`;
  const isStep = BLOCKS_RE.test(cell.text);
  const held = cell.text.startsWith("▓") ? " held" : "";
  const classes = `tp-cell${isStep ? " tp-step" : ""}${cell.on ? " on" : ""}${cell.dim ? " dim" : ""}${held}${gap}`;
  return `<button type="button" class="${classes}" data-tool="${esc(cell.alias ?? cell.id)}" aria-pressed="${Boolean(cell.on)}"${cell.doc ? ` title="${esc(cell.doc)}"` : ""}>${isStep ? "" : esc(cell.text.trim())}</button>`;
}

function rowHtml(row) {
  if (row.text !== undefined) return `<pre class="tp-text ${row.role ?? ""}">${esc(row.text)}</pre>`;
  if (row.slider) {
    const { id, label, min, max, step, value } = row.slider;
    return `<label class="tp-slider"><span>${esc(label)}</span><input type="range" class="ed-picker-range" data-tool="${esc(id)}" min="${min}" max="${max}" step="${step}" value="${value}" /><output>${value}</output></label>`;
  }
  const label = row.label === undefined ? "" : `<span class="tp-label${row.home ? " home" : ""}">${esc(row.label)}</span>`;
  return `<div class="tp-row">${label}<div class="tp-cells">${row.cells.map(cellHtml).join("")}</div></div>`;
}

/** The page's HTML for a tool. */
export function toolHtml(tool, view) {
  const panel = buildPanel(tool, view);
  return `<p class="ed-picker-title"><strong>${esc(panel.title)}</strong></p>${panel.rows.map(rowHtml).join("")}
    <p class="ed-picker-keys">it writes the code on your line · esc closes · ctrl+b to use the keyboard</p>`;
}
