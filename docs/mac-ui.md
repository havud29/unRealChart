# The iReal Pro Mac UI, as observed

Notes taken from the four Mac App Store screenshots for
[iReal Pro (Mac)](https://apps.apple.com/us/app/ireal-pro/id409035833?mt=12),
examined at full resolution. Everything here is *observed*, not inferred; where
a measurement is approximate it says so.

The point of this document is to be precise enough to build from. We are
matching layout and behaviour, not lifting their branding, icons or artwork.

---

## 1. Window layout

Four columns, left to right:

| Pane | Width | Contents |
|---|---|---|
| Sidebar | ~85 px | Search box, `Library` group, `Playlists` group |
| Song list | ~150 px | One row per song, sortable |
| Chart | fills | The chart, as a centred page |
| Player | ~215 px | Transport, style, mixer, practice — collapsible |

A title bar runs across the top: window controls at the far left, then a
sidebar toggle and a globe (the forum). At the far right: `Aa` (chart text
size), `+` (new song), a pencil (edit), a share icon, and a panel toggle.

**When the player panel is collapsed** the transport moves to a **bottom bar**
spanning the chart area — style name on the left, then stop, play, elapsed
time, and the Repeats / Tempo / Key steppers. This is the layout in screenshot
3, and it is the one that gives the chart the most room.

## 2. Sidebar

Two groups, each a list of rows with a right-aligned count:

- **Library** — Songs (2277), Last Viewed (60), Last Imported (82), Last
  Edited, Trash. Each has a small leading icon.
- **Playlists** — Jazz 1460, Brazilian 220, Latin 50, Blues 50, Pop 400,
  Country 50, Exercises. The group header carries two small buttons on the
  right (add / arrange).

The selected row is a filled highlight in the accent colour.

## 3. Song list

Header reads `Library` with a sort control at the right. Each row is three
lines:

```
Title                     (semibold)
Composer                  (regular, secondary)
Jazz-Medium… 120 bpm  C   (small, tertiary; style · tempo · key)
```

The key sits at the far right of the third line and is sometimes shown in a
rounded chip. The selected row is filled with the accent colour, its text
inverted.

## 4. The chart — a page, not a panel

**This is the part that most defines the app.** The chart is drawn as a sheet
of paper: a rectangle of stable proportion, centred in the space it is given,
on a plain ground.

Measured from the screenshots:

| | Page width | Available width | Page height | Ratio |
|---|---|---|---|---|
| Player panel open (shot 1) | ~511 px | ~557 px | ~617 px | 0.83 |
| Player panel closed (shot 3) | ~476 px | ~769 px | ~576 px | 0.83 |

So the page **keeps an aspect ratio near 0.83 (roughly 5:6)**, is sized by the
available *height*, and is **centred horizontally** — it does not stretch to
fill a wide window. That is exactly the "stable relative size, like a paper
page" behaviour to reproduce.

> **Careful with this measurement.** Both screenshots above are **eight-system**
> charts, so they cannot distinguish two very different rules: that the ratio is
> *fixed*, or that it *follows the system count* and merely happens to be 0.83
> at eight. We first built the second reading, and it makes a twelve-bar blues a
> landscape letterbox (1.48) and a long ballad a tall column (0.74) — a swing of
> better than two to one, which is not a stable page at all. The sheet is
> therefore implemented as **fixed**: 0.828 for every chart up to the twelve
> systems the help centre documents as one page's maximum, with the systems
> spreading or tightening inside it and blank paper left below a short song.

Three page treatments are visible across the screenshots: **white**, **cream**
(a parchment tone, `#f2e8d5`-ish) and **black**. The surrounding ground is a
neutral grey, darker than the page in light themes.

### Page contents

- **Title** centred at the top, semibold.
- **Style** in parentheses at the top left: `(Medium Up Swing)`.
- **Composer** at the top right.
- Then the chart itself, four bars to a row.

### Chord typography

The distinctive part. Chords are set in a **clean rounded sans**, not a script
face, and each symbol is built from three differently-sized parts:

```
      ♭          ← accidental: superscript, ~0.55em, raised
   B             ← root: full size
     △7          ← quality: subscript, ~0.62em, dropped below the baseline
```

A slash chord puts the bass note below and to the right, after a slash, at
subscript size:  `E♭-7 / D♭` with the `/D♭` set low.

### Colour language

Ink is black on the light pages, white on the black one — but **structural
markup is red**:

- Section letters: white on a solid **red** square, at the row's left edge
- Time signature: **red**, stacked, at the start of the first bar
- Repeat barlines and their dots: **red**
- Ending brackets `1.` `2.`: **red**
- `D.C. al Coda` and coda signs: **red**
- `END`: **blue** (screenshot 4)

Ordinary barlines are thin and drawn in the ink colour. Repeat-bar slashes
(`%`) are ink too.

## 5. Player panel

Top to bottom:

1. Stop square, large play triangle, elapsed time `00:00`
2. Three steppers side by side: **Repeats** (3), **Tempo** (60), **Key** (Bb)
3. Style name, e.g. `Jazz - Ballad Melodic`, with the word `Style` beneath
4. **Bar Length**: a segmented control — Half | Normal | Double
5. Master **Volume** slider
6. One row per instrument: a dropdown naming the sound plus a level slider —
   Piano, Harmony (dimmed when unused), Acoustic Bass, Real Drums
7. **Reverb** slider
8. `Reset Instruments` button
9. `Embellished Chords` checkbox
10. `Practice Tempo: Off` slider
11. `Practice Transposition: Off` slider
12. `Chord Diagrams` button
13. `Count-In Duration` dropdown, `Count-In Volume` slider
14. Two click-sound dropdowns labelled `Click 1` and `Click 2`

## 6. Editor

Entered from the pencil; the title bar swaps to `Save` and `Done`. The chart
stays in place and the current cell takes a grey highlight. The player panel is
replaced by an inspector:

- A row of navigation and a chord dropdown showing the current chord
- `Alternate Chord` / `Regular Chord` segmented toggle
- **Symbols** — a grid of buttons: slashes, `N.C.`, pauses and rests, up/down
  arrows; then barline types; then endings `1. 2. 3.`; then section markers
  `A B C D i V`, a coda, and scissors
- **Time Signature** stepper
- **Text** field with a dropdown of stock directions and up/down arrows
- **Title**, **Composer**, **Style**, **Key Signature** fields, with `Set` and
  `Set and Transpose` buttons

The bottom transport bar stays visible while editing.

---

## What this means for iFakePro

The largest gaps against our current UI:

1. ~~**The chart is not a page.**~~ **Closed.** Fixed aspect ratio, sized by
   height, centred, with every dimension a multiple of one `--cell` value.
2. **No sidebar.** We have one library pane; iReal has a source list plus a
   song list.
3. **Controls are a single wrapping row.** iReal groups them into a right-hand
   panel, with a bottom transport bar when that panel is closed.
4. **No red structural markup.** Ours draws sections, endings and repeats in
   the same ink as the chords.
5. **Chord typography is flat.** Ours sets the whole symbol at one size; the
   iReal look comes from root / superscript accidental / subscript quality.
6. **Song rows show two lines,** not three, and omit style · tempo · key.
