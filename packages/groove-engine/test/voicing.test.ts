import { describe, expect, it } from 'vitest';
import { voice } from '../src/voicing.js';
import { midiOf } from '../src/harmony.js';

const C = 0, F = 5, G = 7, D = 2, A = 9, Bb = 10;
const PIANO = { low: midiOf('C', 3)!, high: midiOf('A', 4)! };

const pitchClasses = (notes: number[]) => [...new Set(notes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);

describe('voicing shapes', () => {
  it('builds a shell voicing from root, third and seventh', () => {
    const notes = voice({ root: C, quality: '^7', style: 'shell', ...PIANO });
    expect(pitchClasses(notes)).toEqual([0, 4, 11]);
  });

  it('leaves the root out of a rootless voicing', () => {
    const notes = voice({ root: C, quality: '-7', style: 'rootless', ...PIANO });
    expect(pitchClasses(notes)).not.toContain(0); // no C
    expect(pitchClasses(notes)).toContain(3); // Eb
    expect(pitchClasses(notes)).toContain(10); // Bb
  });

  it('keeps a quartal voicing in fourths', () => {
    const notes = voice({ root: D, quality: '-7', style: 'quartal', ...PIANO });
    const gaps = notes.slice(1).map((n, i) => n - notes[i]!);
    expect(gaps.every((g) => g === 5)).toBe(true);
  });

  it('spreads a drop-2 voicing wider than a closed one', () => {
    const closed = voice({ root: C, quality: '7', style: 'closed', ...PIANO });
    const drop = voice({ root: C, quality: '7', style: 'drop2', ...PIANO });
    const spread = (n: number[]) => Math.max(...n) - Math.min(...n);
    expect(spread(drop)).toBeGreaterThanOrEqual(spread(closed));
  });
});

describe('register', () => {
  it('never leaves the requested range', () => {
    for (const quality of ['^7', '-7', '7b9#11', '13', 'o7', 'sus', '6/9']) {
      for (let root = 0; root < 12; root++) {
        const notes = voice({ root, quality, style: 'rootless', ...PIANO });
        expect(Math.min(...notes), `${root} ${quality}`).toBeGreaterThanOrEqual(PIANO.low);
        expect(Math.max(...notes), `${root} ${quality}`).toBeLessThanOrEqual(PIANO.high);
      }
    }
  });

  it('starts near the middle of the register when there is no history', () => {
    const notes = voice({ root: C, quality: '^7', style: 'rootless', ...PIANO });
    const middle = (PIANO.low + PIANO.high) / 2;
    const centre = notes.reduce((s, n) => s + n, 0) / notes.length;
    expect(Math.abs(centre - middle)).toBeLessThan(7);
  });
});

describe('voice leading', () => {
  it('moves a small distance through a ii-V-I', () => {
    // The test that matters: hands do not jump around the keyboard.
    const ii = voice({ root: D, quality: '-7', style: 'rootless', ...PIANO });
    const v = voice({ root: G, quality: '7', style: 'rootless', ...PIANO, previous: ii });
    const i = voice({ root: C, quality: '^7', style: 'rootless', ...PIANO, previous: v });

    const move = (a: number[], b: number[]) =>
      Math.abs(a.reduce((s, n) => s + n, 0) / a.length - b.reduce((s, n) => s + n, 0) / b.length);

    expect(move(ii, v)).toBeLessThan(4);
    expect(move(v, i)).toBeLessThan(4);
  });

  it('does not creep upward over a long progression', () => {
    const roots = [D, G, C, A, D, G, C, F, Bb, C, D, G];
    let previous: number[] | undefined;
    const centres: number[] = [];
    for (const root of roots) {
      previous = voice({ root, quality: '7', style: 'rootless', ...PIANO, previous });
      centres.push(previous.reduce((s, n) => s + n, 0) / previous.length);
    }
    const drift = Math.abs(centres[centres.length - 1]! - centres[0]!);
    expect(drift).toBeLessThan(6);
  });

  it('is deterministic', () => {
    const once = voice({ root: F, quality: '13', style: 'rootless', ...PIANO });
    const twice = voice({ root: F, quality: '13', style: 'rootless', ...PIANO });
    expect(once).toEqual(twice);
  });
});

describe('embellishment', () => {
  it('adds tensions to a plain chord when asked', () => {
    const plain = voice({ root: C, quality: '7', style: 'rootless', ...PIANO });
    const rich = voice({ root: C, quality: '7', style: 'rootless', ...PIANO, embellish: true });
    expect(rich.length).toBeGreaterThanOrEqual(plain.length);
    expect(pitchClasses(rich)).toContain(2); // the added 9th
  });
});
