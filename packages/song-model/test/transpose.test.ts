import { describe, expect, it } from 'vitest';
import {
  accidentalsFor,
  chordSymbol,
  intervalBetweenKeys,
  pitchClass,
  transposeKey,
  transposeModel,
  transposeNote,
} from '../src/index.js';
import { chartText, model } from './helpers.js';

describe('pitch classes', () => {
  it('reads note names', () => {
    expect(pitchClass('C')).toBe(0);
    expect(pitchClass('B#')).toBe(0);
    expect(pitchClass('Cb')).toBe(11);
    expect(pitchClass('Eb')).toBe(3);
    expect(pitchClass('F#')).toBe(6);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(pitchClass('H')).toBeNull();
    expect(pitchClass('')).toBeNull();
  });
});

describe('key spelling', () => {
  it('knows which keys use sharps', () => {
    expect(accidentalsFor('G')).toBe('sharp');
    expect(accidentalsFor('E')).toBe('sharp');
    expect(accidentalsFor('B-')).toBe('sharp');
    expect(accidentalsFor('F')).toBe('flat');
    expect(accidentalsFor('Eb')).toBe('flat');
    expect(accidentalsFor('C-')).toBe('flat');
  });

  it('defaults C major and A minor to flats, as jazz charts do', () => {
    expect(accidentalsFor('C')).toBe('flat');
    expect(accidentalsFor('A-')).toBe('flat');
  });

  it('transposes to keys iReal Pro accepts, never to C# or D#', () => {
    expect(transposeKey('C', 1)).toBe('Db');
    expect(transposeKey('C', 6)).toBe('Gb');
    expect(transposeKey('F', 2)).toBe('G');
    expect(transposeKey('A-', 3)).toBe('C-');
    expect(transposeKey('F-', 1)).toBe('F#-');
  });

  it('wraps at the octave', () => {
    expect(transposeKey('Bb', 2)).toBe('C');
  });
});

describe('note transposition', () => {
  it('spells for the destination key, not by fixed preference', () => {
    // Up a semitone into F# major must give A#, not Bb.
    expect(transposeNote('A', 1, 'F#')).toBe('A#');
    expect(transposeNote('A', 1, 'Gb')).toBe('Bb');
  });

  it('leaves unparseable input alone', () => {
    expect(transposeNote('N.C.', 2, 'C')).toBe('N.C.');
  });
});

describe('transposeModel', () => {
  it('moves every chord and the key together', () => {
    const m = transposeModel(model('[T44C^7   |A-7 D-7 |G7   |C6   Z', { key: 'C' }), 2);
    expect(m.meta.key).toBe('D');
    expect(chartText(m)).toBe('D^7 | B-7 E-7 | A7 | D6');
  });

  it('moves bass notes too', () => {
    const m = transposeModel(model('[T44C^7/G   Z', { key: 'C' }), 5);
    expect(chartText(m)).toBe('F^7/C');
  });

  it('moves alternate chords', () => {
    const m = transposeModel(model('[T44C^7(A-7)   Z', { key: 'C' }), 2);
    expect(m.bars[0]!.chords[0]!.alternate?.root).toBe('B');
  });

  it('leaves N.C. alone', () => {
    expect(chartText(transposeModel(model('[T44n   Z'), 3))).toBe('N.C.');
  });

  it('returns the same object for a no-op, so React can skip the render', () => {
    const m = model('[T44C^7   Z');
    expect(transposeModel(m, 0)).toBe(m);
    expect(transposeModel(m, 12)).toBe(m);
  });

  it('is absolute: transposing a transposed model works from the original', () => {
    const original = model('[T44C^7   |F#-7b5 B7 |E-7   Z', { key: 'C' });
    const up1 = transposeModel(original, 1);
    // +2 applied to the +1 copy means +2 from the original, not +3.
    expect(transposeModel(up1, 2)).toEqual(transposeModel(original, 2));
    expect(transposeModel(up1, 0)).toBe(original);
  });

  it('does not drift, however far a chart is moved around and back', () => {
    // A chart in C may legitimately spell F#-7b5 with a sharp. Re-spelling from
    // an already-transposed copy would turn it into Gb-7b5 on the way home.
    const original = model('[T44C^7   |F#-7b5 B7 |E-7   Z', { key: 'C' });
    let current = original;
    for (let n = 1; n < 12; n++) {
      current = transposeModel(current, n);
      expect(current.meta.key, `at +${n}`).toBe(transposeKey('C', n));
    }
    const home = transposeModel(current, 0);
    expect(home.meta.key).toBe('C');
    expect(chartText(home)).toBe(chartText(original));
    expect(chartText(home)).toContain('F#-7b5');
  });
});

describe('helpers', () => {
  it('measures the interval between keys', () => {
    expect(intervalBetweenKeys('C', 'Eb')).toBe(3);
    expect(intervalBetweenKeys('G', 'F')).toBe(10);
    expect(intervalBetweenKeys('F-', 'G-')).toBe(2);
  });

  it('rebuilds a written symbol', () => {
    expect(chordSymbol({ root: 'C', quality: '^7', bass: 'G' })).toBe('C^7/G');
    expect(chordSymbol({ root: 'F', quality: '-7b5', bass: null })).toBe('F-7b5');
  });
});
