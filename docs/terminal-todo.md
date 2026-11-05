# Terminal editor: still to do

Web features the terminal editor (`cli/edit.js`) doesn't have yet. The web version is the reference.

Already working in the terminal, because they're in the shared code: the Strudel names, `slider(...)` in the language, and the ideas card when you name a thread.

## Beat grid and bar picker

The logic is already shared and tested in `src/editor/pickers.js`
(`pickerAt`, `applyBeat`, `applyBars`), so this is only drawing and input. The web version is in
`src/editor/editor.js` (search for "the beat grid and bar picker").

- [ ] Draw the grid under the current line, reusing the overlay rows the suggestion card uses (`cardBox`)
- [ ] Beat grid: 16 steps split into beats, with beat numbers, under drum threads (`kick:`, `drums:`, `hats:` …)
- [ ] Bar picker: 16 bars in fours, under `every`, `firstOf`, `lastOf` and `when bar % n == r`
- [ ] Clicking: turn on mouse reporting only while a grid is showing (so normal text selection still works),
      and teach `cli/keys.js` the mouse sequences (`\x1b[<0;x;yM`)
- [ ] Keyboard: `ctrl+b` to enter the grid, `← →` to move, `space` to toggle, `esc` to leave
- [ ] `esc` closes the grid for that line until the line changes
- [ ] Add it to the editor keys in the guide's reference (`cli/guide-text.js`) and the README

## Chord picker

The logic is in `src/editor/chord-picker.js` (`chordOptions`, `goodNext`, `progressionsFor`, `setChord`, `addBar`, `removeBar`, `applyChords`),
and `pickerAt` already returns `kind: "chords"`. The web version is `drawChords` in `src/editor/editor.js`.

- [ ] Draw the bar blocks, the seven chords, and the progressions under the `chords` line
- [ ] Choose with the mouse, or arrows and `space`
- [ ] `+ bar` and `− bar`
- [ ] Play a chord when it's picked while stopped: see `previewChord` in `src/app.js`

## Melody grid

The logic is in `src/editor/melody-grid.js` (`melodyPicker`, `rowsFor`, `toggleNote`, `holdNote`, `finer`, `applyMelody`),
and `pickerAt` already returns `kind: "melody"`. The web version is `drawMelody` in `src/editor/editor.js`.

- [ ] Draw the rows and cells under the line, with the note names (it needs room: 10 rows or more)
- [ ] Click a cell, and drag right to hold, with mouse reporting on while the grid shows
- [ ] Keyboard: arrows in all four directions, `space` to toggle
- [ ] "More steps" (`minColumns`)
- [ ] Play a note when it's added while stopped: `engine.preview` already works there; see `previewNote` in `src/app.js`

## Sliders

The logic is in `src/editor/pickers.js` (`applySlider`, `addSlider`, `findSliders`), and the engine's
`live(program)` already works in the terminal. It needs the drawing and input.

- [ ] Show a slider when the cursor is on `gain`, `pan`, `fast`, `tempo` and the rest (`pickerAt` returns `kind: "slider"`)
- [ ] Drag it with the mouse, or `← →` once inside it; call `engine.live` as it moves
- [ ] "keep this number" and "add a slider to the code" (`slider(0.5, 0, 1)`)
- [ ] Show the song's `slider(...)` values somewhere always visible, such as a panel in the guide or a new pane
- [ ] Blank drum threads should show the ideas card and the grid together, as the web editor does

## Manual

- [ ] The guide's reference pane has no "coming from Strudel" section: add one from `src/strudel-names.js`
