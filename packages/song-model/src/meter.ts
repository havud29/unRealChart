import type { TimeSignature } from './types.js';

/**
 * The meters iReal Pro supports, keyed by their `T..` token.
 *
 * `beatUnit` is the number of beats one grid cell is worth. It is not derivable
 * from the meter — the grid is a layout device and these values were measured
 * from the app's own playback. Getting them wrong makes 3/4 and 12/8 charts
 * play at the wrong length while every other meter looks fine, which is exactly
 * the kind of bug that survives a casual test pass.
 */
const METERS: Readonly<Record<string, TimeSignature>> = {
  '24': { beats: 2, beatType: 4, beatUnit: 1 },
  '34': { beats: 3, beatType: 4, beatUnit: 0.5 },
  '44': { beats: 4, beatType: 4, beatUnit: 1 },
  '54': { beats: 5, beatType: 4, beatUnit: 1 },
  '64': { beats: 6, beatType: 4, beatUnit: 1 },
  '74': { beats: 7, beatType: 4, beatUnit: 1 },
  '38': { beats: 3, beatType: 8, beatUnit: 1 },
  '58': { beats: 5, beatType: 8, beatUnit: 1 },
  '68': { beats: 6, beatType: 8, beatUnit: 1 },
  '78': { beats: 7, beatType: 8, beatUnit: 1 },
  '98': { beats: 9, beatType: 8, beatUnit: 1 },
  '12': { beats: 12, beatType: 8, beatUnit: 3 }, // T12 is 12/8, not 1/2
  '22': { beats: 2, beatType: 2, beatUnit: 1 },
  '32': { beats: 3, beatType: 2, beatUnit: 0.5 },
};

export const DEFAULT_TIME: TimeSignature = METERS['44']!;

/** Look up a meter from a `T44`-style annotation. Returns null if unknown. */
export function meterFromAnnotation(annot: string): TimeSignature | null {
  const match = /^T(\d\d)$/.exec(annot);
  if (!match) return null;
  return METERS[match[1]!] ?? null;
}

/** How many quarter notes one bar of this meter lasts. */
export function quarterNotesPerBar(time: TimeSignature): number {
  return time.beats * (4 / time.beatType);
}

export function formatMeter(time: TimeSignature): string {
  return `${time.beats}/${time.beatType}`;
}
