import type { CompPattern, DrumPattern } from './types.js';

/**
 * The pattern library.
 *
 * Drum patterns and comping rhythms are pure data, shared across grooves, so a
 * new style is a list of pattern names rather than new code. Positions are in
 * beats from the bar start; swing is applied later, so an offbeat is written
 * plainly as `.5` here.
 */

const swingRide = (id: string, accents: number[]): DrumPattern => ({
  id,
  beats: 4,
  hits: [
    // The ride cymbal: quarter notes with the "spang-a-lang" offbeats on 2 and 4.
    { voice: 'ride', beat: 0, velocity: 0.78 },
    { voice: 'ride', beat: 1, velocity: 0.62 },
    { voice: 'ride', beat: 1.5, velocity: 0.5 },
    { voice: 'ride', beat: 2, velocity: 0.72 },
    { voice: 'ride', beat: 3, velocity: 0.62 },
    { voice: 'ride', beat: 3.5, velocity: 0.5 },
    // Hi-hat pedal on 2 and 4 is what makes it swing rather than just ride.
    { voice: 'hatPedal', beat: 1, velocity: 0.55 },
    { voice: 'hatPedal', beat: 3, velocity: 0.55 },
    ...accents.map((beat) => ({ voice: 'snare' as const, beat, velocity: 0.36, probability: 0.55 })),
  ],
});

export const DRUM_PATTERNS: Readonly<Record<string, DrumPattern>> = {
  'swing-a': swingRide('swing-a', [2.5]),
  'swing-b': swingRide('swing-b', [1.5, 3.5]),

  'swing-fill': {
    id: 'swing-fill',
    beats: 4,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.72 },
      { voice: 'snare', beat: 1, velocity: 0.6 },
      { voice: 'snare', beat: 1.5, velocity: 0.5 },
      { voice: 'tomMid', beat: 2, velocity: 0.66 },
      { voice: 'tomMid', beat: 2.5, velocity: 0.54 },
      { voice: 'tomLow', beat: 3, velocity: 0.7 },
      { voice: 'snare', beat: 3.5, velocity: 0.62 },
    ],
  },

  'swing-waltz': {
    id: 'swing-waltz',
    beats: 3,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.76 },
      { voice: 'ride', beat: 1, velocity: 0.58 },
      { voice: 'ride', beat: 2, velocity: 0.6 },
      { voice: 'ride', beat: 2.5, velocity: 0.46 },
      { voice: 'hatPedal', beat: 1, velocity: 0.5 },
      { voice: 'hatPedal', beat: 2, velocity: 0.5 },
    ],
  },

  'bossa-a': {
    id: 'bossa-a',
    beats: 4,
    hits: [
      { voice: 'rim', beat: 0, velocity: 0.6 },
      { voice: 'rim', beat: 1.5, velocity: 0.52 },
      { voice: 'rim', beat: 2.5, velocity: 0.56 },
      { voice: 'kick', beat: 0, velocity: 0.62 },
      { voice: 'kick', beat: 1.5, velocity: 0.5 },
      { voice: 'kick', beat: 2, velocity: 0.58 },
      { voice: 'kick', beat: 3.5, velocity: 0.5 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.42 : 0.3,
      })),
    ],
  },

  'bossa-b': {
    id: 'bossa-b',
    beats: 4,
    hits: [
      { voice: 'rim', beat: 0.5, velocity: 0.56 },
      { voice: 'rim', beat: 2, velocity: 0.6 },
      { voice: 'rim', beat: 3, velocity: 0.5 },
      { voice: 'kick', beat: 0, velocity: 0.62 },
      { voice: 'kick', beat: 1.5, velocity: 0.5 },
      { voice: 'kick', beat: 2, velocity: 0.58 },
      { voice: 'kick', beat: 3.5, velocity: 0.5 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.42 : 0.3,
      })),
    ],
  },

  'rock-a': {
    id: 'rock-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.85 },
      { voice: 'kick', beat: 2.5, velocity: 0.72 },
      { voice: 'snare', beat: 1, velocity: 0.8 },
      { voice: 'snare', beat: 3, velocity: 0.82 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.55 : 0.4,
      })),
    ],
  },

  'rock-b': {
    id: 'rock-b',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.85 },
      { voice: 'kick', beat: 1.5, velocity: 0.65 },
      { voice: 'kick', beat: 2.5, velocity: 0.72 },
      { voice: 'snare', beat: 1, velocity: 0.8 },
      { voice: 'snare', beat: 3, velocity: 0.82 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.55 : 0.4,
      })),
    ],
  },

  'rock-fill': {
    id: 'rock-fill',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.8 },
      { voice: 'snare', beat: 1, velocity: 0.72 },
      { voice: 'tomHigh', beat: 2, velocity: 0.7 },
      { voice: 'tomHigh', beat: 2.5, velocity: 0.66 },
      { voice: 'tomMid', beat: 3, velocity: 0.74 },
      { voice: 'tomLow', beat: 3.5, velocity: 0.8 },
    ],
  },

  // --- jazz -------------------------------------------------------------

  // Fast swing: the ride thins out, because at 260 there is no room for
  // spang-a-lang on every beat.
  'swing-up': {
    id: 'swing-up',
    beats: 4,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.74 },
      { voice: 'ride', beat: 1, velocity: 0.6 },
      { voice: 'ride', beat: 2, velocity: 0.7 },
      { voice: 'ride', beat: 3, velocity: 0.6 },
      { voice: 'ride', beat: 3.5, velocity: 0.5 },
      { voice: 'hatPedal', beat: 1, velocity: 0.5 },
      { voice: 'hatPedal', beat: 3, velocity: 0.5 },
      { voice: 'snare', beat: 2.5, velocity: 0.3, probability: 0.35 },
    ],
  },

  // Two-feel: the rim on 2 and 4 with nothing between, the sound of a head
  // being played before the band opens up.
  'two-feel': {
    id: 'two-feel',
    beats: 4,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.68 },
      { voice: 'ride', beat: 2, velocity: 0.66 },
      { voice: 'rim', beat: 1, velocity: 0.5 },
      { voice: 'rim', beat: 3, velocity: 0.52 },
      { voice: 'hatPedal', beat: 1, velocity: 0.45 },
      { voice: 'hatPedal', beat: 3, velocity: 0.45 },
    ],
  },

  // Even eighths: straight, not swung, with the hats carrying the subdivision.
  'even-8ths': {
    id: 'even-8ths',
    beats: 4,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.72 },
      { voice: 'ride', beat: 1, velocity: 0.58 },
      { voice: 'ride', beat: 2, velocity: 0.68 },
      { voice: 'ride', beat: 3, velocity: 0.58 },
      { voice: 'hatPedal', beat: 1, velocity: 0.5 },
      { voice: 'hatPedal', beat: 3, velocity: 0.5 },
      { voice: 'kick', beat: 0, velocity: 0.4 },
    ],
  },

  // New Orleans second line: the shuffle in the snare is the whole thing.
  'second-line': {
    id: 'second-line',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.8 },
      { voice: 'kick', beat: 1.5, velocity: 0.6 },
      { voice: 'kick', beat: 2.5, velocity: 0.7 },
      { voice: 'snare', beat: 1, velocity: 0.5 },
      { voice: 'snare', beat: 1.5, velocity: 0.36 },
      { voice: 'snare', beat: 2, velocity: 0.44 },
      { voice: 'snare', beat: 3, velocity: 0.62 },
      { voice: 'snare', beat: 3.5, velocity: 0.4 },
      { voice: 'hatClosed', beat: 0, velocity: 0.4 },
      { voice: 'hatClosed', beat: 2, velocity: 0.4 },
    ],
  },

  // --- latin ------------------------------------------------------------

  'samba-a': {
    id: 'samba-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.55 },
      { voice: 'kick', beat: 1, velocity: 0.85 },
      { voice: 'kick', beat: 2, velocity: 0.55 },
      { voice: 'kick', beat: 3, velocity: 0.85 },
      { voice: 'rim', beat: 0.5, velocity: 0.5 },
      { voice: 'rim', beat: 1.5, velocity: 0.44 },
      { voice: 'rim', beat: 2.75, velocity: 0.52 },
      { voice: 'rim', beat: 3.5, velocity: 0.46 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.4 : 0.3,
      })),
    ],
  },

  'samba-b': {
    id: 'samba-b',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.55 },
      { voice: 'kick', beat: 1, velocity: 0.85 },
      { voice: 'kick', beat: 2.5, velocity: 0.6 },
      { voice: 'kick', beat: 3, velocity: 0.85 },
      { voice: 'rim', beat: 0.25, velocity: 0.46 },
      { voice: 'rim', beat: 1.5, velocity: 0.5 },
      { voice: 'rim', beat: 2.5, velocity: 0.48 },
      { voice: 'snare', beat: 3.75, velocity: 0.4, probability: 0.5 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.4 : 0.3,
      })),
    ],
  },

  // Afro 12/8: the bell pattern, which is the clock everything else hangs on.
  'afro-12-8': {
    id: 'afro-12-8',
    beats: 12,
    hits: [
      ...[0, 2, 3, 5, 6, 8, 9, 11].map((beat) => ({
        voice: 'rideBell' as const,
        beat,
        velocity: beat % 3 === 0 ? 0.7 : 0.52,
      })),
      { voice: 'kick', beat: 0, velocity: 0.72 },
      { voice: 'kick', beat: 6, velocity: 0.66 },
      { voice: 'tomLow', beat: 3, velocity: 0.5 },
      { voice: 'tomLow', beat: 9, velocity: 0.5 },
      { voice: 'hatPedal', beat: 3, velocity: 0.4 },
      { voice: 'hatPedal', beat: 9, velocity: 0.4 },
    ],
  },

  'bolero-a': {
    id: 'bolero-a',
    beats: 4,
    hits: [
      { voice: 'rim', beat: 0, velocity: 0.5 },
      { voice: 'rim', beat: 1.5, velocity: 0.42 },
      { voice: 'rim', beat: 2, velocity: 0.48 },
      { voice: 'rim', beat: 3, velocity: 0.44 },
      { voice: 'kick', beat: 0, velocity: 0.6 },
      { voice: 'kick', beat: 2, velocity: 0.55 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: 0.26,
      })),
    ],
  },

  // --- pop --------------------------------------------------------------

  'funk-a': {
    id: 'funk-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.9 },
      { voice: 'kick', beat: 0.75, velocity: 0.6 },
      { voice: 'kick', beat: 2.5, velocity: 0.8 },
      { voice: 'snare', beat: 1, velocity: 0.85 },
      { voice: 'snare', beat: 3, velocity: 0.85 },
      { voice: 'snare', beat: 3.75, velocity: 0.3, probability: 0.5 },
      ...[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map(
        (beat) => ({
          voice: 'hatClosed' as const,
          beat,
          velocity: beat % 1 === 0 ? 0.5 : beat % 0.5 === 0 ? 0.34 : 0.24,
        }),
      ),
    ],
  },

  'funk-b': {
    id: 'funk-b',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.9 },
      { voice: 'kick', beat: 1.75, velocity: 0.7 },
      { voice: 'kick', beat: 2.5, velocity: 0.8 },
      { voice: 'snare', beat: 1, velocity: 0.85 },
      { voice: 'snare', beat: 2.75, velocity: 0.35 },
      { voice: 'snare', beat: 3, velocity: 0.85 },
      { voice: 'hatOpen', beat: 3.5, velocity: 0.4 },
      ...[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.5 : 0.28,
      })),
    ],
  },

  'funk-fill': {
    id: 'funk-fill',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.85 },
      { voice: 'snare', beat: 1, velocity: 0.7 },
      { voice: 'snare', beat: 2, velocity: 0.55 },
      { voice: 'snare', beat: 2.25, velocity: 0.5 },
      { voice: 'snare', beat: 2.5, velocity: 0.62 },
      { voice: 'tomMid', beat: 3, velocity: 0.7 },
      { voice: 'tomLow', beat: 3.5, velocity: 0.78 },
    ],
  },

  // A shuffle is triplets; the swing setting on the groove does the rest.
  'shuffle-a': {
    id: 'shuffle-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.82 },
      { voice: 'kick', beat: 2, velocity: 0.76 },
      { voice: 'snare', beat: 1, velocity: 0.82 },
      { voice: 'snare', beat: 3, velocity: 0.84 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.52 : 0.34,
      })),
    ],
  },

  // Train beat: the snare buzz under everything is what makes it country.
  'country-a': {
    id: 'country-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.78 },
      { voice: 'kick', beat: 2, velocity: 0.74 },
      { voice: 'rim', beat: 1, velocity: 0.6 },
      { voice: 'rim', beat: 3, velocity: 0.62 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'snare' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.3 : 0.22,
      })),
    ],
  },

  // One drop: beat one is silent, and the weight is on three.
  'reggae-a': {
    id: 'reggae-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 2, velocity: 0.85 },
      { voice: 'rim', beat: 2, velocity: 0.7 },
      { voice: 'hatClosed', beat: 0.5, velocity: 0.42 },
      { voice: 'hatClosed', beat: 1, velocity: 0.34 },
      { voice: 'hatClosed', beat: 1.5, velocity: 0.42 },
      { voice: 'hatClosed', beat: 2.5, velocity: 0.42 },
      { voice: 'hatClosed', beat: 3, velocity: 0.34 },
      { voice: 'hatOpen', beat: 3.5, velocity: 0.4 },
    ],
  },

  // 12/8 slow rock: triplets under a backbeat.
  'slow-rock-12-8': {
    id: 'slow-rock-12-8',
    beats: 12,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.85 },
      { voice: 'kick', beat: 6, velocity: 0.6 },
      { voice: 'snare', beat: 3, velocity: 0.8 },
      { voice: 'snare', beat: 9, velocity: 0.82 },
      ...Array.from({ length: 12 }, (_, i) => ({
        voice: 'hatClosed' as const,
        beat: i,
        velocity: i % 3 === 0 ? 0.48 : 0.3,
      })),
    ],
  },

  'soul-a': {
    id: 'soul-a',
    beats: 4,
    hits: [
      { voice: 'kick', beat: 0, velocity: 0.82 },
      { voice: 'kick', beat: 1.5, velocity: 0.55 },
      { voice: 'kick', beat: 2.5, velocity: 0.7 },
      { voice: 'snare', beat: 1, velocity: 0.8 },
      { voice: 'snare', beat: 3, velocity: 0.82 },
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({
        voice: 'hatClosed' as const,
        beat,
        velocity: beat % 1 === 0 ? 0.46 : 0.3,
      })),
    ],
  },

  'ballad-a': {
    id: 'ballad-a',
    beats: 4,
    hits: [
      { voice: 'ride', beat: 0, velocity: 0.5 },
      { voice: 'ride', beat: 2, velocity: 0.46 },
      { voice: 'hatPedal', beat: 1, velocity: 0.4 },
      { voice: 'hatPedal', beat: 3, velocity: 0.4 },
      { voice: 'snare', beat: 3, velocity: 0.22, probability: 0.4 },
    ],
  },
};

/** A crash on beat one, used to mark a section change. */
export const SECTION_ACCENT: DrumPattern = {
  id: 'section-accent',
  beats: 4,
  hits: [{ voice: 'crash', beat: 0, velocity: 0.62 }],
};

export const COMP_PATTERNS: Readonly<Record<string, CompPattern>> = {
  // The Charleston: beat 1 and the and-of-2. The bedrock of jazz comping.
  charleston: {
    id: 'charleston',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 1.4, velocity: 0.62 },
      { beat: 2.5, durationBeats: 1.2, velocity: 0.55 },
    ],
  },
  'and-of-2': {
    id: 'and-of-2',
    beats: 4,
    hits: [
      { beat: 1.5, durationBeats: 1.6, velocity: 0.58 },
      { beat: 3.5, durationBeats: 0.8, velocity: 0.5 },
    ],
  },
  'sparse-long': {
    id: 'sparse-long',
    beats: 4,
    hits: [{ beat: 0, durationBeats: 3.6, velocity: 0.5 }],
  },
  'off-beats': {
    id: 'off-beats',
    beats: 4,
    hits: [
      { beat: 0.5, durationBeats: 0.9, velocity: 0.5 },
      { beat: 1.5, durationBeats: 0.9, velocity: 0.56 },
      { beat: 3, durationBeats: 1, velocity: 0.52 },
    ],
  },
  'waltz-comp': {
    id: 'waltz-comp',
    beats: 3,
    hits: [
      { beat: 0, durationBeats: 1, velocity: 0.6 },
      { beat: 1.5, durationBeats: 1.4, velocity: 0.5 },
    ],
  },
  'bossa-comp': {
    id: 'bossa-comp',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 1.4, velocity: 0.56 },
      { beat: 1.5, durationBeats: 0.5, velocity: 0.48 },
      { beat: 2.5, durationBeats: 1.4, velocity: 0.54 },
    ],
  },
  // La pompe: four short chops a bar, the engine of gypsy jazz.
  pompe: {
    id: 'pompe',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 0.25, velocity: 0.5 },
      { beat: 1, durationBeats: 0.2, velocity: 0.66 },
      { beat: 2, durationBeats: 0.25, velocity: 0.5 },
      { beat: 3, durationBeats: 0.2, velocity: 0.66 },
    ],
  },
  // A guajeo: the Cuban piano figure, anticipating the bar.
  montuno: {
    id: 'montuno',
    beats: 4,
    hits: [
      { beat: 0.5, durationBeats: 0.4, velocity: 0.56 },
      { beat: 1.5, durationBeats: 0.4, velocity: 0.6 },
      { beat: 2, durationBeats: 0.4, velocity: 0.5 },
      { beat: 3, durationBeats: 0.4, velocity: 0.58 },
      { beat: 3.5, durationBeats: 0.4, velocity: 0.5 },
    ],
  },
  'bolero-comp': {
    id: 'bolero-comp',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 1.4, velocity: 0.5 },
      { beat: 2, durationBeats: 1.6, velocity: 0.48 },
    ],
  },
  // The skank: offbeats only, and nothing on the downbeat at all.
  skank: {
    id: 'skank',
    beats: 4,
    hits: [
      { beat: 0.5, durationBeats: 0.3, velocity: 0.6 },
      { beat: 1.5, durationBeats: 0.3, velocity: 0.56 },
      { beat: 2.5, durationBeats: 0.3, velocity: 0.6 },
      { beat: 3.5, durationBeats: 0.3, velocity: 0.56 },
    ],
  },
  'funk-stabs': {
    id: 'funk-stabs',
    beats: 4,
    hits: [
      { beat: 0.75, durationBeats: 0.2, velocity: 0.62 },
      { beat: 1.5, durationBeats: 0.2, velocity: 0.5 },
      { beat: 2.75, durationBeats: 0.2, velocity: 0.6 },
      { beat: 3.5, durationBeats: 0.3, velocity: 0.52 },
    ],
  },
  'shuffle-comp': {
    id: 'shuffle-comp',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 0.4, velocity: 0.56 },
      { beat: 1, durationBeats: 0.4, velocity: 0.5 },
      { beat: 2, durationBeats: 0.4, velocity: 0.56 },
      { beat: 3, durationBeats: 0.4, velocity: 0.5 },
    ],
  },
  'country-comp': {
    id: 'country-comp',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 0.9, velocity: 0.5 },
      { beat: 1, durationBeats: 0.4, velocity: 0.44 },
      { beat: 2, durationBeats: 0.9, velocity: 0.5 },
      { beat: 3, durationBeats: 0.4, velocity: 0.44 },
    ],
  },
  'soul-pads': {
    id: 'soul-pads',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 1.9, velocity: 0.44 },
      { beat: 2.5, durationBeats: 1.4, velocity: 0.42 },
    ],
  },
  'twelve-eight': {
    id: 'twelve-eight',
    beats: 12,
    hits: [
      { beat: 0, durationBeats: 2.8, velocity: 0.5 },
      { beat: 6, durationBeats: 2.8, velocity: 0.46 },
    ],
  },
  'waltz-two': {
    id: 'waltz-two',
    beats: 3,
    hits: [
      { beat: 1, durationBeats: 0.8, velocity: 0.52 },
      { beat: 2, durationBeats: 0.8, velocity: 0.5 },
    ],
  },

  'pop-pads': {
    id: 'pop-pads',
    beats: 4,
    hits: [{ beat: 0, durationBeats: 3.9, velocity: 0.45 }],
  },
  'rock-stabs': {
    id: 'rock-stabs',
    beats: 4,
    hits: [
      { beat: 0, durationBeats: 0.9, velocity: 0.6 },
      { beat: 1, durationBeats: 0.9, velocity: 0.5 },
      { beat: 2, durationBeats: 0.9, velocity: 0.58 },
      { beat: 3, durationBeats: 0.9, velocity: 0.5 },
    ],
  },
};

/**
 * Scale a pattern written in one meter to another.
 *
 * A 4/4 pattern in 3/4 is not a 3/4 pattern, but truncating it keeps a groove
 * playable in an odd meter instead of dropping the part entirely.
 */
export function fitPattern<T extends { beat: number }>(hits: readonly T[], beats: number): T[] {
  return hits.filter((hit) => hit.beat < beats);
}
