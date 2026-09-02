import type { Cell, Chord } from './types.js';

/**
 * Turn unscrambled chord-payload text into the 16-per-row cell grid.
 *
 * Two passes, mirroring how the format is built:
 *   1. Greedy tokenize — first matching pattern wins, unmatched characters fall
 *      through as single-character tokens.
 *   2. Fold — barlines, annotations and comments attach to the cell they belong
 *      to; only chords and spaces advance the cell cursor.
 *
 * See docs/ireal-format.md §Tokenizing.
 */

/**
 * A complete chord. Capture groups:
 *   1 root, 2 quality/extensions, 3 private text in `*...*`,
 *   4 bass note, 5 alternate chord in parentheses.
 */
export const CHORD_RE =
  /^([A-G][b#]?)((?:sus|alt|add|[+\-^\dhob#])*)(\*.+?\*)*(\/[A-G][#b]?)?(\(.*?\))?/;

/**
 * The pseudo-roots: space (empty cell that may still carry a bass note or
 * alternate), `W` invisible root, `p` repeat previous chord. Empty capture
 * groups keep the match shape identical to CHORD_RE.
 */
export const PSEUDO_CHORD_RE = /^([ Wp])()()(\/[A-G][#b]?)?(\(.*?\))?/;

const TOKEN_PATTERNS: readonly RegExp[] = [
  /^\*[a-zA-Z]/, // section marker: *A, *B, *i, *v
  /^T\d\d/, // time signature: T44, T34, T12 (= 12/8)
  /^N./, // ending bracket: N1, N2, N3
  /^<.*?>/, // comment or repeat directive
  CHORD_RE,
  PSEUDO_CHORD_RE,
];

/** A tokenizer output: either a literal token, or a chord match array. */
type Token = string | RegExpExecArray;

function makeChord(
  note: string,
  modifiers = '',
  over: Chord | null = null,
  alternate: Chord | null = null,
  text: string | null = null,
): Chord {
  return { note, modifiers, text, over, alternate };
}

function emptyCell(): Cell {
  return { annots: [], comments: [], bars: '', spacer: 0, chord: null };
}

/** Pass 1: greedy left-to-right tokenize. */
function scan(text: string): Token[] {
  const tokens: Token[] = [];
  let rest = text;

  while (rest.length > 0) {
    let matched = false;
    for (const pattern of TOKEN_PATTERNS) {
      const m = pattern.exec(rest);
      if (!m) continue;
      // Patterns without capture groups yield literal tokens; the two chord
      // patterns carry captures and are passed through as match arrays.
      tokens.push(m.length <= 2 ? m[0] : m);
      rest = rest.slice(m[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      // Commas are pure separators and carry no meaning.
      if (rest[0] !== ',') tokens.push(rest[0]!);
      rest = rest.slice(1);
    }
  }
  return tokens;
}

/** Build a Chord from a CHORD_RE / PSEUDO_CHORD_RE match. */
function parseChordMatch(m: RegExpExecArray): Chord | null {
  const note = m[1] || ' ';
  const modifiers = m[2] || '';

  // Private text in *...* is the user's own annotation, not part of the chord.
  const privateRaw = m[3] || '';
  const text = privateRaw ? privateRaw.slice(1, -1) : null;

  const overRaw = (m[4] || '').replace(/^\//, '');

  let alternate: Chord | null = null;
  const alternateRaw = m[5];
  if (alternateRaw) {
    const inner = CHORD_RE.exec(alternateRaw.slice(1, -1));
    alternate = inner ? parseChordMatch(inner) : null;
  }

  // A cell holding nothing but a space is genuinely empty.
  if (note === ' ' && !alternate && !overRaw && !text) return null;

  let over: Chord | null = null;
  if (overRaw) {
    const rootLength = overRaw[1] === '#' || overRaw[1] === 'b' ? 2 : 1;
    over = makeChord(overRaw.slice(0, rootLength), overRaw.slice(rootLength));
  }

  return makeChord(note, modifiers, over, alternate, text);
}

/**
 * Pass 2: fold tokens into cells.
 *
 * Barline handling uses an internal vocabulary that distinguishes the two
 * sides of a plain `|`: it both closes the previous cell and opens this one, so
 * it becomes `)` on the previous cell and `(` on this one. Double bars and
 * repeat brackets keep their own characters.
 */
function fold(tokens: Token[]): Cell[] {
  const cells: Cell[] = [];
  let current = emptyCell();
  cells.push(current);
  let previous: Cell | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    let literal: string | null;

    if (typeof token !== 'string') {
      current.chord = parseChordMatch(token);
      literal = ' '; // a chord occupies its cell, so the cursor advances
    } else {
      literal = token;
    }

    switch (literal[0]) {
      case '{': // open repeat
      case '[': // open double barline
        if (previous) {
          previous.bars += ')';
          previous = null;
        }
        current.bars = literal;
        literal = null;
        break;

      case '|': // single barline: closes the previous cell, opens this one
        if (previous) {
          previous.bars += ')';
          previous = null;
        }
        current.bars = '(';
        literal = null;
        break;

      case ']': // close double barline
      case '}': // close repeat
      case 'Z': // final double barline
        if (previous) {
          previous.bars += literal;
          previous = null;
        }
        literal = null;
        break;

      case 'n': // N.C.
        current.chord = makeChord('n');
        break;

      case ',': // separator
        literal = null;
        break;

      case 'S': // segno
      case 'T': // time signature
      case 'Q': // coda
      case 'N': // ending bracket
      case 'U': // end
      case 's': // small chord size (sticky until `l`)
      case 'l': // normal chord size (sticky until `s`)
      case 'f': // fermata
      case '*': // section marker
        current.annots.push(literal);
        literal = null;
        break;

      case 'Y': // vertical spacer
        current.spacer++;
        literal = null;
        previous = null;
        break;

      case 'r': // repeat previous two bars
      case 'x': // repeat previous bar
      case 'W': // invisible root
        current.chord = makeChord(literal);
        break;

      case '<': // comment or repeat directive
        current.comments.push(literal.slice(1, -1));
        literal = null;
        break;

      default:
        break;
    }

    // Only chords and spaces move the cursor on; barlines, annotations and
    // comments attach to the cell they were found in.
    if (literal && i < tokens.length - 1) {
      previous = current;
      current = emptyCell();
      cells.push(current);
    }
  }

  return cells;
}

/** Tokenize unscrambled payload text into cells. */
export function tokenize(music: string): Cell[] {
  return fold(scan(music.trim()));
}
