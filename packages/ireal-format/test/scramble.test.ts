import { describe, expect, it } from 'vitest';
import {
  collapseSubstitutions,
  expandSubstitutions,
  obfusc50,
  permuteBlocks,
  roundTrips,
  scramble,
  unscramble,
} from '../src/index.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const sample = (length: number) =>
  Array.from({ length }, (_, i) => alphabet[i % alphabet.length]).join('');

describe('obfusc50', () => {
  it('is an involution', () => {
    const block = sample(50);
    expect(obfusc50(obfusc50(block))).toBe(block);
  });

  it('swaps the documented index ranges and leaves the rest alone', () => {
    const block = sample(50);
    const out = obfusc50(block);
    expect(out[0]).toBe(block[49]);
    expect(out[4]).toBe(block[45]);
    expect(out[10]).toBe(block[39]);
    expect(out[23]).toBe(block[26]);
    // untouched: 5..9, 24, 25, 40..44
    for (const i of [5, 6, 7, 8, 9, 24, 25, 40, 41, 42, 43, 44]) {
      expect(out[i]).toBe(block[i]);
    }
  });

  it('preserves length', () => {
    expect(obfusc50(sample(50))).toHaveLength(50);
  });
});

describe('permuteBlocks', () => {
  // 50 and 51 are the boundary: a trailing block of that size is left alone.
  for (const length of [0, 1, 49, 50, 51, 52, 99, 100, 101, 150, 151, 152, 517]) {
    it(`is an involution at length ${length}`, () => {
      const input = sample(length);
      expect(permuteBlocks(permuteBlocks(input))).toBe(input);
      expect(permuteBlocks(input)).toHaveLength(length);
    });
  }

  it('leaves a short payload untouched', () => {
    const short = sample(51);
    expect(permuteBlocks(short)).toBe(short);
  });
});

describe('substitutions', () => {
  it('expands the three encoded sequences', () => {
    expect(expandSubstitutions('KclLZXyQ')).toBe('| x |   ');
  });

  it('preserves length, which is what keeps block boundaries stable', () => {
    const input = 'C^7KclA-7LZD-7XyQG7';
    expect(expandSubstitutions(input)).toHaveLength(input.length);
  });

  it('collapses back to the encoded form', () => {
    expect(collapseSubstitutions('| x |   ')).toBe('KclLZXyQ');
  });

  it('round-trips representative chart text', () => {
    for (const text of [
      'T44[C^7   | x |A-7 D-7 |G7   Z',
      '*A{F7   |Bb7   |F7   }',
      '   |   |   ',
      '',
    ]) {
      expect(expandSubstitutions(collapseSubstitutions(text))).toBe(text);
    }
  });
});

describe('unscramble / scramble', () => {
  it('round-trips payloads of every block alignment', () => {
    for (const length of [10, 49, 50, 51, 52, 100, 101, 250, 517]) {
      const payload = sample(length);
      expect(scramble(unscramble(payload))).toBe(payload);
      expect(roundTrips(payload)).toBe(true);
    }
  });

  it('decodes a payload whose blocks contain encoded sequences', () => {
    const music = 'T44[C^7   | x |A-7 D-7 |G7   |C6   Z';
    const encoded = scramble(music);
    expect(unscramble(encoded)).toBe(music);
  });
});
