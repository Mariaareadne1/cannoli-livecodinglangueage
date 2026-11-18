/* ============================================================
   cannoli — the control center tab
   Buttons that open the terminal windows. A web page can't open
   them itself, so it asks the helper that `npm run web` starts on
   this computer. Without it, each window has a command to copy.
   ============================================================ */

const PANES = [
  { id: "stage", title: "Everything", doc: "the editor, guide, visual, reference and threads, side by side" },
  { id: "edit", title: "Code editor", doc: "write and play the song" },
  { id: "guide", title: "Guide", doc: "explains the line you're on" },
  { id: "reference", title: "Reference", doc: "every word in the language" },
  { id: "visual", title: "Visual", doc: "the shark that moves with the music" },
  { id: "threads", title: "Threads", doc: "what each part plays this bar" },
];
const LOOKS = [["", "my saved theme"], ["plain", "plain terminal"], ["deep", "deep"], ["rose", "rose"]];
const FALLBACK_SONGS = ["first-steps.strudel", "baile-strudel.strudel"];
const NEEDS_SONG = new Set(["stage", "edit"]);
const MESSAGE_MS = 6000;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The command for one window, run from the project folder. */
export function commandFor(pane, song, look) {
  const file = NEEDS_SONG.has(pane) ? ` songs/${song}` : "";
  const all = pane === "stage" ? " --all" : "";
  return `node cli/cannoli.js ${pane}${file}${all}${look ? ` --theme=${look}` : ""}`;
}

/** @param {{ root: HTMLElement }} opts */
export function createControlPanel({ root }) {
  const $ = (id) => root.querySelector(`#${id}`);
  let helper = null;
  let messageTimer = 0;

  function say(text, tone = "") {
    const el = $("controlMessage");
    el.textContent = text;
    el.classList.toggle("bad", tone === "bad");
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { el.textContent = ""; }, MESSAGE_MS);
  }

  function drawPanes() {
    const [song, look] = [$("controlSong").value, $("controlLook").value];
    $("controlPanes").innerHTML = PANES.map((pane) => `<li class="control-pane${pane.id === "stage" ? " lead" : ""}">
      <div class="control-text"><strong>${pane.title}</strong><span>${pane.doc}</span>
        <code>${esc(commandFor(pane.id, song, look))}</code></div>
      <div class="control-actions">
        ${helper ? `<button type="button" class="btn${pane.id === "stage" ? " btn-play" : ""}" data-open="${pane.id}">open</button>` : ""}
        <button type="button" class="btn" data-copy="${pane.id}">copy</button>
      </div></li>`).join("");
  }

  function drawHelper() {
    $("controlHelper").innerHTML = helper
      ? helper.canOpen
        ? "Connected. The buttons open windows in Terminal."
        : "Connected, but this computer can't open windows from here. Copy a command into a terminal instead."
      : "To use the open buttons, run <code>npm run web</code> in the project folder and visit <code>localhost:5460</code>. You can always copy a command.";
    $("controlHelper").classList.toggle("on", Boolean(helper?.canOpen));
  }

  async function connect() {
    try {
      const res = await fetch("api/control");
      const body = await res.json();
      helper = body.success ? body.data : null;
    } catch {
      helper = null;
    }
    const songs = helper?.songs ?? FALLBACK_SONGS;
    $("controlSong").innerHTML = songs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    drawHelper();
    drawPanes();
  }

  async function openPane(pane) {
    try {
      const res = await fetch("api/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pane, song: $("controlSong").value, look: $("controlLook").value }),
      });
      const body = await res.json();
      if (!body.success) return say(body.error, "bad");
      return say(body.data.opened ? "Opened in Terminal." : "Copy the command into a terminal to open it.");
    } catch {
      helper = null;
      drawHelper();
      drawPanes();
      return say("The helper stopped. Run npm run web again.", "bad");
    }
  }

  async function copy(pane) {
    try {
      await navigator.clipboard.writeText(commandFor(pane, $("controlSong").value, $("controlLook").value));
      say("Copied. Paste it into a terminal in the project folder.");
    } catch {
      say("Your browser blocked copying. Select the command and copy it by hand.", "bad");
    }
  }

  $("controlLook").innerHTML = LOOKS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  root.addEventListener("change", (e) => { if (e.target.matches("select")) drawPanes(); });
  root.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) openPane(open.dataset.open);
    const copyButton = e.target.closest("[data-copy]");
    if (copyButton) copy(copyButton.dataset.copy);
  });

  return { connect };
}
