import { MUSIC_MARKER } from './parse.js';
import { scramble } from './scramble.js';
import type { Cell, Chord, Scheme } from './types.js';

/**
 * Cells back to payload text — the inverse of `tokenize`.
 *
 * The editor needs this: it mutates the cell grid, and a chart that has been
 * edited has to be written back out. An unedited chart is re-emitted from its
 * stored `raw` payload instead, byte for byte, so this path only runs when the
 * user actually changed something.
 *
 * Byte-identity with iReal Pro's own writer is not the goal here and cannot be:
 * the cell model does not record whether `*A[T44` was written with the section
 * before or after the barline, because nothing downstream cares. What must hold
 * is that `tokenize(serialize(cells))` gives back the same cells — that is the
 * property the corpus test checks, and the one that means saving never
 * corrupts a chart.
 */

/** The written form of a chord, including its bass note and alternate. */
export function chordToText(chord: Chord): string {
  const head = chord.note + chord.modifiers;
  const text = chord.text ? `*${chord.text}*` : '';
  const over = chord.over ? `/${chord.over.note}${chord.over.modifiers}` : '';
  const alternate = chord.alternate ? `(${chordToText(chord.alternate)})` : '';
  return head + text + over + alternate;
}

function openingBarline(bars: string): string {
  if (bars.includes('{')) return '{';
  if (bars.includes('[')) return '[';
  // A plain `|` is stored as `(` on this cell and `)` on the previous one, so
  // emitting it here reproduces both halves.
  if (bars.includes('(')) return '|';
  return '';
}

function closingBarline(bars: string): string {
  if (bars.includes('Z')) return 'Z';
  if (bars.includes('}')) return '}';
  if (bars.includes(']')) return ']';
  // `)` is the mirror of the next cell's `(` and is emitted there, not here.
  return '';
}

/**
 * Write cells as payload text.
 *
 * Each cell is emitted in a canonical order — barline, annotations, comments,
 * spacers, chord, closing barline — which parses back identically even where it
 * differs from the order iReal Pro happened to write.
 */
export function serialize(cells: readonly Cell[]): string {
  let out = '';

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;

    // Spacers come before the barline, not after. `Y` clears the tokenizer's
    // memory of the previous cell, which is what stops a following `|` from
    // also closing the bar behind it — write them the other way round and the
    // chart grows a barline it never had.
    //
    // The flip side: when the bar behind *was* closed and a spacer sits in the
    // way, the closing `|` has to be written explicitly, because the opening
    // bracket that follows can no longer reach back to supply it.
    if (cell.spacer > 0 && cells[i - 1]?.bars.includes(')')) out += '|';
    out += 'Y'.repeat(cell.spacer);
    out += openingBarline(cell.bars);
    for (const annot of cell.annots) out += annot;
    for (const comment of cell.comments) out += `<${comment}>`;
    out += cell.chord ? chordToText(cell.chord) : ' ';
    out += closingBarline(cell.bars);

    // Two chords in neighbouring cells with nothing written between them are
    // separated by a comma, as iReal Pro writes them. Our tokenizer can split
    // `Ab9Ao` without one; iReal Pro is not ours to test, and its own payloads
    // all but never leave it out.
    if (cell.chord && closingBarline(cell.bars) === '' && startsWithChord(cells[i + 1])) out += ',';
  }

  return out;
}

/** Whether a cell's text begins with its chord: nothing written in front of it. */
function startsWithChord(cell: Cell | undefined): boolean {
  return (
    cell !== undefined &&
    cell.chord !== null &&
    cell.chord.note !== ' ' &&
    cell.spacer === 0 &&
    openingBarline(cell.bars) === '' &&
    cell.annots.length === 0 &&
    cell.comments.length === 0
  );
}

/**
 * Trailing padding a chart carries to fill its last row.
 *
 * The tokenizer's final token does not open a new cell, so a serialized chart
 * needs one trailing space to survive a round trip when it ends on a chord.
 */
export function serializeForRoundTrip(cells: readonly Cell[]): string {
  const text = serialize(cells);
  return text.endsWith(' ') ? text : `${text} `;
}

/**
 * Replace the chord payload in a song record, leaving every other field exactly
 * as it was.
 *
 * Rebuilding a record from parsed fields is the wrong move and a tempting one:
 * the title and composer are stored in a sort-first form, so writing back the
 * display name and reading it again reverses "Otis Rush" into "Rush Otis". Only
 * the music changes when a chart is edited, so only the music is rewritten.
 *
 * A multi-part record collapses to one chart here, which is what editing it
 * means — the parts were only ever separate because of a page limit.
 */
export function replaceMusic(record: string, scheme: Scheme, payload: string): string {
  const first = record.split('===')[0] ?? record;
  const parts = first.split('=');

  if (scheme === 'irealbook') {
    while (parts.length < 6) parts.push('');
    parts[5] = payload;
    return parts.join('=');
  }

  while (parts.length < MODERN_UNSET.length) parts.push(MODERN_UNSET[parts.length]!);
  parts[6] = `${MUSIC_MARKER}${scramble(payload)}`;
  return parts.join('=');
}

/**
 * What a modern record holds in a slot it never set, as iReal Pro writes it:
 * transpose and groove empty, tempo and repeat count `0`. Never an empty tempo
 * and repeat count — three empty fields at the end of a record read as the
 * `===` between songs.
 */
export const MODERN_UNSET: readonly string[] = ['', '', '', '', '', '', '', '', '0', '0'];

/**
 * A title as the format stores it, which is not quite how it reads.
 *
 * A leading article goes to the end — "The Gentle Rain" is stored as
 * "Gentle Rain, The" — so it sorts under G in iReal Pro's list as well as ours;
 * `parseTitle` moves it back on the way in. `=` is the field separator and has
 * no escape, so it is dropped rather than allowed to split the record.
 */
export function storedTitle(title: string): string {
  const clean = title.replace(/=/g, '').replace(/\s+/g, ' ').trim();
  return clean.replace(/^(A|An|The) (.+)$/, '$2, $1');
}

/**
 * Replace the title in a song record, leaving every other field exactly as it
 * was — the same rule as `replaceMusic`, for the same reason.
 *
 * Only the first part of a multi-part record is renamed, and the parts after
 * it would then stop reading as its continuation: the song would come back as
 * two. Collapse such a record with `replaceMusic` before renaming it.
 */
export function replaceTitle(record: string, title: string): string {
  const parts = record.split('=');
  parts[0] = storedTitle(title);
  return parts.join('=');
}
