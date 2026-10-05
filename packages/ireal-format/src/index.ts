export type { Cell, Chord, ParseFailure, Playlist, Scheme, Song } from './types.js';

export { extractPayload, findLinks, splitPayload, IRealFormatError } from './extract.js';
export type { ExtractedPayload, SplitPayload } from './extract.js';

export {
  obfusc50,
  permuteBlocks,
  expandSubstitutions,
  collapseSubstitutions,
  unscramble,
  scramble,
  roundTrips,
} from './scramble.js';

export { tokenize, CHORD_RE, PSEUDO_CHORD_RE } from './tokenize.js';
export {
  serialize,
  serializeForRoundTrip,
  chordToText,
  replaceMusic,
  replaceTitle,
  storedTitle,
} from './serialize.js';

export { parsePlaylist, parseSong, parseTitle, parseComposer, MUSIC_MARKER } from './parse.js';

export { recordFor, toHtml, toPayload, toUri } from './export.js';
export type { ExportOptions } from './export.js';

export { formatCells, formatSong } from './debug.js';
