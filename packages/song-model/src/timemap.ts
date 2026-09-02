import { quarterNotesPerBar } from './meter.js';
import type { TimemapEntry, UnrolledBar } from './types.js';

/**
 * When each bar happens, in milliseconds.
 *
 * The player schedules against the Web Audio clock and the UI reads this to
 * decide which bar to highlight, so the two can never disagree about where we
 * are. Built once per unrolled sequence, then binary-searched every frame.
 */

export interface TimemapOptions {
  bpm: number;
  /** Bars of count-in before the form starts. */
  countInBars?: number;
  /** Extra beats-per-minute added at the start of each chorus. */
  tempoRampPerChorus?: number;
}

export function buildTimemap(bars: readonly UnrolledBar[], options: TimemapOptions): TimemapEntry[] {
  const baseBpm = options.bpm > 0 ? options.bpm : 120;
  const ramp = options.tempoRampPerChorus ?? 0;

  const entries: TimemapEntry[] = [];
  let cursor = 0;

  // The count-in borrows the meter of the first bar so it lands in the groove.
  const countInBars = options.countInBars ?? 0;
  if (countInBars > 0 && bars.length > 0) {
    const quarters = quarterNotesPerBar(bars[0]!.bar.time);
    cursor += countInBars * quarters * (60_000 / baseBpm);
  }

  for (const entry of bars) {
    const bpm = baseBpm + ramp * entry.chorus;
    const durationMs = quarterNotesPerBar(entry.bar.time) * (60_000 / Math.max(1, bpm));
    entries.push({
      index: entry.index,
      sourceIndex: entry.sourceIndex,
      chorus: entry.chorus,
      startMs: cursor,
      durationMs,
    });
    cursor += durationMs;
  }

  return entries;
}

/** Total playing time in milliseconds. */
export function totalDuration(timemap: readonly TimemapEntry[]): number {
  const last = timemap[timemap.length - 1];
  return last ? last.startMs + last.durationMs : 0;
}

/**
 * The entry playing at `ms`, by binary search. Returns null before the first
 * bar (during a count-in) and after the last.
 */
export function entryAt(timemap: readonly TimemapEntry[], ms: number): TimemapEntry | null {
  let low = 0;
  let high = timemap.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = timemap[mid]!;
    if (ms < entry.startMs) high = mid - 1;
    else if (ms >= entry.startMs + entry.durationMs) low = mid + 1;
    else return entry;
  }
  return null;
}
