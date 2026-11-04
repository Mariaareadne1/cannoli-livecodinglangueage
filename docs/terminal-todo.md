# Terminal editor: still to do

Web features the terminal editor (`cli/edit.js`) doesn't have yet. The web version is the reference.

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
- [ ] Blank drum threads show the grid instead of the suggestion card (`ctrl+space` or similar still opens the card)
- [ ] `esc` closes the grid for that line until the line changes
- [ ] Add it to the editor keys in the guide's reference (`cli/guide-text.js`) and the README

## Manual

- [ ] The guide's reference pane has no "coming from Strudel" section: add one from `src/strudel-names.js`
