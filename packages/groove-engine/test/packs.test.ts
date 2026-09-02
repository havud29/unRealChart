import { describe, expect, it } from 'vitest';
import { parsePlaylist } from '@unrealchart/ireal-format';
import { buildSongModel, formatMeter } from '@unrealchart/song-model';
import { COMP_PATTERNS, DRUM_PATTERNS, PACKS, renderGroove, selectPack } from '../src/index.js';
import type { GroovePack } from '../src/index.js';

/**
 * Every groove has to actually play. A pack that names a pattern which is not
 * in the library, or a meter its patterns cannot fill, is silence — and silence
 * is the one failure a user cannot diagnose.
 */

const CHART = '*A[T44F7   |Bb7   |F7   |C7   |Bb7   |F7   |G-7   |C7   Z';
const WALTZ = '*A[T34C^7   |A-7   |D-7   |G7   Z';
const TWELVE = '*A[T12C^7   |A-7   |D-7   |G7   Z';

function model(music: string) {
  const record = ['Fixture', 'Anon', 'Medium Swing', 'F', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
  song.bpm = 140;
  song.repeats = 1;
  return buildSongModel(song);
}

/** The chart whose meter this pack is written for. */
function chartFor(pack: GroovePack): string {
  if (pack.meters.includes('3/4')) return WALTZ;
  if (pack.meters[0] === '12/8') return TWELVE;
  return CHART;
}

describe('the groove library', () => {
  it('has a groove for every family', () => {
    const families = new Set(PACKS.map((p) => p.family));
    expect([...families].sort()).toEqual(['jazz', 'latin', 'pop']);
    expect(PACKS.length).toBeGreaterThanOrEqual(15);
  });

  it('gives every pack a distinct id and name', () => {
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
    expect(new Set(PACKS.map((p) => p.name)).size).toBe(PACKS.length);
  });

  it('names only patterns that exist', () => {
    const missing: string[] = [];
    for (const pack of PACKS) {
      for (const part of pack.parts) {
        if (part.kind === 'drums') {
          for (const id of [...part.patterns, ...part.fills]) {
            if (!DRUM_PATTERNS[id]) missing.push(`${pack.id}: drum pattern ${id}`);
          }
        }
        if (part.kind === 'comp') {
          for (const id of part.patterns) {
            if (!COMP_PATTERNS[id]) missing.push(`${pack.id}: comp pattern ${id}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('gives every pack a bass and something harmonic', () => {
    for (const pack of PACKS) {
      const kinds = pack.parts.map((p) => p.kind);
      expect(kinds, pack.id).toContain('bass');
      expect(kinds, pack.id).toContain('comp');
    }
  });

  it('states a sane tempo range', () => {
    for (const pack of PACKS) {
      expect(pack.tempoRange[0], pack.id).toBeGreaterThan(30);
      expect(pack.tempoRange[1], pack.id).toBeGreaterThan(pack.tempoRange[0]);
      expect(pack.tempoRange[1], pack.id).toBeLessThan(400);
    }
  });

  it('keeps swing inside the range that means anything', () => {
    for (const pack of PACKS) {
      // 0.5 is straight; beyond about 0.7 an offbeat has passed the next beat.
      expect(pack.swing, pack.id).toBeGreaterThanOrEqual(0.5);
      expect(pack.swing, pack.id).toBeLessThanOrEqual(0.7);
    }
  });
});

describe('every groove plays', () => {
  for (const pack of PACKS) {
    it(`${pack.name} produces every part`, () => {
      const result = renderGroove(model(chartFor(pack)), pack, { seed: 1 });
      const parts = new Set(result.events.map((e) => e.part));

      for (const part of pack.parts) {
        expect(parts.has(part.id), `${pack.id}: ${part.id} was silent`).toBe(true);
      }
      expect(result.events.length).toBeGreaterThan(10);
    });

    it(`${pack.name} keeps every event inside the piece`, () => {
      const result = renderGroove(model(chartFor(pack)), pack, { seed: 3 });
      for (const event of result.events) {
        expect(event.startMs, pack.id).toBeGreaterThanOrEqual(0);
        expect(event.startMs, pack.id).toBeLessThanOrEqual(result.durationMs + 1);
        expect(event.durationMs, pack.id).toBeGreaterThan(0);
        expect(event.velocity, pack.id).toBeGreaterThan(0);
        expect(event.velocity, pack.id).toBeLessThanOrEqual(1);
      }
    });
  }

  it('renders every pack against every meter without falling silent', () => {
    for (const pack of PACKS) {
      for (const music of [CHART, WALTZ, TWELVE]) {
        const result = renderGroove(model(music), pack, { seed: 5 });
        expect(result.events.length, `${pack.id} on ${music.slice(3, 6)}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps each bass part inside its register', () => {
    for (const pack of PACKS) {
      const bass = pack.parts.find((p) => p.kind === 'bass');
      if (!bass || bass.kind !== 'bass') continue;
      const result = renderGroove(model(chartFor(pack)), pack, { seed: 2 });
      for (const event of result.events.filter((e) => e.part === bass.id)) {
        expect(event.midi, pack.id).toBeGreaterThanOrEqual(bass.low);
        expect(event.midi, pack.id).toBeLessThanOrEqual(bass.high);
      }
    }
  });

  it('sounds different from one groove to the next', () => {
    // Two packs that render identical events are one pack with two names.
    const signatures = PACKS.map((pack) => {
      const result = renderGroove(model(CHART), pack, { seed: 9 });
      return result.events.map((e) => `${e.part}:${e.drum ?? e.midi}:${Math.round(e.startMs)}`).join('|');
    });
    expect(new Set(signatures).size).toBe(PACKS.length);
  });
});

describe('style mapping over the corpus', () => {
  it('spreads the community labels over the library rather than onto one groove', () => {
    const labels = [
      'Medium Swing', 'Jazz-Medium Swing', 'Ballad', 'Up Tempo Swing', 'Medium Up Swing',
      'Pop-Rock', 'Waltz', 'Bossa Nova', 'Pop-Soul', 'Slow Swing', 'Pop-Slow Rock',
      'Even 8ths', 'Pop-Country', 'Latin', 'Pop-Shuffle', 'Pop-Rock 12/8', 'Funk',
      'Pop-Smooth', 'Pop-Disco', 'Pop-RnB', 'Pop-Bluegrass', 'Pop-Reggae',
      'Jazz-Gypsy Jazz', 'Samba', 'Afro', 'Rock', 'Latin-Swing',
    ];
    const chosen = new Set(labels.map((l) => selectPack(l, '4/4').id));
    // Before the library grew, all of these landed on five grooves.
    expect(chosen.size).toBeGreaterThanOrEqual(11);
  });

  it('picks a groove whose meters include the chart meter', () => {
    for (const music of [CHART, WALTZ, TWELVE]) {
      const m = model(music);
      const meter = formatMeter(m.bars[0]!.time);
      for (const label of ['Medium Swing', 'Bossa Nova', 'Pop-Rock', 'Ballad', 'Funk']) {
        expect(selectPack(label, meter).meters, `${label} in ${meter}`).toContain(meter);
      }
    }
  });
});
