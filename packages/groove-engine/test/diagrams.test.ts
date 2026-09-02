import { describe, expect, it } from 'vitest';
import { GUITAR, UKULELE, chordTones, fingerings, pianoVoicing, pitchClassesOf } from '../src/index.js';

const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10;

/** Every note a shape sounds, as pitch classes. */
const classesOf = (frets: Array<number | null>, tuning: number[]) =>
  frets
    .map((fret, i) => (fret === null ? null : (tuning[i]! + fret) % 12))
    .filter((n): n is number => n !== null);

describe('fingerings', () => {
  it('finds shapes for the common chords', () => {
    for (const [root, quality] of [
      [C, ''],
      [G, '7'],
      [A, '-7'],
      [F, '^7'],
      [D, '-7'],
      [Bb, '^7'],
      [E, '7b9'],
      [C, '-7b5'],
    ] as Array<[number, string]>) {
      const shapes = fingerings(root, quality, GUITAR);
      expect(shapes.length, `${root} ${quality}`).toBeGreaterThan(0);
    }
  });

  it('sounds only chord tones', () => {
    for (const quality of ['^7', '-7', '7', 'h7', 'o7', '13', '7b9#11']) {
      for (let root = 0; root < 12; root++) {
        const tones = new Set(chordTones(quality).intervals.map((i) => (root + i) % 12));
        for (const shape of fingerings(root, quality, GUITAR)) {
          for (const pc of classesOf(shape.frets, GUITAR.tuning)) {
            expect(tones.has(pc), `${root} ${quality}: ${shape.frets.join(' ')}`).toBe(true);
          }
        }
      }
    }
  });

  it('offers a root-position shape first', () => {
    // Inversions are allowed — sometimes they are all a hand can reach — but a
    // player asking for "G7" should see G7, not its second inversion.
    for (const quality of ['^7', '-7', '7']) {
      for (let root = 0; root < 12; root++) {
        const first = fingerings(root, quality, GUITAR)[0];
        expect(first, `${root} ${quality}`).toBeTruthy();
        expect(first!.notes[0]! % 12, `${root} ${quality}`).toBe(root);
      }
    }
  });

  it('plays a ukulele chord where a player would, not ten frets up', () => {
    // The lowest F on a ukulele G-string is fret 10. Insisting on root position
    // would send every F chord up the neck; players use an inversion instead.
    const shape = fingerings(F, '7', UKULELE)[0];
    expect(shape).toBeTruthy();
    expect(shape!.position).toBeLessThanOrEqual(5);
  });

  it('honours a written bass note', () => {
    for (const shape of fingerings(C, '^7', GUITAR, { bass: G })) {
      expect(shape.notes[0]! % 12).toBe(G);
    }
  });

  it('stays inside a hand span', () => {
    for (const shape of fingerings(Bb, '13', GUITAR)) {
      const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
      if (fretted.length === 0) continue;
      expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(GUITAR.reach);
    }
  });

  it('never mutes a string in the middle of a shape', () => {
    // A hand can skip the outside strings; it cannot skip one in the middle.
    for (const shape of fingerings(G, '7', GUITAR)) {
      const played = shape.frets.map((f) => f !== null);
      const first = played.indexOf(true);
      const last = played.lastIndexOf(true);
      for (let i = first; i <= last; i++) expect(played[i]).toBe(true);
    }
  });

  it('sounds at least four strings on a guitar', () => {
    for (const shape of fingerings(F, '^7', GUITAR)) {
      expect(shape.notes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('finds the open C major shape', () => {
    // x32010 is the first chord most guitarists learn; it should be in there.
    const shapes = fingerings(C, '', GUITAR, { limit: 8 });
    expect(shapes.some((s) => s.frets.join(',') === ',3,2,0,1,0')).toBe(true);
  });

  it('reports the position for drawing', () => {
    for (const shape of fingerings(Bb, '^7', GUITAR)) {
      const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
      if (fretted.length > 0) expect(shape.position).toBe(Math.min(...fretted));
    }
  });

  it('returns distinct shapes, not the same one repeated', () => {
    const shapes = fingerings(G, '7', GUITAR, { limit: 4 });
    expect(new Set(shapes.map((s) => s.frets.join(','))).size).toBe(shapes.length);
  });

  it('works on a ukulele too', () => {
    const shapes = fingerings(C, '', UKULELE);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) expect(shape.frets).toHaveLength(4);
    expect(shapes[0]!.notes[0]! % 12).toBe(C); // C is reachable in root position
  });
});

describe('piano', () => {
  it('voices a chord from middle C upward', () => {
    const notes = pianoVoicing(C, '^7');
    expect(notes).toEqual([60, 64, 67, 71]);
  });

  it('puts a written bass note underneath', () => {
    const notes = pianoVoicing(C, '', G);
    expect(notes[0]).toBe(48 + G);
    expect(notes.length).toBeGreaterThan(3);
  });

  it('lists the pitch classes to highlight', () => {
    expect([...pitchClassesOf(C, '-7')].sort((a, b) => a - b)).toEqual([0, 3, 7, 10]);
    expect(pitchClassesOf(C, '^7', G).has(G)).toBe(true);
  });
});
