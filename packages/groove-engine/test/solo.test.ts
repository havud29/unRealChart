import { describe, expect, it } from 'vitest';
import { soloTones } from '../src/index.js';

const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10;
const names = (t: ReturnType<typeof soloTones>) => t.map((x) => x.name);
const guides = (t: ReturnType<typeof soloTones>) =>
  t.filter((x) => x.role === 'guide').map((x) => x.name);

/**
 * The claims here are about music, taken from how players actually navigate
 * changes, and they are the whole basis of what the chart highlights. If any
 * of them is wrong the feature teaches the wrong thing, which is worse than
 * not having it.
 */
describe('which notes define a chord', () => {
  it('makes the third and seventh the guide tones', () => {
    // Root and fifth are the same in major, minor and dominant; the third and
    // seventh are what tell them apart.
    expect(guides(soloTones({ root: D, quality: '-7' }))).toEqual(['F', 'C']);
    expect(guides(soloTones({ root: G, quality: '7' }))).toEqual(['B', 'F']);
    expect(guides(soloTones({ root: C, quality: '^7' }))).toEqual(['E', 'B']);
  });

  it('treats the sixth as a guide when there is no seventh', () => {
    // In a sixth chord the sixth does the seventh's job of colouring it.
    expect(guides(soloTones({ root: C, quality: '6' }))).toEqual(['E', 'A']);
  });

  it('calls the root and fifth chord tones, not guides', () => {
    const tones = soloTones({ root: C, quality: '^7' });
    expect(tones.find((t) => t.degree === 1)?.role).toBe('chord');
    expect(tones.find((t) => t.degree === 5)?.role).toBe('chord');
  });

  it('calls tensions colour', () => {
    const tones = soloTones({ root: G, quality: '7b9' });
    expect(tones.find((t) => t.degree === 9)?.role).toBe('colour');
  });
});

describe('the ii-V-I, which is most of the repertoire', () => {
  const dm7 = { root: D, quality: '-7' };
  const g7 = { root: G, quality: '7' };
  const cmaj7 = { root: C, quality: '^7' };

  it('leans the seventh of ii a half step into the third of V', () => {
    // C is the seventh of D-7; B is the third of G7.
    const tones = soloTones(dm7, g7);
    expect(tones.find((t) => t.name === 'C')?.resolvesTo).toBe('B');
  });

  it('leans the seventh of V a half step into the third of I', () => {
    // F is the seventh of G7; E is the third of C^7.
    const tones = soloTones(g7, cmaj7);
    expect(tones.find((t) => t.name === 'F')?.resolvesTo).toBe('E');
  });

  it('marks the tone that simply stays', () => {
    // F is the third of D-7 and the seventh of G7 — hold it through.
    const tones = soloTones(dm7, g7);
    const f = tones.find((t) => t.name === 'F');
    expect(f?.common).toBe(true);
    // A note that stays is not resolving anywhere.
    expect(f?.resolvesTo).toBeNull();
  });

  it('finds every common tone between the two chords', () => {
    // D-7 is D F A C and G7 is G B D F: the D and the F are in both. The D is
    // the root of one and the fifth of the other, which is exactly why a
    // common tone is worth marking -- its job changes while the note does not.
    const tones = soloTones(dm7, g7);
    expect(tones.filter((t) => t.common).map((t) => t.name)).toEqual(['D', 'F']);
  });
});

describe('without a next chord', () => {
  it('still names and labels the tones, with nothing to resolve into', () => {
    const tones = soloTones({ root: Bb, quality: '^7' });
    expect(names(tones)).toEqual(['B♭', 'D', 'F', 'A']);
    expect(tones.every((t) => !t.common && t.resolvesTo === null)).toBe(true);
  });
});
