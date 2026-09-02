import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parsePlaylist,
  roundTrips,
  scramble,
  serializeForRoundTrip,
  toUri,
  tokenize,
  unscramble,
} from '../src/index.js';
import type { Song } from '../src/index.js';

/**
 * The parser's real test suite: thousands of community charts.
 *
 * The corpus lives in a git-ignored directory (`npm run fixtures:fetch`), so
 * these tests skip themselves on a fresh clone rather than fail. They are the
 * only check that the unscrambling constants are right against genuine iReal
 * Pro output — the unit tests can only prove our encoder and decoder agree
 * with each other.
 */

const FIXTURES = join(process.cwd(), 'fixtures');

function corpusFiles(): string[] {
  try {
    return readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.txt') || f.endsWith('.html'))
      .map((f) => join(FIXTURES, f));
  } catch {
    return [];
  }
}

const files = corpusFiles();
const describeCorpus = files.length > 0 ? describe : describe.skip;

/**
 * Characters that legitimately appear in decoded chart text. Anything outside
 * this set means the permutation put bytes in the wrong place — a much sharper
 * signal than "it parsed without throwing".
 */
const CHART_ALPHABET = /^[A-Za-z0-9 ,.'"()[\]{}<>|*\/\\#\-+^°ø?!:;&%$@_=~`\r\n\t -￿]*$/;

describeCorpus('corpus', () => {
  const parsed = files.map((file) => ({
    file,
    playlist: parsePlaylist(readFileSync(file, 'utf8')),
  }));

  const allSongs: Song[] = parsed.flatMap((p) => p.playlist.songs);

  // Only the modern scheme scrambles its payload. Legacy `irealbook://` charts
  // carry plain text, so a scramble round-trip says nothing about them.
  const scrambledSongs: Song[] = parsed
    .filter((p) => p.playlist.scheme === 'irealb')
    .flatMap((p) => p.playlist.songs);

  it('finds songs in every corpus file', () => {
    for (const { file, playlist } of parsed) {
      expect(playlist.songs.length, `${file} produced no songs`).toBeGreaterThan(0);
    }
    console.log(`  corpus: ${allSongs.length} songs across ${files.length} files`);
  });

  it('parses every record without failures', () => {
    const failures = parsed.flatMap((p) =>
      p.playlist.failures.map((f) => `${p.file}: ${f.title} — ${f.message}`),
    );
    expect(failures, failures.slice(0, 10).join('\n')).toHaveLength(0);
  });

  it('decodes to plausible chart text', () => {
    const suspect = allSongs.filter((s) => !CHART_ALPHABET.test(s.music));
    expect(
      suspect.map((s) => s.title).slice(0, 10),
      'decoded payload contains characters no chart should have',
    ).toEqual([]);
  });

  it('gives every song a title and at least one chord', () => {
    const empty = allSongs.filter((s) => !s.title.trim() || !s.cells.some((c) => c.chord));
    expect(empty.map((s) => s.title).slice(0, 10)).toEqual([]);
  });

  // The guarantee that matters: re-encoding never changes the music. Byte
  // identity is the stronger claim we also happen to hold, and it is what makes
  // an exported chart diff-clean against iReal Pro's own output.
  it('re-encodes every payload without changing the music', () => {
    const broken = scrambledSongs.filter((s) => unscramble(scramble(s.music)) !== s.music);
    expect(broken.map((s) => s.title).slice(0, 10)).toEqual([]);
  });

  it('round-trips every payload byte-identically', () => {
    const broken = scrambledSongs.filter((s) => !roundTrips(s.raw));
    const rate = ((scrambledSongs.length - broken.length) / scrambledSongs.length) * 100;
    console.log(`  round-trip: ${rate.toFixed(2)}% of ${scrambledSongs.length} scrambled songs`);
    expect(broken.map((s) => s.title).slice(0, 10)).toEqual([]);
  });

  // Budget from PLAN.md §12. The library screen re-parses on import, so this is
  // a user-facing number, not a vanity metric.
  it('parses the largest playlist well inside the 3s budget', () => {
    const biggest = files
      .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
      .sort((a, b) => b.text.length - a.text.length)[0]!;
    const started = performance.now();
    const playlist = parsePlaylist(biggest.text);
    const elapsed = performance.now() - started;
    console.log(`  parse: ${playlist.songs.length} songs in ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(3000);
  });

  // The editor writes cells back out, so this is the invariant that decides
  // whether saving an edited chart is safe.
  it('writes every chart back out to the same cells', () => {
    const broken: string[] = [];
    for (const song of allSongs) {
      // A multi-part song's cells are two records concatenated, and the seam
      // between them is not reproducible from the cells alone — the join grows
      // the barline that the two separate parses never had. Editing one saves
      // it as a single chart, which is correct, just not identical.
      if (song.record.includes('===')) continue;
      const again = tokenize(serializeForRoundTrip(song.cells));
      if (JSON.stringify(again) !== JSON.stringify(song.cells)) broken.push(song.title);
    }
    console.log(`  serialize: ${allSongs.length - broken.length}/${allSongs.length} charts re-write exactly`);
    expect(broken.slice(0, 10)).toEqual([]);
  });

  // Users must be able to leave with everything they brought.
  it('exports the whole corpus and re-imports it unchanged', () => {
    for (const { file, playlist } of parsed) {
      const back = parsePlaylist(toUri(playlist.songs, { name: 'Export', scheme: playlist.scheme }));
      expect(back.songs.length, `${file}: song count`).toBe(playlist.songs.length);

      const mismatched = back.songs.filter((song, i) => {
        const original = playlist.songs[i]!;
        return (
          song.title !== original.title ||
          song.composer !== original.composer ||
          song.music !== original.music
        );
      });
      expect(mismatched.map((s) => s.title).slice(0, 5), `${file}: content`).toEqual([]);
    }
  });

  it('recognises every chord root it finds', () => {
    const roots = new Set<string>();
    for (const song of allSongs) {
      for (const cell of song.cells) {
        if (cell.chord) roots.add(cell.chord.note);
        if (cell.chord?.over) roots.add(cell.chord.over.note);
      }
    }
    const known = new Set([
      'C', 'C#', 'Cb', 'D', 'D#', 'Db', 'E', 'E#', 'Eb', 'F', 'F#', 'Fb',
      'G', 'G#', 'Gb', 'A', 'A#', 'Ab', 'B', 'B#', 'Bb',
      ' ', 'n', 'W', 'p', 'x', 'r',
    ]);
    expect([...roots].filter((r) => !known.has(r))).toEqual([]);
  });
});
