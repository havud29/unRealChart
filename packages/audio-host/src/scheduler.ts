import type { NoteEvent } from '@ifakepro/groove-engine';

/**
 * Which events fall in the next slice of time.
 *
 * Deliberately free of Web Audio: the part of a player most likely to drop or
 * double a note is the windowing, and that is much easier to trust when it can
 * be tested as a pure function over a sorted array.
 *
 * The cursor only moves forward, so scheduling a whole song is linear rather
 * than a scan per tick.
 */
export class EventCursor {
  private index = 0;

  constructor(private readonly events: readonly NoteEvent[]) {}

  /** Move the cursor to the first event at or after `ms`. */
  seek(ms: number): void {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.events[mid]!.startMs < ms) low = mid + 1;
      else high = mid;
    }
    this.index = low;
  }

  /**
   * Events starting in `[from, until)`. Each event is returned exactly once,
   * however often this is called and whatever the window size.
   */
  take(until: number): NoteEvent[] {
    const out: NoteEvent[] = [];
    while (this.index < this.events.length && this.events[this.index]!.startMs < until) {
      out.push(this.events[this.index]!);
      this.index++;
    }
    return out;
  }

  get done(): boolean {
    return this.index >= this.events.length;
  }

  get position(): number {
    return this.index;
  }
}

/**
 * Fold a loop into a plain sequence.
 *
 * The player loops by rendering the looped span repeatedly rather than by
 * rewinding a cursor, so everything downstream — scheduling, the timemap, the
 * playhead — stays a single forward pass with no special cases.
 */
export function repeatSpan(
  events: readonly NoteEvent[],
  fromMs: number,
  toMs: number,
  times: number,
): NoteEvent[] {
  const span = toMs - fromMs;
  if (span <= 0 || times < 1) return [...events];

  const inside = events.filter((e) => e.startMs >= fromMs && e.startMs < toMs);
  const out: NoteEvent[] = [];
  for (let n = 0; n < times; n++) {
    for (const event of inside) {
      out.push({ ...event, startMs: event.startMs - fromMs + n * span });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
