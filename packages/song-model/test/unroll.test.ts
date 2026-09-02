import { describe, expect, it } from 'vitest';
import { unroll } from '../src/index.js';
import { model, playOrder } from './helpers.js';

describe('repeats', () => {
  it('plays a straight chart once', () => {
    expect(playOrder(model('[T44C7   |F7   |G7   |C7   Z'))).toBe('C7 | F7 | G7 | C7');
  });

  it('plays a repeat bracket twice', () => {
    expect(playOrder(model('{T44C7   |F7   }'))).toBe('C7 | F7 | C7 | F7');
  });

  it('takes first and second endings', () => {
    const m = model('{T44C7   |F7   |N1G7   }|N2A7   Z');
    expect(playOrder(m)).toBe('C7 | F7 | G7 | C7 | F7 | A7');
    expect(m.warnings).toEqual([]);
  });

  it('reports no leftover warnings after taking endings', () => {
    const { warnings } = unroll(model('{T44C7   |F7   |N1G7   }|N2A7   Z'), { choruses: 1 });
    expect(warnings).toEqual([]);
  });

  it('takes three endings when a third is written', () => {
    // Every ending but the last carries its own repeat sign, which is how these
    // are actually written.
    const m = model('{T44C7   |N1D7   }|N2E7   }|N3F7   Z');
    expect(playOrder(m)).toBe('C7 | D7 | C7 | E7 | C7 | F7');
  });

  it('honours an explicit play-count directive', () => {
    // `<3x>` on the opening bar means three passes, not two.
    expect(playOrder(model('{T44<3x>C7   |F7   }'))).toBe('C7 | F7 | C7 | F7 | C7 | F7');
  });

  it('handles nested repeats', () => {
    const m = model('{T44C7   |{F7   }|G7   }');
    expect(playOrder(m)).toBe('C7 | F7 | F7 | G7 | C7 | F7 | F7 | G7');
  });

  it('recovers from a repeat close with no opening bracket', () => {
    const m = model('*A[T44C7   |F7   }');
    const { bars, warnings } = unroll(m, { choruses: 1 });
    expect(bars).toHaveLength(4);
    expect(warnings.map((w) => w.code)).toContain('unmatched-repeat-close');
  });
});

describe('jumps', () => {
  it('plays D.C. al Fine', () => {
    const m = model('[T44C7   |F7<Fine>   |G7   |A7<D.C. al Fine>   Z');
    expect(playOrder(m)).toBe('C7 | F7 | G7 | A7 | C7 | F7');
  });

  it('plays D.S. al Fine from the segno', () => {
    const m = model('[T44C7   |SF7   |G7<Fine>   |A7<D.S. al Fine>   Z');
    expect(playOrder(m)).toBe('C7 | F7 | G7 | A7 | F7 | G7');
  });

  it('plays D.C. al Coda, leaping from the first coda mark to the second', () => {
    const m = model('[T44C7   |QF7   |G7<D.C. al Coda>   |QA7   Z');
    expect(playOrder(m)).toBe('C7 | F7 | G7 | C7 | F7 | A7');
  });

  it('plays D.C. al 2nd ending, spelled the way the corpus spells it', () => {
    // Shaped after Alice In Wonderland: endings in section A, the jump at the
    // end of section B, and the Fine inside the second ending that stops it.
    const m = model('{T44C7   |N1F7   }|N2G7<Fine>   ][*BD7   |E7<D.C. al 2nd ending>   Z');
    expect(playOrder(m)).toBe('C7 | F7 | C7 | G7 | D7 | E7 | C7 | G7');
  });

  it('does not retake inner repeats after a jump', () => {
    const m = model('[T44C7   |{F7   }|G7<D.C. al Fine>   |A7<Fine>   Z');
    // The jump interrupts the first pass at G7, so A7 is only reached after the
    // D.C. First pass takes the repeat; the D.C. pass does not.
    expect(playOrder(m)).toBe('C7 | F7 | F7 | G7 | C7 | F7 | G7 | A7');
  });

  it('warns and keeps playing when a D.S. has no segno', () => {
    const { warnings } = unroll(model('[T44C7   |F7<D.S. al Fine>   Z'), { choruses: 1 });
    expect(warnings.map((w) => w.code)).toContain('jump-target-missing');
  });

  it('fires a jump only once, however many choruses', () => {
    const m = model('[T44C7   |F7<Fine>   |G7<D.C. al Fine>   Z');
    const once = playOrder(m, { choruses: 1 });
    expect(playOrder(m, { choruses: 2 })).toBe(`${once} | ${once}`);
  });
});

describe('choruses', () => {
  it('repeats the whole form', () => {
    const m = model('[T44C7   |F7   Z');
    expect(playOrder(m, { choruses: 3 })).toBe('C7 | F7 | C7 | F7 | C7 | F7');
  });

  it('numbers each chorus and keeps a back-pointer to the source bar', () => {
    const { bars } = unroll(model('[T44C7   |F7   Z'), { choruses: 2 });
    expect(bars.map((b) => b.chorus)).toEqual([0, 0, 1, 1]);
    expect(bars.map((b) => b.sourceIndex)).toEqual([0, 1, 0, 1]);
  });

  it('defaults to the chart repeat count', () => {
    expect(unroll(model('[T44C7   Z', { repeats: 4 })).bars).toHaveLength(4);
  });
});

describe('safety', () => {
  it('a bare D.C. cannot loop, because a jump fires only once', () => {
    const m = model('[T44C7   |F7<D.C.>   Z');
    const { bars, warnings } = unroll(m, { choruses: 1 });
    expect(bars).toHaveLength(4); // C7 F7, then C7 F7 again
    expect(warnings).toEqual([]);
  });

  it('honours the bar budget so a malformed chart cannot hang the player', () => {
    const { bars, warnings } = unroll(model('{T44C7   |F7   |G7   |A7   }'), {
      choruses: 1,
      maxBars: 3,
    });
    expect(bars.length).toBeLessThanOrEqual(3);
    expect(warnings.map((w) => w.code)).toContain('unroll-budget-exceeded');
  });
});
