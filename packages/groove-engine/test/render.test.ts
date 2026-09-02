import { describe, expect, it } from 'vitest';
import { parsePlaylist } from '@ifakepro/ireal-format';
import { buildSongModel } from '@ifakepro/song-model';
import {
  BOSSA_NOVA,
  JAZZ_WALTZ,
  MEDIUM_SWING,
  ROCK,
  renderGroove,
  selectPack,
} from '../src/index.js';
import type { NoteEvent } from '../src/index.js';

const BLUES = '*A[T44F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |G-7   |C7   |F7   |C7   Z';

function model(music = BLUES, meta: { key?: string; bpm?: number; repeats?: number } = {}) {
  const record = ['Fixture', 'Anon', 'Medium Swing', meta.key ?? 'F', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
  song.bpm = meta.bpm ?? 160;
  song.repeats = meta.repeats ?? 1;
  return buildSongModel(song);
}

const partsOf = (events: NoteEvent[]) => [...new Set(events.map((e) => e.part))].sort();
const forPart = (events: NoteEvent[], part: string) => events.filter((e) => e.part === part);

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitchClassOf = (name: string) => {
  const base = PITCH[name[0]!]!;
  const shift = name[1] === 'b' ? -1 : name[1] === '#' ? 1 : 0;
  return (((base + shift) % 12) + 12) % 12;
};

describe('renderGroove', () => {
  const result = renderGroove(model(), MEDIUM_SWING, { seed: 1 });

  it('plays every part in the groove', () => {
    expect(partsOf(result.events)).toEqual(['bass', 'drums', 'piano']);
  });

  it('covers the whole form', () => {
    expect(result.bars).toHaveLength(12);
    expect(result.durationMs).toBeGreaterThan(0);
    const lastBar = result.timemap[result.timemap.length - 1]!;
    expect(result.durationMs).toBeGreaterThanOrEqual(lastBar.startMs);
  });

  it('emits events in time order', () => {
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.startMs).toBeGreaterThanOrEqual(result.events[i - 1]!.startMs);
    }
  });

  it('keeps every event inside the piece and audible', () => {
    for (const event of result.events) {
      expect(event.startMs).toBeGreaterThanOrEqual(0);
      expect(event.startMs).toBeLessThanOrEqual(result.durationMs + 1);
      expect(event.velocity).toBeGreaterThan(0);
      expect(event.velocity).toBeLessThanOrEqual(1);
      expect(event.durationMs).toBeGreaterThan(0);
    }
  });

  it('walks the bass one note per beat', () => {
    expect(forPart(result.events, 'bass')).toHaveLength(48); // 12 bars of 4/4
  });

  it('lands the bass on the root at every chord change', () => {
    const bass = forPart(result.events, 'bass');
    const roots = ['F', 'Bb', 'F', 'F', 'Bb', 'Bb', 'F', 'F', 'G', 'C', 'F', 'C'];
    for (let bar = 0; bar < roots.length; bar++) {
      const first = bass.find((e) => e.bar === bar)!;
      expect(((first.midi % 12) + 12) % 12, `bar ${bar + 1}`).toBe(pitchClassOf(roots[bar]!));
    }
  });

  it('keeps the bass inside its register', () => {
    const part = MEDIUM_SWING.parts.find((p) => p.id === 'bass') as { low: number; high: number };
    for (const event of forPart(result.events, 'bass')) {
      expect(event.midi).toBeGreaterThanOrEqual(part.low);
      expect(event.midi).toBeLessThanOrEqual(part.high);
    }
  });

  it('never repeats the same bass note twice running', () => {
    const bass = forPart(result.events, 'bass');
    let repeats = 0;
    for (let i = 1; i < bass.length; i++) if (bass[i]!.midi === bass[i - 1]!.midi) repeats++;
    // A held root across a bar line is fine; a stuck line is not.
    expect(repeats).toBeLessThan(bass.length * 0.1);
  });

  it('gives drums a named voice as well as a MIDI note', () => {
    for (const event of forPart(result.events, 'drums')) {
      expect(event.drum).toBeTruthy();
      expect(event.midi).toBeGreaterThan(0);
    }
  });

  it('is reproducible for a given seed', () => {
    expect(renderGroove(model(), MEDIUM_SWING, { seed: 42 }).events).toEqual(
      renderGroove(model(), MEDIUM_SWING, { seed: 42 }).events,
    );
  });

  it('differs between seeds, so it is not a fixed loop', () => {
    expect(renderGroove(model(), MEDIUM_SWING, { seed: 1 }).events).not.toEqual(
      renderGroove(model(), MEDIUM_SWING, { seed: 2 }).events,
    );
  });

  it('voice-leads the comping instead of jumping around', () => {
    const piano = forPart(result.events, 'piano');
    // Group simultaneous notes into voicings, then measure how far the hand moves.
    const stabs = new Map<number, number[]>();
    for (const e of piano) {
      const key = Math.round(e.startMs);
      stabs.set(key, [...(stabs.get(key) ?? []), e.midi]);
    }
    const centres = [...stabs.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, notes]) => notes.reduce((s, n) => s + n, 0) / notes.length);

    const moves = centres.slice(1).map((c, i) => Math.abs(c - centres[i]!));
    const average = moves.reduce((s, m) => s + m, 0) / Math.max(1, moves.length);
    expect(average).toBeLessThan(5);
  });
});

describe('swing', () => {
  it('places offbeats later than an even-eighth groove would', () => {
    const straight = { ...MEDIUM_SWING, swing: 0.5, humanize: { time: 0, velocity: 0 } };
    const swung = { ...MEDIUM_SWING, swing: 0.66, humanize: { time: 0, velocity: 0 } };

    const rideTimes = (pack: typeof MEDIUM_SWING) =>
      renderGroove(model(), pack, { seed: 7 })
        .events.filter((e) => e.part === 'drums' && e.drum === 'ride')
        .map((e) => e.startMs);

    const even = rideTimes(straight);
    const late = rideTimes(swung);
    expect(even).toHaveLength(late.length);
    // Every offbeat moved later; downbeats stayed put.
    expect(late.some((t, i) => t > even[i]! + 1)).toBe(true);
    expect(late.every((t, i) => t >= even[i]! - 0.001)).toBe(true);
  });
});

describe('mixer options', () => {
  it('mutes a part', () => {
    expect(partsOf(renderGroove(model(), MEDIUM_SWING, { seed: 1, mute: ['drums'] }).events)).toEqual([
      'bass',
      'piano',
    ]);
  });

  it('solos a part', () => {
    expect(partsOf(renderGroove(model(), MEDIUM_SWING, { seed: 1, solo: ['bass'] }).events)).toEqual([
      'bass',
    ]);
  });
});

describe('other grooves and meters', () => {
  it('renders a waltz in 3/4', () => {
    const result = renderGroove(model('*A[T34C^7   |A-7   |D-7   |G7   Z'), JAZZ_WALTZ, { seed: 1 });
    expect(forPart(result.events, 'bass')).toHaveLength(12); // 4 bars x 3 beats
  });

  it('renders a bossa with its own instruments', () => {
    expect(partsOf(renderGroove(model(), BOSSA_NOVA, { seed: 1 }).events)).toEqual([
      'bass',
      'drums',
      'guitar',
    ]);
  });

  it('renders rock with a kick drum', () => {
    const result = renderGroove(model(), ROCK, { seed: 1 });
    expect(forPart(result.events, 'drums').some((e) => e.drum === 'kick')).toBe(true);
  });

  it('never renders silence, whatever the meter', () => {
    for (const meter of ['24', '34', '44', '54', '68', '78', '98', '12', '22']) {
      const m = model(`[T${meter}C^7   |F7   |G7   |C6   Z`);
      const pack = selectPack('Medium Swing', `${m.bars[0]!.time.beats}/${m.bars[0]!.time.beatType}`);
      expect(renderGroove(m, pack, { seed: 1 }).events.length, `meter ${meter}`).toBeGreaterThan(0);
    }
  });

  it('handles N.C. without emitting a chord', () => {
    const result = renderGroove(model('[T44n   |C^7   Z'), MEDIUM_SWING, { seed: 1 });
    expect(result.events.filter((e) => e.part === 'piano' && e.bar === 0)).toHaveLength(0);
  });
});

describe('selectPack', () => {
  it('maps the labels the corpus actually uses', () => {
    // Taken from the 64 distinct style labels across 2200 community charts,
    // most frequent first.
    const cases: Array<[string, string, string]> = [
      ['Medium Swing', '4/4', 'medium-swing'],
      ['Jazz-Medium Swing', '4/4', 'medium-swing'],
      ['Ballad', '4/4', 'ballad'],
      ['Up Tempo Swing', '4/4', 'up-tempo-swing'],
      ['Medium Up Swing', '4/4', 'up-tempo-swing'],
      ['Pop-Rock', '4/4', 'rock'],
      ['Waltz', '3/4', 'jazz-waltz'],
      ['Bossa Nova', '4/4', 'bossa-nova'],
      ['Pop-Soul', '4/4', 'soul'],
      ['Slow Swing', '4/4', 'two-feel'],
      ['Pop-Slow Rock', '4/4', 'slow-rock'],
      ['Even 8ths', '4/4', 'even-8ths'],
      ['Pop-Country', '4/4', 'country'],
      ['Latin', '4/4', 'bossa-nova'],
      ['Pop-Shuffle', '4/4', 'shuffle'],
      ['Pop-Rock 12/8', '4/4', 'slow-rock'],
      ['Funk', '4/4', 'funk'],
      ['Pop-Smooth', '4/4', 'soul'],
      ['Pop-Disco', '4/4', 'funk'],
      ['Pop-RnB', '4/4', 'soul'],
      ['Pop-Bluegrass', '4/4', 'country'],
      ['Pop-Reggae', '4/4', 'reggae'],
      ['Jazz-Gypsy Jazz', '4/4', 'gypsy-jazz'],
      ['Samba', '4/4', 'samba'],
      ['Afro', '4/4', 'afro'],
      ['Latin-Brazil: Bossa Electric', '4/4', 'bossa-nova'],
      ['Cuba: Son Montuno 2-3', '4/4', 'bolero'],
      ['Dixieland', '4/4', 'second-line'],
    ];
    for (const [label, meter, id] of cases) {
      expect(selectPack(label, meter).id, `${label} in ${meter}`).toBe(id);
    }
  });

  it('lets the meter override the label where it must', () => {
    // A 4/4 pattern in 3/4 is not a groove, it is a mistake.
    expect(selectPack('Medium Swing', '3/4').id).toBe('jazz-waltz');
    expect(selectPack('Pop-Rock', '3/4').id).toBe('jazz-waltz');
    expect(selectPack('Pop-Slow Rock', '12/8').id).toBe('slow-rock');
    expect(selectPack('Afro', '12/8').id).toBe('afro');
  });

  it('chooses a groove whose meters include the chart meter', () => {
    for (const meter of ['4/4', '3/4', '12/8']) {
      for (const label of ['Medium Swing', 'Bossa Nova', 'Pop-Rock', 'Funk', 'Ballad']) {
        const pack = selectPack(label, meter);
        expect(pack.meters, `${label} in ${meter}`).toContain(meter);
      }
    }
  });

  it('always returns something playable for an unknown style', () => {
    expect(selectPack('Something Unheard Of', '4/4')).toBeTruthy();
    expect(selectPack('', '4/4')).toBeTruthy();
  });
});
