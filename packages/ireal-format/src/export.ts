import { MUSIC_MARKER } from './parse.js';
import { scramble, unscramble } from './scramble.js';
import { MODERN_UNSET } from './serialize.js';
import type { Scheme, Song } from './types.js';

/**
 * Writing playlists back out.
 *
 * The point of this module is that a user can leave. Charts they imported, and
 * charts they edited here, go back to iReal Pro or to any other tool that reads
 * the format — no lock-in, no export that quietly drops the parts we did not
 * model.
 *
 * Songs carry the record they were parsed from, so an untouched chart exports
 * byte-identically to what came in. Only an edited one is rewritten, and only
 * its music field.
 */

export interface ExportOptions {
  /** Playlist name. Omit for a single shared song. */
  name?: string | undefined;
  /** Which URI scheme to write. Defaults to the modern one. */
  scheme?: Scheme;
}

/**
 * The composer iReal Pro's own charts give a tune nobody is credited with.
 * Stored last name first like any two-word name, so it reads "Unknown Composer".
 */
const UNKNOWN_COMPOSER = 'Composer Unknown';

/** A modern record keeps its music behind the marker in field 6; a legacy one has no field 6. */
function isModern(record: string): boolean {
  return (record.split('=')[6] ?? '').startsWith(MUSIC_MARKER);
}

/**
 * One record, written for the given scheme.
 *
 * A URI has one scheme and every record in it is read by that scheme's field
 * layout, but a library holds both: imports keep whatever they arrived as, and
 * a chart written here is legacy plain text. Writing a record under the other
 * scheme's name is not a degraded export but a broken one — iReal Pro finds no
 * chord payload where it looks and refuses the whole file.
 *
 * A record already in the right scheme goes out untouched, byte for byte. A
 * legacy record carries no transpose, groove, tempo or repeat count, so the
 * modern one it becomes leaves them unset; going the other way they are lost,
 * because the legacy layout has nowhere to put them.
 */
export function recordFor(record: string, scheme: Scheme): string {
  // Each part of a multi-part song is a record of its own.
  if (record.includes('===')) {
    return record
      .split('===')
      .map((part) => recordFor(part, scheme))
      .join('===');
  }

  const fields = record.split('=');
  const field = (i: number) => fields[i] ?? '';

  if (scheme === 'irealbook') {
    if (!isModern(record)) return record;
    const music = unscramble(field(6).slice(MUSIC_MARKER.length));
    return [field(0), field(1), field(3), field(4), 'n', music].join('=');
  }

  if (isModern(record)) {
    if (fields.length >= MODERN_UNSET.length) return record;
    while (fields.length < MODERN_UNSET.length) fields.push(MODERN_UNSET[fields.length]!);
    return fields.join('=');
  }
  const modern = [...MODERN_UNSET];
  modern[0] = field(0);
  // Never empty: the slot after the composer always is, so an empty composer
  // writes `Title===Style` -- the separator between songs, splitting the
  // record in two. Legacy charts may leave it out; a chart written here does.
  modern[1] = field(1).trim() === '' ? UNKNOWN_COMPOSER : field(1);
  modern[3] = field(2);
  modern[4] = field(3);
  modern[6] = `${MUSIC_MARKER}${scramble(field(5))}`;
  return modern.join('=');
}

/**
 * The `=`-delimited payload: records joined by `===`, with the playlist name
 * last when there is one.
 *
 * Given a scheme, every record is written for it — see `recordFor`. Without
 * one, records go out exactly as they are stored.
 */
export function toPayload(songs: readonly Song[], name?: string, scheme?: Scheme): string {
  // A multi-part song's record already holds its parts joined by `===`, so it
  // goes in whole: the same separator, and reparsing re-merges them. Taking
  // only the first part here would silently export half of every long chart.
  const records = songs.map((song) => (scheme ? recordFor(song.record, scheme) : song.record));
  // A playlist ends with its name; a single shared song ends with its record,
  // as iReal Pro's own shares do. A trailing `===` with nothing after it reads
  // as a playlist whose name is empty.
  return name ? `${records.join('===')}===${name}` : records.join('===');
}

/** A shareable `irealb://` URI. Tapping it on a device with iReal Pro imports. */
export function toUri(songs: readonly Song[], options: ExportOptions = {}): string {
  const scheme = options.scheme ?? 'irealb';
  return `${scheme}://${encodeURIComponent(toPayload(songs, options.name, scheme))}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A shareable HTML file, the way playlists are actually passed around.
 *
 * Deliberately our own page rather than a copy of iReal Pro's: no borrowed
 * branding, no logo, no claim to be their export. What matters for
 * interoperability is the link, and that is byte-for-byte the real thing.
 */
export function toHtml(songs: readonly Song[], options: ExportOptions = {}): string {
  const name = options.name ?? (songs.length === 1 ? (songs[0]?.title ?? 'Chart') : 'Playlist');
  const uri = toUri(songs, options);
  const list = songs
    .map((song, i) => `${i + 1}. ${escapeHtml(song.title)}${song.composer ? ` - ${escapeHtml(song.composer)}` : ''}`)
    .join('<br>\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         max-width: 40rem; margin: 3rem auto; padding: 0 1.5rem;
         line-height: 1.6; color: #15191c; background: #f5f3ee; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .count { color: #55616a; font-size: .9rem; margin: 0 0 1.5rem; }
  a.chart { font-size: 1.05rem; }
  ol, p { font-size: .95rem; }
  .hint { color: #55616a; font-size: .85rem; margin-top: 2rem; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e3da; background: #10161b; }
    .count, .hint { color: #9aa8b1; }
  }
</style>
</head>
<body>
<h1><a href="${escapeHtml(uri)}" class="chart">${escapeHtml(name)}</a></h1>
<p class="count">${songs.length} ${songs.length === 1 ? 'song' : 'songs'}</p>
<p>
${list}
</p>
<p class="hint">Open this file on a device with a chord chart app installed and
tap the title to import. The link is a standard <code>irealb://</code> playlist.</p>
</body>
</html>
`;
}
