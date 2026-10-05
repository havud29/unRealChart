import { describe, expect, it } from 'vitest';
import {
  parsePlaylist,
  recordFor,
  replaceMusic,
  scramble,
  serializeForRoundTrip,
  toHtml,
  toPayload,
  toUri,
} from '../src/index.js';
import type { Song } from '../src/index.js';

const BLUES = 'T44[F7   |Bb7   |F7   |C7   Z';

function song(title: string, composer = 'Anon'): Song {
  const record = [title, composer, 'Medium Swing', 'F', 'n', BLUES].join('=');
  return parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
}

describe('toPayload', () => {
  it('joins records and puts the playlist name last', () => {
    const payload = toPayload([song('One'), song('Two')], 'My Set');
    expect(payload.split('===')).toHaveLength(3);
    expect(payload.split('===').pop()).toBe('My Set');
  });

  it('leaves a single shared song unnamed, with no separator after it', () => {
    // iReal Pro's own single-song shares end with the record. A trailing `===`
    // with nothing after it reads as a playlist with an empty name.
    const one = song('One');
    const payload = toPayload([one]);
    expect(payload).toBe(one.record);
    expect(parsePlaylist(`irealbook://${encodeURIComponent(payload)}`).name).toBeNull();
  });
});

describe('recordFor', () => {
  // A chart written in the app: a legacy record, whatever the library holds.
  const legacy = ['Gentle Rain, The', 'Bonfa Luiz', 'Bossa Nova', 'A-', 'n', BLUES].join('=');
  const modern = [
    'Moanin\'',
    'Timmons Bobby',
    '',
    'Medium Swing',
    'F-',
    '',
    `1r34LbKcu7${scramble(BLUES)}`,
    'Hard Bop',
    '120',
    '3',
  ].join('=');

  const read = (uri: string) => {
    const playlist = parsePlaylist(uri);
    expect(playlist.failures).toEqual([]);
    return playlist.songs;
  };

  it('writes a legacy record as a modern one that reads back as the same chart', () => {
    const record = recordFor(legacy, 'irealb');
    const fields = record.split('=');
    expect(fields).toHaveLength(10);
    expect(fields[6]!.startsWith('1r34LbKcu7')).toBe(true);
    // Unset as iReal Pro writes it: never an empty tempo or repeat count.
    expect(fields.slice(7)).toEqual(['', '0', '0']);

    const [back] = read(`irealb://${encodeURIComponent(record)}`);
    expect(back!.title).toBe('The Gentle Rain');
    expect(back!.composer).toBe('Luiz Bonfa');
    expect(back!.style).toBe('Bossa Nova');
    expect(back!.key).toBe('A-');
    expect(back!.music).toBe(BLUES);
  });

  it('credits an unknown composer rather than leave the field empty', () => {
    // A chart written here has no composer, and the modern slot after it is
    // always empty: `Untitled===Medium Swing` would split at the song separator.
    const blank = ['Untitled', '', 'Medium Swing', 'C', 'n', BLUES].join('=');
    const record = recordFor(blank, 'irealb');
    expect(record).not.toContain('===');
    const [back, ...rest] = read(toUri([parsePlaylist(`irealbook://${encodeURIComponent(blank)}`).songs[0]!]));
    expect(rest).toEqual([]);
    expect(back!.title).toBe('Untitled');
    expect(back!.composer).toBe('Unknown Composer');
    expect(back!.style).toBe('Medium Swing');
    expect(back!.music).toBe(BLUES);
  });

  it('leaves a record already in the scheme byte for byte', () => {
    expect(recordFor(modern, 'irealb')).toBe(modern);
    expect(recordFor(legacy, 'irealbook')).toBe(legacy);
  });

  it('writes a modern record as a legacy one, keeping what the layout can hold', () => {
    const [back] = read(`irealbook://${encodeURIComponent(recordFor(modern, 'irealbook'))}`);
    expect(back!.title).toBe("Moanin'");
    expect(back!.composer).toBe('Bobby Timmons');
    expect(back!.style).toBe('Medium Swing');
    expect(back!.key).toBe('F-');
    expect(back!.music).toBe(BLUES);
  });

  it('fills the unset slots of a short modern record', () => {
    const short = modern.split('=').slice(0, 7).join('=');
    expect(recordFor(short, 'irealb').split('=').slice(7)).toEqual(['', '0', '0']);
  });

  it('converts every part of a multi-part song, so they still merge', () => {
    const first = ['Long Tune 1', 'Anon', 'Ballad', 'C', 'n', BLUES].join('=');
    const second = ['Long Tune 2', 'Anon', 'Ballad', 'C', 'n', BLUES].join('=');
    const merged = parsePlaylist(`irealbook://${encodeURIComponent(`${first}===${second}`)}`).songs[0]!;
    const [back, ...rest] = read(toUri([merged]));
    expect(rest).toEqual([]);
    expect(back!.music).toBe(merged.music);
  });
});

describe('a playlist holding both schemes', () => {
  it('exports every song, not just the ones in the URI scheme', () => {
    // The library keeps each import in the scheme it arrived in, and charts
    // written here are legacy. Writing them all under one scheme's name used to
    // leave iReal Pro with one readable song in three.
    const imported = parsePlaylist(
      `irealb://${encodeURIComponent(
        ['Modern', 'Anon', '', 'Medium Swing', 'C', '', `1r34LbKcu7${scramble(BLUES)}`, '', '0', '0'].join('='),
      )}`,
    ).songs[0]!;
    const written = song('Written Here');

    for (const scheme of ['irealb', 'irealbook'] as const) {
      const back = parsePlaylist(toUri([imported, written], { name: 'Mixed', scheme }));
      expect(back.failures).toEqual([]);
      expect(back.songs.map((s) => s.title)).toEqual(['Modern', 'Written Here']);
      expect(back.songs.map((s) => s.music)).toEqual([BLUES, BLUES]);
    }
  });
});

describe('round trip through export', () => {
  it('re-imports to the same songs', () => {
    const songs = [song('One', 'Rush Otis'), song('Two', 'Davis Miles')];
    const back = parsePlaylist(toUri(songs, { name: 'My Set', scheme: 'irealbook' }));

    expect(back.name).toBe('My Set');
    expect(back.songs.map((s) => s.title)).toEqual(['One', 'Two']);
    // The composers must not reverse on the way out and back.
    expect(back.songs.map((s) => s.composer)).toEqual(['Otis Rush', 'Miles Davis']);
    expect(back.songs[0]!.music).toBe(songs[0]!.music);
  });

  it('exports an untouched chart byte-identically', () => {
    const original = song('One');
    const back = parsePlaylist(toUri([original], { scheme: 'irealbook' })).songs[0]!;
    expect(back.record).toBe(original.record);
  });

  it('carries an edit through', () => {
    const original = song('One');
    const edited = parsePlaylist(
      `irealbook://${encodeURIComponent(
        replaceMusic(original.record, 'irealbook', 'T44[C^7   |A-7   Z '),
      )}`,
    ).songs[0]!;

    const back = parsePlaylist(toUri([edited], { scheme: 'irealbook' })).songs[0]!;
    expect(back.music.trim()).toBe('T44[C^7   |A-7   Z');
    expect(back.title).toBe('One');
  });

  it('survives repeated export and import', () => {
    let songs = [song('One', 'Rush Otis')];
    for (let i = 0; i < 5; i++) {
      songs = parsePlaylist(toUri(songs, { name: 'Set', scheme: 'irealbook' })).songs;
    }
    expect(songs[0]!.composer).toBe('Otis Rush');
    expect(songs[0]!.music).toBe(BLUES);
  });

  it('exports in the modern scheme too', () => {
    const modern = parsePlaylist(
      `irealb://${encodeURIComponent(
        ['One', 'Anon', '', 'Style', 'F', '0', `1r34LbKcu7${'x'.repeat(20)}`, 'Groove', '160', '3'].join('='),
      )}`,
    ).songs[0]!;
    const back = parsePlaylist(toUri([modern], { name: 'Set' })).songs[0]!;
    expect(back.bpm).toBe(160);
    expect(back.groove).toBe('Groove');
    expect(back.raw).toBe(modern.raw);
  });
});

describe('toHtml', () => {
  const html = toHtml([song('One', 'Rush Otis'), song('Two')], { name: 'My Set', scheme: 'irealbook' });

  it('carries an importable link', () => {
    expect(html).toContain('irealbook://');
    expect(parsePlaylist(html).songs.map((s) => s.title)).toEqual(['One', 'Two']);
  });

  it('writes the anchor the way iReal Pro does, href first', () => {
    // An importer matching the literal `<a href="` would miss anything else.
    expect(html).toContain('<a href="irealbook://');
  });

  it('shares a chart written here as a modern link iReal Pro can read', () => {
    const shared = parsePlaylist(toHtml([song('Written Here')]));
    expect(shared.scheme).toBe('irealb');
    expect(shared.failures).toEqual([]);
    expect(shared.songs[0]!.music).toBe(BLUES);
  });

  it('lists the songs for a human', () => {
    expect(html).toContain('1. One - Otis Rush');
    expect(html).toContain('2. Two');
    expect(html).toContain('2 songs');
  });

  it('escapes titles rather than letting them break the page', () => {
    const nasty = toHtml([song('Tune <script>alert(1)</script>')], { scheme: 'irealbook' });
    expect(nasty).not.toContain('<script>alert');
    expect(nasty).toContain('&lt;script&gt;');
  });

  it('does not borrow iReal Pro branding', () => {
    // Interoperability is the link, not their trade dress.
    expect(html).not.toContain('irealpro.com');
    expect(html).not.toContain('irealb.com');
    expect(html.toLowerCase()).not.toContain('made with ireal');
  });

  it('names a single-song export after the song', () => {
    expect(toHtml([song('Solitude')], { scheme: 'irealbook' })).toContain('<title>Solitude</title>');
  });
});

describe('multi-part songs', () => {
  it('exports both halves, not just the first page', () => {
    const parts = [
      ['Long Tune 1', 'Anon', 'Medium Swing', 'F', 'n', BLUES].join('='),
      ['Long Tune 2', 'Anon', 'Medium Swing', 'F', 'n', BLUES].join('='),
    ].join('===');
    const merged = parsePlaylist(`irealbook://${encodeURIComponent(parts)}`).songs[0]!;
    const chords = (s: Song) => s.cells.filter((c) => c.chord).length;

    const back = parsePlaylist(toUri([merged], { scheme: 'irealbook' })).songs[0]!;
    expect(back.title).toBe('Long Tune 1');
    expect(chords(back)).toBe(chords(merged));
  });
});

describe('serializer interop', () => {
  it('exports cells that were edited in place', () => {
    const original = song('One');
    const payload = serializeForRoundTrip(original.cells);
    const record = replaceMusic(original.record, 'irealbook', payload);
    const back = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
    expect(JSON.stringify(back.cells)).toBe(JSON.stringify(original.cells));
  });
});
