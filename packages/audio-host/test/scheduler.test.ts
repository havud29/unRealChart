import { describe, expect, it } from 'vitest';
import { EventCursor, repeatSpan } from '../src/scheduler.js';
import type { NoteEvent } from '@unrealchart/groove-engine';

/**
 * The windowing is the part of a player that drops or doubles notes, so it is
 * tested on its own, away from anything that needs an audio device.
 */

const event = (startMs: number, part = 'bass'): NoteEvent => ({
  part,
  instrument: 'upright-bass',
  midi: 40,
  startMs,
  durationMs: 100,
  velocity: 0.7,
  bar: 0,
});

const at = (events: NoteEvent[]) => events.map((e) => e.startMs);

describe('EventCursor', () => {
  const events = [0, 100, 200, 300, 400, 500].map((ms) => event(ms));

  it('takes everything before the horizon', () => {
    const cursor = new EventCursor(events);
    expect(at(cursor.take(250))).toEqual([0, 100, 200]);
  });

  it('never returns the same event twice', () => {
    const cursor = new EventCursor(events);
    const seen: number[] = [];
    for (let horizon = 50; horizon <= 600; horizon += 50) seen.push(...at(cursor.take(horizon)));
    expect(seen).toEqual([0, 100, 200, 300, 400, 500]);
  });

  it('returns every event exactly once whatever the window size', () => {
    for (const step of [1, 7, 33, 100, 1000]) {
      const cursor = new EventCursor(events);
      const seen: number[] = [];
      // Sweep until the cursor is spent, so a coarse step still finishes.
      for (let horizon = step; !cursor.done && horizon < 100_000; horizon += step) {
        seen.push(...at(cursor.take(horizon)));
      }
      expect(seen, `step ${step}`).toEqual([0, 100, 200, 300, 400, 500]);
    }
  });

  it('seeks to a position without replaying the past', () => {
    const cursor = new EventCursor(events);
    cursor.seek(250);
    expect(at(cursor.take(1000))).toEqual([300, 400, 500]);
  });

  it('seeks to an exact event boundary inclusively', () => {
    const cursor = new EventCursor(events);
    cursor.seek(300);
    expect(at(cursor.take(1000))).toEqual([300, 400, 500]);
  });

  it('knows when it is finished', () => {
    const cursor = new EventCursor(events);
    expect(cursor.done).toBe(false);
    cursor.take(10_000);
    expect(cursor.done).toBe(true);
  });

  it('copes with no events at all', () => {
    const cursor = new EventCursor([]);
    expect(cursor.take(1000)).toEqual([]);
    expect(cursor.done).toBe(true);
  });

  it('handles simultaneous events', () => {
    const cursor = new EventCursor([event(100, 'bass'), event(100, 'drums'), event(100, 'piano')]);
    expect(cursor.take(101)).toHaveLength(3);
  });
});

describe('repeatSpan', () => {
  const events = [0, 100, 200, 300].map((ms) => event(ms));

  it('repeats a span the requested number of times', () => {
    expect(at(repeatSpan(events, 100, 300, 3))).toEqual([0, 100, 200, 300, 400, 500]);
  });

  it('keeps events in time order', () => {
    const looped = repeatSpan(events, 0, 200, 4);
    for (let i = 1; i < looped.length; i++) {
      expect(looped[i]!.startMs).toBeGreaterThanOrEqual(looped[i - 1]!.startMs);
    }
  });

  it('leaves the material alone for a degenerate span', () => {
    expect(at(repeatSpan(events, 200, 200, 3))).toEqual([0, 100, 200, 300]);
    expect(at(repeatSpan(events, 300, 100, 3))).toEqual([0, 100, 200, 300]);
  });

  it('excludes the bar at the loop end, which belongs to the next pass', () => {
    const looped = repeatSpan(events, 0, 200, 1);
    expect(at(looped)).toEqual([0, 100]);
  });
});
