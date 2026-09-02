import { midiOf } from './harmony.js';
import type { GroovePack } from './types.js';

/**
 * The built-in grooves.
 *
 * Structurally these are plain data — no behaviour, only names that resolve
 * against the pattern library — so moving them to JSON files a user can drop in
 * is a loader change, not a rewrite.
 *
 * Ranges are written as note names because that is how a musician thinks about
 * a bass register, and read as MIDI because that is what the engine needs.
 */

const note = (spec: string, octave: number) => midiOf(spec, octave)!;

export const MEDIUM_SWING: GroovePack = {
  id: 'medium-swing',
  name: 'Medium Swing',
  family: 'jazz',
  meters: ['4/4', '2/2'],
  tempoRange: [100, 220],
  swing: 0.615,
  humanize: { time: 0.014, velocity: 0.08 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.85,
      patterns: ['swing-a', 'swing-b'],
      fills: ['swing-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'walking',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.75,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.8,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['charleston', 'and-of-2', 'sparse-long', 'off-beats'],
      density: 0.62,
      anticipate: 0.3,
    },
  ],
};

export const JAZZ_WALTZ: GroovePack = {
  id: 'jazz-waltz',
  name: 'Jazz Waltz',
  family: 'jazz',
  meters: ['3/4', '6/8'],
  tempoRange: [100, 220],
  swing: 0.6,
  humanize: { time: 0.014, velocity: 0.08 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.85,
      patterns: ['swing-waltz'],
      fills: ['swing-waltz'],
      fillEvery: 0,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'walking',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.6,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.8,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['waltz-comp'],
      density: 0.6,
      anticipate: 0.2,
    },
  ],
};

export const BALLAD: GroovePack = {
  id: 'ballad',
  name: 'Ballad',
  family: 'jazz',
  meters: ['4/4'],
  tempoRange: [50, 100],
  swing: 0.6,
  humanize: { time: 0.018, velocity: 0.09 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.6,
      patterns: ['ballad-a'],
      fills: ['swing-fill'],
      fillEvery: 16,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'twoFeel',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.4,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.75,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['sparse-long', 'charleston'],
      density: 0.4,
      anticipate: 0.15,
    },
  ],
};

export const BOSSA_NOVA: GroovePack = {
  id: 'bossa-nova',
  name: 'Bossa Nova',
  family: 'latin',
  meters: ['4/4'],
  tempoRange: [110, 170],
  swing: 0.5, // even eighths, not swung
  humanize: { time: 0.01, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'brush-kit',
      gain: 0.75,
      patterns: ['bossa-a', 'bossa-b'],
      fills: ['bossa-b'],
      fillEvery: 0,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'bossa',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.2,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'nylon-guitar',
      gain: 0.8,
      voicing: 'drop2',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['bossa-comp'],
      density: 0.75,
      anticipate: 0.1,
    },
  ],
};

export const ROCK: GroovePack = {
  id: 'rock',
  name: 'Rock',
  family: 'pop',
  meters: ['4/4'],
  tempoRange: [90, 170],
  swing: 0.5,
  humanize: { time: 0.006, velocity: 0.05 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.95,
      patterns: ['rock-a', 'rock-b'],
      fills: ['rock-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'rootFive',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.25,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'electric-piano',
      gain: 0.7,
      voicing: 'closed',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['rock-stabs', 'pop-pads'],
      density: 0.6,
      anticipate: 0.1,
    },
  ],
};

export const UP_TEMPO_SWING: GroovePack = {
  id: 'up-tempo-swing',
  name: 'Up Tempo Swing',
  family: 'jazz',
  meters: ['4/4', '2/2'],
  tempoRange: [200, 340],
  // Swing straightens out as the tempo climbs; at 280 nobody plays triplets.
  swing: 0.56,
  humanize: { time: 0.009, velocity: 0.07 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.85,
      patterns: ['swing-up', 'swing-a'],
      fills: ['swing-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'walking',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.6,
      leapLimit: 5,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.78,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['charleston', 'sparse-long', 'and-of-2'],
      density: 0.45,
      anticipate: 0.35,
    },
  ],
};

export const TWO_FEEL: GroovePack = {
  id: 'two-feel',
  name: 'Swing Two/Four',
  family: 'jazz',
  meters: ['4/4', '2/2'],
  tempoRange: [90, 200],
  swing: 0.62,
  humanize: { time: 0.014, velocity: 0.08 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.75,
      patterns: ['two-feel'],
      fills: ['swing-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'twoFeel',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.45,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.78,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['charleston', 'sparse-long'],
      density: 0.5,
      anticipate: 0.25,
    },
  ],
};

export const EVEN_EIGHTHS: GroovePack = {
  id: 'even-8ths',
  name: 'Even 8ths',
  family: 'jazz',
  meters: ['4/4'],
  tempoRange: [100, 200],
  swing: 0.5,
  humanize: { time: 0.01, velocity: 0.07 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.8,
      patterns: ['even-8ths'],
      fills: ['swing-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'walking',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.5,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.8,
      voicing: 'quartal',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['off-beats', 'sparse-long'],
      density: 0.55,
      anticipate: 0.2,
    },
  ],
};

export const GYPSY_JAZZ: GroovePack = {
  id: 'gypsy-jazz',
  name: 'Gypsy Jazz',
  family: 'jazz',
  meters: ['4/4', '2/2'],
  tempoRange: [140, 280],
  swing: 0.55,
  humanize: { time: 0.011, velocity: 0.07 },
  parts: [
    // No kit at all: la pompe is the rhythm section.
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'twoFeel',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.5,
      leapLimit: 7,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'nylon-guitar',
      gain: 0.95,
      voicing: 'shell',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['pompe'],
      density: 1,
      anticipate: 0,
    },
  ],
};

export const SECOND_LINE: GroovePack = {
  id: 'second-line',
  name: 'Second Line',
  family: 'jazz',
  meters: ['4/4'],
  tempoRange: [90, 160],
  swing: 0.58,
  humanize: { time: 0.014, velocity: 0.09 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.9,
      patterns: ['second-line'],
      fills: ['swing-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'rootFive',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.35,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.8,
      voicing: 'closed',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['charleston', 'off-beats'],
      density: 0.6,
      anticipate: 0.25,
    },
  ],
};

export const SAMBA: GroovePack = {
  id: 'samba',
  name: 'Samba',
  family: 'latin',
  meters: ['4/4', '2/2'],
  tempoRange: [140, 220],
  swing: 0.5,
  humanize: { time: 0.008, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'brush-kit',
      gain: 0.85,
      patterns: ['samba-a', 'samba-b'],
      fills: ['samba-b'],
      fillEvery: 0,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'samba',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.2,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'nylon-guitar',
      gain: 0.8,
      voicing: 'drop2',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['bossa-comp', 'off-beats'],
      density: 0.8,
      anticipate: 0.15,
    },
  ],
};

export const AFRO: GroovePack = {
  id: 'afro',
  name: 'Afro 12/8',
  family: 'latin',
  meters: ['12/8', '6/8'],
  tempoRange: [80, 160],
  swing: 0.5,
  humanize: { time: 0.012, velocity: 0.08 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'jazz-kit',
      gain: 0.9,
      patterns: ['afro-12-8'],
      fills: ['afro-12-8'],
      fillEvery: 0,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'pedal',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.2,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.8,
      voicing: 'quartal',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['twelve-eight'],
      density: 0.7,
      anticipate: 0.1,
    },
  ],
};

export const BOLERO: GroovePack = {
  id: 'bolero',
  name: 'Bolero',
  family: 'latin',
  meters: ['4/4'],
  tempoRange: [70, 120],
  swing: 0.5,
  humanize: { time: 0.01, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'brush-kit',
      gain: 0.7,
      patterns: ['bolero-a'],
      fills: ['bolero-a'],
      fillEvery: 0,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'upright-bass',
      gain: 1,
      style: 'tumbao',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.2,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.78,
      voicing: 'closed',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['bolero-comp', 'montuno'],
      density: 0.65,
      anticipate: 0.1,
    },
  ],
};

export const FUNK: GroovePack = {
  id: 'funk',
  name: 'Funk',
  family: 'pop',
  meters: ['4/4'],
  tempoRange: [85, 130],
  swing: 0.5,
  humanize: { time: 0.005, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.95,
      patterns: ['funk-a', 'funk-b'],
      fills: ['funk-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'funk',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.3,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'electric-piano',
      gain: 0.7,
      voicing: 'shell',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['funk-stabs'],
      density: 0.75,
      anticipate: 0.2,
    },
  ],
};

export const SHUFFLE: GroovePack = {
  id: 'shuffle',
  name: 'Shuffle',
  family: 'pop',
  meters: ['4/4'],
  tempoRange: [80, 180],
  // A shuffle is triplets: the offbeat sits on the last of three, further back
  // than a swung eighth.
  swing: 0.66,
  humanize: { time: 0.01, velocity: 0.07 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.9,
      patterns: ['shuffle-a'],
      fills: ['rock-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'boogie',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.3,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.75,
      voicing: 'closed',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['shuffle-comp'],
      density: 0.6,
      anticipate: 0.1,
    },
  ],
};

export const COUNTRY: GroovePack = {
  id: 'country',
  name: 'Country',
  family: 'pop',
  meters: ['4/4', '2/2'],
  tempoRange: [90, 180],
  swing: 0.5,
  humanize: { time: 0.007, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'brush-kit',
      gain: 0.8,
      patterns: ['country-a'],
      fills: ['rock-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'rootFive',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.25,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'nylon-guitar',
      gain: 0.8,
      voicing: 'closed',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['country-comp'],
      density: 0.8,
      anticipate: 0.05,
    },
  ],
};

export const REGGAE: GroovePack = {
  id: 'reggae',
  name: 'Reggae',
  family: 'pop',
  meters: ['4/4'],
  tempoRange: [70, 150],
  swing: 0.5,
  humanize: { time: 0.008, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.85,
      patterns: ['reggae-a'],
      fills: ['rock-fill'],
      fillEvery: 16,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1.1,
      style: 'reggae',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.2,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'guitar',
      instrument: 'electric-piano',
      gain: 0.7,
      voicing: 'shell',
      low: note('E', 3),
      high: note('E', 5),
      patterns: ['skank'],
      density: 1,
      anticipate: 0,
    },
  ],
};

export const SLOW_ROCK: GroovePack = {
  id: 'slow-rock',
  name: 'Slow Rock 12/8',
  family: 'pop',
  meters: ['12/8', '4/4'],
  tempoRange: [50, 100],
  swing: 0.5,
  humanize: { time: 0.012, velocity: 0.07 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.85,
      patterns: ['slow-rock-12-8'],
      fills: ['rock-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'rootFive',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.3,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'piano',
      instrument: 'acoustic-piano',
      gain: 0.75,
      voicing: 'closed',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['twelve-eight', 'pop-pads'],
      density: 0.7,
      anticipate: 0.1,
    },
  ],
};

export const SOUL: GroovePack = {
  id: 'soul',
  name: 'Soul',
  family: 'pop',
  meters: ['4/4'],
  tempoRange: [70, 130],
  swing: 0.52,
  humanize: { time: 0.008, velocity: 0.06 },
  parts: [
    {
      kind: 'drums',
      id: 'drums',
      instrument: 'rock-kit',
      gain: 0.85,
      patterns: ['soul-a'],
      fills: ['funk-fill'],
      fillEvery: 8,
      fillOnSectionChange: true,
    },
    {
      kind: 'bass',
      id: 'bass',
      instrument: 'electric-bass',
      gain: 1,
      style: 'rootFive',
      low: note('E', 1),
      high: note('G', 3),
      approach: 0.35,
      leapLimit: 12,
    },
    {
      kind: 'comp',
      id: 'keys',
      instrument: 'electric-piano',
      gain: 0.75,
      voicing: 'rootless',
      low: note('C', 3),
      high: note('A', 4),
      patterns: ['soul-pads', 'off-beats'],
      density: 0.6,
      anticipate: 0.15,
    },
  ],
};

export const PACKS: readonly GroovePack[] = [
  MEDIUM_SWING,
  UP_TEMPO_SWING,
  TWO_FEEL,
  EVEN_EIGHTHS,
  JAZZ_WALTZ,
  BALLAD,
  GYPSY_JAZZ,
  SECOND_LINE,
  BOSSA_NOVA,
  SAMBA,
  AFRO,
  BOLERO,
  ROCK,
  FUNK,
  SHUFFLE,
  COUNTRY,
  REGGAE,
  SLOW_ROCK,
  SOUL,
];

/**
 * Pick a groove for a chart.
 *
 * iReal's style and groove fields are free text, and the corpus uses 64
 * distinct labels — `Medium Swing`, `Jazz-Medium Swing`, `Pop-Rock 12/8`,
 * `Latin-Brazil: Bossa Electric`. Matching is therefore by keyword against the
 * labels that actually occur, most specific first, and it always returns
 * something playable: silence is never the right answer to an unfamiliar style.
 */
export function selectPack(styleOrGroove: string, meter: string): GroovePack {
  const name = styleOrGroove.toLowerCase();
  const twelveEight = meter === '12/8' || meter === '6/8';
  const threeFour = meter === '3/4' || meter === '3/2';

  // Meter decides first where it must: a waltz is a waltz whatever the label,
  // and a 4/4 pattern in 12/8 is not a groove, it is a mistake.
  if (threeFour) return JAZZ_WALTZ;
  if (twelveEight) {
    if (/afro|12\/8 afro|mozambique/.test(name)) return AFRO;
    if (/rock|pop|slow|blues|soul|rnb|r&b/.test(name)) return SLOW_ROCK;
    return AFRO;
  }

  // --- latin, before "swing" can claim "latin/swing" -----------------------
  if (/samba/.test(name)) return SAMBA;
  if (/afro|mozambique|nanigo/.test(name)) return AFRO;
  if (/bolero|cha ?cha|montuno|son |mambo|tango/.test(name)) return BOLERO;
  if (/bossa|baiao|baião|partido|choro|latin/.test(name)) return BOSSA_NOVA;

  // --- pop -----------------------------------------------------------------
  if (/reggae|ska/.test(name)) return REGGAE;
  if (/funk|disco|virtual/.test(name)) return FUNK;
  if (/shuffle/.test(name)) return SHUFFLE;
  if (/country|bluegrass/.test(name)) return COUNTRY;
  if (/soul|rnb|r&b|smooth|motown/.test(name)) return SOUL;
  if (/slow rock|12\/8|rock ballad/.test(name)) return SLOW_ROCK;
  if (/rock|pop|glam|house/.test(name)) return ROCK;

  // --- jazz ----------------------------------------------------------------
  if (/gypsy/.test(name)) return GYPSY_JAZZ;
  if (/second line|new orleans|dixie|trad/.test(name)) return SECOND_LINE;
  if (/even 8|even eight|straight/.test(name)) return EVEN_EIGHTHS;
  if (/two\/four|two four|2\/4 feel/.test(name)) return TWO_FEEL;
  if (/up ?tempo|medium up|fast/.test(name)) return UP_TEMPO_SWING;
  if (/ballad|slow blues/.test(name)) return BALLAD;
  // "Slow Swing" is a swing feel at a ballad tempo, not a ballad.
  if (/slow swing/.test(name)) return TWO_FEEL;
  if (/waltz/.test(name)) return JAZZ_WALTZ;

  return MEDIUM_SWING;
}

export function packById(id: string): GroovePack | undefined {
  return PACKS.find((p) => p.id === id);
}
