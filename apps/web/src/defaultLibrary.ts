import type { Playlist } from '@ifakepro/ireal-format';
import { parsePlaylist } from '@ifakepro/ireal-format';

/**
 * The standard jazz library, fetched once so a new install is not empty.
 *
 * A caveat worth keeping in view: PLAN.md deliberately kept this app
 * import-only and local-first, on the grounds that a library of transcribed
 * charts for copyrighted songs is an argument worth not having. Seeding on
 * first run softens that line -- the charts are user transcriptions from the
 * iReal Pro forums, but the app now brings them rather than the user. The
 * source therefore lives in one constant, so pointing it at a host you control
 * is a one-line change, and the seed never runs against a library that already
 * has songs in it.
 *
 * It is also a third party's test-data directory, not a CDN, so it can move
 * without notice. Failure is reported and retryable rather than fatal: an
 * empty library is a worse outcome than a slow one, but neither should stop
 * the app from starting.
 */

export const DEFAULT_LIBRARY = {
  name: 'Jazz 1460',
  /** ~650 KB, about 1460 songs. */
  url: 'https://raw.githubusercontent.com/infojunkie/ireal-musicxml/main/test/data/jazz1460.txt',
};

/** Where the seed got to, remembered so it is attempted at most once. */
export const SEED_SETTING = 'defaultLibrary';
export type SeedState = 'done' | 'skipped';

export async function fetchDefaultLibrary(signal?: AbortSignal): Promise<Playlist> {
  const response = await fetch(DEFAULT_LIBRARY.url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(`The standard library did not download (HTTP ${response.status}).`);
  }

  const text = await response.text();
  const playlist = parsePlaylist(text);
  if (playlist.songs.length === 0) {
    throw new Error('The standard library downloaded but held no songs.');
  }

  // The file carries no playlist name of its own, so give it one: without it
  // the songs land in the library with no source and the sidebar has nothing
  // to file them under.
  return { ...playlist, name: playlist.name ?? DEFAULT_LIBRARY.name };
}
