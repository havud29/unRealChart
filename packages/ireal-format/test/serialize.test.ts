import { describe, expect, it } from 'vitest';
import {
  chordToText,
  parsePlaylist,
  replaceMusic,
  serialize,
  serializeForRoundTrip,
  tokenize,
} from '../src/index.js';

/**
 * The property that matters: writing cells out and reading them back gives the
 * same cells. That is what makes the editor safe to save from.
 */
const roundTrips = (music: string) =>
  JSON.stringify(tokenize(serializeForRoundTrip(tokenize(music)))) ===
  JSON.stringify(tokenize(music));

describe('chordToText', () => {
  it('writes a plain chord', () => {
    expect(chordToText({ note: 'C', modifiers: '^7', text: null, over: null, alternate: null })).toBe(
      'C^7',
    );
  });

  it('writes a slash chord', () => {
    expect(
      chordToText({
        note: 'C',
        modifiers: '^7',
        text: null,
        over: { note: 'G', modifiers: '', text: null, over: null, alternate: null },
        alternate: null,
      }),
    ).toBe('C^7/G');
  });

  it('writes an alternate chord in brackets', () => {
    expect(
      chordToText({
        note: 'C',
        modifiers: '6',
        text: null,
        over: null,
        alternate: { note: 'A', modifiers: '-7', text: null, over: null, alternate: null },
      }),
    ).toBe('C6(A-7)');
  });

  it('keeps private text in its delimiters', () => {
    // Without the asterisks this reads back as a chord whose quality is "solo".
    expect(
      chordToText({ note: 'B', modifiers: '', text: 'solo', over: null, alternate: null }),
    ).toBe('B*solo*');
  });
});

describe('serialize', () => {
  it('round-trips a plain chart', () => {
    expect(roundTrips('*A[T44C^7   |A-7 D-7 |G7   |C6   Z')).toBe(true);
  });

  it('round-trips repeats and endings', () => {
    expect(roundTrips('{T44C7   |F7   |N1G7   }|N2A7   Z')).toBe(true);
  });

  it('round-trips comments and directives', () => {
    expect(roundTrips('[T44C7   |F7<D.C. al Fine>   |G7<Fine>   Z')).toBe(true);
  });

  it('round-trips the pseudo-roots', () => {
    expect(roundTrips('[T44n   | x  |   r|    |W/G   |p   Z')).toBe(true);
  });

  it('round-trips chord sizes and fermatas', () => {
    expect(roundTrips('[T44sC7,B7,Bb7lA7   |fC^7   Z')).toBe(true);
  });

  it('round-trips private chord text', () => {
    expect(roundTrips('[T44B*solo break*   |C^7   Z')).toBe(true);
  });

  it('round-trips a spacer that swallows a barline', () => {
    // `|Y{` is the awkward one: the spacer clears the tokenizer's memory, so the
    // closing barline has to be written explicitly or the bar behind loses it.
    expect(roundTrips('[T44C7   |Y{<*74Verse>F7   |Bb7   }')).toBe(true);
  });

  it('round-trips adjacent chords that could be misread as one', () => {
    // `A` then `B` must not come back as a single chord with a flat.
    const cells = tokenize('[T44A,B,B,C,B,B,B,BZ');
    const again = tokenize(serializeForRoundTrip(cells));
    expect(again.filter((c) => c.chord).length).toBe(cells.filter((c) => c.chord).length);
    expect(roundTrips('[T44A,B,B,C,B,B,B,BZ')).toBe(true);
  });

  it('round-trips every meter', () => {
    for (const meter of ['24', '34', '44', '54', '64', '74', '38', '58', '68', '78', '98', '12', '22', '32']) {
      expect(roundTrips(`[T${meter}C^7   |F7 G7 |A7   Z`), `meter ${meter}`).toBe(true);
    }
  });

  it('writes something a human can read', () => {
    const text = serialize(tokenize('*A[T44C^7   |A-7   Z'));
    expect(text).toContain('C^7');
    expect(text).toContain('*A');
    expect(text).toContain('T44');
  });

  it('handles an empty chart', () => {
    expect(serialize([])).toBe('');
  });
});

describe('replaceMusic', () => {
  const legacy = ['All Your Love', 'Rush Otis', 'Slow Blues', 'E-', 'n', '[T44E-   Z'].join('=');

  it('changes the music and nothing else', () => {
    const next = replaceMusic(legacy, 'irealbook', '[T44A^7   Z');
    expect(next.split('=').slice(0, 5)).toEqual(['All Your Love', 'Rush Otis', 'Slow Blues', 'E-', 'n']);
    expect(next.split('=')[5]).toBe('[T44A^7   Z');
  });

  it('does not reverse a two-word composer on every save', () => {
    // The trap: rebuilding the record from the parsed composer turns
    // "Otis Rush" into "Rush Otis", once per save.
    let record = legacy;
    for (let i = 0; i < 5; i++) {
      const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
      expect(song.composer).toBe('Otis Rush');
      record = replaceMusic(song.record, 'irealbook', serializeForRoundTrip(song.cells));
    }
  });

  it('re-scrambles the payload for the modern scheme', () => {
    const modern = ['T', 'C', '', 'Style', 'C', '0', '1r34LbKcu7xx', 'Groove', '120', '3'].join('=');
    const next = replaceMusic(modern, 'irealb', '[T44C^7   Z');
    const song = parsePlaylist(`irealb://${encodeURIComponent(next)}`).songs[0]!;
    expect(song.music).toBe('[T44C^7   Z');
    expect(song.bpm).toBe(120);
    expect(song.groove).toBe('Groove');
  });

  it('collapses a multi-part record to a single chart', () => {
    const multi = `${legacy}===${legacy}`;
    const next = replaceMusic(multi, 'irealbook', '[T44C^7   Z');
    expect(next).not.toContain('===');
  });
});
