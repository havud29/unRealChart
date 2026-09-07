import { chordSpelling } from './diagrams.js';

/**
 * Which notes to aim at, and where they go next.
 *
 * A chart says what the harmony is. It does not say what to play over it, and
 * the gap between those is where most people get stuck. Three facts close most
 * of it, and all three can be worked out from the changes:
 *
 *   1. **The third and the seventh are the chord.** They are what separates a
 *      major seventh from a minor seventh from a dominant: the root and fifth
 *      are the same in all three and say almost nothing. Land on a third or a
 *      seventh on a strong beat and the line spells the change by itself.
 *
 *   2. **A note held across a change is free.** A tone in both chords needs no
 *      resolution and no thought, so it is the safe place to sit while the
 *      harmony moves underneath.
 *
 *   3. **A seventh falls a half step into the next chord's third.** That is the
 *      engine of a ii-V-I and most of what "voice leading" means in practice:
 *      in C, the C of D-7 leans into the B of G7, and the F of G7 into the E of
 *      C^7. Aim at the note a half step away and the line pulls itself along.
 *
 * So each tone is labelled with what it does rather than merely named, and the
 * chart can show a soloist where to land instead of leaving them to work it out
 * a bar at a time.
 */

export type ToneRole =
  /** Third or seventh: the notes that define the chord. Land here. */
  | 'guide'
  /** Root and fifth: true, but they say little about which chord this is. */
  | 'chord'
  /** Ninths, elevenths, thirteenths: colour over the top. */
  | 'colour';

export interface SoloTone {
  name: string;
  pc: number;
  degree: number;
  role: ToneRole;
  /** Sounds in the next chord too, so it can be held straight through. */
  common: boolean;
  /**
   * Where this note goes if it moves by a half step into a guide tone of the
   * next chord. The strongest melodic move available at a change.
   */
  resolvesTo: string | null;
}

function roleOf(degree: number): ToneRole {
  // The sixth of a sixth chord stands in for the seventh and defines it just
  // as much, so it guides too.
  if (degree === 3 || degree === 7 || degree === 6) return 'guide';
  if (degree === 1 || degree === 5) return 'chord';
  return 'colour';
}

/** Semitones from `a` up or down to `b`, whichever is shorter. */
function distance(a: number, b: number): number {
  const up = (((b - a) % 12) + 12) % 12;
  return Math.min(up, 12 - up);
}

export interface ChordRef {
  root: number;
  quality: string;
}

/**
 * Label a chord's tones, in the light of the chord that follows it.
 *
 * Passing the next chord is what makes this useful rather than a spelling: it
 * is the difference between "these are the notes" and "hold this one, and lean
 * that one into the change".
 */
export function soloTones(chord: ChordRef, next?: ChordRef | null): SoloTone[] {
  const tones = chordSpelling(chord.root, chord.quality);
  const following = next ? chordSpelling(next.root, next.quality) : [];
  const nextGuides = following.filter((tone) => roleOf(tone.degree) === 'guide');
  const nextPitches = new Set(following.map((tone) => tone.pc));

  return tones.map((tone) => {
    const common = nextPitches.has(tone.pc);

    // A tone that is already in the next chord is not resolving anywhere -- it
    // is staying put, which is the more useful thing to say about it.
    const target = common
      ? null
      : (nextGuides.find((guide) => distance(tone.pc, guide.pc) === 1) ?? null);

    return {
      name: tone.name,
      pc: tone.pc,
      degree: tone.degree,
      role: roleOf(tone.degree),
      common,
      resolvesTo: target?.name ?? null,
    };
  });
}
