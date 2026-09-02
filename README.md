# iFakePro

A browser-native chord chart reader, editor and accompaniment player. Imports
the iReal Pro playlists you already own; everything stays on your device.

**Status: M1, M2, M4, M6, M7 and most of M8 complete; M3 partly done.**
Everything in the plan except the chart renderer's engraving fonts and the
larger groove library. Playlists decode and
re-encode losslessly, charts resolve into bars with real beat durations, repeats
and jumps unroll into a play order, transposition is enharmonically correct —
**and it plays, you can edit it, and you can take it with you.** Nineteen
grooves, a walking bass generator, voice-led comping, a Web Audio transport with
a live playhead, A/B loop, tempo ramp, key cycling, a cell-grid editor with undo,
chord diagrams for piano/guitar/ukulele, a library that survives a reload, and
export to iReal Pro, MusicXML, MIDI and print.

## Quick start

On Windows, `run.cmd` is the front door. It installs dependencies on first use.

```
run                          start the app at http://localhost:5173
run test                     run the test suite  (run test watch for watch mode)
run check                    typecheck every package
run fixtures                 download the community test corpus
run chart <file> [title]     print a parsed chart as text
run build                    production build into apps/web/dist
run shot [file]              screenshot the running app
run audio [groove]           render a groove offline and measure it
```

Examples:

```
run chart fixtures\jazz1460.txt                 list every title
run chart fixtures\jazz1460.txt "Blue Bossa"    print one chart
run shot out.png --import fixtures\jazz1460.txt --song "Autumn Leaves"
```

Cross-platform equivalents:

```bash
npm install
npm run dev --workspace @ifakepro/web
npm test
npm run typecheck
npm run fixtures:fetch
```

## Where things are

| Path | What |
|---|---|
| `PLAN.md` | The full implementation plan — scope, architecture, roadmap, risks |
| `docs/ireal-format.md` | Reverse-engineered format spec. The living reference |
| `packages/ireal-format` | Decode/encode URIs and HTML, unscramble, tokenize to cells |
| `packages/song-model` | Cells to bars: beats, meter, transposition, unrolling, timemap |
| `packages/groove-engine` | Bars plus a groove become note events: voicings, bass, drums, comping, MIDI |
| `packages/audio-host` | Transport, built-in instruments, mixer, offline render |
| `apps/web` | Vite + React app: import, library, chart, transposition, playback |
| `tools/` | Dev CLIs: fixture fetcher, chart printer, screenshot |
| `fixtures/` | Test corpus. Git-ignored — fetched on demand |

Still to come: the chart editor, the practice tools (A/B loop, tempo ramp, key
cycling), chord diagrams, more grooves, iReal/MusicXML export, and the PWA
shell. See `PLAN.md` for the full roadmap.

## Current guarantees

Measured against 2200 community charts across 7 playlists:

- Every record parses, with no unrecognized tokens or chord roots
- Every payload re-encodes **byte-identically** (2199 scrambled songs, 100%)
- Both URI schemes, HTML exports, `.txt` dumps and pasted URIs
- Multi-part songs merged; unparseable records reported rather than dropped
- **Every chart re-writes to the same cells** after a serialize/parse round
  trip, which is what makes saving an edit safe

And, from the musical model built on top of them:

- **Every one of 70,912 bars fills its meter exactly** — the beat-resolution
  rules hold across every meter in the corpus
- Repeats, 1st/2nd/3rd endings, D.C./D.S., Coda and Fine unroll into a play
  order; 2199 of 2200 songs have every written bar reachable
- Transposition spells for the destination key (C major to D major gives
  `C#ø7`, not `Dbø7`) and never drifts, however far a chart is moved

And from the playback engine:

- Five grooves — Medium Swing, Jazz Waltz, Ballad, Bossa Nova, Rock — each
  rendering audibly with no clipping, verified by an offline render in a real
  browser (`run audio`)
- The walking bass lands on the root at every chord change and stays in register
- Comping voice-leads: the hand moves under 5 semitones between chords on
  average, rather than jumping around the keyboard
- Renders are reproducible from a seed, so an audio regression is a readable
  event diff rather than a waveform comparison

The app is verified end to end in a real browser: it imports the 1459-song jazz
playlist through the file input, draws the chart, transposes it, plays it with a
live playhead, loops a bar range, keeps its library across a reload, and exports
MIDI — with no console errors.

## The library, on your machine

Everything lives in IndexedDB on the device — there is no account and no
server. Songs are stored with the **original payload** beside anything derived,
so a parser improvement reaches old imports by reparsing rather than by a
migration, and imports deduplicate on the chord payload rather than the title,
because the same tune arrives a dozen times spelled a dozen ways.

**A new install seeds itself.** On first run, if the library is empty, the
standard ~1460-song jazz collection is fetched once and imported, so the app
opens on something to read rather than on nothing. It is attempted at most
once: clearing your library is a choice, and re-downloading it under you would
be the app arguing with you. If the download fails the sidebar says so and
offers to retry. The source is one constant in `defaultLibrary.ts` — point it
at your own host if you would rather not depend on a third party's file.

> These charts are user transcriptions from the iReal Pro forums. The project
> is otherwise deliberately import-only (see *Notes on scope*); seeding softens
> that line, which is why the source is isolated and the seed never runs
> against a library that already has songs in it.

**Press `+` to start a chart of your own.** It is written to the library
immediately and opens in the editor — a new chart held only in memory is a
chart you lose by reloading. Authored charts get an identity of their own
rather than a content hash, because every blank chart has identical music and
content-addressing would file them all as one.

## Editing

Press the **pencil** in the title bar to work on the cell grid — the same
16-cells-a-row model the format stores, so nothing is lost in translation. The
chart stays on the stage and the editor's controls take over the right-hand
panel, so you keep reading the chart while you change it.

- Type a chord however you like: `Cmaj7`, `CM7`, `CΔ7` and `C^7` are the same
  chord, and `Cm7` is emphatically not `CM7`. Anything unreadable is refused
  rather than written as a broken chord.
- Barlines, repeat brackets, endings, sections, meters, segno/coda/fine,
  fermatas and free text, all per cell.
- Undo and redo, with rapid edits to one cell collapsed into a single step.
- Live validation: the bar model is rebuilt on every keystroke, so beat counts
  and warnings are the ones the player would actually use.

Saving swaps the music into the record the song came from and leaves every
other field byte-identical — a chart can be edited any number of times without
its metadata drifting.

## Install it, and use it with the network off

iFakePro is a progressive web app: install it from the browser and it runs from
the home screen or dock in its own window, with no address bar.

It works entirely offline, and not by accident — there is no backend, the
library lives in IndexedDB, and the instruments are synthesised rather than
sampled, so there is no soundfont to download. The whole app is under 300 KB and
is precached on first visit.

A new version prompts rather than reloading underneath you; mid-tune is not the
moment to swap the code out. The screen also stays awake while the band plays.

Verified the honest way: load the app, kill the server, reload — it still draws
the chart.

## Getting your charts back out

**Share** exports the current chart, **Export all** the whole library, as an
HTML file carrying a standard `irealb://` link — the same thing iReal Pro
shares, so anything that reads the format can import it.

An untouched chart exports byte-identically to what came in, because songs keep
the record they were parsed from. An edited one has only its music field
rewritten. Verified against the corpus: **every one of 2200 charts exports and
re-imports unchanged.**

**MusicXML** exports a lead sheet for a notation program — slash noteheads
carrying the rhythm with `harmony` elements above, which is what the format is
for. Written from our own bar model rather than borrowed: the most complete open
converter is GPL-3.0 and depending on it would relicense the app.

Checked against the whole jazz corpus in a real browser: **1459 of 1459 charts
produce well-formed XML** — 42,229 measures, 58,505 chord symbols — with no
dangling instrument references, duplicate barlines or misordered elements.

Also exports MIDI (one track per part) and prints via the browser.

## Chord diagrams

Piano, guitar and ukulele, computed from the parsed intervals rather than looked
up — so `Eb7b9#11` gets a diagram too, which is exactly the chord you would want
a picture of. Diagrams follow the playhead.

Fingerings come from a search over the neck, scored the way a player chooses:
only chord tones, no muted string in the middle of a shape, inside a hand span,
third and seventh present, low on the neck. Root position is strongly preferred
on six strings and merely preferred on four — the lowest F on a ukulele is at
the tenth fret, and nobody goes there when an inversion sits at the first.

## How the chart looks

The chart is drawn as a **sheet of paper**, not a panel: sixteen cells across,
a fixed portrait shape, centred on the stage with margin either side. Give the
window more width and the sheet does not stretch — the margin grows. That is
what iReal Pro does, and it is the reason a chart stays readable when you open
and close the side panels.

The whole page is derived from one number, the width of a cell, so its
proportions cannot drift: every dimension in the stylesheet is a multiple of
`--cell`. The sheet holds a width-to-height of 0.828, measured off the Mac app,
for every chart from one system to the twelve that fit a page — a short blues
spreads its systems out and leaves blank paper below, the way a real lead sheet
does, rather than becoming a letterbox. Only a thirteenth system grows the
sheet, and `sheetMetrics` in `Chart.tsx` is unit-tested to keep it that way.


Chord symbols are set in the reader's own UI sans, at one size throughout. No
web font is downloaded and none is bundled: a chart is information to read at
speed off a music stand, and an evenly-set text face does that better than a
handwriting face does. Only what the chart itself marks small is drawn smaller.

The musical signs — segno, coda, fermata, the repeat bars, and the major
triangle and diminished circle inside chord symbols — are drawn as inline SVG
rather than set in a font. Two reasons: the full SMuFL music face is 225 KB for
glyphs a chart uses six of, and the script face has no triangle or circle, so a
text `△` would silently drop to the system font in the middle of a symbol.

## Grooves

Nineteen, across three families:

| Jazz | Latin | Pop |
|---|---|---|
| Medium Swing, Up Tempo Swing, Swing Two/Four, Even 8ths, Jazz Waltz, Ballad, Gypsy Jazz, Second Line | Bossa Nova, Samba, Afro 12/8, Bolero | Rock, Funk, Shuffle, Country, Reggae, Slow Rock 12/8, Soul |

The chart's style picks one; the **Groove** menu overrules it, which matters
because a label like `Latin` could mean several things.

Choosing was data-driven rather than by taste: the corpus uses 64 distinct style
labels, and the mapping was built against the ones that actually occur. Before,
1113 of 2200 charts landed on Medium Swing; now they spread across 18 grooves.

Each groove is a drum pattern set, a bass style and a comping rhythm bank — data
that resolves against a shared pattern library, so a new style is a list of names
rather than new code. Every one is checked to produce all its parts, keep its
bass in register, and sound distinguishable from every other groove.

## Practice tools

- **A/B loop** — arm *Loop*, click the first and last bar. Looping repeats the
  span rather than rewinding a cursor, so there is no seam at the wrap.
- **Tempo ramp** — add 5, 10 or 20 bpm at the top of each chorus.
- **Key cycling** — the band moves up a semitone, or round the fourths or
  fifths, each chorus. The chart on screen stays put; that is the exercise.
- **Count-in**, part mutes, and a tensions toggle that adds 9ths and 13ths to
  plain chords.

## Test corpus

`npm run fixtures:fetch` downloads community playlists into `fixtures/`. They
are user-contributed transcriptions of copyrighted songs, so they are never
committed — the corpus tests skip themselves when the directory is empty, and a
fresh clone still runs green.

## Notes on scope

iFakePro is import-only and local-first. It does not host a chart database, ship
anything from iReal Pro, or use their branding — see `PLAN.md` §13.

Dependency licensing matters here: `ireal-musicxml` is GPL-3.0 and is read as a
reference, never depended on. Our parser lineage is the MIT-licensed
`ireal-renderer` / `ireal-reader`.
