/**
 * The musical model: bars, beats and structure, derived from the cell grid.
 *
 * The grid model in `ireal-format` is what the user authored and what gets
 * exported. This is what the player and the analysis tools read. Keeping them
 * separate is what lets export stay byte-identical while playback gets to
 * resolve durations, expand repeats and transpose freely.
 */

export interface TimeSignature {
  beats: number;
  beatType: number;
  /**
   * How many beats one grid cell is worth. iReal's grid is a layout device, not
   * a rhythmic one, so this differs per meter: ½ for 3/4 and 3/2, 3 for 12/8,
   * 1 everywhere else.
   */
  beatUnit: number;
}

export type ChordKind =
  | 'chord' // an ordinary written chord
  | 'nc' // N.C.
  | 'repeat'; // `p` — repeat the previous chord, drawn as a slash

export interface ChordSpelling {
  /** Root note, or null for N.C. and invisible-root cells. */
  root: string | null;
  /** Quality and extensions exactly as written: `^7`, `-7b5`, `13sus`. */
  quality: string;
  /** Bass note for slash chords. */
  bass: string | null;
}

export interface BarChord extends ChordSpelling {
  kind: ChordKind;
  /** Resolved duration in beats. May be fractional in meters where beatUnit is ½. */
  beats: number;
  /** Written small — always one beat, never absorbs padding. */
  small: boolean;
  fermata: boolean;
  /** Alternate chord, printed small above this one. */
  alternate: ChordSpelling | null;
}

export type BarlineOpen = 'none' | 'single' | 'double' | 'repeat';
export type BarlineClose = 'none' | 'single' | 'double' | 'repeat' | 'final';

export type Directive =
  | { type: 'dc'; target: 'start' | 'coda' | 'fine' | 'ending'; ending?: number }
  | { type: 'ds'; target: 'start' | 'coda' | 'fine' | 'ending'; ending?: number }
  | { type: 'fine' }
  | { type: 'times'; count: number };

export interface Bar {
  index: number;
  time: TimeSignature;
  chords: BarChord[];
  open: BarlineOpen;
  close: BarlineClose;
  /** Section letter this bar starts, e.g. `A`, `B`, `i` (intro), `v` (verse). */
  section: string | null;
  /** Which repeat ending this bar belongs to, if any. */
  ending: number | null;
  segno: boolean;
  coda: boolean;
  end: boolean;
  /** Free text found on this bar, brackets already stripped. */
  comments: string[];
  directives: Directive[];
  /** Source cell range `[start, end)`, so the renderer can map a bar back. */
  cells: [number, number];
}

export interface Section {
  name: string;
  startBar: number;
  /** Exclusive. */
  endBar: number;
}

export type WarningCode =
  | 'too-many-chords'
  | 'empty-bar'
  | 'unclosed-repeat'
  | 'unmatched-repeat-close'
  | 'no-previous-bar'
  | 'unknown-meter'
  | 'jump-target-missing'
  | 'unroll-budget-exceeded';

export interface ModelWarning {
  code: WarningCode;
  message: string;
  /** Bar index the warning concerns, when it has one. */
  bar?: number;
}

export interface SongModel {
  meta: SongMeta;
  bars: Bar[];
  sections: Section[];
  warnings: ModelWarning[];
  /** Semitones this model has been transposed from its source. */
  transposedBy?: number;
  /**
   * The untransposed model, carried so every transposition is computed from the
   * original spelling rather than from an already-transposed one. Without it a
   * chart taken up a semitone and back returns with `F#-7b5` respelled as
   * `Gb-7b5` — correct pitches, wrong notation.
   */
  origin?: SongModel;
}

export interface SongMeta {
  title: string;
  composer: string;
  style: string;
  key: string;
  groove: string;
  bpm: number;
  repeats: number;
  transpose: number;
}

/** One bar of the flattened play order. */
export interface UnrolledBar {
  /** Position in the unrolled sequence. */
  index: number;
  /** Index into `SongModel.bars` — what the playhead highlights. */
  sourceIndex: number;
  bar: Bar;
  /** 0-based chorus number. */
  chorus: number;
}

export interface TimemapEntry {
  index: number;
  sourceIndex: number;
  chorus: number;
  startMs: number;
  durationMs: number;
}
