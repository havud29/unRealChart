import { describe, expect, it } from 'vitest';
import { parsePlaylist, replaceMusic, serializeForRoundTrip, toHtml, toPayload, toUri } from '../src/index.js';
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

  it('leaves a single shared song unnamed', () => {
    const payload = toPayload([song('One')]);
    expect(payload.endsWith('===')).toBe(true);
    expect(parsePlaylist(`irealbook://${encodeURIComponent(payload)}`).name).toBeNull();
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
