/**
 * Data shapes for the iReal Pro wire format.
 *
 * These mirror the format exactly, warts and all. Normalization into a musical
 * model (bars, beats, sections) is the job of `song-model` — deliberately not
 * this package, so round-trip fidelity is never lost to a convenience.
 *
 * See docs/ireal-format.md for the format spec these types encode.
 */

export type Scheme = 'irealb' | 'irealbook';

/**
 * A chord as written in a cell. `note` is a root name, or one of the
 * pseudo-roots the format uses in the root slot:
 *
 * - `' '` — no chord, cell carries only a bass note or alternate
 * - `'n'` — N.C.
 * - `'W'` — invisible root (bass note shown alone)
 * - `'p'` — repeat previous chord (renders as a slash)
 * - `'x'` — repeat previous bar
 * - `'r'` — repeat previous two bars
 */
export interface Chord {
  /** Root note (`C`, `Bb`, `F#`) or a pseudo-root: ` `, `n`, `W`, `p`, `x`, `r`. */
  note: string;
  /** Quality and extensions exactly as written: `^7`, `-7b5`, `7b9#11`, `sus`. */
  modifiers: string;
  /**
   * The user's own note on the chord, written `*like this*` in the payload.
   *
   * Kept apart from `modifiers` because it is not part of the harmony — folding
   * it in gives you a chord whose quality is `..........`, which no voicing
   * engine can make sense of.
   */
  text: string | null;
  /** Bass note for slash chords, as its own Chord. `null` when absent. */
  over: Chord | null;
  /** Alternate chord, printed small above the main one. `null` when absent. */
  alternate: Chord | null;
}

/**
 * One cell of the 16-per-row grid. A cell is NOT a beat — barlines attach to
 * cells without consuming them, so a bar may span any number of cells.
 */
export interface Cell {
  /**
   * Annotations attached to this cell, raw:
   * `*A` section, `T44` time signature, `N1` ending, `S` segno, `Q` coda,
   * `U` end, `f` fermata, `s`/`l` small/normal chord size.
   */
  annots: string[];
  /** Comment / repeat-directive text, with the angle brackets stripped. */
  comments: string[];
  /**
   * Barline markers for this cell, concatenated. Uses the tokenizer's internal
   * vocabulary: `[` `{` open, `]` `}` `Z` close, `(` `)` single barline
   * open/close. See `foldCells` for why single bars get their own pair.
   */
  bars: string;
  /** Number of vertical spacer tokens (`Y`) stacked above this cell. */
  spacer: number;
  /** The chord in this cell, or `null` if empty. */
  chord: Chord | null;
}

/** A song record as it appears in the wire format, plus its decoded cells. */
export interface Song {
  title: string;
  composer: string;
  /** Display style, used by iReal Pro for sorting. e.g. `Medium Swing`. */
  style: string;
  /** Key signature. Minor keys carry a trailing `-`, e.g. `F-`. */
  key: string;
  /** Chart transposition in semitones. */
  transpose: number;
  /** Playback groove. Empty on many older charts — fall back to `style`. */
  groove: string;
  /** Beats per minute. 0 when unset. */
  bpm: number;
  /** Chorus repeat count. Defaults to 3 when unset. */
  repeats: number;
  /** The unscrambled, substituted chord payload. Source of `cells`. */
  music: string;
  /** The raw payload exactly as it arrived, before unscrambling. */
  raw: string;
  /**
   * The complete `=`-delimited record this song was parsed from, verbatim.
   *
   * Field parsing is not idempotent — a two-word composer is stored last name
   * first, so re-encoding the *parsed* name and reading it back reverses it a
   * second time. Keeping the original means a stored song reparses to exactly
   * what was imported, and it is what export re-emits.
   *
   * Multi-part songs keep their parts joined by `===`, so reparsing re-merges.
   */
  record: string;
  cells: Cell[];
}

export interface Playlist {
  /** Playlist name, or `null` for a single shared song. */
  name: string | null;
  scheme: Scheme;
  songs: Song[];
  /** Songs that failed to parse, kept so import can report rather than silently drop. */
  failures: ParseFailure[];
}

export interface ParseFailure {
  /** Best-effort title, recovered from the record's first field. */
  title: string;
  message: string;
  /** The record that failed, so it can be inspected or re-tried later. */
  record: string;
}
