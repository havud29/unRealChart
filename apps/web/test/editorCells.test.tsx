import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { tokenize } from '@unrealchart/ireal-format';
import { annotationNodes, cellLabel, chordTextOf } from '../src/Editor.js';

/**
 * The editor grid has to look like the chart it produces.
 *
 * It used to print the payload as written -- `Eb^7`, `C7b9`, an alternate
 * appended as `(Bb7)` -- which is what the format stores but not what anyone
 * reads, and the appended alternate ran straight into the next cell. You edit
 * a chart by looking at it, so a cell shows the same symbol the page will.
 */
function cellsOf(music: string) {
  return tokenize(music);
}

const draw = (node: unknown) => renderToStaticMarkup(<>{node as never}</>);

describe('a cell in the editor grid', () => {
  it('draws a real accidental, not the letter b', () => {
    const cells = cellsOf('[T44Eb^7   Z');
    const chord = cells.find((c) => c.chord?.note === 'Eb');
    expect(chord).toBeDefined();
    const html = draw(cellLabel(chord!));
    expect(html).toContain('\u266D');
    expect(html).toContain('c-root');
  });

  it('draws the major triangle rather than a caret', () => {
    const cells = cellsOf('[T44C^7   Z');
    const html = draw(cellLabel(cells.find((c) => c.chord?.note === 'C')!));
    expect(html).toContain('data-glyph="triangle"');
    expect(html).not.toContain('^');
  });

  it('stacks a slash chord bass under the quality', () => {
    const cells = cellsOf('[T44F^7/C   Z');
    const html = draw(cellLabel(cells.find((c) => c.chord?.note === 'F')!));
    expect(html).toContain('c-bass');
  });

  it('draws marks as signs, not as their payload codes', () => {
    const html = draw(annotationNodes(['*A', 'T44', 'N1', 'U']));
    expect(html).toContain('gridsection');
    expect(html).toContain('gridmeter');
    expect(html).toContain('gridending');
    // The meter is stacked, so `T44` never appears as text.
    expect(html).not.toContain('T44');
    expect(html).not.toContain('N1');
  });

  it('keeps a letter for a mark that has no sign of its own', () => {
    // `s` and `l` switch chord size; inventing a glyph for them would be worse.
    const html = draw(annotationNodes(['s']));
    expect(html).toContain('gridflag');
    expect(html).toContain('s');
  });
});

describe('the chord in the edit box', () => {
  const cellsOf2 = (music: string) => tokenize(music);

  it('shows the chord as written, so it can be edited rather than retyped', () => {
    const cells = cellsOf2('[T44Eb^7   Z');
    expect(chordTextOf(cells.find((c) => c.chord?.note === 'Eb'))).toBe('Eb^7');
  });

  it('includes a slash bass', () => {
    const cells = cellsOf2('[T44F^7/A   Z');
    expect(chordTextOf(cells.find((c) => c.chord?.note === 'F'))).toBe('F^7/A');
  });

  it('leaves out an alternate, which cannot be typed back in', () => {
    // Showing it would invite an edit that could not survive the round trip;
    // commitDraft carries it across instead.
    const cells = cellsOf2('[T44C^7(A-7)   Z');
    const cell = cells.find((c) => c.chord?.note === 'C');
    expect(cell?.chord?.alternate).toBeTruthy();
    expect(chordTextOf(cell)).toBe('C^7');
  });

  it('is empty for a cell with no chord', () => {
    expect(chordTextOf(undefined)).toBe('');
    expect(chordTextOf(cellsOf2('[T44    Z')[1])).toBe('');
  });
});
