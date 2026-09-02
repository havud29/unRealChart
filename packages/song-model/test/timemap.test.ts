import { describe, expect, it } from 'vitest';
import { buildTimemap, entryAt, totalDuration, unroll } from '../src/index.js';
import { model } from './helpers.js';

const bars = (music: string, choruses = 1) => unroll(model(music), { choruses }).bars;

describe('buildTimemap', () => {
  it('gives a 4/4 bar one whole note at the given tempo', () => {
    const map = buildTimemap(bars('[T44C7   |F7   Z'), { bpm: 120 });
    expect(map).toHaveLength(2);
    expect(map[0]!.durationMs).toBe(2000); // 4 quarters at 120bpm
    expect(map[0]!.startMs).toBe(0);
    expect(map[1]!.startMs).toBe(2000);
  });

  it('scales by meter, not by bar count', () => {
    const waltz = buildTimemap(bars('[T34C7   Z'), { bpm: 120 });
    const sixEight = buildTimemap(bars('[T68C7   Z'), { bpm: 120 });
    expect(waltz[0]!.durationMs).toBe(1500); // 3 quarters
    expect(sixEight[0]!.durationMs).toBe(1500); // 6 eighths
  });

  it('offsets everything by the count-in', () => {
    const map = buildTimemap(bars('[T44C7   Z'), { bpm: 120, countInBars: 2 });
    expect(map[0]!.startMs).toBe(4000);
  });

  it('speeds up each chorus when a tempo ramp is set', () => {
    const map = buildTimemap(bars('[T44C7   Z', 3), { bpm: 120, tempoRampPerChorus: 60 });
    expect(map[0]!.durationMs).toBe(2000); // 120bpm
    expect(map[1]!.durationMs).toBeCloseTo(1333.33, 1); // 180bpm
    expect(map[2]!.durationMs).toBe(1000); // 240bpm
  });

  it('leaves no gaps between bars', () => {
    const map = buildTimemap(bars('[T44C7   |T34F7   |T68G7   Z'), { bpm: 140 });
    for (let i = 1; i < map.length; i++) {
      expect(map[i]!.startMs).toBeCloseTo(map[i - 1]!.startMs + map[i - 1]!.durationMs, 6);
    }
  });

  it('falls back to a usable tempo when the chart has none', () => {
    expect(buildTimemap(bars('[T44C7   Z'), { bpm: 0 })[0]!.durationMs).toBeGreaterThan(0);
  });

  it('keeps the back-pointer to the source bar', () => {
    const map = buildTimemap(bars('[T44C7   |F7   Z', 2), { bpm: 120 });
    expect(map.map((e) => e.sourceIndex)).toEqual([0, 1, 0, 1]);
    expect(map.map((e) => e.chorus)).toEqual([0, 0, 1, 1]);
  });
});

describe('totalDuration', () => {
  it('adds up to the end of the last bar', () => {
    expect(totalDuration(buildTimemap(bars('[T44C7   |F7   Z'), { bpm: 120 }))).toBe(4000);
  });

  it('is zero for an empty map', () => {
    expect(totalDuration([])).toBe(0);
  });
});

describe('entryAt', () => {
  const map = buildTimemap(bars('[T44C7   |F7   |G7   |C7   Z'), { bpm: 120 });

  it('finds the bar playing at a moment', () => {
    expect(entryAt(map, 0)?.index).toBe(0);
    expect(entryAt(map, 1999)?.index).toBe(0);
    expect(entryAt(map, 2000)?.index).toBe(1);
    expect(entryAt(map, 5500)?.index).toBe(2);
  });

  it('returns null outside the piece', () => {
    expect(entryAt(map, -1)).toBeNull();
    expect(entryAt(map, 8000)).toBeNull();
  });

  it('agrees with a linear scan at every millisecond boundary', () => {
    for (const entry of map) {
      expect(entryAt(map, entry.startMs)?.index).toBe(entry.index);
      expect(entryAt(map, entry.startMs + entry.durationMs - 1)?.index).toBe(entry.index);
    }
  });
});
