import { describe, expect, it } from 'vitest';
import { parseComposer, parsePlaylist, parseTitle, scramble } from '../src/index.js';

/** A self-authored 12-bar blues. Chord progressions carry no copyright. */
const BLUES_MUSIC = 'T44[F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |G-7   |C7   |F7   |C7   Z';

const irealbookUri = (record: string) => `irealbook://${encodeURIComponent(record)}`;
const irealbUri = (payload: string) => `irealb://${encodeURIComponent(payload)}`;

/** Build a modern-format song record around a readable chord payload. */
function modernRecord(opts: {
  title: string;
  composer?: string;
  style?: string;
  key?: string;
  music: string;
  groove?: string;
  bpm?: number;
  repeats?: number;
  transpose?: number;
}): string {
  const {
    title,
    composer = 'Anon',
    style = 'Medium Swing',
    key = 'F',
    music,
    groove = 'Medium Swing',
    bpm = 160,
    repeats = 3,
    transpose = 0,
  } = opts;
  return [
    title,
    composer,
    '',
    style,
    key,
    String(transpose),
    `1r34LbKcu7${scramble(music)}`,
    groove,
    String(bpm),
    String(repeats),
  ].join('=');
}

describe('parseTitle', () => {
  it('moves a trailing article to the front', () => {
    expect(parseTitle('Gentle Rain, The')).toBe('The Gentle Rain');
    expect(parseTitle('Night Has A Thousand Eyes, The')).toBe('The Night Has A Thousand Eyes');
    expect(parseTitle('Foggy Day, A')).toBe('A Foggy Day');
  });

  it('leaves an ordinary title alone', () => {
    expect(parseTitle('All Blues')).toBe('All Blues');
    expect(parseTitle('Blue in Green')).toBe('Blue in Green');
  });
});

describe('parseComposer', () => {
  it('un-reverses a two-word name', () => {
    expect(parseComposer('Timmons Bobby')).toBe('Bobby Timmons');
    expect(parseComposer('Davis Miles')).toBe('Miles Davis');
  });

  it('leaves anything else alone, exactly as iReal Pro does', () => {
    expect(parseComposer('Cedar Extra Name Walton')).toBe('Cedar Extra Name Walton');
    expect(parseComposer('Anon')).toBe('Anon');
    expect(parseComposer('')).toBe('');
  });
});

describe('parsePlaylist — modern format', () => {
  it('reads every metadata field off a song record', () => {
    const uri = irealbUri(`${modernRecord({ title: 'Blues Fixture', music: BLUES_MUSIC })}===Test Set`);
    const playlist = parsePlaylist(uri);

    expect(playlist.scheme).toBe('irealb');
    expect(playlist.name).toBe('Test Set');
    expect(playlist.failures).toEqual([]);
    expect(playlist.songs).toHaveLength(1);

    const song = playlist.songs[0]!;
    expect(song.title).toBe('Blues Fixture');
    expect(song.composer).toBe('Anon');
    expect(song.style).toBe('Medium Swing');
    expect(song.key).toBe('F');
    expect(song.groove).toBe('Medium Swing');
    expect(song.bpm).toBe(160);
    expect(song.repeats).toBe(3);
    expect(song.transpose).toBe(0);
  });

  it('unscrambles the payload back to the written chart', () => {
    const uri = irealbUri(modernRecord({ title: 'Blues Fixture', music: BLUES_MUSIC }));
    const song = parsePlaylist(uri).songs[0]!;
    expect(song.music).toBe(BLUES_MUSIC);
  });

  it('produces cells with the chords in the right places', () => {
    const uri = irealbUri(modernRecord({ title: 'Blues Fixture', music: BLUES_MUSIC }));
    const cells = parsePlaylist(uri).songs[0]!.cells;
    const symbols = cells.filter((c) => c.chord).map((c) => c.chord!.note + c.chord!.modifiers);
    expect(symbols).toEqual([
      'F7', 'Bb7', 'F7', 'F7', 'Bb7', 'Bb7', 'F7', 'F7', 'G-7', 'C7', 'F7', 'C7',
    ]);
  });

  it('defaults the repeat count to 3 when unset', () => {
    const record = modernRecord({ title: 'X', music: BLUES_MUSIC }).replace(/=3$/, '=');
    expect(parsePlaylist(irealbUri(record)).songs[0]!.repeats).toBe(3);
  });

  it('keeps the raw payload so an untouched chart can be re-exported byte-identically', () => {
    const record = modernRecord({ title: 'X', music: BLUES_MUSIC });
    const song = parsePlaylist(irealbUri(record)).songs[0]!;
    expect(scramble(song.music)).toBe(song.raw);
  });
});

describe('parsePlaylist — legacy format', () => {
  it('reads the legacy field order and plain-text payload', () => {
    const record = ['Blues Fixture', 'Anon', 'Medium Swing', 'F', 'n', BLUES_MUSIC].join('=');
    const song = parsePlaylist(irealbookUri(record)).songs[0]!;

    expect(song.title).toBe('Blues Fixture');
    expect(song.composer).toBe('Anon');
    expect(song.style).toBe('Medium Swing');
    expect(song.key).toBe('F');
    expect(song.music).toBe(BLUES_MUSIC);
    expect(song.cells.some((c) => c.chord?.note === 'F')).toBe(true);
  });
});

describe('parsePlaylist — multiple songs', () => {
  it('splits records on ===', () => {
    const payload = [
      modernRecord({ title: 'One', music: BLUES_MUSIC }),
      modernRecord({ title: 'Two', music: BLUES_MUSIC }),
      'Two Song Set',
    ].join('===');
    const playlist = parsePlaylist(irealbUri(payload));
    expect(playlist.songs.map((s) => s.title)).toEqual(['One', 'Two']);
    expect(playlist.name).toBe('Two Song Set');
  });

  it('merges consecutive parts of a multi-part song', () => {
    const payload = [
      modernRecord({ title: 'Long Tune 1', music: BLUES_MUSIC }),
      modernRecord({ title: 'Long Tune 2', music: BLUES_MUSIC }),
      modernRecord({ title: 'Other Tune', music: BLUES_MUSIC }),
    ].join('===');
    const playlist = parsePlaylist(irealbUri(payload));

    expect(playlist.songs.map((s) => s.title)).toEqual(['Long Tune 1', 'Other Tune']);
    const merged = playlist.songs[0]!;
    const chords = merged.cells.filter((c) => c.chord).length;
    expect(chords).toBe(24); // both halves, not just the first page
  });

  it('does not merge two distinct titles', () => {
    const payload = [
      modernRecord({ title: 'Autumn Leaves', music: BLUES_MUSIC }),
      modernRecord({ title: 'Summer Leaves', music: BLUES_MUSIC }),
    ].join('===');
    expect(parsePlaylist(irealbUri(payload)).songs).toHaveLength(2);
  });
});

describe('record round-trip', () => {
  it('keeps the record verbatim, so reparsing is idempotent', () => {
    // Field parsing is not idempotent: a two-word composer is stored last name
    // first. Re-encoding the parsed name and reading it back would turn
    // "Otis Rush" into "Rush Otis" on every save/load cycle.
    const record = ['All Your Love', 'Rush Otis', 'Slow Blues', 'E-', 'n', BLUES_MUSIC].join('=');
    const song = parsePlaylist(irealbookUri(record)).songs[0]!;
    expect(song.composer).toBe('Otis Rush');
    expect(song.record).toBe(record);

    const again = parsePlaylist(irealbookUri(song.record)).songs[0]!;
    expect(again.composer).toBe('Otis Rush');
    expect(again.record).toBe(record);
  });

  it('survives repeated save and load cycles unchanged', () => {
    let song = parsePlaylist(
      irealbUri(modernRecord({ title: 'Gentle Rain, The', composer: 'Bonfa Luiz', music: BLUES_MUSIC })),
    ).songs[0]!;
    const first = { title: song.title, composer: song.composer };
    for (let i = 0; i < 5; i++) {
      song = parsePlaylist(irealbUri(song.record)).songs[0]!;
    }
    expect({ title: song.title, composer: song.composer }).toEqual(first);
    expect(song.title).toBe('The Gentle Rain');
    expect(song.composer).toBe('Luiz Bonfa');
  });

  it('keeps both halves of a merged multi-part song', () => {
    const payload = [
      modernRecord({ title: 'Long Tune 1', music: BLUES_MUSIC }),
      modernRecord({ title: 'Long Tune 2', music: BLUES_MUSIC }),
    ].join('===');
    const song = parsePlaylist(irealbUri(payload)).songs[0]!;
    const chords = (s: typeof song) => s.cells.filter((c) => c.chord).length;

    const reparsed = parsePlaylist(irealbUri(song.record)).songs[0]!;
    expect(reparsed.title).toBe('Long Tune 1');
    expect(chords(reparsed)).toBe(chords(song));
  });
});

describe('parsePlaylist — resilience', () => {
  it('collects a bad record instead of losing the whole playlist', () => {
    const payload = [
      modernRecord({ title: 'Good', music: BLUES_MUSIC }),
      'Broken=Composer==Style=C=0=no-marker-here=Groove=120=3',
      modernRecord({ title: 'Also Good', music: BLUES_MUSIC }),
    ].join('===');
    const playlist = parsePlaylist(irealbUri(payload));

    expect(playlist.songs.map((s) => s.title)).toEqual(['Good', 'Also Good']);
    expect(playlist.failures).toHaveLength(1);
    expect(playlist.failures[0]!.title).toBe('Broken');
    expect(playlist.failures[0]!.message).toContain('1r34LbKcu7');
  });
});
