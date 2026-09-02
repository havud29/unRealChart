import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/index.js';
import type { Cell } from '../src/index.js';

const chordAt = (cells: Cell[], i: number) => cells[i]?.chord ?? null;
const symbolAt = (cells: Cell[], i: number) => {
  const c = chordAt(cells, i);
  return c ? c.note + c.modifiers : '';
};

describe('tokenize', () => {
  it('lays a four-bar row onto the 16-cell grid', () => {
    const cells = tokenize('*A[T44C^7   |A-7 D-7 |G7   |C6   Z');

    expect(symbolAt(cells, 0)).toBe('C^7');
    expect(symbolAt(cells, 4)).toBe('A-7');
    expect(symbolAt(cells, 6)).toBe('D-7');
    expect(symbolAt(cells, 8)).toBe('G7');
    expect(symbolAt(cells, 12)).toBe('C6');

    // Cells between chords are genuinely empty; that is how duration is written.
    for (const i of [1, 2, 3, 5, 7, 9, 10, 11, 13, 14]) {
      expect(chordAt(cells, i)).toBeNull();
    }
  });

  it('attaches annotations to the cell they precede', () => {
    const cells = tokenize('*A[T44C^7   ');
    expect(cells[0]?.annots).toEqual(['*A', 'T44']);
  });

  it('attaches barlines without consuming a cell', () => {
    const cells = tokenize('*A[T44C^7   |A-7 D-7 |G7   |C6   Z');
    expect(cells[0]?.bars).toBe('[');
    expect(cells[3]?.bars).toBe(')'); // closed by the following single barline
    expect(cells[4]?.bars).toBe('('); // and that same barline opens this cell
    expect(cells[15]?.bars ?? '').toContain('Z');
  });

  it('reads repeat brackets', () => {
    const cells = tokenize('{F7   |Bb7   }');
    expect(cells[0]?.bars).toBe('{');
    expect(cells[7]?.bars ?? '').toContain('}');
  });

  it('parses slash chords', () => {
    const chord = chordAt(tokenize('C^7/G   '), 0);
    expect(chord?.note).toBe('C');
    expect(chord?.modifiers).toBe('^7');
    expect(chord?.over?.note).toBe('G');
  });

  it('parses a bass note with an accidental', () => {
    expect(chordAt(tokenize('F-7/Bb   '), 0)?.over?.note).toBe('Bb');
  });

  it('parses alternate chords', () => {
    const chord = chordAt(tokenize('C^7(A-7)   '), 0);
    expect(chord?.note).toBe('C');
    expect(chord?.alternate?.note).toBe('A');
    expect(chord?.alternate?.modifiers).toBe('-7');
  });

  it('parses altered dominants without splitting them', () => {
    expect(symbolAt(tokenize('G7b9#11   '), 0)).toBe('G7b9#11');
    expect(symbolAt(tokenize('C7alt   '), 0)).toBe('C7alt');
    expect(symbolAt(tokenize('F#-7b5   '), 0)).toBe('F#-7b5');
    expect(symbolAt(tokenize('Bb13sus   '), 0)).toBe('Bb13sus');
  });

  it('reads the pseudo-roots', () => {
    expect(chordAt(tokenize('n   '), 0)?.note).toBe('n'); // N.C.
    expect(chordAt(tokenize('x   '), 0)?.note).toBe('x'); // repeat bar
    expect(chordAt(tokenize('r   '), 0)?.note).toBe('r'); // repeat two bars
    expect(chordAt(tokenize('p   '), 0)?.note).toBe('p'); // repeat chord
    expect(chordAt(tokenize('W/G   '), 0)?.over?.note).toBe('G'); // invisible root
  });

  it('collects comments with the brackets stripped', () => {
    // Charts write the directive before the chord it applies to.
    const cells = tokenize('<D.S. al Coda>C^7   ');
    expect(cells[0]?.comments).toEqual(['D.S. al Coda']);
    expect(symbolAt(cells, 0)).toBe('C^7');
  });

  it('attaches a trailing comment to the following cell, since a chord fills its own', () => {
    const cells = tokenize('C^7<Fine>   ');
    expect(symbolAt(cells, 0)).toBe('C^7');
    expect(cells[0]?.comments).toEqual([]);
    expect(cells[1]?.comments).toEqual(['Fine']);
  });

  it('counts vertical spacers', () => {
    const cells = tokenize('YYC^7   ');
    expect(cells[0]?.spacer).toBe(2);
  });

  it('records endings, segno and coda as annotations', () => {
    expect(tokenize('N1C^7   ')[0]?.annots).toEqual(['N1']);
    expect(tokenize('SC^7   ')[0]?.annots).toEqual(['S']);
    expect(tokenize('QC^7   ')[0]?.annots).toEqual(['Q']);
    expect(tokenize('UC^7   ')[0]?.annots).toEqual(['U']);
    expect(tokenize('fC^7   ')[0]?.annots).toEqual(['f']);
  });

  it('treats commas as separators, not content', () => {
    const cells = tokenize('C^7,,,');
    expect(symbolAt(cells, 0)).toBe('C^7');
    expect(cells).toHaveLength(1);
  });

  it('returns a single empty cell for empty input', () => {
    expect(tokenize('')).toEqual([{ annots: [], comments: [], bars: '', spacer: 0, chord: null }]);
  });
});
