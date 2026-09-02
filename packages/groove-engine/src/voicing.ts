import { chordTones, fold } from './harmony.js';

/**
 * Turning a chord symbol into pitches a player would actually choose.
 *
 * Two decisions, in order. First *which* notes: a jazz pianist playing under a
 * bass player leaves the root out and voices the third, seventh and tensions;
 * a guitarist plays a drop-2 shape; a sparse style plays shells. Second *where*
 * they sit: among all the valid arrangements, pick the one closest to what was
 * played last.
 *
 * That second step is the whole difference. Voicings chosen independently jump
 * around the keyboard and sound like a machine; voice-led ones move by a
 * semitone or two and sound like hands.
 */

export type VoicingStyle =
  | 'rootless' // jazz piano: 3rd, 7th and tensions, no root
  | 'shell' // root, 3rd, 7th — sparse and unambiguous
  | 'drop2' // guitar and close piano voicings
  | 'closed' // plain stacked chord, root included
  | 'quartal'; // modal, stacked fourths

export interface VoicingRequest {
  /** Root pitch class, 0–11. */
  root: number;
  /** Quality as written, e.g. `-7b5`. */
  quality: string;
  style: VoicingStyle;
  /** Register the voicing must sit inside, as MIDI numbers. */
  low: number;
  high: number;
  /** The previous voicing, for voice leading. */
  previous?: readonly number[] | undefined;
  /** Add 9ths and 13ths to plain chords. Mirrors iReal's embellishment toggle. */
  embellish?: boolean;
}

/** Candidate note sets for a style, as intervals above the root. */
function candidateIntervals(quality: string, style: VoicingStyle, embellish: boolean): number[][] {
  const { third, fifth, seventh, tensions, intervals } = chordTones(quality);

  const has = (n: number | null): n is number => n !== null;
  const ninth = tensions.find((t) => t === 13 || t === 14 || t === 15);
  const thirteenth = tensions.find((t) => t === 20 || t === 21);
  const eleventh = tensions.find((t) => t === 17 || t === 18);

  switch (style) {
    case 'shell':
      return [[0, ...(has(third) ? [third] : []), ...(has(seventh) ? [seventh] : [])]];

    case 'rootless': {
      // The classic A and B forms: 3-5-7-9 and 7-9-3-13. Both leave out the
      // root because the bass has it, which frees the hand for tensions.
      if (!has(third) || !has(seventh)) {
        return [[0, ...(has(third) ? [third] : [fifth]), fifth]];
      }
      const extra9 = ninth ?? (embellish ? 14 : null);
      const extra13 = thirteenth ?? (embellish ? 21 : null);
      const formA = [third, fifth, seventh, ...(extra9 !== null ? [extra9] : [])];
      const formB = [
        seventh,
        ...(extra9 !== null ? [extra9] : []),
        third + 12,
        ...(extra13 !== null ? [extra13] : [fifth + 12]),
      ];
      return [formA, formB];
    }

    case 'drop2': {
      // Take a closed four-note voicing and drop its second-from-top an octave.
      const core = [0, ...(has(third) ? [third] : []), fifth, ...(has(seventh) ? [seventh] : [])];
      const drops: number[][] = [core];
      for (let inversion = 1; inversion < core.length; inversion++) {
        const rotated = core.map((n, i) => (i < inversion ? n + 12 : n)).sort((a, b) => a - b);
        const dropped = [...rotated];
        if (dropped.length >= 2) dropped[dropped.length - 2]! -= 12;
        drops.push(dropped.sort((a, b) => a - b));
      }
      return drops;
    }

    case 'quartal': {
      // Stacked fourths from the third, the sound of modal comping.
      const base = has(third) ? third : fifth;
      return [[base, base + 5, base + 10], [fifth, fifth + 5, fifth + 10]];
    }

    case 'closed':
    default: {
      const core = embellish ? intervals : intervals.filter((i) => i < 12 || eleventh === i);
      return [core.length > 0 ? core : [0, fifth]];
    }
  }
}

/** How far two voicings are apart, as total semitone movement. */
function distance(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  // Each note counts its move to the nearest note of the other voicing, so
  // voicings of different sizes still compare sensibly.
  let total = 0;
  for (const note of a) {
    let best = Infinity;
    for (const other of b) best = Math.min(best, Math.abs(note - other));
    total += best;
  }
  return total / a.length;
}

/** Place a candidate inside the register, keeping its shape. */
function place(root: number, candidate: readonly number[], low: number, high: number): number[] | null {
  const spread = Math.max(...candidate) - Math.min(...candidate);
  if (spread > high - low) return null;

  const bottom = root + Math.min(...candidate);
  const shifted = fold(bottom, low, high - spread);
  const offset = shifted - bottom;
  return candidate.map((i) => root + i + offset).sort((a, b) => a - b);
}

/**
 * Choose a voicing, preferring the one closest to `previous`.
 *
 * Ties break toward the lower voicing so a line does not creep upward over a
 * long chorus.
 */
export function voice(request: VoicingRequest): number[] {
  const { root, quality, style, low, high, previous, embellish = false } = request;

  const candidates = candidateIntervals(quality, style, embellish);
  const placed: number[][] = [];

  for (const candidate of candidates) {
    const normalized = [...new Set(candidate)].sort((a, b) => a - b);
    // Try the voicing at every octave that fits, not just one.
    const base = place(root, normalized, low, high);
    if (!base) continue;
    placed.push(base);
    for (const octave of [-12, 12]) {
      const moved = base.map((n) => n + octave);
      if (Math.min(...moved) >= low && Math.max(...moved) <= high) placed.push(moved);
    }
  }

  if (placed.length === 0) {
    // Nothing fits the register; fall back to the root and third an octave apart
    // rather than returning silence.
    const { third } = chordTones(quality);
    return [fold(root, low, high), fold(root + (third ?? 7), low, high)];
  }

  if (!previous || previous.length === 0) {
    // No history: start in the middle of the register so there is room to move.
    const middle = (low + high) / 2;
    return placed.reduce((best, current) =>
      Math.abs(average(current) - middle) < Math.abs(average(best) - middle) ? current : best,
    );
  }

  return placed.reduce((best, current) => {
    const d = distance(current, previous);
    const bd = distance(best, previous);
    if (d < bd - 0.001) return current;
    if (Math.abs(d - bd) <= 0.001 && average(current) < average(best)) return current;
    return best;
  });
}

function average(notes: readonly number[]): number {
  return notes.reduce((sum, n) => sum + n, 0) / notes.length;
}
