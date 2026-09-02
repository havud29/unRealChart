import type { BarChord } from '@ifakepro/song-model';
import { chordScale, chordTones, fold } from './harmony.js';
import type { Random } from './random.js';
import type { BassPart } from './types.js';

/**
 * The bass line.
 *
 * Drums and comping can be pattern playback; the bass cannot, because it is the
 * one part whose every note is decided by the harmony. A walking line is built
 * note by note against a running score: land on the root at the top of a chord,
 * approach the next chord by a step or a half step, stay in range, keep moving
 * in one direction for a while, and don't repeat yourself inside a bar.
 */

export interface BassNote {
  midi: number;
  beat: number;
  durationBeats: number;
  velocity: number;
}

export interface BassContext {
  chords: readonly BarChord[];
  /** Beats in this bar. */
  beats: number;
  /** The first chord of the next bar, so the line can approach it. */
  nextRoot: number | null;
  nextQuality: string | null;
  /** Last note played, for continuity across the barline. */
  previous: number | null;
  part: BassPart;
  random: Random;
}

const PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Pitch class of a chord's root, or of its written bass note. */
export function rootOf(chord: BarChord): number | null {
  const name = chord.bass ?? chord.root;
  if (!name) return null;
  const match = /^([A-G])(bb|##|[b#])?/.exec(name);
  if (!match) return null;
  const base = PITCH_CLASSES[match[1]!]!;
  const accidental = match[2] ?? '';
  const shift =
    accidental === 'b' ? -1 : accidental === '#' ? 1 : accidental === 'bb' ? -2 : accidental === '##' ? 2 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

/** All pitches of a class inside a register. */
function optionsFor(pitchClass: number, low: number, high: number): number[] {
  const out: number[] = [];
  for (let n = low; n <= high; n++) if (((n % 12) + 12) % 12 === pitchClass) out.push(n);
  return out;
}

/** Nearest pitch of `pitchClass` to `from`, inside the register. */
function nearest(pitchClass: number, from: number, low: number, high: number): number {
  const options = optionsFor(pitchClass, low, high);
  if (options.length === 0) return fold(pitchClass + 36, low, high);
  return options.reduce((best, n) => (Math.abs(n - from) < Math.abs(best - from) ? n : best));
}

/**
 * Score a candidate note. Lower is better.
 *
 * The weights are the whole character of the line: raise `leap` and it walks in
 * steps, raise `range` and it hugs the middle of the instrument.
 */
function score(
  candidate: number,
  previous: number,
  part: BassPart,
  used: ReadonlySet<number>,
  direction: number,
): number {
  const interval = Math.abs(candidate - previous);
  let cost = interval * 1.0;

  if (interval === 0) cost += 8; // never repeat the same note twice running
  if (interval > part.leapLimit) cost += (interval - part.leapLimit) * 4;
  if (used.has(candidate % 12)) cost += 2.5; // vary the pitch classes within a bar

  // Reward continuing in the current direction, so the line has shape.
  const moving = Math.sign(candidate - previous);
  if (direction !== 0 && moving === direction) cost -= 1.2;

  // Pull back toward the middle when the line drifts to an extreme.
  const middle = (part.low + part.high) / 2;
  cost += Math.abs(candidate - middle) * 0.12;

  return cost;
}

/** A walking line: one note per beat, chord tones on strong beats. */
function walk(context: BassContext): BassNote[] {
  const { chords, beats, part, random, nextRoot } = context;
  const notes: BassNote[] = [];
  const used = new Set<number>();

  // Where each chord starts, in beats.
  const starts: number[] = [];
  let cursor = 0;
  for (const chord of chords) {
    starts.push(cursor);
    cursor += chord.beats;
  }

  let previous = context.previous;
  let direction = 0;

  for (let beat = 0; beat < beats; beat++) {
    // Which chord is sounding on this beat?
    let index = 0;
    for (let c = 0; c < chords.length; c++) if (starts[c]! <= beat) index = c;
    const chord = chords[index]!;
    const root = rootOf(chord);
    if (root === null) continue;

    const isChordStart = Math.abs(starts[index]! - beat) < 0.001;
    const isLastBeat = beat === beats - 1;

    // The chord that follows, for approach notes.
    const following =
      index + 1 < chords.length ? rootOf(chords[index + 1]!) : nextRoot;

    let midi: number;

    if (isChordStart) {
      // Beat one of a chord takes its root — the anchor the whole line hangs on.
      midi = previous === null
        ? nearest(root, (part.low + part.high) / 2, part.low, part.high)
        : nearest(root, previous, part.low, part.high);
    } else if (isLastBeat && following !== null && random.chance(part.approach)) {
      // Approach the next chord from a half step above or below, or from its
      // fifth — the three ways a bass player gets there.
      const above = (following + 1) % 12;
      const below = (following + 11) % 12;
      const fifth = (following + 7) % 12;
      const choice = random.next();
      const target = choice < 0.42 ? below : choice < 0.84 ? above : fifth;
      midi = nearest(target, previous ?? part.low, part.low, part.high);
    } else {
      // Interior beats: chord tones, then the scale, scored for shape.
      const tones = chordTones(chord.quality).intervals.map((i) => (root + i) % 12);
      const scale = chordScale(chord.quality).map((i) => (root + i) % 12);
      const pool = [...new Set([...tones, ...tones, ...scale])];

      const from = previous ?? nearest(root, (part.low + part.high) / 2, part.low, part.high);
      const candidates = pool.flatMap((pc) => optionsFor(pc, part.low, part.high));
      midi = candidates.reduce((best, candidate) =>
        score(candidate, from, part, used, direction) < score(best, from, part, used, direction)
          ? candidate
          : best,
      );
    }

    if (previous !== null) {
      const moved = Math.sign(midi - previous);
      // Turn around at the edges of the register instead of running out of room.
      if (midi > part.high - 3) direction = -1;
      else if (midi < part.low + 3) direction = 1;
      else if (moved !== 0) direction = moved;
    }

    used.add(midi % 12);
    notes.push({
      midi,
      beat,
      durationBeats: 0.92,
      velocity: (beat === 0 ? 0.78 : 0.68) + random.jitter(0.05),
    });
    previous = midi;
  }

  return notes;
}

/** Root and fifth on the strong beats: two-feel, country, rock. */
function rootFive(context: BassContext, halfTime: boolean): BassNote[] {
  const { chords, beats, part } = context;
  const notes: BassNote[] = [];
  let previous = context.previous;
  let cursor = 0;

  for (const chord of chords) {
    const root = rootOf(chord);
    if (root === null) {
      cursor += chord.beats;
      continue;
    }
    const rootNote = previous === null
      ? nearest(root, (part.low + part.high) / 2, part.low, part.high)
      : nearest(root, previous, part.low, part.high);
    const fifth = nearest((root + 7) % 12, rootNote, part.low, part.high);

    const step = halfTime ? 2 : 1;
    for (let offset = 0; offset < chord.beats; offset += step) {
      const beat = cursor + offset;
      if (beat >= beats) break;
      const onRoot = halfTime ? offset % 4 === 0 : offset % 2 === 0;
      notes.push({
        midi: onRoot ? rootNote : fifth,
        beat,
        durationBeats: step * 0.9,
        velocity: beat === 0 ? 0.78 : 0.68,
      });
    }
    previous = rootNote;
    cursor += chord.beats;
  }

  return notes;
}

/** The bossa nova ostinato: root on 1, fifth on the and-of-2. */
function bossa(context: BassContext): BassNote[] {
  const { chords, beats, part } = context;
  const notes: BassNote[] = [];
  let previous = context.previous;
  let cursor = 0;

  for (const chord of chords) {
    const root = rootOf(chord);
    if (root === null) {
      cursor += chord.beats;
      continue;
    }
    const rootNote = previous === null
      ? nearest(root, (part.low + part.high) / 2, part.low, part.high)
      : nearest(root, previous, part.low, part.high);
    const fifth = nearest((root + 7) % 12, rootNote, part.low, part.high);

    const figure = [
      { midi: rootNote, at: 0, length: 1.4 },
      { midi: fifth, at: 1.5, length: 0.9 },
    ];
    for (const note of figure) {
      const beat = cursor + note.at;
      if (beat >= beats || note.at >= chord.beats) continue;
      notes.push({ midi: note.midi, beat, durationBeats: note.length, velocity: 0.72 });
    }
    previous = rootNote;
    cursor += chord.beats;
  }

  return notes;
}

/**
 * Play a written figure under each chord.
 *
 * Most non-walking styles are one rhythmic cell repeated against whatever
 * harmony is above it, so they differ only in that cell and in which chord tone
 * each hit takes. `degree` is a scale degree — 1 root, 5 fifth, 8 the octave,
 * b7 the flat seventh — resolved against the chord at that moment.
 */
interface Figure {
  at: number;
  length: number;
  degree: 1 | 5 | 8 | 10;
  velocity?: number;
}

function playFigure(context: BassContext, figure: readonly Figure[]): BassNote[] {
  const { chords, beats, part } = context;
  const notes: BassNote[] = [];
  let previous = context.previous;
  let cursor = 0;

  const SEMITONES: Record<Figure['degree'], number> = { 1: 0, 5: 7, 8: 12, 10: 4 };

  for (const chord of chords) {
    const root = rootOf(chord);
    if (root === null) {
      cursor += chord.beats;
      continue;
    }
    const rootNote =
      previous === null
        ? nearest(root, (part.low + part.high) / 2, part.low, part.high)
        : nearest(root, previous, part.low, part.high);

    for (const hit of figure) {
      // A figure written for a whole bar is trimmed to a chord that is shorter.
      if (hit.at >= chord.beats) continue;
      const beat = cursor + hit.at;
      if (beat >= beats) break;

      const target = rootNote + SEMITONES[hit.degree];
      notes.push({
        midi: Math.min(part.high, Math.max(part.low, target)),
        beat,
        durationBeats: Math.min(hit.length, chord.beats - hit.at),
        velocity: hit.velocity ?? 0.72,
      });
    }
    previous = rootNote;
    cursor += chord.beats;
  }

  return notes;
}

/** The figures that define each pattern-driven style, in beats from the bar. */
const FIGURES: Record<string, readonly Figure[]> = {
  // Samba: the surdo puts the weight on beat 2, not beat 1.
  samba: [
    { at: 0, length: 0.9, degree: 1, velocity: 0.62 },
    { at: 1, length: 1.1, degree: 5, velocity: 0.8 },
    { at: 2, length: 0.9, degree: 1, velocity: 0.62 },
    { at: 3, length: 1.1, degree: 5, velocity: 0.8 },
  ],
  // Tumbao: the bass arrives early, on the and-of-2 and the and-of-4, which is
  // what pulls a Cuban groove forward.
  tumbao: [
    { at: 1.5, length: 1.4, degree: 5, velocity: 0.76 },
    { at: 3, length: 0.9, degree: 1, velocity: 0.7 },
    { at: 3.5, length: 1.4, degree: 1, velocity: 0.74 },
  ],
  // Reggae: beat one is left open on purpose. The space is the style.
  reggae: [
    { at: 1, length: 0.9, degree: 1, velocity: 0.72 },
    { at: 2.5, length: 0.6, degree: 5, velocity: 0.62 },
    { at: 3, length: 1, degree: 1, velocity: 0.74 },
  ],
  funk: [
    { at: 0, length: 0.4, degree: 1, velocity: 0.85 },
    { at: 0.75, length: 0.3, degree: 8, velocity: 0.6 },
    { at: 1.5, length: 0.4, degree: 1, velocity: 0.7 },
    { at: 2.5, length: 0.4, degree: 1, velocity: 0.78 },
    { at: 3.5, length: 0.4, degree: 8, velocity: 0.62 },
  ],
  // Boogie: eighths climbing root-third-fifth-sixth and back, the blues engine.
  boogie: [
    { at: 0, length: 0.5, degree: 1, velocity: 0.78 },
    { at: 0.5, length: 0.5, degree: 10, velocity: 0.64 },
    { at: 1, length: 0.5, degree: 5, velocity: 0.72 },
    { at: 1.5, length: 0.5, degree: 10, velocity: 0.62 },
    { at: 2, length: 0.5, degree: 1, velocity: 0.76 },
    { at: 2.5, length: 0.5, degree: 10, velocity: 0.64 },
    { at: 3, length: 0.5, degree: 5, velocity: 0.72 },
    { at: 3.5, length: 0.5, degree: 10, velocity: 0.62 },
  ],
};

/** Hold the root under the whole chord. */
function pedal(context: BassContext): BassNote[] {
  const { chords, part } = context;
  const notes: BassNote[] = [];
  let cursor = 0;
  let previous = context.previous;

  for (const chord of chords) {
    const root = rootOf(chord);
    if (root !== null) {
      const midi = previous === null
        ? nearest(root, (part.low + part.high) / 2, part.low, part.high)
        : nearest(root, previous, part.low, part.high);
      notes.push({
        midi,
        beat: cursor,
        durationBeats: chord.beats * 0.95,
        velocity: 0.7,
      });
      previous = midi;
    }
    cursor += chord.beats;
  }
  return notes;
}

export function generateBass(context: BassContext): BassNote[] {
  switch (context.part.style) {
    case 'walking':
      return walk(context);
    case 'twoFeel':
      return rootFive(context, true);
    case 'rootFive':
      return rootFive(context, false);
    case 'bossa':
      return bossa(context);
    case 'pedal':
      return pedal(context);
    case 'samba':
    case 'tumbao':
    case 'reggae':
    case 'funk':
    case 'boogie':
      return playFigure(context, FIGURES[context.part.style]!);
    default:
      return walk(context);
  }
}
