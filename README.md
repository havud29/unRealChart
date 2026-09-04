# unRealChart

A chord chart reader, editor and backing band that runs in a browser.

Open the iReal Pro playlists you already have, read the chart as a page, and play
it with a rhythm section that follows the form. Nothing is uploaded — your library
lives in the browser and the app works offline.

*Compatible with iReal Pro's file formats. Not affiliated with Technimo LLC.*

## Start

```bash
npm install
npm run dev --workspace @unrealchart/web    # or: run           (Windows)
npm test                                    # or: run test
npm run typecheck                           # or: run check
npm run sounds:fetch                        # recorded instruments, optional
```

Drop an iReal Pro `.html` or `.txt` export anywhere in the window. An empty library
seeds itself once, so there is something to read immediately.

`run.cmd` is the Windows front door — also `run build`, `run fixtures`,
`run chart <file> [title]`, `run shot`, `run audio [groove]`, `run icons`.

## What it does

- **Reads the format properly** — both URI schemes, HTML exports, `.txt` dumps,
  pasted URIs, and the positional scramble. Re-encodes byte-identically.
- **Draws the chart as a sheet of paper** — 16 cells across, fixed portrait shape,
  centred. A wider window gets more margin, not a wider sheet.
- **Plays it** — 19 grooves, walking bass, phrased comping with voice-led rootless
  voicings, drums. Repeats, endings, D.C./D.S., Coda and Fine unroll into play order.
- **Lets you change it** — cell-grid editor with undo and live validation. Key,
  tempo, style and repeats are remembered per song.
- **Goes with you** — installable, offline, exports to iReal Pro URIs and HTML,
  MusicXML, MIDI and print.

## Layout

| Path | What |
|---|---|
| `packages/ireal-format` | URI schemes and HTML: unscramble, tokenize to cells, serialize back |
| `packages/song-model` | Cells to bars: beats, meter, repeats and jumps, unrolling, transposition, MusicXML |
| `packages/groove-engine` | Bars + groove to note events: chord grammar, voicings, bass, drums, comping, MIDI, diagrams |
| `packages/audio-host` | Web Audio transport, instruments, mixer, offline render |
| `apps/web` | The app: library, chart, editor, player, export |
| `tools/` | Fixture fetcher, chart printer, screenshots, audio checks, icons |
| `docs/ireal-format.md` | The format spec. Read before touching `ireal-format` |
| `PLAN.md` | Original plan: scope, architecture, risks |

~11,700 lines of TypeScript, 469 tests.

## Verified, not asserted

Measured against 2,200 community charts across seven playlists.

| | |
|---|---|
| Parsing | Every record parses; no unrecognised tokens or roots |
| Round trip | **2,199 of 2,199 payloads re-encode byte-identically** |
| Beats | **All 70,912 bars fill their meter exactly.** The rules are undocumented; this is how we know they hold |
| Form | Repeats, endings, D.C./D.S., Coda and Fine unroll with every bar reachable in 2,199 of 2,200 |
| Transposition | Spells for the destination key — C→D gives `C#ø7`, not `Dbø7` — and never drifts |
| Audio | No clipping, bass lands on roots, comping moves under 5 semitones between chords, reproducible from a seed |

End to end in a real browser: imports the 1,459-song jazz playlist, draws, transposes,
plays with a live playhead, loops, survives a reload, exports MIDI. No console errors.

## Sound

Synthesised by default — a few kilobytes, no network, working the moment it loads.

`npm run sounds:fetch` adds ~3.6 MB of sampled piano, electric piano, upright and
electric bass, and nylon guitar (git-ignored). Resolution is per instrument, so a
partial download still helps; anything missing falls back to the synth. Drums stay
synthesised — the soundfont has no GM kit, and they hold up best anyway.

Samples: **FluidR3_GM** via [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts),
**CC-BY 3.0**. Attribution is a condition; `sounds/CREDITS.md` carries it.

## Hosting

Static, so GitHub Pages serves it free. Pushing to `master` typechecks, tests, fetches
the instruments and publishes — see `.github/workflows/pages.yml`. Enable it once in
**Settings → Pages → Source → GitHub Actions**; the site lands at
`https://<user>.github.io/unRealChart/`.

A project site is served under the repo name, which is why `base` is set in
`vite.config.ts` and the sound banks resolve against it. For a custom domain serving
from the root, build with `BASE_PATH=/`.

## Scope, deliberately

- **Import-only and local-first.** No hosted chart database. Progressions are not
  protectable, but a searchable library of transcribed charts for copyrighted songs is
  a different argument, and one worth not having. The one exception: an empty library
  seeds once from a public collection, via a single constant in `defaultLibrary.ts`.
- **Nothing of iReal Pro's ships here** — no samples, fonts, artwork or branding.
  Their trademark appears only in statements about what this reads.
- **No copyleft in the tree.** `ireal-musicxml` is GPL-3.0 and would relicense the
  app, so it was read as a reference and never linked; same for MMA. The lineage is
  the MIT `ireal-renderer` / `ireal-reader`. Shipped to the browser: React, React-DOM,
  and the four packages here.
- **`fixtures/`** is user-contributed transcriptions of copyrighted songs. Git-ignored
  and fetched on demand; tests needing it skip when absent, so a fresh clone runs green.

## Licence

**Not yet chosen.** Without a LICENCE file the default is all rights reserved, so
nobody can legally contribute. Pick one before making the repository public.
