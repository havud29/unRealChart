import { describe, expect, it } from 'vitest';
import { chordNoteNames } from '../src/index.js';

const C = 0, F = 5, Bb = 10, D = 2, A = 9, Eb = 3;

/**
 * Naming the notes of a chord.
 *
 * Spelling is not arithmetic. The third of C minor is an E of some kind, so it
 * is E flat and never D sharp: a chord is built in thirds and each degree takes
 * the next letter but one. Spelled by pitch class alone `C-7` comes out as
 * `C D# G A#` — the same sound and the wrong chord on the page.
 */
describe('chord note names', () => {
  it('names a minor seventh with flats, by degree', () => {
    expect(chordNoteNames(C, '-7')).toEqual(['C', 'E♭', 'G', 'B♭']);
  });

  it('names a plain major triad', () => {
    expect(chordNoteNames(C, '')).toEqual(['C', 'E', 'G']);
  });

  it('names a dominant seventh', () => {
    expect(chordNoteNames(F, '7')).toEqual(['F', 'A', 'C', 'E♭']);
  });

  it('names a major seventh', () => {
    expect(chordNoteNames(Bb, '^7')).toEqual(['B♭', 'D', 'F', 'A']);
  });

  it('names a half-diminished chord', () => {
    // D half-diminished is D F A♭ C — the fifth is a flattened A, not a G♯.
    expect(chordNoteNames(D, '-7b5')).toEqual(['D', 'F', 'A♭', 'C']);
  });

  it('puts a slash bass first, where it sounds', () => {
    expect(chordNoteNames(C, '^7', A)).toEqual(['A', 'C', 'E', 'G', 'B']);
  });

  it('leaves the bass out when it is the root', () => {
    expect(chordNoteNames(Eb, '', Eb)).toEqual(['E♭', 'G', 'B♭']);
  });

  it('never writes a bare letter twice in one chord', () => {
    // Two notes on the same letter is the signature of arithmetic spelling.
    for (const quality of ['', '-7', '7', '^7', '-7b5', 'o7', '7b9', '^9']) {
      for (let root = 0; root < 12; root++) {
        const letters = chordNoteNames(root, quality).map((n) => n[0]);
        expect(new Set(letters).size, `${root} ${quality}: ${letters.join('')}`).toBe(
          letters.length,
        );
      }
    }
  });
});

describe('nine semitones is two different notes', () => {
  /**
   * The interval does not name the note; the chord does. Nine semitones above
   * B flat is the sixth of a six-nine chord (G) and the diminished seventh of
   * a diminished chord (A double flat). Reading it as a seventh either way
   * spelled `Bb6/9` as `Bb D F Abb C`.
   */
  it('names the sixth of a six-nine chord', () => {
    expect(chordNoteNames(Bb, '69')).toEqual(['B♭', 'D', 'F', 'G', 'C']);
  });

  it('names a plain sixth chord', () => {
    expect(chordNoteNames(C, '6')).toEqual(['C', 'E', 'G', 'A']);
  });

  it('still names the diminished seventh as a seventh', () => {
    expect(chordNoteNames(C, 'o7')).toEqual(['C', 'E♭', 'G♭', 'B♭♭']);
  });

  it('leaves the minor seventh alone', () => {
    expect(chordNoteNames(C, '-7')).toEqual(['C', 'E♭', 'G', 'B♭']);
  });
});
