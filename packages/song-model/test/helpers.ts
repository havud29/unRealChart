import { parsePlaylist } from '@ifakepro/ireal-format';
import { buildSongModel, chordSymbol, unroll } from '../src/index.js';
import type { Bar, SongModel, UnrollOptions } from '../src/index.js';

/**
 * Chart in, model out.
 *
 * Fixtures are written in the legacy readable scheme so a test reads like the
 * chart it describes — `'[T44C^7   |A-7 D-7 |G7   Z'` is the actual payload,
 * not an encoding of one.
 */
export function model(music: string, meta: Partial<{ key: string; repeats: number }> = {}): SongModel {
  const record = ['Fixture', 'Anon', 'Medium Swing', meta.key ?? 'C', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
  if (meta.repeats !== undefined) song.repeats = meta.repeats;
  return buildSongModel(song);
}

/** One bar as `"C^7 A-7"`. */
export function barText(bar: Bar): string {
  return bar.chords.map((c) => chordSymbol(c)).join(' ');
}

/** The whole chart as `"C^7 | A-7 D-7 | G7"`. */
export function chartText(m: SongModel): string {
  return m.bars.map(barText).join(' | ');
}

/** Beats per chord, bar by bar: `"4 | 2 2 | 4"`. */
export function beatsText(m: SongModel): string {
  return m.bars.map((b) => b.chords.map((c) => c.beats).join(' ')).join(' | ');
}

/** The play order, as chord text — the fixture format for unrolling. */
export function playOrder(m: SongModel, options: UnrollOptions = { choruses: 1 }): string {
  return unroll(m, options)
    .bars.map((u) => barText(u.bar))
    .join(' | ');
}
