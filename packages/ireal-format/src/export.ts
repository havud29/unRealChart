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
 * The `=`-delimited payload: records joined by `===`, with the playlist name
 * last when there is one.
 */
export function toPayload(songs: readonly Song[], name?: string): string {
  // A multi-part song's record already holds its parts joined by `===`, so it
  // goes in whole: the same separator, and reparsing re-merges them. Taking
  // only the first part here would silently export half of every long chart.
  const records = songs.map((song) => song.record);
  // A single shared song carries no trailing name; a playlist does. That is the
  // only thing distinguishing the two on the way back in.
  return name ? `${records.join('===')}===${name}` : `${records.join('===')}===`;
}

/** A shareable `irealb://` URI. Tapping it on a device with iReal Pro imports. */
export function toUri(songs: readonly Song[], options: ExportOptions = {}): string {
  const scheme = options.scheme ?? 'irealb';
  return `${scheme}://${encodeURIComponent(toPayload(songs, options.name))}`;
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
<h1><a class="chart" href="${escapeHtml(uri)}">${escapeHtml(name)}</a></h1>
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
