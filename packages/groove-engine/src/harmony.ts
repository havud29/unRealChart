/**
 * Chord symbols to actual notes.
 *
 * iReal Pro's quality vocabulary is a closed set of about sixty symbols, but
 * they are compositional rather than arbitrary — a family (major, minor,
 * dominant, diminished, half-diminished, suspended), an extension (6, 7, 9, 11,
 * 13) and any number of alterations. Parsing the grammar rather than tabulating
 * sixty strings means an unlisted-but-sensible symbol still plays correctly.
 *
 * Intervals are semitones above the root, and may exceed an octave: a 13th is
 * 21, not 9. The voicing engine needs to know a tension is *high* before it
 * decides where to actually put it.
 */

export interface ChordTones {
  /** Semitones above the root, ascending, root first. */
  intervals: number[];
  /** The third (or the tone standing in for it), for shell voicings. */
  third: number | null;
  /** The seventh or sixth, for shell voicings. */
  seventh: number | null;
  /** Fifth, which voicings drop first when room is tight. */
  fifth: number;
  /** Tensions above the seventh: 9ths, 11ths, 13ths and their alterations. */
  tensions: number[];
}

const M3 = 4;
const m3 = 3;
const P5 = 7;
const d5 = 6;
const A5 = 8;
const M6 = 9;
const m7 = 10;
const M7 = 11;
const d7 = 9;

/** Alterations, longest first so `#11` is not read as `#1` then `1`. */
const ALTERATIONS: ReadonlyArray<readonly [string, number]> = [
  ['b13', 20],
  ['#11', 18],
  ['b9', 13],
  ['#9', 15],
  ['b5', d5],
  ['#5', A5],
];

function unique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Work out the notes of a chord quality.
 *
 * `quality` is the symbol as written, without the root: `^7`, `-7b5`, `13sus`,
 * `7b9#11`. An empty quality is a major triad.
 */
export function chordTones(quality: string): ChordTones {
  const q = quality.replace(/\s+/g, '');

  // Families are mutually exclusive and detected before anything else, because
  // `-7b5` is a half-diminished chord, not a minor chord with a flat five.
  const isHalfDim = /^(ø|h)/.test(q) || /^-7b5/.test(q) || /^-9b5/.test(q);
  const isDim = !isHalfDim && /^o/.test(q);
  const isMinor = !isDim && !isHalfDim && /^-/.test(q);
  const isMajorFamily = /\^/.test(q);
  const isSus = /sus/.test(q);
  const isAlt = /alt/.test(q);

  // Extensions. `2` and `5` are iReal's shorthand for add9 and a bare fifth.
  const isPowerChord = /^5$/.test(q);
  const isTwo = /^2$/.test(q);
  const has6 = /(^|[^b#\d])6/.test(q) || /6\/9/.test(q);
  const has69 = /6\/9/.test(q);
  const has7 = /7/.test(q) || isAlt;
  const has9 = /(^|[^b#])9/.test(q) || has69;
  const has11 = /(^|[^b#])11/.test(q);
  const has13 = /(^|[^b#])13/.test(q);
  const hasAdd9 = /add9/.test(q);

  const intervals: number[] = [0];
  const tensions: number[] = [];

  // --- third -------------------------------------------------------------
  let third: number | null;
  if (isPowerChord) {
    third = null;
  } else if (isSus) {
    // sus2 only when written as such; iReal's plain `sus` is sus4.
    third = /sus2/.test(q) ? 2 : 5;
  } else if (isTwo) {
    third = M3;
  } else if (isMinor || isDim || isHalfDim) {
    third = m3;
  } else {
    third = M3;
  }
  if (third !== null) intervals.push(third);

  // `7add3sus` is a suspended chord that also states its third.
  if (/add3/.test(q) && third !== M3) intervals.push(M3);

  // --- fifth -------------------------------------------------------------
  let fifth = P5;
  if (isDim || isHalfDim) fifth = d5;
  if (/b5/.test(q)) fifth = d5;
  if (/#5/.test(q) || /^\+/.test(q) || /\^7#5/.test(q)) fifth = A5;
  if (isAlt) fifth = A5;
  intervals.push(fifth);

  // --- sixth and seventh -------------------------------------------------
  let seventh: number | null = null;
  if (isDim && /o7/.test(q)) {
    seventh = d7;
  } else if (has7) {
    seventh = isMajorFamily ? M7 : m7;
  } else if (has6) {
    seventh = M6; // a sixth stands in for the seventh in shell voicings
  } else if ((has9 || has11 || has13) && !hasAdd9) {
    // `C9`, `C13` and friends are dominants even without a written 7 — but
    // `Cadd9` says the opposite in as many words.
    seventh = isMajorFamily ? M7 : m7;
  }
  if (seventh !== null) intervals.push(seventh);

  // A minor-major chord: `-^7` is a minor triad with a major seventh.
  if (isMinor && isMajorFamily && seventh !== null) {
    intervals[intervals.length - 1] = M7;
    seventh = M7;
  }

  // --- tensions ----------------------------------------------------------
  const addTension = (semitones: number) => {
    tensions.push(semitones);
    intervals.push(semitones);
  };

  if (has9 || hasAdd9 || has69 || isTwo) addTension(14);
  if (has11) {
    addTension(17);
    if (!has9) addTension(14); // an 11th chord implies the 9th
  }
  if (has13) {
    addTension(21);
    if (!has9) addTension(14);
  }

  for (const [token, semitones] of ALTERATIONS) {
    if (!q.includes(token)) continue;
    // b5/#5 already moved the fifth; they are not separate tensions.
    if (semitones === d5 || semitones === A5) continue;
    addTension(semitones);
    // A written alteration replaces its natural form.
    if (semitones === 13 || semitones === 15) {
      const natural = intervals.indexOf(14);
      if (natural >= 0 && !/(^|[^b#])9/.test(q)) intervals.splice(natural, 1);
    }
    if (semitones === 20) {
      const natural = intervals.indexOf(21);
      if (natural >= 0) intervals.splice(natural, 1);
    }
  }

  // `alt` is shorthand for the altered scale's characteristic tensions.
  if (isAlt) {
    addTension(13); // b9
    addTension(15); // #9
  }

  // `-b6` is a minor triad with a flat sixth on top.
  if (/-b6/.test(q)) addTension(20);
  // `-#5` raises the fifth of a minor chord.
  if (/-#5/.test(q)) {
    const at = intervals.indexOf(P5);
    if (at >= 0) intervals[at] = A5;
    fifth = A5;
  }

  return {
    intervals: unique(intervals),
    third,
    seventh,
    fifth,
    tensions: unique(tensions),
  };
}

/** MIDI note numbers for a chord, rooted at `rootMidi`. */
export function chordPitches(rootMidi: number, quality: string): number[] {
  return chordTones(quality).intervals.map((i) => rootMidi + i);
}

const PITCH_CLASSES: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** MIDI number for a note name in a given octave. Middle C (C4) is 60. */
export function midiOf(note: string, octave: number): number | null {
  const match = /^([A-G])(bb|##|[b#])?$/.exec(note);
  if (!match) return null;
  const base = PITCH_CLASSES[match[1]!]!;
  const accidental = match[2] ?? '';
  const shift =
    accidental === 'b' ? -1 : accidental === '#' ? 1 : accidental === 'bb' ? -2 : accidental === '##' ? 2 : 0;
  return (octave + 1) * 12 + base + shift;
}

/** Parse a note name plus octave, e.g. `"Eb3"` or `"C-1"`. */
export function parsePitch(spec: string): number | null {
  const match = /^([A-G](?:bb|##|[b#])?)(-?\d+)$/.exec(spec.trim());
  if (!match) return null;
  return midiOf(match[1]!, Number(match[2]));
}

/** Move `midi` into `[low, high]` by octaves, keeping its pitch class. */
export function fold(midi: number, low: number, high: number): number {
  let n = midi;
  while (n < low) n += 12;
  while (n > high) n -= 12;
  return n;
}

/** The scale a chord implies, for passing tones. Semitones above the root. */
export function chordScale(quality: string): number[] {
  const { intervals, third, seventh } = chordTones(quality);
  const core = new Set(intervals.map((i) => i % 12));

  // Fill the gaps with the most idiomatic scale for the family.
  const minorish = third === m3;
  const dominant = seventh === m7 && third === M3;
  const candidates = minorish
    ? [0, 2, 3, 5, 7, 8, 10] // natural minor
    : dominant
      ? [0, 2, 4, 5, 7, 9, 10] // mixolydian
      : [0, 2, 4, 5, 7, 9, 11]; // major

  for (const step of candidates) core.add(step);
  return [...core].sort((a, b) => a - b);
}
