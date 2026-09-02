import type { Cell, Chord, Song } from './types.js';

/**
 * Plain-text chart rendering, for eyeballing a parse against the real app.
 *
 * This is a development tool, not the renderer. It exists because the fastest
 * way to find a tokenizer bug is to look at a chart you know and see the chords
 * land in the wrong cells.
 */

const CELL_WIDTH = 7;
const CELLS_PER_ROW = 16;

/** Render a chord the way it was written, with the pseudo-roots spelled out. */
export function chordToString(chord: Chord | null): string {
  if (!chord) return '';
  switch (chord.note) {
    case ' ':
      return '';
    case 'n':
      return 'N.C.';
    case 'p':
      return '/'; // repeat previous chord
    case 'x':
      return '%'; // repeat previous bar
    case 'r':
      return '%%'; // repeat previous two bars
    default:
      break;
  }
  let out = chord.note === 'W' ? '' : chord.note + chord.modifiers;
  if (chord.over) out += `/${chord.over.note}${chord.over.modifiers}`;
  if (chord.alternate) out += `(${chordToString(chord.alternate)})`;
  return out;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

function openMark(bars: string): string {
  if (bars.includes('{')) return '|:';
  if (bars.includes('[')) return '||';
  if (bars.includes('(')) return '| ';
  return '  ';
}

function closeMark(bars: string): string {
  if (bars.includes('}')) return ':|';
  if (bars.includes('Z')) return '||';
  if (bars.includes(']')) return '||';
  return '';
}

/** Render cells as rows of 16, with an annotation line above each row. */
export function formatCells(cells: Cell[]): string {
  const lines: string[] = [];

  for (let start = 0; start < cells.length; start += CELLS_PER_ROW) {
    const row = cells.slice(start, start + CELLS_PER_ROW);

    let annotLine = '';
    let chordLine = '';
    const comments: string[] = [];

    for (const cell of row) {
      const annots = cell.annots.join(' ');
      annotLine += pad(annots, CELL_WIDTH + 2);
      chordLine += openMark(cell.bars) + pad(chordToString(cell.chord), CELL_WIDTH);
      const close = closeMark(cell.bars);
      if (close) chordLine = chordLine.slice(0, -close.length) + close;
      for (const comment of cell.comments) comments.push(comment);
    }

    if (annotLine.trim()) lines.push(annotLine.trimEnd());
    lines.push(chordLine.trimEnd());
    for (const comment of comments) lines.push(`      <${comment}>`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Render a whole song: header block plus the chart. */
export function formatSong(song: Song): string {
  const header = [
    song.title,
    song.composer,
    [
      song.style,
      song.key,
      song.groove && song.groove !== song.style ? `groove: ${song.groove}` : '',
      song.bpm ? `${song.bpm} bpm` : '',
      `x${song.repeats}`,
      song.transpose ? `transpose ${song.transpose}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  ].join('\n');

  return `${header}\n${'-'.repeat(72)}\n${formatCells(song.cells)}`;
}
