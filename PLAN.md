# unRealChart — Implementation Plan

**A browser-native rebuild of iReal Pro.** Import the playlists you already own, edit the charts, and hear them played back by a style engine you control.

| | |
|---|---|
| **Target** | PWA, offline-first, mobile + desktop |
| **Stack** | TypeScript + React + Web Audio |
| **Repo** | `E:\Working\GitRepos\unRealChart` |
| **Effort** | ~18–22 weeks to v1 (one developer) |
| **Hard part** | The style/accompaniment engine |
| **Researched** | September 2026 — format verified against reference parsers and a real iReal Pro HTML export |

---

## 1. Scope — what "clone" actually means

iReal Pro is three products welded together, each with a different difficulty curve:

1. **Chord-chart reader** — solved problem. The format is reverse-engineered and documented; a faithful renderer is a weekend of layout work.
2. **Chart editor** — ordinary application engineering.
3. **Accompaniment generator** — the whole game.

The third one is where this project lives or dies. iReal Pro ships ~50 styles built from hand-authored MIDI patterns and a licensed sample set, **none of which appear in the file format**. A song file says `Medium Swing, 160bpm` and nothing more. Everything that makes playback sound good has to be authored by us.

So: front-load the format work (fast, high-certainty) to get a usable reader early, then spend the bulk of the schedule on the style engine.

### 1.1 Feature parity, staged

**MVP — milestones 0–4, ~10 weeks**
- Import `.html` playlists, `.txt` dumps, pasted `irealb://` URIs
- Faithful 16-cell chart rendering: sections, repeats, endings, codas
- Local library: search, sort, tag, playlists
- Transpose to any key + horn keys (E♭, B♭, F)
- Playback: 3 grooves, bass + drums + comping
- Tempo, repeat count, count-in, playhead follow

**v1 — milestones 5–7, ~10 weeks**
- Full chart editor: cell grid + chord keypad
- ~15 grooves across jazz / latin / pop
- Mixer: per-part instrument swap, volume, mute/solo, reverb
- Practice: A/B loop, tempo ramp per chorus, key cycling
- Chord diagrams for piano, guitar, ukulele
- Export: iReal URI/HTML round-trip, MusicXML, MIDI, PDF
- PWA offline, gig mode, wake lock

**Post-v1**
- 50+ grooves with variations and fills
- Audio bounce (offline render to WAV/MP3)
- Melody / head playback from MusicXML
- Cloud sync, Web MIDI out, Yamaha `.sty` import as a groove source
- Bluetooth page-turner pedal support

### 1.2 Deliberately out of scope

**A public, searchable chart database.** iReal Pro's own catalogue is user-uploaded and lives on their forums for a reason. Keep unRealChart import-only and local-first — users bring their own charts. This removes the single largest legal exposure at zero cost to the product.

---

## 2. Format ground truth

Undocumented by its authors, fully reverse-engineered by the community. Everything below is verified against working parsers and a real exported playlist — implementation-ready, not folklore.

### 2.1 Two schemes, one container

- **`irealbook://`** — legacy, human-readable. Plain text after URL-decoding.
- **`irealb://`** — current. Same idea, but the chord payload is position-scrambled with a few substring substitutions.

What users actually hand you is an **HTML file** the app emails or shares: plain XHTML whose one interesting element is an anchor whose `href` is the URI, with the link text being the playlist name. Extraction is a single regex over the whole file — no HTML parsing needed:

```js
// Works for .html exports, .txt dumps, and raw pasted URIs alike.
const m = /.*?(irealb(?:ook)?):\/\/([^"]*)/.exec(fileText);
const scheme  = m[1];                      // "irealb" | "irealbook"
const payload = decodeURIComponent(m[2]);

const parts = payload.split("===");        // songs are separated by ===
const playlistName = parts.length > 1 ? parts.pop() : null;
// each remaining part is one song record
```

A single-song share has no trailing name; a playlist has the name as the final segment.

### 2.2 The song record

Each song record is `=`-delimited. Field positions differ between schemes, and the modern one has empty slots that must not be re-indexed away.

| Index | `irealb://` (current) | `irealbook://` (legacy) |
|---|---|---|
| 0 | Title — trailing article moved to front (`Gentle Rain, The` → `The Gentle Rain`) | Title, same rule |
| 1 | Composer — *reversed* when exactly two words (`Timmons Bobby` → `Bobby Timmons`) | Composer, same rule |
| 2 | *(empty)* | Style (display) |
| 3 | Style (display), e.g. `Medium Swing` | Key signature |
| 4 | Key signature, e.g. `F-` | unused (`n`) |
| 5 | Transpose, semitones | **Chord payload** (plain text) |
| 6 | **Chord payload**, prefixed by the literal marker `1r34LbKcu7` | — |
| 7 | Groove (playback style) | — |
| 8 | BPM | — |
| 9 | Repeat count (default 3) | — |

**Multi-part songs.** Long tunes are split across consecutive records whose titles differ only by a trailing number. Detect with a character diff: if every difference between adjacent titles is purely numeric, concatenate the second song's cells into the first. Skipping this silently truncates charts.

### 2.3 Unscrambling the modern payload

Not encryption — a fixed positional permutation applied to 50-character blocks, plus three substring substitutions. The permutation is an **involution** (it swaps index pairs), so the same function both scrambles and unscrambles. That is what makes lossless export back to iReal Pro possible.

```js
function obfusc50(s) {
  // swap 0..4 with 45..49, and 10..23 with 26..39. Self-inverse.
  const a = s.split('');
  for (let i = 0;  i < 5;  i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  for (let i = 10; i < 24; i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  return a.join('');
}

function unscramble(s) {
  let r = '';
  while (s.length > 51) {              // a tail of 50 or 51 is left alone
    r += obfusc50(s.substring(0, 50));
    s  = s.substring(50);
  }
  r += s;
  return r.replace(/Kcl/g, '| x')      // substitutions, applied last
          .replace(/LZ/g,  ' |')
          .replace(/XyQ/g, '   ');
}
```

To re-encode: reverse the three substitutions **first**, then run `obfusc50` over the same 50-char blocking.

> **⚠ Round-trip gotcha.** Block boundaries are computed on the *substituted* string, so substitution and blocking are order-dependent in both directions. Don't reason about it — build the encoder in M7 and assert `encode(decode(x)) === x` across a few thousand real songs. Anything less will corrupt users' charts.

### 2.4 The cell grid

A chart is a flat stream of **cells**, laid out 16 to a row. A cell holds at most one chord plus any number of annotations, barline markers and comments.

**A cell is not a beat.** Barlines attach to cells rather than occupying them, so a bar can span any number of cells, and the same 4-cell span means different things in 4/4 and 3/4.

```
raw     [C^7   |A-7 D-7 |G7   |C6   ]

cell     0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
        ┃C△7  ·    ·    ·   │A-7  ·   D-7   ·   │G7   ·    ·    ·   │C6   ·    ·    ·
beats    1    2    3    4    1    2    3    4    1 —————————— 4    1 —————————— 4
```

16 cells · 4 bars · cell 6 gets 2 beats because cell 7 is empty · a lone chord absorbs the whole bar.

**Tokenizing** — greedy match against an ordered regex list, first match wins; unmatched characters fall through as single-character tokens (commas discarded):

```
/^\*[a-zA-Z]/    section marker: *A, *B, *i (intro), *v (verse)
/^T\d\d/         time signature: T44, T34, T12 (= 12/8)
/^N./            ending bracket: N1, N2, N3
/^<.*?>/         comment or repeat directive; *yy prefix = vertical offset
/^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\*.+?\*)*(\/[A-G][#b]?)?(\(.*?\))?/
                 chord: root, quality, private text, bass note, alternate
/^([ Wp])()()(\/[A-G][#b]?)?(\(.*?\))?/
                 space, W (invisible root), p (repeat previous chord)
```

A second pass folds barline characters, annotations and comments onto the surrounding cells.

### 2.5 Timing — how cells become beats

The rule set that decides what actually plays. Not in any spec; derived by observing the app. Applied per measure, after the bar is closed:

1. Every chord starts at **1 beat minimum**.
2. Empty cells *before* the first chord of the bar are discarded.
3. Every remaining empty cell counts as one beat and is added to the chord that precedes it.
4. If the total now *exceeds* the meter, walk the chords round-robin removing one absorbed space at a time until it fits.
5. If the total is *under* the meter, walk the chords round-robin adding a beat each pass — skipping chords marked *small* (the `s` annotation), which stay at one beat.
6. More chords than beats in the bar is a hard error; the editor must prevent it.

A per-meter scaling factor maps grid cells onto beats: `½` for 3/4 and 3/2, `3` for 12/8, `1` everywhere else.

Supported meters: 2/4, 3/4, 4/4, 5/4, 6/4, 7/4, 3/8, 5/8, 6/8, 7/8, 9/8, 12/8, 2/2, 3/2.

### 2.6 What the format does *not* contain

Worth stating plainly, because it defines the build:

- **No groove data.** Just a style name string. Every drum pattern, bass rule and comping rhythm is ours to author.
- **No voicings.** Chord symbols only.
- **No sounds.** No samples, no instrument definitions, no mixer state.
- **No melody.** Chords only — a real book without the tune.
- **No layout coordinates** beyond the 16-cell grid, spacers (`Y`) and small/large chord flags.

---

## 3. Architecture

One pipeline, five stages, each independently testable.

| Stage | Name | Does |
|---|---|---|
| 1 | **Decode** | Bytes → cells. Regex extract, unscramble, tokenize. |
| 2 | **Model** | Cells → Song: bars, chords with beat durations, sections, jumps. |
| 3 | **Unroll** | Song → linear bar list. Repeats, endings, D.S./D.C., choruses. |
| 4 | **Generate** | Bars + groove → timed note events per instrument part. |
| 5 | **Render** | Events → audio. Scheduler, sampler, mixer, and the timemap for UI sync. |

The renderer and editor attach at stage 2; only playback continues to 3–5. Stage 3 also produces the timemap that drives playhead highlighting.

### 3.1 Two models, on purpose

- **Grid model** — preserves cell positions exactly as authored. What the renderer draws, the editor mutates, and the exporter writes back. Round-trip fidelity depends on never normalizing it away.
- **Timeline model** — a flat array of bars with resolved chord durations, all repeats and jumps expanded, per-chorus transposition applied. Disposable; regenerated whenever a setting changes. The playback engine never sees a repeat sign.

### 3.2 Package boundaries

| Package | Responsibility | Depends on |
|---|---|---|
| `ireal-format` | Decode/encode URIs and HTML, scramble/unscramble, tokenize to cells. Zero DOM, zero audio. | — |
| `song-model` | Cells ↔ Song. Timing rules, transposition, validation, unrolling, timemap. | `ireal-format` |
| `chart-render` | Song → SVG/DOM chart. Layout, fonts, notation options, print stylesheet. | `song-model` |
| `groove-engine` | Bars + groove pack → note events. Generators, voicing engine, humanization. | `song-model` |
| `audio-host` | Transport clock, instrument providers, mixer, effects. Swappable backends. | `groove-engine` |
| `grooves` | Pure JSON data packs. No code. Versioned, schema-validated. | — |
| `apps/web` | React app: library, chart view, editor, mixer, practice panel, settings. | all |

`ireal-format` and `song-model` are pure functions over strings and objects — the highest-risk logic gets thousands of golden-file assertions with no browser in sight.

---

## 4. Import and library

### 4.1 Ingest paths

- **Drag-and-drop / file picker** for `.html` exports and `.txt` dumps. Accept multiple files at once; the extraction regex handles both without branching.
- **Paste** an `irealb://` or `irealbook://` URI directly into a text box.
- **Protocol handler** — `navigator.registerProtocolHandler('web+irealb', …)`. Browsers won't let a web app claim the bare `irealb` scheme, so also accept the URI as an `?import=` query parameter, and offer a bookmarklet for the forum links people actually click.
- **Folder import** via the File System Access API on Chromium; graceful fallback to multi-file input elsewhere.

### 4.2 Storage

IndexedDB through a thin typed wrapper, three stores: `songs` (grid model + metadata + user edits), `playlists` (ordered ID lists), `settings`.

Store the **original raw payload** alongside the parsed model — when the parser improves, reparse from source rather than migrating derived data.

Deduplicate on a content hash of the chord payload, not the title. The same tune arrives a dozen times with different spellings; offer merge-or-keep-both rather than silently dropping.

### 4.3 Library UI

Virtualized list, incremental search across title / composer / style / key, sort by any column, multi-select for playlist assembly. Playlists are ordered; a song can belong to many. Deliberately boring — it's the screen users see most, so it should be fast and unsurprising.

---

## 5. Song model and unrolling

### 5.1 Shape

```ts
type Song = {
  meta:     { title, composer, style, groove, key, bpm, repeats, transpose },
  cells:    Cell[],              // grid model, authored order, 16 per row
  bars:     Bar[],               // derived: meter, chords[], barlines, marks
  sections: Section[],           // *A, *B, … with bar ranges
};

type Bar = {
  meter:  [number, number],
  chords: { symbol, root, quality, bass, alt, beats, small, fermata }[],
  open:   '|' | '[' | '{',
  close:  '|' | ']' | '}' | 'Z',
  ending: 1 | 2 | 3 | null,
  marks:  { segno?, coda?, fine?, section?, text?[] },
};
```

### 5.2 Chord parsing and transposition

iReal's quality vocabulary is a fixed list of ~60 symbols (`^7`, `-7`, `7alt`, `7b9#11`, `6/9`, `-^9`, …). Parse to a normalized `{root, intervals[], bass}` using `chord-symbol`, but **keep the original symbol string** for display — re-rendering a normalized symbol changes what the user typed, which musicians notice immediately.

Transposition operates on root and bass pitch classes with correct enharmonic spelling for the destination key (F♯ major gets A♯, not B♭). Two independent transpositions must compose: the chart's own value and the global "horn key" offset. Both must be reversible without accumulating drift — **always transpose from the stored original**, never from the currently displayed value.

### 5.3 Unrolling

Expand into a flat play order, in this precedence:

1. Bar-level repeats: `x` (repeat previous bar), `r` (repeat previous two bars), `p` (repeat previous chord within a bar).
2. Repeat brackets `{ }` with first/second/third endings (`N1`/`N2`/`N3`) — an ending marker in iReal covers exactly one bar.
3. Text directives parsed from comments: `D.C. al Coda`, `D.S. al Fine`, `D.C. al 2nd End.`, plus explicit `3x`…`8x` multipliers.
4. Chorus repetition: the whole form × the repeat count, with per-chorus key or tempo changes applied at this stage.

Output is `UnrolledBar[]` where each entry carries a back-pointer to its source bar index. That back-pointer is what lets the playhead highlight the right cell on the fourth chorus of a chart with two endings and a D.S.

> **Test this hard.** Unrolling is where subtle bugs hide and where they're most audible. Build a text fixture format — chart in, expected bar sequence out — and write cases for nested repeats, endings, segno-before-repeat and coda-inside-ending *before* writing the implementation.

---

## 6. Renderer

### 6.1 Approach: DOM grid, not canvas

The chart is a 16-column CSS grid of positioned text — not engraved notation. DOM gives free text selection, accessibility, native print-to-PDF, and trivially clickable cells for the editor. Canvas would buy nothing here and cost all of that. Reserve SVG for small decorative glyphs (segno, coda, fermata, repeat brackets) drawn as inline paths.

### 6.2 Layout algorithm

1. Chunk cells into rows of 16.
2. Within a row, place chord text at cell positions; barlines render as pseudo-elements on the left edge of their cell so they never consume a slot.
3. Spacer tokens (`Y`) add vertical padding above their cell; comments with a `*yy` prefix get an explicit pixel offset.
4. Section letters render in a boxed gutter at the row's left; endings draw a horizontal bracket spanning their bar.
5. Scale the whole grid with a single CSS custom property so "fit one page" is one number, not a reflow.

### 6.3 Typography

iReal Pro's look comes from a hand-copyist face. **Petaluma Script** (Steinberg, SIL Open Font License) is the right choice — explicitly modelled on the Sher Publishing *Real Book* copyists, free to embed commercially. Pair with **Petaluma** (SMuFL-compliant) for musical glyphs. Subset both to the ~120 glyphs a chart actually uses; the full Petaluma face is ~1350 glyphs.

Offer a plain-sans alternative for readers who find script hard to read on stage — a real accessibility need, not a preference toggle.

### 6.4 Display options

- Minor rendering: `-`, `m`, or `min`
- Major rendering: `△` or `maj`
- Show/hide alternate chords (the small chords above the staff)
- Slash vs. rhythmic notation for repeated bars
- Font size, page fit, dark/light chart, high-contrast gig mode

### 6.5 Print and PDF

A dedicated print stylesheet plus `window.print()` gets a genuinely good PDF for free, including multi-song playlist booklets. Skip a JS PDF library entirely at v1 — browser print output of a DOM chart beats anything `jsPDF` will produce, at zero maintenance cost.

---

## 7. Editor

The editor mutates the grid model directly, one cell at a time. Every mutation is a small, invertible command — which gives undo/redo, dirty tracking and future collaboration for one design decision.

### 7.1 Interaction

- **Cell cursor** moved with arrows; type a chord symbol to fill, `Delete` to clear. Typing accepts loose input (`Cmaj7`, `CM7`, `C^7`) and normalizes on commit.
- **Chord keypad** for touch: root row, quality grid, bass-note picker, alternate-chord toggle. The mobile path has to be first-class — half the users are on a phone at a rehearsal.
- **Bar tools:** insert/delete bar, set barline type, open/close repeat, add ending, insert section marker, time signature change.
- **Marks palette:** segno, coda, fine, fermata, D.C./D.S. directives, free text comments, vertical spacers.

### 7.2 Live validation

Run the timing rules on every edit and surface violations inline — too many chords for the meter, unclosed repeat bracket, ending without a repeat, orphan coda. iReal Pro prevents these at input; we should flag rather than block, but never let an invalid chart reach the player.

### 7.3 Command model

```ts
interface Command {
  apply(song: Song): Song;   // pure, returns new state
  invert(): Command;         // for undo
  label: string;             // "Set chord B♭7 at bar 12"
}
```

Coalesce rapid same-cell edits into one undo entry. Persist the command log per song so an interrupted session restores exactly.

---

## 8. The playback engine

Half the schedule and nearly all the risk. Everything here is original work — the file format contributes a style name and a tempo, and nothing else.

### 8.1 Groove packs

A groove is **data, not code**: a versioned JSON document describing how each instrument behaves over a chord progression. Declarative means new styles ship without a release, and a community can contribute them.

```json
{
  "id": "medium-swing",
  "name": "Medium Swing",
  "family": "jazz",
  "meter": "4/4",
  "tempoRange": [100, 220],
  "feel": { "swing": 0.62, "unit": "8n", "humanize": { "time": 0.012, "vel": 0.10 } },

  "parts": [
    { "id": "drums", "instrument": "jazz-kit", "generator": "pattern",
      "patterns": { "main": ["ride-swing-a", "ride-swing-b"],
                    "fill": ["fill-4"], "ending": ["end-hit"] },
      "fillEvery": 8, "fillOnSectionChange": true },

    { "id": "bass", "instrument": "upright-bass", "generator": "walking",
      "range": ["E1", "G3"], "approach": 0.7, "leapLimit": 7, "restOnFermata": true },

    { "id": "piano", "instrument": "acoustic-piano", "generator": "comp",
      "voicing": "rootless-AB", "range": ["C3", "A4"],
      "rhythms": ["charleston", "and-of-2", "sparse-long"],
      "density": 0.55, "anticipate": 0.35 }
  ],

  "sections": { "intro": "4-bar-vamp", "ending": "turnaround-tag", "countIn": 2 }
}
```

Patterns referenced by name resolve from a shared pattern library, so kits and rhythms are reused across styles.

### 8.2 Generators

**Drums — pattern playback.** Pure data: per-bar step lists of `{instrument, position, velocity, probability}`. Variation comes from weighted alternation between A/B bars, fills at a configurable period and on every section change, and a written ending hit. Humanization jitters timing and velocity from a **seeded** RNG so a given song + groove always renders identically — essential for regression-testing audio.

**Bass — algorithmic.** Walking bass must be generated rather than patterned, because it's driven by the harmony:

1. Beat 1 takes the chord root (or the written bass note for slash chords).
2. The last beat before a chord change takes an approach note — chromatic from above/below, or the dominant fifth — chosen by the pack's `approach` weight.
3. Interior beats take chord tones and scale tones, scored by: distance from the previous note, contour continuity, staying inside range, and not repeating a pitch within the bar.
4. A leap limit prevents octave jumps; when register drifts to an extreme, invert direction.

Non-swing families replace this with pattern-driven generators: root-fifth for country and rock, a two-bar bossa ostinato transposed per chord, tumbao for son montuno, half-time root-and-octave for ballads.

**Comping — voicing engine + rhythm.** Two independent problems, deliberately kept separate:

- *Voicings.* Map `{root, intervals}` to actual pitches using a template selected by the pack: rootless A/B forms for jazz piano, drop-2 for guitar, shell voicings (root-3-7) for sparse styles, quartal for modal. Then **voice-lead**: among valid inversions of the target voicing, pick the one minimizing total semitone movement from the previous voicing, subject to staying inside the part's register window. This one rule is the difference between "a computer playing chords" and "a piano player."
- *Rhythm.* Select a one- or two-bar comping rhythm from the pack's bank, weighted by density, biased against repeating the previous selection. Handle anticipations: with probability `anticipate`, pull the chord an eighth ahead of the barline and shorten the previous hit.

An **embellished chords** toggle (matching iReal Pro's) adds 9ths and 13ths to plain triads and sevenths; off, it plays exactly what's written.

### 8.3 Transport and scheduling

Web Audio's clock is the only trustworthy timebase. Standard lookahead pattern: a `setInterval` tick every 25 ms scans a horizon of ~200 ms ahead and schedules every event in that window against `audioContext.currentTime`. Nothing is ever scheduled "now."

Because the timeline is fully unrolled up front, the scheduler is a cursor over a sorted event array — no generation happens on the audio path. Regenerate only when the user changes tempo, groove, key, loop points or repeat count, and regenerate from the current bar forward so playback doesn't stutter.

The transport owns a **tempo map** rather than a scalar BPM, which makes tempo ramping per chorus, ritardando on the final bar, and half/double-time feel changes all the same mechanism.

UI sync reads `currentTime` in a `requestAnimationFrame` loop and binary-searches the timemap for the current bar — never drive visuals from scheduler callbacks, which fire early by design.

### 8.4 Sound

Design an `InstrumentProvider` interface up front, with three implementations, so sound quality can improve without touching the engine:

| Backend | Use | Trade |
|---|---|---|
| **SoundFont** via `spessasynth_lib` (Apache-2.0) | Default. One SF2 covers every instrument; FluidR3 (MIT) or GeneralUser GS (permissive) both allow commercial use. | Fastest path to all parts playing. GM sounds are serviceable, not beautiful. |
| **Sample packs** via `smplr` (MIT) or a hand-rolled sampler | Upgrade path for the parts that matter most: upright bass, ride cymbal, piano. | Best sound. Costs curation, licensing, tens of MB per instrument. |
| **Web MIDI out** | Power users driving hardware or a DAW. | Nearly free once events are the engine's output format. |

Assets load lazily per instrument and cache in the Cache Storage API, so a groove's sounds are fetched once and then work offline. Budget: first playable groove under 8 MB; full default set under 40 MB.

### 8.5 Mixer

A gain/pan node per part feeding a shared convolution reverb send and a master limiter. Controls mirror iReal Pro: instrument swap per part, volume, mute, solo, reverb amount, embellishment toggle. Mixer state saves per song **and** as a global default — "make the drums quieter, forever" is the actual request.

> **⚠ Where this project fails, if it fails.** Not in parsing — in the grooves sounding lifeless. Mitigate by building *one* style end-to-end to a standard you'd actually practise with before building the second. **Medium Swing** is the right first target: it exercises walking bass, swing feel, ride patterns, comping voicings and fills all at once. If it sounds good, the architecture is right. If it doesn't, better to learn that in week six than week sixteen.

---

## 9. Practice tools and export

### 9.1 Practice

- **Tempo** slider + tap tempo; **tempo ramp** adding N BPM every chorus.
- **A/B loop** on bar boundaries, set by clicking two cells. Loops re-enter cleanly because the unroller treats the loop as its own form.
- **Key cycling** — transpose up a semitone, or around the cycle of fourths, each chorus.
- **Horn transposition** globally: E♭, B♭, F, G, independent of the chart's own key.
- **Count-in** of one or two bars, plus a metronome layer.
- **Chord diagrams** for piano, guitar and ukulele, generated from parsed intervals rather than a lookup table, with swipeable alternates and a left-hand flip.
- **Gig mode**: maximum contrast, large type, wake lock held, tap zones for next/previous chart in the playlist.

### 9.2 Export

| Format | How | Milestone |
|---|---|---|
| `irealb://` URI + HTML | Our own encoder — scramble is the same involution as unscramble. Guarantees users can leave. ✅ done | M7 |
| MusicXML | Write our own emitter from the Song model. **Not** by importing `ireal-musicxml` — see §10 licensing. ✅ done | M7 |
| MIDI | Serialize the generated event stream to a Standard MIDI File. Nearly free once the engine exists. ✅ done | M7 |
| PDF | Print stylesheet + `window.print()`. Single chart or whole playlist. ✅ done | M6 |
| Audio (WAV/MP3) | `OfflineAudioContext` render of the same event stream, faster than real time. | post-v1 |

---

## 10. Stack decisions

Chosen for a small team shipping a long-lived offline app. Versions verified current as of September 2026.

| Layer | Choice | Why | Alternative considered |
|---|---|---|---|
| Language | TypeScript, strict | The format work is all string-shaped; types are the cheapest defence against silent corruption. | — |
| Build | Vite + pnpm workspaces | Fast, first-class monorepo support, good PWA plugin. | Turborepo (overkill at this size) |
| UI | React 19 + Zustand | The chart is a large virtualized grid with fine-grained state; Zustand avoids provider churn. | Svelte (fine, smaller ecosystem for music libs) |
| Chart render | Hand-written DOM/CSS grid | The 16-cell model is unlike any notation library's model. Wrapping one would be more work than writing it. | VexFlow, OpenSheetMusicDisplay — both engrave staves we don't want |
| Chord theory | `chord-symbol` 4.x + `tonal` 4.x (both MIT) | Parsing, normalization, intervals, enharmonic spelling — solved and well-tested. | Rolling our own (weeks of edge cases) |
| Audio clock | Custom lookahead scheduler on raw Web Audio | Full control of tempo map, loop re-entry, offline render. ~200 lines. | Tone.js 15.x (MIT) — use if the custom clock stalls, but its Transport abstraction fights per-chorus tempo maps |
| Synthesis | `spessasynth_lib` (Apache-2.0), swappable | SF2/DLS with full modulator support, WASM, actively maintained. | js-synthesizer (FluidSynth WASM) — heavier; `smplr` for curated packs later |
| Storage | IndexedDB + Cache Storage | Offline-first by construction; audio assets cached separately from user data. | OPFS (useful later for large sample packs) |
| Fonts | Petaluma + Petaluma Script (SIL OFL), subset | Purpose-built for exactly this look, free to embed commercially. | Bravura (engraved, wrong character for a lead sheet) |
| Testing | Vitest + Playwright | Unit for the pure packages, browser for render and audio. | — |

> **⚠ Licensing trap — check before you `npm install`.**
> `ireal-musicxml`, the most complete open iReal Pro parser, is **GPL-3.0**. Depending on it makes unRealChart GPL. Its parser is itself derived from `ireal-renderer` and `ireal-reader`, both **MIT** — base the implementation on those, or write from the format documentation directly (that's what §2 is for).
> Same caution for **MMA** (Musical MIDI Accompaniment): a superb groove library, but GPL — treat it as a reference for authoring our own packs, not a data source to vendor.
> **Verovio** is LGPL-3.0 — linkable, but only worth it if we ever engrave real notation.

---

## 11. Roadmap

Nine milestones, each ending in something demonstrable. Durations assume one experienced developer working steadily; ranges because the groove work is genuinely uncertain.

### M0 — Spike: prove the two risks · *1 wk*
Throwaway code, one goal: parse a real 1400-song playlist and get a bar of swing drums and walking bass out of Web Audio. Answers "is the format what the docs say" and "does the audio path work on my target devices" before any architecture exists.
**Done when:** a downloaded playlist parses with zero exceptions, its song titles print, and a 4-bar loop plays in Chrome, Safari and on iOS.

### M1 — Format package · *1–2 wk*
Real `ireal-format`: extraction, unscrambling, tokenizer, cell model, typed output. Golden-file tests against several thousand songs.
**Done when:** the full corpus parses with no errors and no unrecognized tokens, and cell-array snapshots are locked in CI.

### M2 — Song model, timing, unrolling · *1–2 wk*
Cells to bars, the beat-distribution rules, transposition, and the unroller with repeats, endings and jumps. Plus the timemap.
**Done when:** every bar in the corpus sums to its meter, and hand-written fixtures for nested repeats and D.S. al Coda produce the exact expected bar sequences.

### M3 — Renderer and library · *2–3 wk*
The chart view with fonts, sections, endings, marks, transposition and display options. Import flows, IndexedDB, search, playlists. First genuinely useful build.
**Done when:** twenty charts rendered side by side with iReal Pro screenshots are visually equivalent, and print output is gig-usable.

### M4 — Playback v1, one groove done properly · *3–4 wk*
Transport, scheduler, SoundFont backend, event generation, playhead sync, count-in, repeat count. Medium Swing only, but finished: walking bass, ride patterns with fills, voice-led comping.
**Done when:** you'd choose it over iReal Pro to practise a blues, and timing holds with no audible drift over a ten-minute play.

### M5 — Groove library and mixer · *2–3 wk*
Generalize into groove packs, author ~15 styles across jazz, latin and pop. Mixer with instrument swap, levels, reverb, embellishments.
**Done when:** a new groove ships as a JSON file with no code change, and every style has intro, fill and ending behaviour.

### M6 — Editor and practice tools · *3 wk*
Full cell editing, chord keypad, bar and mark tools, undo/redo, live validation. A/B loop, tempo ramp, key cycling, chord diagrams, gig mode, PDF.
**Done when:** a chart can be authored start to finish on a phone and plays back correctly.

### M7 — Export and round-trip · *1–2 wk*
The encoder, MusicXML emitter, MIDI writer, share links.
**Done when:** `encode(decode(x)) === x` across the whole corpus, and an exported chart imports cleanly into iReal Pro itself.

### M8 — Harden and ship · *2 wk*
PWA install, offline asset strategy, iOS audio quirks, performance budgets, accessibility pass, error reporting.
**Done when:** the app works with the network off on a mid-range Android phone, cold start to first chart under two seconds.

**Total to v1: roughly 18–22 weeks.** M4 and M5 carry nearly all the schedule risk; the format milestones are close to fixed-cost.

---

## 12. Testing

**Corpus tests.** Community playlists (jazz, blues, pop, dixieland — thousands of songs) are the parser's real test suite. Fetch them at test-setup time into a git-ignored `fixtures/` directory rather than committing them; they are user-contributed transcriptions of copyrighted songs and don't belong in the repo. Assert: no exceptions, no unrecognized tokens, every measure's beats sum to its meter, every repeat bracket closes.

**Round-trip tests.** Decode → encode → decode over the corpus, asserting byte-identical payloads. The single most valuable test in the project: it's what lets users trust the app with charts they've spent years building.

**Rendering.** Playwright screenshot regression on a fixed set of ~30 charts chosen to cover every layout feature — odd meters, three endings, coda inside a repeat, dense 16-cell rows, vertical spacers, long comments.

**Audio.** Don't compare waveforms. Seed the humanization RNG, render the event stream for a fixture song + groove, and snapshot the *event list* (pitch, time, duration, velocity, part). Deterministic, readable diffs, catches real regressions. Separately, an `OfflineAudioContext` render asserts no clipping and no silent parts.

**Performance budgets, enforced in CI:**

- Parse a 1400-song playlist: < 3 s
- Chart render after selection: < 100 ms
- Play button to first audible note: < 150 ms (assets warm)
- Playhead: steady 60 fps, no scheduler jank

---

## 13. Risks and legal footing

| Risk | Severity | Mitigation |
|---|---|---|
| Grooves sound mechanical — technically complete but nobody wants to play with it | **High** | Finish one groove to a musician's standard in M4 before generalizing. Get a working jazz player to A/B it against iReal Pro. |
| Sample assets too large for mobile | Medium | Per-instrument lazy loading, aggressive SF2 subsetting, Cache Storage, a "lite" sound set as default on metered connections. |
| iOS Safari audio: unlock gestures, sample-rate switching on headphone connect, background suspension | Medium | Test on real hardware from M0. Recreate the AudioContext on rate change; hold a wake lock during playback. |
| Format edge cases corrupt user charts on export | Medium | Corpus round-trip in CI; never overwrite an imported original; keep the raw payload forever. |
| iReal Pro changes its format | Low | The scheme has been stable for over a decade; keep the decoder isolated in one package so a change is a contained fix. |
| Scope drift into notation editing | Medium | Chord charts only. Melody rendering is explicitly post-v1. |

### Legal footing

Not legal advice — but the shape of it is well established, and the following keeps the project on solid ground:

- **Reading the format is fine.** Reverse engineering a file format for interoperability is broadly lawful in both the US and EU, and a file layout isn't itself copyrightable. The algorithm in §2 is already public in multiple open-source projects.
- **Ship nothing of theirs.** No samples, no groove patterns, no fonts, no artwork, no strings lifted from the app. Everything in the audio path is authored or permissively licensed.
- **Don't use the trademark.** "iReal Pro" appears only in factual statements about compatibility — "imports iReal Pro playlists" — never in the product name, icon or branding.
- **Don't host charts.** Import-only, local-first. Chord progressions themselves aren't protectable, but a searchable library of transcribed charts for copyrighted songs is a different argument, and one worth not having.
- **Watch dependency licenses.** Per §10: GPL in the parser or the groove data relicenses the whole app.

---

## 14. Repo layout and week one

```
unRealChart/
├─ packages/
│  ├─ ireal-format/     decode · unscramble · tokenize · encode
│  ├─ song-model/       bars · timing · transpose · unroll · timemap
│  ├─ chart-render/     grid layout · fonts · print stylesheet
│  ├─ groove-engine/    generators · voicings · scheduler
│  ├─ audio-host/       transport · instruments · mixer
│  └─ grooves/          JSON packs + pattern library + schema
├─ apps/
│  └─ web/              React app
├─ fixtures/            git-ignored corpus; fetched by test setup
├─ docs/
│  ├─ ireal-format.md   §2 of this plan, as the living spec
│  └─ groove-authoring.md
└─ tools/
   └─ groove-preview/   CLI: render a groove to MIDI for fast iteration
```

### The first week, concretely

1. `git init`, pnpm workspace, TypeScript strict, Vitest, Vite app shell, CI on push.
2. Write `docs/ireal-format.md` from §2 — the spec you'll reread fifty times.
3. Implement extraction + `unscramble` + the song-record split. Test against a hand-checked single song first, then a full playlist.
4. Implement the tokenizer and cell folding. Print a parsed chart as plain text and eyeball it against the app.
5. Download the large community playlists into `fixtures/`; write the "parses without error" corpus test. Expect it to fail interestingly — that's the point.
6. In parallel, a scratch page that loads a SoundFont and plays a scheduled 4-bar swing loop. Confirm on iOS before trusting anything.

By the end of week one you should be able to answer: how many songs in a real corpus fail to parse, and does audio work on every device you care about. Both answers shape everything after.

---

## 15. Appendix — token cheat sheet

| Token | Meaning | Token | Meaning |
|---|---|---|---|
| `T44` | Time signature (`T12` = 12/8) | `[` `]` | Opening / closing double barline |
| `*A` | Section marker (also `*i`, `*v`) | `{` `}` | Repeat brackets |
| `N1` `N2` | Ending bracket — covers one bar | `\|` `LZ` | Normal barline |
| `S` | Segno | `Z` | Final double barline |
| `Q` | Coda | `x` / `Kcl` | Repeat previous bar |
| `U` | End | `r` | Repeat previous two bars |
| `f` | Fermata | `p` | Repeat previous chord (slash) |
| `Y` | Vertical spacer | `n` | N.C. |
| `s` / `l` | Small / normal chord size (sticky) | `W` | Invisible root (bass note only) |
| `XyQ` | Three spaces (alignment) | `(…)` | Alternate chord, printed small above |
| `<…>` | Comment or repeat directive | `,` | Separator, discard |

**Repeat directives found inside comments:** `D.C. al Coda`, `D.C. al Fine`, `D.C. al 1st/2nd/3rd End.`, `D.S. al Coda`, `D.S. al Fine`, `D.S. al 1st/2nd/3rd End.`, `Fine`, and multipliers `3x` through `8x`.

**Chord vocabulary.** Roots and bass notes span `Cb` to `B` with both accidentals. Qualities are a closed set of ~60 symbols:

```
^7  -7  7  7sus  ^  -  7alt  sus  6  -6  o7  ø7  ^9  -9  9sus  ^13  -11  13
13sus  6/9  -6/9  -^7  -^9  ^7#11  ^9#11  -b6  -#5  ^7#5  add9  -7b5  ø9  2  5
+  o  ø  7b9  7#9  7b5  7#5  7b13  7#11  9#11  13#11  11  7b9sus  7b13sus
7add3sus  9b5  9#5  13b9  13#9  7b9b13  7b9#5  7b9b5  7b9#9  7#9#5  7#9b5
7#9#11  7b9#11
```

Enumerate this list once in `docs/ireal-format.md` and drive the editor's quality keypad from it, so the two can never disagree.

**Styles (display), 24 values:** Afoxe, Afro, Baião, Ballad, Bossa Nova, Chacarera, Even 8ths, Funk, Latin, Medium Swing, Medium Up Swing, Pop, Pop Ballad, Reggae, RnB, Rock, Rock Pop, Samba, Samba Funk, Shuffle, Slow Bossa, Slow Swing, Up Tempo Swing, Waltz.

**Grooves (playback)** are a separate, larger set grouped Jazz / Latin / Pop — e.g. Afro 12/8, Ballad Swing, Bossa Nova, Doo Doo Cats, Gypsy Jazz, Second Line, Trad Jazz; Argentina: Tango, Brazil: Samba, Cuba: Son Montuno 2-3; Bluegrass, Country, Disco, Glam Funk, House, Rock 12/8, Smooth, Soul, Virtual Funk. The style/groove distinction matters: **style** is a display label used for sorting, **groove** is what the player actually uses.

---

## References

Format & prior art
- [iReal Pro format and model documentation](https://github.com/infojunkie/ireal-musicxml/blob/main/doc/irealpro.md)
- [daumling/ireal-renderer](https://github.com/daumling/ireal-renderer) — MIT, the parser lineage to build on
- [infojunkie/ireal-musicxml](https://github.com/infojunkie/ireal-musicxml) — GPL-3.0, most complete reference (read, don't depend)
- [Emulating the iReal Pro playback model](https://blog.karimratib.me/2020/11/30/ireal-musicxml.html)
- [iReal Pro custom chord chart protocol](https://www.irealpro.com/ireal-pro-custom-chord-chart-protocol/)
- [sciurius/perl-Data-iRealPro](https://github.com/sciurius/perl-Data-iRealPro) — independent implementation, useful cross-check

Accompaniment prior art
- [musicxml-midi](https://github.com/infojunkie/musicxml-midi) — the MMA groove approach
- [musicxml-player](https://github.com/infojunkie/musicxml-player) — score/audio synchronization
- [JJazzLab](https://www.jjazzlab.org/en/) — open-source rhythm engine built on Yamaha styles
- [MaxHilsdorf/Walking-Bass-Generator](https://github.com/MaxHilsdorf/Walking-Bass-Generator) — algorithmic walking bass reference

Libraries & assets
- [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) — Apache-2.0 SF2/DLS synth
- [smplr](https://github.com/danigb/smplr) — MIT web audio sampler
- [chord-symbol](https://github.com/no-chris/chord-symbol) — MIT chord parser/renderer
- [Tone.js](https://github.com/Tonejs/Tone.js) — MIT, fallback for the transport
- [Petaluma fonts](https://github.com/steinbergmedia/petaluma) — SIL OFL
- [Verovio](https://github.com/rism-digital/verovio) — LGPL-3.0, only if real engraving is ever needed
