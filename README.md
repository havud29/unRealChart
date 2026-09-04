# unRealChart

A chord chart reader, editor and backing band that runs in a browser.

Open the iReal Pro playlists you already have, read the chart as a page, and
play it with a rhythm section that follows the form. Nothing is uploaded:
your library lives in the browser, and the app works with the network off.

*Compatible with iReal Pro's file formats. Not affiliated with, or endorsed by,
Technimo LLC.*

---

## Quick start

On Windows, `run.cmd` is the front door. It installs dependencies on first use.

```
run                          start the app
run test                     run the test suite  (run test watch to watch)
run check                    typecheck everything
run build                    production build into apps/web/dist
run fixtures                 download the community test corpus
run sounds                   download the sampled instruments
run chart <file> [title]     print a parsed chart as text
run shot [file]              screenshot the running app
run audio [groove]           render a groove offline and measure it
run icons                    regenerate the app icons from favicon.svg
```

Anywhere else:

```bash
npm install
npm run dev --workspace @unrealchart/web
npm test
npm run typecheck
```

Then drop an iReal Pro `.html` or `.txt` export anywhere in the window. A new
install with an empty library fetches the standard jazz collection once, so
there is something to read immediately.

## What it does

**Reads the format properly.** Both `irealb://` and `irealbook://` URI schemes,
HTML exports, `.txt` dumps and pasted URIs, including the positional scramble.
Charts re-encode byte-identically, which is what makes saving an edit safe.

**Draws the chart as a sheet of paper.** Sixteen cells across, a fixed portrait
shape, centred with margin either side. Give the window more width and the
sheet does not stretch — the margin grows. The whole page derives from one
number, the width of a cell, so its proportions cannot drift.

**Plays it.** Nineteen grooves, a walking bass that lands on the root at every
change, phrased piano comping with voice-led rootless voicings, and drums.
Repeats, endings, D.C./D.S., Coda and Fine unroll into the order the band
actually plays.

**Lets you change it.** A cell-grid editor with undo, live validation, and the
same chord symbols the page draws. Transpose for a horn, set a tempo, pick a
style; the app remembers what you did to each song and puts it back next time.

**Goes with you.** Installable, fully offline, and everything exports again —
iReal Pro URIs and HTML, MusicXML, MIDI, and print.

## How it is put together

Four packages under `packages/`, and one app. Each layer is useful on its own
and none of them know about the browser except the last two.

| Path | What it does |
|---|---|
| `packages/ireal-format` | The URI schemes and HTML exports: unscramble, tokenize to cells, serialize back |
| `packages/song-model` | Cells become bars: beat resolution, meter, repeats and jumps, unrolling, transposition, MusicXML |
| `packages/groove-engine` | Bars plus a groove become note events: chord grammar, voicings, bass, drums, comping, MIDI, chord diagrams |
| `packages/audio-host` | Web Audio transport, instruments, mixer, offline render |
| `apps/web` | The app: library, chart, editor, player, export |
| `tools/` | Dev CLIs: fixture fetcher, chart printer, screenshots, audio checks, icons |
| `docs/ireal-format.md` | The reverse-engineered format spec, and the living reference |
| `PLAN.md` | The original implementation plan: scope, architecture, risks |

About 11,700 lines of TypeScript, covered by 466 tests.

## What is verified, and how

Claims here are measured against 2,200 community charts across seven
playlists, not asserted.

**The format**

- Every record parses, with no unrecognised tokens or chord roots
- Every payload re-encodes **byte-identically** — 2,199 scrambled songs, 100%
- Every chart re-writes to the same cells after a serialize/parse round trip

**The musical model**

- **Every one of 70,912 bars fills its meter exactly.** The beat-resolution
  rules are undocumented and were derived; this is how we know they hold
- Repeats, 1st/2nd/3rd endings, D.C./D.S., Coda and Fine unroll into a play
  order, with every written bar reachable in 2,199 of 2,200 songs
- Transposition spells for the destination key — C major to D major gives
  `C#ø7`, not `Db ø7` — and never drifts, however far a chart is moved

**The band**

- Grooves render audibly with no clipping, verified by an offline render in a
  real browser (`run audio`)
- The walking bass lands on the root at every chord change and stays in register
- Comping voice-leads: the hand moves under five semitones between chords on
  average, rather than jumping around the keyboard
- Renders are reproducible from a seed, so an audio regression is a readable
  event diff rather than a waveform comparison

The app is checked end to end in a real browser: it imports the 1,459-song jazz
playlist, draws the chart, transposes it, plays with a live playhead, loops a
bar range, keeps its library across a reload, and exports MIDI, with no console
errors.

## Sound

The app plays through a **synthesised** instrument set by default. It is a few
kilobytes, needs no network, and is why the whole thing installs at under a
megabyte and works offline the moment it loads.

**Recorded instruments are an optional upgrade:**

```
npm run sounds:fetch
```

That downloads about 3.6 MB of sampled piano, electric piano, upright and
electric bass, and nylon guitar into `apps/web/public/sounds/`, which is
git-ignored. The player decides per instrument, so a partial download still
helps: anything without a bank falls through to the synthesised voice. The
drums stay synthesised — the soundfont carries no General MIDI kit, and the
drums are the part of the built-in set that holds up best.

Samples come from **FluidR3_GM** via [midi-js-soundfonts][sf], under
**Creative Commons Attribution 3.0**. Attribution is a condition, and
`sounds/CREDITS.md` is written alongside the banks to carry it.

[sf]: https://github.com/gleitz/midi-js-soundfonts

## The library, on your machine

Everything lives in IndexedDB on the device — no account, no server. Songs are
stored with the **original payload** beside anything derived, so a parser
improvement reaches old imports by reparsing rather than by a migration, and
imports deduplicate on the chord payload rather than the title, because the
same tune arrives a dozen times spelled a dozen ways.

Key, tempo, style and repeats are remembered per song and restored when you
reopen it — kept beside the song rather than written into the chart, because
playing a tune in another key is a decision about this session, not an edit. A
control showing something other than what the chart says is marked, so you
cannot read a transposed chart believing it is the original.

## Development

```bash
npm test              # 466 tests
npm run typecheck     # packages and the app
npm run fixtures:fetch
npm run sounds:fetch
```

The corpus in `fixtures/` is user-contributed transcriptions of copyrighted
songs. It is git-ignored and fetched on demand, and the tests that need it skip
when it is absent, so a fresh clone still runs green.

`docs/ireal-format.md` is the reference for anything about the file format, and
is worth reading before touching `packages/ireal-format`.

## Scope, deliberately

**Import-only and local-first.** unRealChart does not host a chart database.
Chord progressions themselves are not protectable, but a searchable library of
transcribed charts for copyrighted songs is a different argument, and one worth
not having.

> The one exception: an empty library seeds itself once from a public
> collection of community transcriptions, so a new install is not blank. The
> source is a single constant in `apps/web/src/defaultLibrary.ts`, and the seed
> never runs against a library that already holds songs.

**Nothing of iReal Pro's ships here** — no samples, no fonts, no artwork, no
branding. Their trademark appears only in statements about what this reads.

**No copyleft in the dependency tree.** `ireal-musicxml` is the most complete
open parser and is **GPL-3.0**: depending on it would relicense this whole app,
so it was read as a reference and never linked. Same for MMA on the groove
side. The parser lineage is the MIT-licensed `ireal-renderer` / `ireal-reader`.
The only code shipped to a browser is React, React-DOM, and the four packages
here.

## Hosting it

The app is static, so GitHub Pages serves it for nothing. Pushing to `master`
builds and publishes it: see `.github/workflows/pages.yml`.

Turn it on once, in **Settings → Pages → Source → GitHub Actions**. The site
then lives at `https://<user>.github.io/unRealChart/`.

A project site is served under the repository name rather than the domain
root, which is why `base` is set in `apps/web/vite.config.ts` and why the
sound banks resolve against it rather than against `/`. Publishing to a custom
domain, which serves from the root, means setting `BASE_PATH=/` for the build.

The workflow typechecks and runs the tests before publishing, and fetches the
sampled instruments so the hosted app has them.

## Licence

**Not yet chosen.** Without a LICENCE file the default is all rights reserved,
which means nobody can legally contribute. Pick one before making the
repository public.
