import { describe, expect, it } from 'vitest';
import type { Cell } from '@unrealchart/ireal-format';
import { chordToText, tokenize } from '@unrealchart/ireal-format';
import {
  CELLS_PER_ROW,
  EditHistory,
  ENDING,
  METER,
  SECTION,
  appendRow,
  clearCells,
  copyCells,
  deleteCell,
  deleteCells,
  insertCell,
  parseChordInput,
  pasteCells,
  setAnnotation,
  setChord,
  setCloseBarline,
  setComment,
  setOpenBarline,
  setSpacer,
  toPayload,
  toggleAnnotation,
} from '../src/edit.js';
import { buildSongModel } from '../src/build.js';
import { parsePlaylist } from '@unrealchart/ireal-format';

const cellsOf = (music: string) => tokenize(music);
const text = (chord: ReturnType<typeof parseChordInput>) => (chord ? chordToText(chord) : null);

describe('parseChordInput', () => {
  it('accepts the format vocabulary unchanged', () => {
    expect(text(parseChordInput('C^7'))).toBe('C^7');
    expect(text(parseChordInput('F-7'))).toBe('F-7');
    expect(text(parseChordInput('G7b9'))).toBe('G7b9');
    expect(text(parseChordInput('Bb13sus'))).toBe('Bb13sus');
  });

  it('accepts how people actually type major sevenths', () => {
    for (const input of ['Cmaj7', 'CM7', 'CMaj7', 'Cma7', 'CΔ7']) {
      expect(text(parseChordInput(input)), input).toBe('C^7');
    }
  });

  it('accepts how people type minor', () => {
    for (const input of ['Cm7', 'Cmin7', 'Cmi7', 'C-7']) {
      expect(text(parseChordInput(input)), input).toBe('C-7');
    }
    expect(text(parseChordInput('Cm'))).toBe('C-');
  });

  it('accepts the half-diminished spellings', () => {
    for (const input of ['Cm7b5', 'Cmin7b5', 'Cø7', 'Ch7']) {
      expect(text(parseChordInput(input)), input).toBe('Ch7');
    }
    expect(text(parseChordInput('C-7b5'))).toBe('Ch7');
  });

  it('keeps M and m apart, because they are opposite chords', () => {
    expect(text(parseChordInput('CM7'))).toBe('C^7');
    expect(text(parseChordInput('Cm7'))).toBe('C-7');
    expect(text(parseChordInput('CMaj7'))).toBe('C^7');
    expect(text(parseChordInput('Cmin7'))).toBe('C-7');
  });

  it('accepts diminished and augmented', () => {
    expect(text(parseChordInput('Cdim7'))).toBe('Co7');
    expect(text(parseChordInput('C°7'))).toBe('Co7');
    expect(text(parseChordInput('Caug'))).toBe('C+');
    expect(text(parseChordInput('C+'))).toBe('C+');
  });

  it('reads accidentals however they are typed', () => {
    expect(text(parseChordInput('Bb7'))).toBe('Bb7');
    expect(text(parseChordInput('B♭7'))).toBe('Bb7');
    expect(text(parseChordInput('f#m7'))).toBe('F#-7');
  });

  it('reads slash chords', () => {
    expect(text(parseChordInput('C/G'))).toBe('C/G');
    expect(text(parseChordInput('Cmaj7/E'))).toBe('C^7/E');
    expect(text(parseChordInput('F-7/Bb'))).toBe('F-7/Bb');
  });

  it('does not mistake 6/9 for a slash chord', () => {
    // The chart prints "6/9"; the payload stores "69".
    expect(text(parseChordInput('C6/9'))).toBe('C69');
    expect(text(parseChordInput('C69'))).toBe('C69');
  });

  it('reads the pseudo-roots', () => {
    expect(parseChordInput('N.C.')?.note).toBe('n');
    expect(parseChordInput('nc')?.note).toBe('n');
    expect(parseChordInput('%')?.note).toBe('x');
    expect(parseChordInput('/')?.note).toBe('p');
  });

  it('rejects nonsense rather than writing a broken chord', () => {
    expect(parseChordInput('H7')).toBeNull();
    expect(parseChordInput('hello')).toBeNull();
    expect(parseChordInput('')).toBeNull();
    expect(parseChordInput('C!!!')).toBeNull();
  });

  it('produces chords the tokenizer reads back identically', () => {
    for (const input of ['Cmaj7', 'F#m7b5', 'Bb13', 'Eb-^9', 'A7alt', 'Dsus', 'G7#9#5', 'C/E']) {
      const chord = parseChordInput(input)!;
      expect(chord, input).not.toBeNull();
      const again = tokenize(`${chordToText(chord)} `)[0]?.chord;
      expect(chordToText(again!), input).toBe(chordToText(chord));
    }
  });
});

describe('cell operations', () => {
  const base = cellsOf('[T44C^7   |A-7   Z');

  it('sets and clears a chord', () => {
    const set = setChord(base, 4, parseChordInput('D-7'));
    expect(text(set[4]!.chord)).toBe('D-7');
    expect(text(setChord(set, 4, null)[4]!.chord)).toBeNull();
    // The original is untouched — operations are pure.
    expect(text(base[4]!.chord)).toBe('A-7');
  });

  it('toggles a mark on and off', () => {
    const on = toggleAnnotation(base, 0, 'S');
    expect(on[0]!.annots).toContain('S');
    expect(toggleAnnotation(on, 0, 'S')[0]!.annots).not.toContain('S');
  });

  it('replaces a single-valued annotation rather than stacking it', () => {
    let cells = setAnnotation(base, 0, METER, 'T34');
    cells = setAnnotation(cells, 0, METER, 'T68');
    expect(cells[0]!.annots.filter((a) => METER.test(a))).toEqual(['T68']);
  });

  it('sets a section and an ending', () => {
    const cells = setAnnotation(setAnnotation(base, 0, SECTION, '*B'), 4, ENDING, 'N1');
    expect(cells[0]!.annots).toContain('*B');
    expect(cells[4]!.annots).toContain('N1');
  });

  it('moves both halves of a single barline together', () => {
    // The closing half lives on the previous cell; editing one alone would
    // leave a barline drawn on one side only.
    const cells = setOpenBarline(base, 8, 'single');
    expect(cells[8]!.bars).toContain('(');
    expect(cells[7]!.bars).toContain(')');

    const cleared = setOpenBarline(cells, 8, 'none');
    expect(cleared[8]!.bars).not.toContain('(');
    expect(cleared[7]!.bars).not.toContain(')');
  });

  it('sets closing barlines', () => {
    expect(setCloseBarline(base, 7, 'repeat')[7]!.bars).toContain('}');
    expect(setCloseBarline(base, 7, 'final')[7]!.bars).toContain('Z');
    expect(setCloseBarline(setCloseBarline(base, 7, 'final'), 7, 'none')[7]!.bars).not.toContain('Z');
  });

  it('replaces the plain barline a closing bracket supersedes', () => {
    // Cell 3 is closed by the `|` before cell 4. Putting a repeat sign there
    // must take that barline with it, both halves — a cell closed by two
    // different barlines cannot be parsed back.
    const closed = setCloseBarline(base, 3, 'repeat');
    expect(closed[3]!.bars).toBe('}');
    expect(closed[4]!.bars).not.toContain('(');
    expect(JSON.stringify(tokenize(toPayload(closed)))).toBe(JSON.stringify(closed));
  });

  it('sets and clears a comment', () => {
    const cells = setComment(base, 0, 'D.C. al Fine');
    expect(cells[0]!.comments).toEqual(['D.C. al Fine']);
    expect(setComment(cells, 0, '')[0]!.comments).toEqual([]);
  });

  it('clamps spacers to something sane', () => {
    expect(setSpacer(base, 0, 3)[0]!.spacer).toBe(3);
    expect(setSpacer(base, 0, -5)[0]!.spacer).toBe(0);
    expect(setSpacer(base, 0, 99)[0]!.spacer).toBe(6);
  });

  it('inserts and deletes cells', () => {
    expect(insertCell(base, 2)).toHaveLength(base.length + 1);
    expect(deleteCell(base, 2)).toHaveLength(base.length - 1);
    expect(text(insertCell(base, 0)[5]!.chord)).toBe(text(base[4]!.chord));
  });

  it('appends a row of sixteen', () => {
    expect(appendRow(base)).toHaveLength(base.length + 16);
  });
});

describe('saving', () => {
  it('writes edited cells back to a payload that reads the same', () => {
    const cells = setChord(cellsOf('[T44C^7   |A-7   Z'), 4, parseChordInput('D-7'));
    const again = tokenize(toPayload(cells));
    expect(JSON.stringify(again)).toBe(JSON.stringify(cells));
  });

  it('survives a full edit-save-reload cycle', () => {
    let cells = cellsOf('*A[T44C^7   |A-7   |D-7   |G7   Z');
    cells = setChord(cells, 4, parseChordInput('Bbmaj7'));
    cells = setAnnotation(cells, 8, SECTION, '*B');
    cells = setCloseBarline(cells, 11, 'repeat');
    cells = setComment(cells, 0, 'Intro');

    const payload = toPayload(cells);
    const record = ['Edited', 'Anon', 'Medium Swing', 'C', 'n', payload].join('=');
    const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;

    expect(JSON.stringify(song.cells)).toBe(JSON.stringify(cells));
    const model = buildSongModel(song);
    expect(model.bars[1]!.chords[0]!.root).toBe('Bb');
    expect(model.sections.map((s) => s.name)).toEqual(['A', 'B']);
  });
});

describe('EditHistory', () => {
  const base = cellsOf('[T44C^7   |A-7   Z');

  it('undoes and redoes an edit', () => {
    const history = new EditHistory(base);
    history.apply('Set chord', setChord(base, 4, parseChordInput('D-7')));
    expect(text(history.cells[4]!.chord)).toBe('D-7');

    history.undo();
    expect(text(history.cells[4]!.chord)).toBe('A-7');

    history.redo();
    expect(text(history.cells[4]!.chord)).toBe('D-7');
  });

  it('knows what it can do', () => {
    const history = new EditHistory(base);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    history.apply('Set chord', setChord(base, 4, null));
    expect(history.canUndo).toBe(true);
    expect(history.undoLabel).toBe('Set chord');

    history.undo();
    expect(history.canRedo).toBe(true);
  });

  it('drops the redo stack once a new edit lands', () => {
    const history = new EditHistory(base);
    history.apply('One', setChord(base, 4, null));
    history.undo();
    history.apply('Two', setChord(base, 0, null));
    expect(history.canRedo).toBe(false);
  });

  it('collapses rapid edits to the same cell into one step', () => {
    const history = new EditHistory(base);
    let cells = base;
    for (const symbol of ['D', 'D-', 'D-7']) {
      cells = setChord(cells, 4, parseChordInput(symbol));
      history.apply('Type chord', cells, true);
    }
    history.undo();
    // One undo returns to before the whole typed word, not to "D-".
    expect(text(history.cells[4]!.chord)).toBe('A-7');
  });

  it('undoing past the beginning is harmless', () => {
    const history = new EditHistory(base);
    history.undo();
    history.undo();
    expect(history.cells).toEqual(base);
  });
});

describe('several cells at once', () => {
  // Four bars of four cells. Bar lines live on cells 4, 8 and 12.
  const chart = cellsOf('[T44C^7   |A-7 D-7 |G7   |C^7   Z');
  const chordAt = (cells: readonly Cell[], i: number) =>
    cells[i]?.chord ? chordToText(cells[i]!.chord!) : null;
  // What the editor shows has to be what a save and reload gives back.
  const survivesSave = (cells: readonly Cell[]) => expect(tokenize(toPayload(cells))).toEqual(cells);

  it('copies whole cells, in chart order, as copies', () => {
    const clip = copyCells(chart, [6, 4, 4]);
    expect(clip.map((c) => chordToText(c.chord!))).toEqual(['A-7', 'D-7']);
    expect(clip[0]!.bars).toContain('(');
    clip[0]!.chord = null;
    expect(chordAt(chart, 4)).toBe('A-7');
  });

  it('pastes a bar over another, barline and all', () => {
    const next = pasteCells(chart, 8, copyCells(chart, [4, 5, 6, 7]));
    expect([8, 9, 10, 11].map((i) => chordAt(next, i))).toEqual(['A-7', null, 'D-7', null]);
    expect(chordAt(next, 12)).toBe('C^7');
    survivesSave(next);
  });

  it('lands cells picked out of order side by side, with their barlines paired', () => {
    // The first bar's opening and the third's, pasted against each other.
    const next = pasteCells(chart, 4, copyCells(chart, [0, 8]));
    expect(chordAt(next, 4)).toBe('C^7');
    expect(chordAt(next, 5)).toBe('G7');
    // The `|` now on cell 5 closes cell 4, so cell 4 carries the other half.
    expect(next[4]!.bars).toContain(')');
    survivesSave(next);
  });

  it('grows the chart by whole rows when a paste runs past the end', () => {
    const next = pasteCells(chart, chart.length - 1, copyCells(chart, [4, 5, 6, 7]));
    expect(next.length).toBe(chart.length + CELLS_PER_ROW);
    expect(chordAt(next, chart.length + 1)).toBe('D-7');
  });

  it('leaves a chart unchanged when it is pasted over itself', () => {
    // The barline repair has to agree with the tokenizer everywhere, including
    // round spacers, repeats and a single bar right after a double one.
    for (const music of [
      '[T44C^7   |A-7 D-7 |G7   |C^7   Z',
      '{*AT44C^7   |A-7   }[*BYD-7   |G7   ]|C   Z',
      'T34C YY|F   |G7   ]Y[C   Z',
      '[T44C,F,G,C|x  |r|  Z',
    ]) {
      const cells = cellsOf(music);
      const all = cells.map((_, i) => i);
      expect(pasteCells(cells, 0, copyCells(cells, all)), music).toEqual(cells);
    }
  });

  it('clears the chords and keeps the bar structure', () => {
    const next = clearCells(chart, [4, 6, 99]);
    expect(chordAt(next, 4)).toBeNull();
    expect(chordAt(next, 6)).toBeNull();
    expect(next[4]!.bars).toBe(chart[4]!.bars);
    expect(chordAt(next, 8)).toBe('G7');
  });

  it('deletes several cells and closes the gaps', () => {
    const next = deleteCells(chart, [7, 5]);
    expect(next.length).toBe(chart.length - 2);
    expect([4, 5, 6].map((i) => chordAt(next, i))).toEqual(['A-7', 'D-7', 'G7']);
    survivesSave(next);
  });

  it('pairs the barline across a gap', () => {
    // Cell 3 held the closing half of the `|` on cell 4. Remove it, and the
    // cell that now sits before the barline has to take that half over.
    const next = deleteCells(chart, [3]);
    expect(next[2]!.bars).toContain(')');
    survivesSave(next);
  });
});
