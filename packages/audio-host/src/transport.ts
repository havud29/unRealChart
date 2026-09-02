import type { NoteEvent } from '@unrealchart/groove-engine';
import { Mixer } from './mixer.js';
import { EventCursor } from './scheduler.js';
import { BuiltInInstruments } from './synth.js';
import type { InstrumentProvider } from './synth.js';

/**
 * The clock.
 *
 * Web Audio's own clock is the only trustworthy timebase in a browser, so
 * nothing is ever scheduled "now": a timer wakes every `tickMs`, looks
 * `horizonMs` ahead, and hands the audio thread everything due in that window
 * with an exact start time. The timer can be late by tens of milliseconds and
 * the music will not flinch, which is the whole point.
 */

export interface TransportOptions {
  /** How often to look for work. */
  tickMs?: number;
  /** How far ahead to schedule. Must comfortably exceed `tickMs`. */
  horizonMs?: number;
  instruments?: InstrumentProvider;
}

export type TransportState = 'stopped' | 'playing';

export class Transport {
  readonly mixer: Mixer;
  private readonly instruments: InstrumentProvider;
  private readonly tickMs: number;
  private readonly horizonMs: number;

  private events: readonly NoteEvent[] = [];
  private cursor = new EventCursor([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  private state: TransportState = 'stopped';
  /** AudioContext time at which position 0 would have played. */
  private originSeconds = 0;
  private pausedAtMs = 0;
  private endMs = 0;

  /** Fired when playback reaches the end on its own. */
  onEnded: (() => void) | null = null;

  constructor(
    private readonly context: AudioContext,
    options: TransportOptions = {},
  ) {
    this.tickMs = options.tickMs ?? 25;
    this.horizonMs = options.horizonMs ?? 200;
    this.instruments = options.instruments ?? new BuiltInInstruments(context);
    this.mixer = new Mixer(context, context.destination);
  }

  /** Replace the material. Safe while playing: playback continues in place. */
  load(events: readonly NoteEvent[], durationMs: number): void {
    this.events = events;
    this.endMs = durationMs;
    const at = this.positionMs;
    this.cursor = new EventCursor(events);
    this.cursor.seek(at);
  }

  async play(fromMs?: number): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume();
    await this.instruments.prepare([]);

    const start = fromMs ?? this.pausedAtMs;
    this.cursor = new EventCursor(this.events);
    this.cursor.seek(start);

    // Start a beat in the future so the first window is never late.
    this.originSeconds = this.context.currentTime + 0.06 - start / 1000;
    this.state = 'playing';

    this.pump();
    this.timer = setInterval(() => this.pump(), this.tickMs);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.pausedAtMs = this.positionMs;
    this.halt();
  }

  stop(): void {
    this.pausedAtMs = 0;
    this.halt();
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.state = 'stopped';
    this.instruments.allOff?.();
  }

  /** Where we are, in milliseconds from the start of the material. */
  get positionMs(): number {
    if (this.state !== 'playing') return this.pausedAtMs;
    return Math.max(0, (this.context.currentTime - this.originSeconds) * 1000);
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  get durationMs(): number {
    return this.endMs;
  }

  seek(ms: number): void {
    const target = Math.max(0, Math.min(ms, this.endMs));
    if (this.state === 'playing') {
      this.instruments.allOff?.();
      this.originSeconds = this.context.currentTime + 0.03 - target / 1000;
      this.cursor = new EventCursor(this.events);
      this.cursor.seek(target);
    } else {
      this.pausedAtMs = target;
    }
  }

  /** Schedule everything due before the horizon. */
  private pump(): void {
    if (this.state !== 'playing') return;

    const now = this.positionMs;
    const until = now + this.horizonMs;

    for (const event of this.cursor.take(until)) {
      // Convert the event's position back to an absolute AudioContext time.
      const when = this.originSeconds + event.startMs / 1000;
      // A window can open slightly late; never schedule in the past.
      this.instruments.play(event, Math.max(when, this.context.currentTime), this.mixer.channel(event.part));
    }

    if (this.cursor.done && now >= this.endMs) {
      this.stop();
      this.onEnded?.();
    }
  }
}
