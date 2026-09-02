/**
 * Note spelling and transposition.
 *
 * The hard part is not moving pitches, it is spelling them. Transposing a chart
 * to F# major must produce A#, not Bb — musicians read the wrong spelling as a
 * mistake. So spelling is chosen from the *destination key*, not from a fixed
 * preference for sharps or flats.
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** The 12 major and 12 minor keys iReal Pro accepts, by pitch class. */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEYS = [
  'C-', 'C#-', 'D-', 'Eb-', 'E-', 'F-', 'F#-', 'G-', 'G#-', 'A-', 'Bb-', 'B-',
] as const;

/**
 * Position on the circle of fifths. Positive means sharps, negative flats.
 * C major and A minor sit at zero; jazz charts default to flats there.
 */
const KEY_FIFTHS: Readonly<Record<string, number>> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
  'A-': 0, 'E-': 1, 'B-': 2, 'F#-': 3, 'C#-': 4, 'G#-': 5, 'D-': -1, 'G-': -2, 'C-': -3,
  'F-': -4, 'Bb-': -5, 'Eb-': -6,
};

export type Accidentals = 'sharp' | 'flat';

/** Parse a note name (`C`, `Bb`, `F#`) to a pitch class 0–11, or null. */
export function pitchClass(note: string): number | null {
  const match = /^([A-G])(bb|##|[b#])?$/.exec(note);
  if (!match) return null;
  const base = LETTER_SEMITONES[match[1]!]!;
  const accidental = match[2] ?? '';
  const shift =
    accidental === 'b' ? -1 : accidental === '#' ? 1 : accidental === 'bb' ? -2 : accidental === '##' ? 2 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

export function isMinorKey(key: string): boolean {
  return key.trim().endsWith('-');
}

/** Pitch class of a key name such as `Eb` or `F-`. */
export function keyPitchClass(key: string): number | null {
  const trimmed = key.trim();
  return pitchClass(isMinorKey(trimmed) ? trimmed.slice(0, -1) : trimmed);
}

/** Which accidentals a key is written with. */
export function accidentalsFor(key: string): Accidentals {
  const fifths = KEY_FIFTHS[key.trim()];
  if (fifths === undefined) return key.includes('#') ? 'sharp' : 'flat';
  // Zero means C major or A minor: no key signature to follow, so use flats,
  // which is what jazz charts overwhelmingly do (Bb7, Eb^7, Ab-7).
  return fifths > 0 ? 'sharp' : 'flat';
}

/** Spell a pitch class using a key's accidentals. */
export function spell(pc: number, accidentals: Accidentals): string {
  const index = (((pc % 12) + 12) % 12);
  return accidentals === 'sharp' ? SHARP_NAMES[index]! : FLAT_NAMES[index]!;
}

/**
 * Transpose a key name. Returns one of the 24 keys iReal Pro accepts, so the
 * result always round-trips through the format.
 */
export function transposeKey(key: string, semitones: number): string {
  const pc = keyPitchClass(key);
  if (pc === null) return key;
  const target = (((pc + semitones) % 12) + 12) % 12;
  return isMinorKey(key) ? MINOR_KEYS[target]! : MAJOR_KEYS[target]!;
}

/**
 * Transpose one note name, spelling the result for `destinationKey`.
 * Unparseable input is returned untouched rather than mangled.
 */
export function transposeNote(note: string, semitones: number, destinationKey: string): string {
  const pc = pitchClass(note);
  if (pc === null) return note;
  return spell(pc + semitones, accidentalsFor(destinationKey));
}

/** Enharmonic equality: `C#` and `Db` are the same pitch. */
export function samePitch(a: string, b: string): boolean {
  const pa = pitchClass(a);
  const pb = pitchClass(b);
  return pa !== null && pa === pb;
}

export { LETTERS, MAJOR_KEYS, MINOR_KEYS };
