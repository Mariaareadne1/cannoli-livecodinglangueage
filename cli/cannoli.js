#!/usr/bin/env node
/* ============================================================
   cannoli — terminal entry point

     cannoli edit [file]     the editor (plays the music)
     cannoli guide           live help: this line, suggestions, problems, reference
     cannoli visual          the ASCII creature, moving with the music
     cannoli threads         the beat grid
     cannoli stage [file]    opens all of them side by side
   ============================================================ */

const [command = "help", ...args] = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v] = a.slice(2).split("=");
  return [k, v ?? true];
}));
const file = args.find((a) => !a.startsWith("--"));

const COMMANDS = {
  edit: async () => (await import("./edit.js")).edit(file, flags),
  guide: async () => (await import("./guide.js")).guide(flags),
  reference: async () => (await import("./guide.js")).guide({ ...flags, reference: true }),
  visual: async () => (await import("./visual.js")).visual(flags),
  threads: async () => (await import("./threads.js")).threads(flags),
  stage: async () => (await import("./stage.js")).stage(file, flags),
  help: async () => {
    process.stdout.write(`cannoli — live-coding music in the terminal

  cannoli stage [file]   open the editor, guide and visual side by side
                         --all: all five panes (adds reference and threads)
                         --threads / --reference: add just one
  cannoli edit [file]    the editor; it plays the music (default file: song.cannoli)
  cannoli guide          live help for the line you're on, problems and suggestions
  cannoli reference      every verb, groove and style (scroll with ↑ ↓)
  cannoli visual         an ASCII creature that moves with the music
  cannoli threads        the beat grid

  --theme=deep|rose            a family: each pane gets its own tone of it
  --theme=deep-white|…         one tone for every pane (ctrl+g in the editor cycles them)
`);
  },
};

(COMMANDS[command] ?? COMMANDS.help)().catch((err) => {
  process.stderr.write(`cannoli: ${err.message}\n`);
  process.exit(1);
});
