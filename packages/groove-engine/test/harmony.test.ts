import { describe, expect, it } from 'vitest';
import { chordTones, fold, midiOf, parsePitch } from '../src/harmony.js';

/** Intervals as scale-degree names, so failures read musically. */
const tones = (quality: string) => chordTones(quality).intervals.join(' ');

describe('chordTones — the common vocabulary', () => {
  it('reads triads', () => {
    expect(tones('')).toBe('0 4 7'); // major
    expect(tones('-')).toBe('0 3 7'); // minor
    expect(tones('+')).toBe('0 4 8'); // augmented
    expect(tones('o')).toBe('0 3 6'); // diminished
    expect(tones('5')).toBe('0 7'); // power chord
  });

  it('reads sevenths', () => {
    expect(tones('^7')).toBe('0 4 7 11'); // major 7
    expect(tones('7')).toBe('0 4 7 10'); // dominant 7
    expect(tones('-7')).toBe('0 3 7 10'); // minor 7
    expect(tones('o7')).toBe('0 3 6 9'); // diminished 7
    expect(tones('ø7')).toBe('0 3 6 10'); // half-diminished
    expect(tones('h7')).toBe('0 3 6 10'); // the payload spells ø as h
    expect(tones('-7b5')).toBe('0 3 6 10'); // same chord, written the other way
  });

  it('reads sixths', () => {
    expect(tones('6')).toBe('0 4 7 9');
    expect(tones('-6')).toBe('0 3 7 9');
    expect(tones('6/9')).toBe('0 4 7 9 14');
  });

  it('reads suspensions', () => {
    expect(tones('sus')).toBe('0 5 7'); // iReal's plain sus is sus4
    expect(tones('7sus')).toBe('0 5 7 10');
    expect(tones('9sus')).toBe('0 5 7 10 14');
  });

  it('reads the minor-major chord', () => {
    expect(tones('-^7')).toBe('0 3 7 11');
    expect(tones('-^9')).toBe('0 3 7 11 14');
  });

  it('treats extensions as implying a seventh', () => {
    expect(tones('9')).toBe('0 4 7 10 14');
    expect(tones('13')).toBe('0 4 7 10 14 21');
    expect(tones('^9')).toBe('0 4 7 11 14');
    expect(tones('^13')).toBe('0 4 7 11 14 21');
  });

  it('puts tensions above the octave, not folded into it', () => {
    // A 13th is a 13th. The voicing engine decides where it actually sits.
    expect(chordTones('13').intervals).toContain(21);
    expect(chordTones('7#11').intervals).toContain(18);
  });
});

describe('chordTones — alterations', () => {
  it('moves the fifth rather than adding a note', () => {
    expect(tones('7b5')).toBe('0 4 6 10');
    expect(tones('7#5')).toBe('0 4 8 10');
    expect(tones('^7#5')).toBe('0 4 8 11');
  });

  it('reads altered ninths', () => {
    expect(tones('7b9')).toBe('0 4 7 10 13');
    expect(tones('7#9')).toBe('0 4 7 10 15');
  });

  it('reads stacked alterations', () => {
    expect(tones('7b9#11')).toBe('0 4 7 10 13 18');
    expect(tones('7#9#5')).toBe('0 4 8 10 15');
    expect(tones('7b9b13')).toBe('0 4 7 10 13 20');
  });

  it('reads 7alt as the altered scale tensions', () => {
    const alt = chordTones('7alt');
    expect(alt.intervals).toContain(10); // dominant seventh
    expect(alt.intervals).toContain(8); // #5
    expect(alt.intervals).toContain(13); // b9
    expect(alt.intervals).toContain(15); // #9
  });

  it('reads add9 without adding a seventh', () => {
    expect(tones('add9')).toBe('0 4 7 14');
  });

  it('reads the minor flat six and sharp five', () => {
    expect(tones('-b6')).toBe('0 3 7 20');
    expect(tones('-#5')).toBe('0 3 8');
  });
});

describe('chordTones — structure for voicings', () => {
  it('names the third, fifth and seventh', () => {
    const c = chordTones('-9');
    expect(c.third).toBe(3);
    expect(c.fifth).toBe(7);
    expect(c.seventh).toBe(10);
    expect(c.tensions).toEqual([14]);
  });

  it('has no third for a power chord', () => {
    expect(chordTones('5').third).toBeNull();
  });

  it('treats a sixth as the seventh for shell purposes', () => {
    expect(chordTones('6').seventh).toBe(9);
  });
});

describe('pitch helpers', () => {
  it('places middle C at 60', () => {
    expect(midiOf('C', 4)).toBe(60);
    expect(midiOf('A', 4)).toBe(69);
    expect(midiOf('Bb', 3)).toBe(58);
    expect(midiOf('F#', 2)).toBe(42);
  });

  it('parses a pitch spec', () => {
    expect(parsePitch('E1')).toBe(28);
    expect(parsePitch('Eb3')).toBe(51);
    expect(parsePitch('nonsense')).toBeNull();
  });

  it('folds a pitch into a register', () => {
    expect(fold(60, 40, 52)).toBe(48);
    expect(fold(30, 40, 52)).toBe(42);
    expect(fold(45, 40, 52)).toBe(45);
  });
});
