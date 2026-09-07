import { chordTones } from './harmony.js';

/**
 * Chord fingerings, worked out rather than looked up.
 *
 * A table of shapes would cover the common chords and fail on exactly the ones
 * a player needs help with — `Eb7b9#11` is not in anyone's table. Searching the
 * neck instead means every chord the format can express gets a diagram, and the
 * ones it finds are the ones a guitarist would actually reach for, because that
 * is what the scoring rewards.
 */

export interface FretShape {
  /** One entry per string, low to high. `null` is a muted string. */
  frets: Array<number | null>;
  /** Lowest fret used, for drawing the position marker. 0 means open. */
  position: number;
  /** MIDI notes this shape sounds, low to high. */
  notes: number[];
}

export interface Instrument {
  id: string;
  name: string;
  /** Open-string pitches, low to high, as MIDI numbers. */
  tuning: number[];
  /** How many frets a hand can span. */
  reach: number;
  frets: number;
}

// Standard tunings. The ukulele is given in linear (low-G) tuning, because a
// diagram that assumes re-entrant tuning draws the bass note in the wrong place.
export const GUITAR: Instrument = {
  id: 'guitar',
  name: 'Guitar',
  tuning: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
  reach: 4,
  frets: 15,
};

export const UKULELE: Instrument = {
  id: 'ukulele',
  name: 'Ukulele',
  tuning: [55, 60, 64, 69], // G3 C4 E4 A4
  reach: 4,
  frets: 12,
};

export const INSTRUMENTS = [GUITAR, UKULELE];

interface Candidate {
  frets: Array<number | null>;
  score: number;
}

/**
 * Find fingerings for a chord.
 *
 * Every returned shape sounds only chord tones, spans no more than the reach,
 * and puts the root — or the written bass note — at the bottom. Beyond that the
 * scoring prefers shapes that are low on the neck, sound plenty of strings, and
 * include the third and seventh, which are the notes that make a chord sound
 * like itself.
 */
export function fingerings(
  root: number,
  quality: string,
  instrument: Instrument = GUITAR,
  options: { bass?: number | undefined; limit?: number } = {},
): FretShape[] {
  const { intervals, third, seventh } = chordTones(quality);
  const tones = new Set(intervals.map((i) => (root + i) % 12));
  // A written slash chord names the bass and means it. Otherwise root position
  // is strongly preferred but not required — on four strings an inversion is
  // often the only thing a hand can reach, and players use them freely.
  const requiredBass = options.bass ?? null;
  const bassClass = options.bass ?? root;
  const thirdClass = third === null ? null : (root + third) % 12;
  const seventhClass = seventh === null ? null : (root + seventh) % 12;

  const results: Candidate[] = [];

  for (let low = 0; low <= instrument.frets - instrument.reach; low++) {
    const high = low + instrument.reach;

    // Per string: the frets in this window that sound a chord tone, plus mute.
    const options_: Array<Array<number | null>> = instrument.tuning.map((open) => {
      const choices: Array<number | null> = [null];
      for (let fret = low === 0 ? 0 : low; fret <= high; fret++) {
        // An open string is always available; it does not cost the hand a finger.
        if (fret !== 0 && fret < low) continue;
        if (tones.has((open + fret) % 12)) choices.push(fret);
      }
      if (low > 0 && tones.has(open % 12)) choices.push(0);
      return choices;
    });

    const frets: Array<number | null> = [];

    const walk = (stringIndex: number): void => {
      if (results.length > 4000) return; // plenty to choose from; stop searching
      if (stringIndex === instrument.tuning.length) {
        const shape = evaluate(frets, instrument, {
          bassClass,
          requiredBass,
          thirdClass,
          seventhClass,
          toneCount: tones.size,
          low,
        });
        if (shape) results.push({ frets: [...frets], score: shape });
        return;
      }
      for (const fret of options_[stringIndex]!) {
        frets[stringIndex] = fret;
        walk(stringIndex + 1);
      }
      frets[stringIndex] = null;
    };
    walk(0);
  }

  // Best first, then de-duplicate: the same shape turns up in several windows.
  results.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const out: FretShape[] = [];
  for (const candidate of results) {
    const key = candidate.frets.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const sounded = candidate.frets
      .map((fret, i) => (fret === null ? null : instrument.tuning[i]! + fret))
      .filter((n): n is number => n !== null);
    const played = candidate.frets.filter((f): f is number => f !== null && f > 0);
    out.push({
      frets: candidate.frets,
      position: played.length > 0 ? Math.min(...played) : 0,
      notes: sounded,
    });
    if (out.length >= (options.limit ?? 4)) break;
  }
  return out;
}

/** Score a candidate shape. Lower is better; `null` rejects it outright. */
function evaluate(
  frets: ReadonlyArray<number | null>,
  instrument: Instrument,
  context: {
    bassClass: number;
    requiredBass: number | null;
    thirdClass: number | null;
    seventhClass: number | null;
    toneCount: number;
    low: number;
  },
): number | null {
  const sounded = frets
    .map((fret, i) => (fret === null ? null : { note: instrument.tuning[i]! + fret, string: i }))
    .filter((n): n is { note: number; string: number } => n !== null);

  // A chord needs enough voices to be one, and a hand cannot mute a string in
  // the middle of a shape without a lot of effort.
  if (sounded.length < Math.min(4, instrument.tuning.length)) return null;
  const first = frets.findIndex((f) => f !== null);
  const last = frets.length - 1 - [...frets].reverse().findIndex((f) => f !== null);
  for (let i = first; i <= last; i++) if (frets[i] === null) return null;

  const lowest = sounded[0]!.note;
  // A slash chord's bass note is not negotiable; the root of a plain chord is
  // merely much preferred, and gets its weight in the score below.
  if (context.requiredBass !== null && lowest % 12 !== context.requiredBass) return null;
  const rootInBass = lowest % 12 === context.bassClass;

  const played = frets.filter((f): f is number => f !== null && f > 0);
  const span = played.length > 0 ? Math.max(...played) - Math.min(...played) : 0;
  if (span > instrument.reach) return null;

  const classes = new Set(sounded.map((s) => s.note % 12));
  // The third and seventh are what make a chord sound like itself; a shape that
  // drops both is some other chord.
  let score = 0;
  // How much root position is worth depends on the instrument. Six strings give
  // a hand two low strings to find a root on, so a guitarist expects it; four
  // strings do not, and ukulele players use inversions without a second thought.
  if (!rootInBass) score += instrument.tuning.length >= 6 ? 7 : 3;
  if (context.thirdClass !== null && !classes.has(context.thirdClass)) score += 6;
  if (context.seventhClass !== null && !classes.has(context.seventhClass)) score += 5;

  // Prefer more of the chord, fewer muted strings, lower on the neck, and a
  // shape the hand does not have to stretch across.
  //
  // Position is weighted heavily enough to outrun the root-position preference,
  // which is what a player does: on a ukulele the lowest F sits at the tenth
  // fret, and nobody goes there when an inversion is available at the first.
  score += (context.toneCount - classes.size) * 2;
  score += (instrument.tuning.length - sounded.length) * 1.5;
  score += Math.min(...(played.length ? played : [0])) * 0.9;
  score += span * 0.6;

  return score;
}

/** Which keys of a piano to press, as MIDI notes in one comfortable register. */
export function pianoVoicing(root: number, quality: string, bass?: number): number[] {
  const { intervals } = chordTones(quality);
  const base = 60 + root; // from middle C upward, so the shape reads at a glance
  const notes = intervals.map((i) => base + i);
  if (bass !== undefined && bass !== root) notes.unshift(48 + bass);
  return [...new Set(notes)].sort((a, b) => a - b);
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];

/**
 * Spell one note as a letter and accidental, given the degree it is playing.
 *
 * The degree is what makes this musical rather than arithmetic. The third of
 * C minor is an E of some kind -- E flat -- and never a D sharp, because a
 * chord is built in thirds and each degree takes the next letter but one.
 * Spelling by pitch class alone gives `C D# G A#`, which is the same sound
 * and the wrong chord on the page.
 */
function spell(rootLetterIndex: number, rootPitch: number, degree: number, semitones: number) {
  // Degrees run 1 3 5 7 9 11 13; each is two letters on from the last.
  const letterIndex = (rootLetterIndex + (degree - 1)) % 7;
  const letter = LETTERS[letterIndex]!;
  const natural = LETTER_PITCH[letterIndex]!;
  const wanted = (rootPitch + semitones) % 12;

  // Nearest signed distance, so B against C reads as -1 rather than +11.
  let offset = (((wanted - natural) % 12) + 12) % 12;
  if (offset > 6) offset -= 12;

  const accidental =
    offset === 0 ? '' : offset > 0 ? '♯'.repeat(offset) : '♭'.repeat(-offset);
  return letter + accidental;
}

/**
 * The notes of a chord, named and in order.
 *
 * For reading rather than for playing: `C-7` is `C E♭ G B♭`. A slash bass is
 * put first, because that is where it sounds and how the symbol reads.
 */
/** One note of a chord: what it is called, and which degree it plays. */
export interface SpelledTone {
  name: string;
  /** Pitch class, 0-11. */
  pc: number;
  /** Scale degree: 1, 3, 5, 6, 7, 9, 11 or 13. */
  degree: number;
  /** Semitones above the root. */
  semitones: number;
}

/**
 * A chord as spelled tones, degree by degree.
 *
 * The degrees are the point. Everything downstream -- naming the notes, and
 * knowing which of them are the third and seventh a soloist aims at -- needs to
 * know what each note is *doing* in the chord, and a pitch class cannot say.
 */
export function chordSpelling(root: number, quality: string): SpelledTone[] {
  const { third, fifth, seventh, tensions } = chordTones(quality);

  // Which letter the root is spelled with. Pitch class alone cannot say
  // whether 6 is F sharp or G flat, so prefer the flat spelling, which is what
  // jazz charts use for every one of them except F sharp.
  const rootLetterIndex = LETTERS.indexOf(
    ['C', 'D', 'E', 'F', 'G', 'A', 'B'][[0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][root % 12]!]!,
  );
  const rootPitch = root % 12;

  const degrees: Array<[number, number]> = [[1, 0]];
  if (third !== null) degrees.push([3, third]);
  degrees.push([5, fifth]);

  /*
   * The `seventh` slot holds a sixth for a sixth chord, and nine semitones
   * means two different notes depending on the chord it is in. In `Bb6/9` it
   * is the sixth, G. In `Bbo7` it is the diminished seventh, A double flat.
   * Same pitch, different name, and taking it for a seventh either way spelled
   * a six-nine chord `Bb D F Abb C`.
   */
  if (seventh !== null) {
    const isDiminished = /^o/.test(quality.trim());
    degrees.push([seventh === 9 && !isDiminished ? 6 : 7, seventh]);
  }
  for (const tension of tensions) {
    const degree = tension <= 15 ? 9 : tension <= 18 ? 11 : 13;
    degrees.push([degree, tension]);
  }

  return degrees.map(([degree, semitones]) => ({
    name: spell(rootLetterIndex, rootPitch, degree, semitones),
    pc: (rootPitch + semitones) % 12,
    degree,
    semitones,
  }));
}

/**
 * The notes of a chord, named and in order.
 *
 * For reading rather than for playing: `C-7` is `C E♭ G B♭`. A slash bass is
 * put first, because that is where it sounds and how the symbol reads.
 */
export function chordNoteNames(root: number, quality: string, bass?: number): string[] {
  const rootPitch = root % 12;
  const names = chordSpelling(root, quality).map((tone) => tone.name);

  if (bass !== undefined && bass % 12 !== rootPitch) {
    const bassIndex = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][bass % 12]!;
    const bassNatural = LETTER_PITCH[bassIndex]!;
    let offset = ((((bass % 12) - bassNatural) % 12) + 12) % 12;
    if (offset > 6) offset -= 12;
    const accidental =
      offset === 0 ? '' : offset > 0 ? '♯'.repeat(offset) : '♭'.repeat(-offset);
    names.unshift(LETTERS[bassIndex]! + accidental);
  }

  return names;
}

/** Pitch classes a chord contains, for highlighting a keyboard. */
export function pitchClassesOf(root: number, quality: string, bass?: number): Set<number> {
  const classes = new Set(chordTones(quality).intervals.map((i) => (root + i) % 12));
  if (bass !== undefined) classes.add(bass % 12);
  return classes;
}
