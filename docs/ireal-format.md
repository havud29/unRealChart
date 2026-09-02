# The iReal Pro format

Reverse-engineered spec, verified against 2200 community charts. This is the
document `packages/ireal-format` implements — when the code and this file
disagree, one of them is a bug.

Sources: [format notes](https://github.com/infojunkie/ireal-musicxml/blob/main/doc/irealpro.md),
[ireal-renderer](https://github.com/daumling/ireal-renderer) (MIT),
[Data::iRealPro](https://github.com/sciurius/perl-Data-iRealPro).

> **Licensing.** `ireal-musicxml` is GPL-3.0 — read it, don't depend on it.
> The lineage we build from is `ireal-renderer` / `ireal-reader`, both MIT.

---

## 1. Container

Charts travel as a URI. Two generations:

| Scheme | Payload |
|---|---|
| `irealbook://` | Legacy. Plain text after URL-decoding. |
| `irealb://` | Current. Chord payload is position-scrambled with substitutions. |

Users normally hand us the **HTML file** the app shares. It is plain XHTML whose
only interesting element is an anchor whose `href` is the URI. No HTML parsing
is needed — one regex over the whole file covers HTML exports, `.txt` dumps and
pasted URIs alike:

```
/(irealb(?:ook)?):\/\/([^"\r\n]*)/
```

Only `"` and a line break may terminate the payload. **Apostrophes cannot** —
titles such as `'S Wonderful` arrive with the apostrophe unencoded, and
excluding it truncates the payload to nothing. (This cost us a whole corpus file
during M1.)

URL-decode, then split:

```
records = payload.split("===")
```

A playlist carries its **name as the final segment**; a single shared song does
not. The name segment contains no `=`, which is how the two are told apart after
dropping trailing empties.

## 2. Song record

Fields are `=`-delimited. Positions differ per scheme, and the modern one has
empty slots that must not be re-indexed away.

| Index | `irealb://` | `irealbook://` |
|---|---|---|
| 0 | Title | Title |
| 1 | Composer | Composer |
| 2 | *(empty)* | Style |
| 3 | Style (display) | Key |
| 4 | Key | unused (`n`) |
| 5 | Transpose (semitones) | **Chord payload**, plain |
| 6 | **Chord payload**, after marker `1r34LbKcu7` | — |
| 7 | Groove (playback style) | — |
| 8 | BPM | — |
| 9 | Repeat count (default 3) | — |

Both schemes share two field quirks:

- **Title** is stored sort-first: `Gentle Rain, The` → `The Gentle Rain`.
- **Composer** is stored last-name-first, but *only when the name is exactly two
  words*. `Timmons Bobby` → `Bobby Timmons`; `Cedar Extra Name Walton` is left
  alone, reversed-looking or not. iReal Pro has the same behaviour.

Many charts leave `groove` empty — fall back to `style` for playback.

### Multi-part songs

Long charts are exported as **consecutive records whose titles differ only by a
part number**. Merge them by concatenating cells. Skipping this silently
truncates every long chart to its first page.

Our test: strip digits from both titles; if what remains is equal and non-empty
and the titles are not identical, it is a continuation.

## 3. Payload obfuscation (`irealb://` only)

Two independent transforms. Decoding applies them in this order:

**Step 1 — block permutation.** Walk the payload in 50-character blocks,
permuting each. A trailing block of 50 **or 51** characters is left alone.

```js
function obfusc50(s) {
  const a = s.split('');
  for (let i = 0;  i < 5;  i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  for (let i = 10; i < 24; i++) { a[49 - i] = s[i]; a[i] = s[49 - i]; }
  return a.join('');
}
```

Swaps indices `0..4 ↔ 45..49` and `10..23 ↔ 26..39`. Indices `5..9`, `24`, `25`
and `40..44` stay put. It swaps pairs, so it is an **involution** — the same
function encodes and decodes. This is what makes lossless export possible.

**Step 2 — substitutions**, all length-preserving:

| Encoded | Decoded |
|---|---|
| `Kcl` | `\| x` |
| `LZ` | `&nbsp;\|` |
| `XyQ` | three spaces |

Because every transform preserves length, block boundaries land in the same
places in both directions.

### Re-encoding

Collapse the substitutions **first**, then permute. Collapsing is genuinely
ambiguous where patterns overlap (`"  | x"` reads two ways); scanning left to
right with the preference order `| x`, three-spaces, ` |` reproduces iReal Pro's
own output on every song in the corpus.

One empirical quirk, undocumented anywhere and found by measuring:

> A chart ending in **exactly three spaces followed by its final barline, with
> nothing after it**, keeps those spaces literal. iReal Pro does not encode that
> last padding run as `XyQ`.

Honouring it takes byte-identical round-trip from 95.15% to **100%** across 2199
scrambled songs. Without it, exports are still musically identical — just not
byte-for-byte what iReal Pro would have written.

**Always keep the original payload.** Re-emit it verbatim for an unedited chart;
only re-encode when the user actually changed something.

## 4. The cell grid

A chart is a flat stream of **cells**, laid out 16 to a row. A cell holds at
most one chord plus annotations, barline markers and comments.

**A cell is not a beat.** Barlines attach to cells without consuming them, so a
bar spans any number of cells.

```
raw     [C^7   |A-7 D-7 |G7   |C6   ]

cell     0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
        ┃C△7  ·    ·    ·   │A-7  ·   D-7   ·   │G7   ·    ·    ·   │C6   ·    ·    ·
beats    1    2    3    4    1    2    3    4    1 —————————— 4    1 —————————— 4
```

### Tokenizing

Greedy, ordered, first match wins. Unmatched characters fall through as
single-character tokens; commas are discarded as pure separators.

```
/^\*[a-zA-Z]/    section marker: *A, *B, *i (intro), *v (verse)
/^T\d\d/         time signature: T44, T34, T12 (= 12/8)
/^N./            ending bracket: N1, N2, N3
/^<.*?>/         comment or repeat directive; a *yy prefix is a vertical offset
/^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\*.+?\*)*(\/[A-G][#b]?)?(\(.*?\))?/
                 chord: root, quality, private text, bass note, alternate
/^([ Wp])()()(\/[A-G][#b]?)?(\(.*?\))?/
                 space, W (invisible root), p (repeat previous chord)
```

A second pass folds tokens into cells. Only chords and spaces advance the cell
cursor; **barlines, annotations and comments attach to the cell they are found
in**. In practice charts write a directive *before* the chord it applies to
(`<D.S. al Fine>C7b9`), which is why that ordering matters.

Barlines use an internal vocabulary that splits a plain `|` into its two sides:
it closes the previous cell (`)`) and opens the current one (`(`). Double bars
and repeat brackets keep their own characters.

### Token reference

| Token | Meaning | Token | Meaning |
|---|---|---|---|
| `T44` | Time signature (`T12` = 12/8) | `[` `]` | Opening / closing double barline |
| `*A` | Section marker (also `*i`, `*v`) | `{` `}` | Repeat brackets |
| `N1` `N2` | Ending bracket — runs to the repeat sign | `\|` `LZ` | Normal barline |
| `S` | Segno | `Z` | Final double barline |
| `Q` | Coda | `x` / `Kcl` | Repeat previous bar |
| `U` | End | `r` | Repeat previous two bars (occupies two) |
| `f` | Fermata | `p` | Repeat previous chord (slash) |
| `Y` | Vertical spacer | `n` | N.C. |
| `s` / `l` | Small / normal chord size (sticky) | `W` | Invisible root (bass note only) |
| `XyQ` | Three spaces (alignment) | `(…)` | Alternate chord, printed small above |
| `<…>` | Comment or repeat directive | `,` | Separator, discard |

Repeat directives found inside comments: `D.C. al Coda`, `D.C. al Fine`,
`D.C. al 1st/2nd/3rd End.`, `D.S. al Coda`, `D.S. al Fine`,
`D.S. al 1st/2nd/3rd End.`, `Fine`, and multipliers `3x` through `8x`.

## 4b. Writing cells back out

The editor mutates cells and has to write them back, which is the inverse of
tokenizing. Three things are not obvious:

- **Spacers come before the barline.** `Y` clears the tokenizer's memory of the
  previous cell, which is what stops a following `|` from also closing the bar
  behind it. Write `|Y` instead of `Y|` and the chart grows a barline. The flip
  side: when the bar behind *was* closed and a spacer sits in the way, the
  closing `|` must be written explicitly.
- **Private text keeps its delimiters.** `B*solo*` is a B chord with a note on
  it; drop the asterisks and it reads back as a chord whose quality is `solo`.
- **A closing bracket supersedes a plain barline.** Setting `}` on a cell that a
  `|` already closed has to remove both halves of that `|`, or the cell ends up
  closed by two barlines at once — a state no chart parses into.

Byte-identity with iReal Pro's own writer is neither achievable nor needed: the
cell model does not record whether `*A[T44` was written with the section before
or after the barline. What holds, across every single-record chart in the
corpus, is that `tokenize(serialize(cells))` returns the same cells.

A multi-part song is the one exception, and inherently so: its cells are two
records concatenated, and the seam grows the barline that the two separate
parses never had. Editing one saves it as a single chart, which is correct.

## 5. Chord vocabulary

**Roots and bass notes:** `Cb C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B`
(the corpus also contains `E#` and `B#`).

**Qualities** — a closed set of about sixty:

```
^7  -7  7  7sus  ^  -  7alt  sus  6  -6  o7  ø7  ^9  -9  9sus  ^13  -11  13
13sus  6/9  -6/9  -^7  -^9  ^7#11  ^9#11  -b6  -#5  ^7#5  add9  -7b5  ø9  2  5
+  o  ø  7b9  7#9  7b5  7#5  7b13  7#11  9#11  13#11  11  7b9sus  7b13sus
7add3sus  9b5  9#5  13b9  13#9  7b9b13  7b9#5  7b9b5  7b9#9  7#9#5  7#9b5
7#9#11  7b9#11
```

Quality indicators: `^` major, `-` minor, `o` diminished, `ø` half-diminished
(also written `h` in the payload), `+` augmented, `b` flat, `#` sharp.

## 6. Timing — cells to beats

Not in any spec; derived by observing the app. Applied per measure once the bar
is closed. Implemented in `song-model`, recorded here so the format notes stay
in one place.

1. Every chord starts at **1 beat minimum**.
2. Empty cells *before* the first chord of the bar are discarded.
3. Every remaining empty cell counts as one beat, added to the preceding chord.
4. If the total *exceeds* the meter, walk the chords round-robin removing one
   absorbed space at a time until it fits.
5. If the total is *under* the meter, walk the chords round-robin adding a beat
   per pass — skipping chords marked small (`s`), which stay at one beat.
6. More chords than beats in a bar is a hard error; the editor must prevent it.

A per-meter scaling factor maps cells onto beats: `½` for 3/4 and 3/2, `3` for
12/8, `1` otherwise.

Two corrections to rule 5, both found by running the rules over the corpus:

- **`s` is a display size first.** Plenty of charts switch small chords on and
  never switch them back with `l`. When *every* chord in a bar is small there is
  no full-size chord to defer to, so they share the bar normally — otherwise
  1,272 bars across the corpus played as a single beat followed by silence.
- **A bar repeat must be refilled for its own meter.** Copying a 4/4 bar into a
  2/4 `x` verbatim leaves the copy twice as long as its bar.

### Endings, and what ends them

An ending bracket runs from its `Nx` marker until a repeat sign or the final
barline. A plain double barline does **not** end it — `]` is a section divider
and occurs happily inside a first ending. `N0` is not a zeroth ending: charts
use it to close the bracket so bars after a long final ending are not drawn
under it.

Meters: 2/4, 3/4, 4/4, 5/4, 6/4, 7/4, 3/8, 5/8, 6/8, 7/8, 9/8, 12/8, 2/2, 3/2.

## 7. Styles and grooves

**Style** is a display label used for sorting. **Groove** is what the player
actually uses. They are different fields and often differ in value.

Display styles (24): Afoxe, Afro, Baião, Ballad, Bossa Nova, Chacarera,
Even 8ths, Funk, Latin, Medium Swing, Medium Up Swing, Pop, Pop Ballad, Reggae,
RnB, Rock, Rock Pop, Samba, Samba Funk, Shuffle, Slow Bossa, Slow Swing,
Up Tempo Swing, Waltz.

Grooves are a larger set grouped Jazz / Latin / Pop — Afro 12/8, Ballad Swing,
Doo Doo Cats, Gypsy Jazz, Second Line, Trad Jazz; Argentina: Tango,
Brazil: Bossa Acoustic, Cuba: Son Montuno 2-3; Bluegrass, Country, Disco,
Glam Funk, House, Rock 12/8, Smooth, Soul, Virtual Funk, and others.

## 8. What the format does *not* contain

- **No groove data** — a style name string, nothing more.
- **No voicings** — chord symbols only.
- **No sounds** — no samples, instruments or mixer state.
- **No melody** — a real book without the tune.
- **No layout** beyond the 16-cell grid, spacers and chord-size flags.

Everything that makes playback sound good is ours to author.
