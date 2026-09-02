/**
 * The `irealb://` payload obfuscation.
 *
 * Two independent transforms, applied in this order when decoding:
 *
 *   1. A positional permutation over 50-character blocks. A trailing block of
 *      50 or 51 characters is left alone.
 *   2. Three substring substitutions that expand common sequences.
 *
 * The permutation swaps index pairs, so it is an involution: running it again
 * undoes it. Both substitutions and permutation preserve string length, which
 * is what makes re-encoding possible at all — block boundaries land in the same
 * places in both directions.
 *
 * See docs/ireal-format.md §Unscrambling.
 */

/**
 * Permute one 50-character block. Self-inverse: `obfusc50(obfusc50(s)) === s`.
 *
 * Swaps indices 0..4 with 45..49, and 10..23 with 26..39.
 * Indices 5..9, 24, 25 and 40..44 are left in place.
 */
export function obfusc50(s: string): string {
  const a = s.split('');
  for (let i = 0; i < 5; i++) {
    a[49 - i] = s[i]!;
    a[i] = s[49 - i]!;
  }
  for (let i = 10; i < 24; i++) {
    a[49 - i] = s[i]!;
    a[i] = s[49 - i]!;
  }
  return a.join('');
}

/**
 * Apply the block permutation across a whole payload.
 * Self-inverse, like the block transform it is built from.
 */
export function permuteBlocks(s: string): string {
  let out = '';
  let rest = s;
  while (rest.length > 51) {
    out += obfusc50(rest.slice(0, 50));
    rest = rest.slice(50);
  }
  return out + rest;
}

/** Expand the three encoded sequences. Length-preserving. */
export function expandSubstitutions(s: string): string {
  return s
    .replace(/Kcl/g, '| x')
    .replace(/LZ/g, ' |')
    .replace(/XyQ/g, '   ');
}

/**
 * A chart ending in exactly three spaces followed by its final barline, with
 * nothing after it, keeps those spaces literal — iReal Pro does not encode that
 * last padding run as `XyQ`.
 *
 * This is an empirical quirk of their encoder, not a rule anyone documented.
 * Honouring it is what takes byte-identical round-trip from 95% to 100% across
 * the corpus; without it the export is still musically identical, just not
 * byte-for-byte what iReal Pro would have written.
 */
const LITERAL_TRAILING_PAD = / {3}[Z\]}]$/;

/**
 * Collapse the three sequences back to their encoded forms.
 *
 * The inverse is genuinely ambiguous where patterns overlap — `"  | x"` can be
 * read as `" " + "| x"` or as `" |" + " x"`. We scan left to right taking the
 * first match from a fixed preference order, which reproduces iReal Pro's own
 * output on every song in the test corpus. `roundTrips()` is the check that
 * keeps that claim honest.
 */
export function collapseSubstitutions(s: string): string {
  const rules: ReadonlyArray<readonly [string, string]> = [
    ['| x', 'Kcl'],
    ['   ', 'XyQ'],
    [' |', 'LZ'],
  ];

  let tail = '';
  if (LITERAL_TRAILING_PAD.test(s)) {
    tail = s.slice(-4);
    s = s.slice(0, -4);
  }

  let out = '';
  let i = 0;
  outer: while (i < s.length) {
    for (const [pattern, replacement] of rules) {
      if (s.startsWith(pattern, i)) {
        out += replacement;
        i += pattern.length;
        continue outer;
      }
    }
    out += s[i];
    i += 1;
  }
  return out + tail;
}

/** Decode a scrambled `irealb://` chord payload to readable cell text. */
export function unscramble(payload: string): string {
  return expandSubstitutions(permuteBlocks(payload));
}

/**
 * Re-encode readable cell text back to the scrambled wire form.
 *
 * Substitutions are collapsed first, because block boundaries are measured on
 * the collapsed string — the same string the permutation ran over when the
 * payload was produced.
 */
export function scramble(music: string): string {
  return permuteBlocks(collapseSubstitutions(music));
}

/**
 * Whether a payload survives a decode/encode cycle byte-identically.
 *
 * Export must never corrupt a chart the user did not touch, so the importer
 * records this per song and the exporter re-emits the original bytes when the
 * chart is unedited.
 */
export function roundTrips(payload: string): boolean {
  return scramble(unscramble(payload)) === payload;
}
