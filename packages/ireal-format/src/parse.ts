import { extractPayload, splitPayload, IRealFormatError } from './extract.js';
import { unscramble } from './scramble.js';
import { tokenize } from './tokenize.js';
import type { ParseFailure, Playlist, Scheme, Song } from './types.js';

/** Literal marker that precedes the chord payload in the modern format. */
export const MUSIC_MARKER = '1r34LbKcu7';

/**
 * Titles are stored sort-first: `Gentle Rain, The` rather than `The Gentle Rain`.
 */
export function parseTitle(title: string): string {
  return title.replace(/^(.*)(, )(A|An|The)$/, '$3 $1');
}

/**
 * Composers are stored last-name-first, but only when the name is exactly two
 * words. Anything else is left alone — which is why some charts genuinely do
 * carry a reversed three-word name, in iReal Pro too.
 */
export function parseComposer(composer: string): string {
  const parts = composer.split(/(\s+)/); // keep separators so spacing survives
  if (parts.length === 3) return `${parts[2]}${parts[1]}${parts[0]}`;
  return composer;
}

function field(parts: string[], index: number): string {
  return parts[index] ?? '';
}

/** Parse a single `=`-delimited song record. */
export function parseSong(record: string, scheme: Scheme): Song {
  const parts = record.split('=');
  const title = parseTitle(field(parts, 0).trim());

  if (scheme === 'irealbook') {
    const music = field(parts, 5);
    return {
      title,
      composer: parseComposer(field(parts, 1).trim()),
      style: field(parts, 2).trim(),
      key: field(parts, 3).trim(),
      transpose: 0,
      groove: field(parts, 2).trim(),
      bpm: 0,
      repeats: 3,
      music,
      raw: music,
      record,
      cells: tokenize(music),
    };
  }

  const rawField = field(parts, 6);
  const markerAt = rawField.indexOf(MUSIC_MARKER);
  if (markerAt < 0) {
    throw new IRealFormatError(
      `Missing chord payload marker "${MUSIC_MARKER}" — record has ${parts.length} fields, expected at least 7.`,
    );
  }
  const raw = rawField.slice(markerAt + MUSIC_MARKER.length);
  const music = unscramble(raw);

  return {
    title,
    composer: parseComposer(field(parts, 1).trim()),
    style: field(parts, 3).trim(),
    key: field(parts, 4).trim(),
    transpose: Number(field(parts, 5)) || 0,
    groove: field(parts, 7).trim(),
    bpm: Number(field(parts, 8)) || 0,
    repeats: Number(field(parts, 9)) || 3,
    music,
    raw,
    record,
    cells: tokenize(music),
  };
}

/**
 * Long charts are exported as consecutive records whose titles differ only by a
 * part number. Merging them is not optional: skip it and every multi-part song
 * in the library is silently truncated to its first page.
 *
 * The test is deliberately narrow — same title once digits are removed, and the
 * titles are not identical — so two distinct tunes named `Blues 1` and
 * `Blues 2` are the only false positive, which is also how iReal Pro behaves.
 */
function mergeMultiPartSongs(songs: Song[]): Song[] {
  const merged: Song[] = [];
  for (const song of songs) {
    const previous = merged[merged.length - 1];
    if (previous && isContinuationOf(previous.title, song.title)) {
      previous.cells = previous.cells.concat(song.cells);
      previous.music += song.music;
      // Keep both records so the merged song reparses to the same merge.
      previous.record += `===${song.record}`;
      continue;
    }
    merged.push(song);
  }
  return merged;
}

function isContinuationOf(previousTitle: string, title: string): boolean {
  if (previousTitle === title) return false;
  const strip = (s: string) => s.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  const a = strip(previousTitle);
  return a.length > 0 && a === strip(title);
}

/**
 * Parse an iReal Pro HTML export, `.txt` dump, or pasted URI into a playlist.
 *
 * A record that fails to parse is collected in `failures` rather than thrown,
 * so one bad chart in a 1400-song playlist does not lose the other 1399.
 */
export function parsePlaylist(input: string): Playlist {
  const { scheme, payload } = extractPayload(input);
  const { records, name } = splitPayload(payload);

  const songs: Song[] = [];
  const failures: ParseFailure[] = [];

  for (const record of records) {
    try {
      songs.push(parseSong(record, scheme));
    } catch (error) {
      failures.push({
        title: parseTitle(record.split('=')[0]?.trim() ?? '(untitled)'),
        message: error instanceof Error ? error.message : String(error),
        record,
      });
    }
  }

  return { name, scheme, songs: mergeMultiPartSongs(songs), failures };
}
