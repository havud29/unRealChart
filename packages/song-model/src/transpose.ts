import { accidentalsFor, pitchClass, spell, transposeKey } from './pitch.js';
import type { Bar, ChordSpelling, SongModel } from './types.js';

/**
 * Transposition.
 *
 * Always transpose from the stored original, never from what is currently on
 * screen — compounding transpositions accumulates enharmonic drift, so a chart
 * taken up a tone and back down again would come back spelled differently.
 * `transposeModel` therefore takes an absolute offset, not a relative one.
 */

function transposeSpelling(
  spelling: ChordSpelling,
  semitones: number,
  destinationKey: string,
): ChordSpelling {
  const accidentals = accidentalsFor(destinationKey);
  const move = (note: string | null): string | null => {
    if (note === null) return null;
    // Bass notes arrive as a root plus any modifiers, e.g. `Bb` or `G`.
    const match = /^([A-G](?:bb|##|[b#])?)(.*)$/.exec(note);
    if (!match) return note;
    const pc = pitchClass(match[1]!);
    if (pc === null) return note;
    return spell(pc + semitones, accidentals) + match[2];
  };
  return { root: move(spelling.root), quality: spelling.quality, bass: move(spelling.bass) };
}

/**
 * Return the model sounding `semitones` above its **original** key.
 *
 * The offset is absolute, not relative: passing an already-transposed model
 * transposes its source, never the transposed copy. That is what keeps
 * `F#-7b5` from drifting to `Gb-7b5` when a chart is moved around the cycle and
 * back. `transposeModel(m, 0)` therefore returns the untouched original, and
 * returns it by identity so React can skip the render.
 */
export function transposeModel(model: SongModel, semitones: number): SongModel {
  const source = model.origin ?? model;
  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return source;

  const key = transposeKey(source.meta.key, shift);

  const bars: Bar[] = source.bars.map((bar) => ({
    ...bar,
    chords: bar.chords.map((chord) => ({
      ...chord,
      ...transposeSpelling(chord, shift, key),
      alternate: chord.alternate ? transposeSpelling(chord.alternate, shift, key) : null,
    })),
  }));

  return {
    ...source,
    meta: { ...source.meta, key },
    bars,
    transposedBy: shift,
    origin: source,
  };
}

/** Semitones from a source key to a destination key, always 0–11. */
export function intervalBetweenKeys(from: string, to: string): number {
  const a = pitchClass(from.replace(/-$/, ''));
  const b = pitchClass(to.replace(/-$/, ''));
  if (a === null || b === null) return 0;
  return (((b - a) % 12) + 12) % 12;
}

/**
 * Concert-pitch offsets for transposing instruments. A B♭ instrument reads a
 * tone above concert, so its part is written up two semitones.
 */
export const INSTRUMENT_OFFSETS = {
  C: 0,
  Bb: 2,
  Eb: 9,
  F: 7,
  G: 5,
} as const;

export type InstrumentKey = keyof typeof INSTRUMENT_OFFSETS;

/** The written symbol for a chord, rebuilt from its parts. */
export function chordSymbol(chord: ChordSpelling & { kind?: string }): string {
  if (chord.kind === 'nc') return 'N.C.';
  if (chord.kind === 'repeat') return '%';
  const head = chord.root ? chord.root + chord.quality : '';
  return chord.bass ? `${head}/${chord.bass}` : head;
}
