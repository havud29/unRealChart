import type { Cell, Chord } from '@unrealchart/ireal-format';
import { chordToText, serializeForRoundTrip, tokenize } from '@unrealchart/ireal-format';

/**
 * Editing the cell grid.
 *
 * Every operation is a pure function from cells to cells, which makes undo a
 * matter of keeping snapshots rather than writing an inverse for each one. For
 * a chart of a few hundred small objects that is far cheaper than the bugs an
 * inverse-per-operation scheme invites — and it cannot drift out of step with
 * the forward operation, because there is only one.
 */

export const CELLS_PER_ROW = 16;

function clone(cells: readonly Cell[]): Cell[] {
  return cells.map((cell) => ({
    annots: [...cell.annots],
    comments: [...cell.comments],
    bars: cell.bars,
    spacer: cell.spacer,
    chord: cell.chord ? cloneChord(cell.chord) : null,
  }));
}

function cloneChord(chord: Chord): Chord {
  return {
    note: chord.note,
    modifiers: chord.modifiers,
    text: chord.text,
    over: chord.over ? cloneChord(chord.over) : null,
    alternate: chord.alternate ? cloneChord(chord.alternate) : null,
  };
}

export function emptyCell(): Cell {
  return { annots: [], comments: [], bars: '', spacer: 0, chord: null };
}

/* -------------------------------------------------------------------------
 * Chord input
 * ---------------------------------------------------------------------- */

/**
 * The chord family, as people type it.
 *
 * Case matters exactly once, and it matters a lot: `M` means major and `m`
 * means minor, so `CM7` and `Cm7` are different chords. Spelled-out prefixes
 * (`maj`, `min`, `mi`) are unambiguous and read either way — but `ma`/`maj`
 * must be tried before a bare `m`, or `Cmaj7` reads as C minor.
 *
 * Order is the whole correctness argument here.
 */
const FAMILY_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  // Half-diminished, in all its spellings.
  [/^(?:min|minor|mi)7(?:b5|-5)/i, 'h7'],
  [/^m7(?:b5|-5)/, 'h7'],
  [/^-7(?:b5|-5)/, 'h7'],
  [/^(?:ø|h)7?/, 'h7'],

  // Minor-major, before plain minor swallows the `m`.
  [/^(?:min|minor|mi|m|-)(?:maj|ma|M|Δ|\^)9/, '-^9'],
  [/^(?:min|minor|mi|m|-)(?:maj|ma|M|Δ|\^)7?/, '-^7'],

  [/^(?:dim|°)7/i, 'o7'],
  [/^o7/, 'o7'],
  [/^(?:dim|°)/i, 'o'],
  [/^aug/i, '+'],

  // Spelled-out prefixes first, then the single letters where case decides.
  [/^(?:maj|major|ma)/i, '^'],
  [/^(?:Δ|\^)/, '^'],
  [/^M/, '^'],
  [/^(?:min|minor|mi)/i, '-'],
  [/^[m-]/, '-'],
];

/** Extensions written differently from how the payload stores them. */
const EXTENSION_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  // The format writes a six-nine chord as `69`, whatever the chart prints.
  [/^6\/9/, '69'],
  [/^69/, '69'],
];

/**
 * Read a chord the way a musician would type it.
 *
 * Deliberately forgiving about spelling — `Cmaj7`, `CM7`, `CΔ7` and `C^7` are
 * the same chord — and deliberately strict about the result: whatever comes out
 * is re-tokenized, and rejected if it does not come back as exactly the chord
 * we thought we built. That is what stops a typo becoming a corrupt chart.
 */
export function parseChordInput(input: string): Chord | null {
  const text = input.trim();
  if (text === '') return null;

  // The pseudo-roots people type as words.
  const lower = text.toLowerCase();
  if (lower === 'n.c.' || lower === 'nc' || lower === 'n') {
    return { note: 'n', modifiers: '', text: null, over: null, alternate: null };
  }
  if (text === '%' || lower === 'x') {
    return { note: 'x', modifiers: '', text: null, over: null, alternate: null };
  }
  if (text === '/' || lower === 'p') {
    return { note: 'p', modifiers: '', text: null, over: null, alternate: null };
  }

  const match = /^([A-Ga-g])([b#♭♯]?)(.*)$/.exec(text);
  if (!match) return null;

  const root = match[1]!.toUpperCase() + (match[2] ?? '').replace('♭', 'b').replace('♯', '#');
  let rest = (match[3] ?? '').trim();

  // A slash chord: split the bass off before reading the quality.
  let bass: Chord | null = null;
  const slash = rest.lastIndexOf('/');
  // `6/9` is a quality, not a slash chord.
  if (slash >= 0 && !/^6\/9$/.test(rest)) {
    const bassText = rest.slice(slash + 1).trim();
    const bassMatch = /^([A-Ga-g])([b#♭♯]?)$/.exec(bassText);
    if (bassMatch) {
      bass = {
        note: bassMatch[1]!.toUpperCase() + (bassMatch[2] ?? '').replace('♭', 'b').replace('♯', '#'),
        modifiers: '',
        text: null,
        over: null,
        alternate: null,
      };
      rest = rest.slice(0, slash).trim();
    }
  }

  let quality = '';
  let remaining = rest;

  // The family is read once, at the front, where the case rules apply.
  for (const [pattern, replacement] of FAMILY_ALIASES) {
    const m = pattern.exec(remaining);
    if (!m) continue;
    quality += replacement;
    remaining = remaining.slice(m[0].length);
    break;
  }

  // Then extensions and alterations, which are the same in both vocabularies
  // apart from a couple of spellings.
  let guard = 0;
  while (remaining.length > 0 && guard++ < 16) {
    const alias = EXTENSION_ALIASES.find(([pattern]) => pattern.test(remaining));
    if (alias) {
      quality += alias[1];
      remaining = remaining.slice(alias[0].exec(remaining)![0].length);
      continue;
    }
    const raw = /^(sus|alt|add|[+\-^\dhob#])/.exec(remaining);
    if (!raw) return null; // something we cannot make sense of
    quality += raw[0];
    remaining = remaining.slice(raw[0].length);
  }
  if (remaining.length > 0) return null;

  const chord: Chord = { note: root, modifiers: quality, text: null, over: bass, alternate: null };

  // Prove it: what we built must read back as itself.
  const cells = tokenize(`${chordToText(chord)} `);
  const parsed = cells[0]?.chord;
  if (!parsed || chordToText(parsed) !== chordToText(chord)) return null;
  return parsed;
}

/* -------------------------------------------------------------------------
 * Operations
 * ---------------------------------------------------------------------- */

export function setChord(cells: readonly Cell[], index: number, chord: Chord | null): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;
  cell.chord = chord;
  return next;
}

/** Toggle a one-off annotation such as `S`, `Q`, `U` or `f`. */
export function toggleAnnotation(cells: readonly Cell[], index: number, annot: string): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;
  const at = cell.annots.indexOf(annot);
  if (at >= 0) cell.annots.splice(at, 1);
  else cell.annots.push(annot);
  return next;
}

/** Set an annotation that has one value per cell: section, meter, ending. */
export function setAnnotation(
  cells: readonly Cell[],
  index: number,
  prefix: RegExp,
  value: string | null,
): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;
  cell.annots = cell.annots.filter((a) => !prefix.test(a));
  if (value) cell.annots.push(value);
  return next;
}

export const SECTION = /^\*/;
export const METER = /^T\d\d$/;
export const ENDING = /^N\d/;

export type OpenBarline = 'none' | 'single' | 'double' | 'repeat';
export type CloseBarline = 'none' | 'double' | 'repeat' | 'final';

const OPEN_CHARS: Record<OpenBarline, string> = {
  none: '',
  single: '(',
  double: '[',
  repeat: '{',
};
const CLOSE_CHARS: Record<CloseBarline, string> = {
  none: '',
  double: ']',
  repeat: '}',
  final: 'Z',
};

/**
 * Set the barline that opens a cell.
 *
 * The closing half of a plain `|` lives on the previous cell, so both have to
 * move together — editing one and not the other leaves a barline drawn on one
 * side only.
 */
export function setOpenBarline(cells: readonly Cell[], index: number, kind: OpenBarline): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;

  cell.bars = cell.bars.replace(/[[{(]/g, '');
  cell.bars = OPEN_CHARS[kind] + cell.bars;

  const previous = next[index - 1];
  if (previous) {
    previous.bars = previous.bars.replace(/\)/g, '');
    if (kind === 'single') previous.bars += ')';
  }
  return next;
}

/**
 * Set the barline that closes a cell.
 *
 * A repeat, double or final bar supersedes a plain `|`, so the two halves of
 * that `|` — the `)` here and the `(` on the next cell — have to go with it.
 * Leaving them produces a cell closed by two different barlines at once, which
 * is a state no chart can be parsed into and which quietly loses one of them on
 * the next save.
 */
export function setCloseBarline(cells: readonly Cell[], index: number, kind: CloseBarline): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;

  cell.bars = cell.bars.replace(/[\]}Z]/g, '');
  if (kind !== 'none') {
    cell.bars = cell.bars.replace(/\)/g, '');
    const following = next[index + 1];
    if (following) following.bars = following.bars.replace(/\(/g, '');
  }
  cell.bars += CLOSE_CHARS[kind];
  return next;
}

export function setComment(cells: readonly Cell[], index: number, comment: string | null): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;
  cell.comments = comment && comment.trim() ? [comment.trim()] : [];
  return next;
}

export function setSpacer(cells: readonly Cell[], index: number, spacer: number): Cell[] {
  const next = clone(cells);
  const cell = next[index];
  if (!cell) return next;
  cell.spacer = Math.max(0, Math.min(6, Math.round(spacer)));
  return next;
}

/** Insert an empty cell, pushing the rest along. */
export function insertCell(cells: readonly Cell[], index: number): Cell[] {
  const next = clone(cells);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, emptyCell());
  return next;
}

export function deleteCell(cells: readonly Cell[], index: number): Cell[] {
  const next = clone(cells);
  if (index >= 0 && index < next.length) next.splice(index, 1);
  return next;
}

/** Add a row of 16 empty cells at the end — a new line of the chart. */
export function appendRow(cells: readonly Cell[]): Cell[] {
  const next = clone(cells);
  for (let i = 0; i < CELLS_PER_ROW; i++) next.push(emptyCell());
  return next;
}

/** Write cells back to payload text, ready to be re-encoded into a record. */
export function toPayload(cells: readonly Cell[]): string {
  return serializeForRoundTrip(cells);
}

/* -------------------------------------------------------------------------
 * History
 * ---------------------------------------------------------------------- */

export interface HistoryEntry {
  label: string;
  cells: Cell[];
}

/**
 * Undo and redo, by snapshot.
 *
 * Consecutive edits with the same label collapse into one entry, so holding a
 * key down does not fill the stack with a hundred single-character steps.
 */
export class EditHistory {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(
    private current: Cell[],
    private readonly limit = 200,
  ) {}

  get cells(): Cell[] {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  apply(label: string, next: Cell[], coalesce = false): Cell[] {
    const previous = this.past[this.past.length - 1];
    if (!(coalesce && previous?.label === label)) {
      this.past.push({ label, cells: this.current });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.current = next;
    return next;
  }

  undo(): Cell[] {
    const entry = this.past.pop();
    if (!entry) return this.current;
    this.future.push({ label: entry.label, cells: this.current });
    this.current = entry.cells;
    return this.current;
  }

  redo(): Cell[] {
    const entry = this.future.pop();
    if (!entry) return this.current;
    this.past.push({ label: entry.label, cells: this.current });
    this.current = entry.cells;
    return this.current;
  }

  reset(cells: Cell[]): void {
    this.current = cells;
    this.past = [];
    this.future = [];
  }
}
