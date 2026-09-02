import { describe, expect, it } from 'vitest';
import { barBeats } from '../src/index.js';
import { beatsText, chartText, model } from './helpers.js';

describe('bar grouping', () => {
  it('splits a row into bars on barlines', () => {
    const m = model('[T44C^7   |A-7 D-7 |G7   |C6   Z');
    expect(chartText(m)).toBe('C^7 | A-7 D-7 | G7 | C6');
  });

  it('records barline types', () => {
    const m = model('[T44C^7   |A-7   |G7   |C6   Z');
    expect(m.bars[0]!.open).toBe('double');
    expect(m.bars[1]!.open).toBe('single');
    expect(m.bars[3]!.close).toBe('final');
  });

  it('records repeat brackets', () => {
    const m = model('{T44C7   |F7   }');
    expect(m.bars[0]!.open).toBe('repeat');
    expect(m.bars[1]!.close).toBe('repeat');
  });

  it('collects sections', () => {
    const m = model('*A[T44C7   |F7   ]*B[G7   |C7   Z');
    expect(m.sections).toEqual([
      { name: 'A', startBar: 0, endBar: 2 },
      { name: 'B', startBar: 2, endBar: 4 },
    ]);
  });

  it('drops the trailing row padding without warning', () => {
    const m = model('[T44C7   |F7   Z            ');
    expect(m.bars).toHaveLength(2);
    expect(m.warnings).toEqual([]);
  });
});

describe('beat resolution', () => {
  it('gives a lone chord the whole bar', () => {
    expect(beatsText(model('[T44C^7   Z'))).toBe('4');
  });

  it('splits a bar between two chords', () => {
    expect(beatsText(model('[T44A-7 D-7 Z'))).toBe('2 2');
  });

  it('lets padding lengthen the chord before it', () => {
    // C^7 holds three beats because two cells of padding follow it.
    expect(beatsText(model('[T44C^7   D-7 Z'))).toBe('3 1');
  });

  it('discards padding before the first chord of a bar', () => {
    expect(beatsText(model('[T44   C^7 Z'))).toBe('4');
  });

  it('gives four adjacent chords a beat each', () => {
    expect(beatsText(model('[T44C7,B7,Bb7,A7Z'))).toBe('1 1 1 1');
  });

  it('keeps small chords at one beat and gives the rest away', () => {
    // `s` is sticky, `l` turns it off again.
    const m = model('[T44sC7,B7,Bb7lA7   Z');
    expect(beatsText(m)).toBe('1 1 1 1');
  });

  it('fills 3/4 correctly, where a cell is half a beat', () => {
    expect(beatsText(model('[T34G7   Z'))).toBe('3');
    expect(barBeats(model('[T34G7   Z').bars[0]!)).toBe(3);
  });

  it('fills 12/8, where a cell is three beats', () => {
    expect(barBeats(model('[T12C7   Z').bars[0]!)).toBe(12);
  });

  it('never lets a bar run past its meter', () => {
    for (const meter of ['24', '34', '44', '54', '64', '74', '38', '68', '78', '98', '12', '22', '32']) {
      const m = model(`[T${meter}C7   |F7 G7 |A7   Z`);
      for (const bar of m.bars) {
        expect(barBeats(bar), `meter ${meter}`).toBeCloseTo(bar.time.beats, 6);
      }
    }
  });

  it('warns when a bar holds more chords than beats', () => {
    const m = model('[T24C7,F7,G7,A7Z');
    expect(m.warnings.map((w) => w.code)).toContain('too-many-chords');
  });
});

describe('chord shapes', () => {
  it('reads slash chords', () => {
    const chord = model('[T44C^7/G   Z').bars[0]!.chords[0]!;
    expect(chord.root).toBe('C');
    expect(chord.quality).toBe('^7');
    expect(chord.bass).toBe('G');
  });

  it('reads N.C.', () => {
    const chord = model('[T44n   Z').bars[0]!.chords[0]!;
    expect(chord.kind).toBe('nc');
    expect(chord.root).toBeNull();
  });

  it('reads an invisible root as a bass note alone', () => {
    const chord = model('[T44W/G   Z').bars[0]!.chords[0]!;
    expect(chord.root).toBeNull();
    expect(chord.bass).toBe('G');
  });

  it('reads alternate chords', () => {
    const chord = model('[T44C^7(A-7)   Z').bars[0]!.chords[0]!;
    expect(chord.alternate?.root).toBe('A');
    expect(chord.alternate?.quality).toBe('-7');
  });

  it('marks fermatas', () => {
    expect(model('[T44fC^7   Z').bars[0]!.chords[0]!.fermata).toBe(true);
  });
});

describe('bar repeats', () => {
  it('expands `x` into a copy of the previous bar', () => {
    const m = model('[T44C^7   | x  Z');
    expect(chartText(m)).toBe('C^7 | C^7');
    expect(m.bars[1]!.chords[0]!.beats).toBe(4);
  });

  it('expands `r` into copies of the previous two bars', () => {
    // `r` occupies two bars of chart space; the second is written empty.
    const m = model('[T44C^7   |A-7   |   r|    Z');
    expect(chartText(m)).toBe('C^7 | A-7 | C^7 | A-7');
    expect(m.warnings).toEqual([]);
  });

  it('warns when a bar repeat has nothing to copy', () => {
    expect(model('[T44 x  Z').warnings.map((w) => w.code)).toContain('no-previous-bar');
  });
});

describe('meta', () => {
  it('falls back to the display style when no groove is set', () => {
    expect(model('[T44C7   Z').meta.groove).toBe('Medium Swing');
  });
});
