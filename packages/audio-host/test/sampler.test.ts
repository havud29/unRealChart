import { describe, expect, it } from 'vitest';
import { closest } from '../src/sampler.js';

/**
 * Nearest-neighbour pitch selection.
 *
 * Banks hold one sample every few semitones, so most notes are played by
 * shifting a neighbour. Picking the wrong neighbour is not subtle: a sample
 * stretched five semitones sounds like a different instrument.
 */
describe('choosing which sample plays a note', () => {
  const pitches = [24, 27, 30, 33, 36];

  it('takes the exact sample when there is one', () => {
    expect(closest(pitches, 30)).toBe(30);
  });

  it('takes the nearer neighbour, either side', () => {
    expect(closest(pitches, 31)).toBe(30);
    expect(closest(pitches, 32)).toBe(33);
  });

  it('handles notes outside the sampled range', () => {
    expect(closest(pitches, 12)).toBe(24);
    expect(closest(pitches, 90)).toBe(36);
  });

  it('reports nothing for an empty bank rather than guessing', () => {
    // The caller falls through to the synthesised voice on null.
    expect(closest([], 60)).toBeNull();
  });
});
