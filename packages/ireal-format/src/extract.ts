import type { Scheme } from './types.js';

/**
 * Pull the iReal Pro URI out of whatever the user handed us.
 *
 * The same regex handles all three shapes people actually have:
 *   - a `.html` file the app exported (the URI sits in an anchor href)
 *   - a `.txt` dump
 *   - a bare `irealb://` / `irealbook://` URI pasted into a box
 *
 * No HTML parsing — the href is the only part of the export that matters, and
 * the closing quote is a reliable terminator in every export we have seen.
 *
 * Only `"` and a line break terminate the payload. Apostrophes cannot: titles
 * like `'S Wonderful` reach us with the apostrophe unencoded, and excluding it
 * silently truncates the payload to nothing.
 */
const URI_RE = /(irealb(?:ook)?):\/\/([^"\r\n]*)/;

export interface ExtractedPayload {
  scheme: Scheme;
  /** URL-decoded payload: song records joined by `===`, name last. */
  payload: string;
}

export class IRealFormatError extends Error {
  override name = 'IRealFormatError';
}

/** Extract and URL-decode the payload. Throws if no iReal URI is present. */
export function extractPayload(input: string): ExtractedPayload {
  const match = URI_RE.exec(input);
  if (!match) {
    throw new IRealFormatError(
      'No irealb:// or irealbook:// URI found. Expected an iReal Pro HTML export, a .txt dump, or a pasted URI.',
    );
  }
  const scheme = match[1] as Scheme;
  let payload: string;
  try {
    payload = decodeURIComponent(match[2]!);
  } catch {
    // Malformed percent-escapes appear in hand-edited files. Salvage what we can:
    // a chart with one mangled character beats refusing the whole playlist.
    payload = decodeURIComponent(match[2]!.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
  }
  return { scheme, payload };
}

export interface SplitPayload {
  /** Raw, undecoded song records in playlist order. */
  records: string[];
  /** Playlist name, or `null` when the payload holds a single shared song. */
  name: string | null;
}

/**
 * Split a payload into song records.
 *
 * Records are separated by `===`. A playlist carries its name as a final
 * segment; a single-song share does not, which is the only way to tell them
 * apart. Trailing empty segments are an artifact of the delimiter and are
 * dropped before the name is taken.
 */
export function splitPayload(payload: string): SplitPayload {
  const parts = payload.split('===');
  while (parts.length > 0 && parts[parts.length - 1]!.trim() === '') parts.pop();
  if (parts.length === 0) return { records: [], name: null };

  // A playlist's final segment is a bare name: no `=` fields, no chord payload.
  const last = parts[parts.length - 1]!;
  const isName = parts.length > 1 && !last.includes('=');
  const name = isName ? parts.pop()!.trim() : null;

  return { records: parts.filter((p) => p.trim() !== ''), name };
}
