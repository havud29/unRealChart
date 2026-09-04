import { describe, expect, it } from 'vitest';
import { COMP_PATTERNS } from '../src/patterns.js';
import { PACKS, renderGroove } from '../src/index.js';
import { buildSongModel } from '@unrealchart/song-model';
import { parsePlaylist } from '@unrealchart/ireal-format';

/**
 * The comping rhythms, checked against what the figures actually are.
 *
 * These are claims about music, not about code, and they are the kind that
 * drift: the Charleston was written here with its second attack on the
 * and-of-3 for a long time, which is a different rhythm wearing its name.
 */
describe('the comping vocabulary', () => {
  it('places the Charleston on 1 and the and-of-2', () => {
    // A dotted quarter then an eighth: the attacks are 1.5 beats apart.
    const beats = COMP_PATTERNS.charleston!.hits.map((h) => h.beat);
    expect(beats).toEqual([0, 1.5]);
  });

  it('places Red Garland on the anticipated heavy beats, and nowhere else', () => {
    const beats = COMP_PATTERNS.garland!.hits.map((h) => h.beat);
    expect(beats).toEqual([1.5, 3.5]);
    // Its whole character is that it never states a downbeat.
    expect(beats).not.toContain(0);
  });

  it('mirrors the Charleston late in the bar, to drive the next one', () => {
    const mirror = COMP_PATTERNS['charleston-mirror']!;
    expect(mirror.hits.map((h) => h.beat)).toEqual([0, 2.5]);
    expect(mirror.pushes).toBe(true);
  });

  it('marks which rhythms open a phrase and which close one', () => {
    // Without both kinds, phrasing has nothing to choose between.
    const all = Object.values(COMP_PATTERNS);
    expect(all.some((p) => p.anchored)).toBe(true);
    expect(all.some((p) => p.pushes)).toBe(true);
  });

  it('keeps every hit inside its own bar', () => {
    for (const pattern of Object.values(COMP_PATTERNS)) {
      for (const hit of pattern.hits) {
        expect(hit.beat).toBeGreaterThanOrEqual(0);
        expect(hit.beat).toBeLessThan(pattern.beats);
      }
    }
  });
});

function render(seed: string) {
  const music = '*A[T44C^7   |A-7   |D-7   |G7   |C^7   |A-7   |D-7   |G7   Z';
  const record = ['Comping Test', '', 'Medium Swing', 'C', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
  const model = buildSongModel(song);
  const pack = PACKS.find((p) => p.parts.some((part) => part.kind === 'comp'))!;
  return renderGroove(model, pack, { bpm: 140, seed });
}

describe('comping as it is played', () => {
  it('weights the voices of a chord rather than striking them flat', () => {
    const events = render('a').events.filter((e) => e.part === 'piano');
    const byOnset = new Map<number, number[]>();
    for (const e of events) {
      const key = Math.round(e.startMs / 30);
      byOnset.set(key, [...(byOnset.get(key) ?? []), e.velocity]);
    }
    const chords = [...byOnset.values()].filter((v) => v.length >= 3);
    expect(chords.length).toBeGreaterThan(0);
    // At least one voicing has a spread across its voices.
    expect(chords.some((v) => Math.max(...v) - Math.min(...v) > 0.02)).toBe(true);
  });

  it('is reproducible from a seed', () => {
    const a = render('same').events.filter((e) => e.part === 'piano');
    const b = render('same').events.filter((e) => e.part === 'piano');
    expect(a.map((e) => [e.startMs, e.midi])).toEqual(b.map((e) => [e.startMs, e.midi]));
  });

  it('does not play the same rhythm in every bar', () => {
    const events = render('vary').events.filter((e) => e.part === 'piano');
    const perBar = new Map<number, Set<number>>();
    for (const e of events) {
      if (!perBar.has(e.bar)) perBar.set(e.bar, new Set());
      perBar.get(e.bar)!.add(Math.round(e.startMs));
    }
    const shapes = new Set([...perBar.values()].map((s) => s.size));
    expect(shapes.size).toBeGreaterThan(1);
  });
});
