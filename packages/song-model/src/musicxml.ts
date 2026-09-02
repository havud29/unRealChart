import { keyPitchClass, isMinorKey } from './pitch.js';
import type { Bar, BarChord, SongModel } from './types.js';

/**
 * Lead sheets as MusicXML.
 *
 * Written here rather than borrowed: the most complete open converter is
 * GPL-3.0, and depending on it would relicense the whole app. Emitting from our
 * own bar model is also simply less work than it sounds, because the model
 * already holds everything a lead sheet needs — resolved chord durations,
 * barlines, endings and marks.
 *
 * The output is a chord chart, not an engraving: slash noteheads carrying the
 * rhythm, with `harmony` elements above them. That is what the format is for
 * and what other programs expect to receive.
 */

/** Ticks per quarter note. 24 divides by 2, 3 and 4, so every duration is exact. */
const DIVISIONS = 24;

/**
 * iReal's quality vocabulary mapped to MusicXML `kind` values.
 *
 * MusicXML names a family and then lists altered degrees separately, so this
 * table gives the family and the degrees are worked out from what is left.
 * Longest first, because `-7b5` is half-diminished, not minor with a flat five.
 */
const KINDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\^13/, 'major-13th'],
  [/^\^9/, 'major-ninth'],
  [/^\^7/, 'major-seventh'],
  [/^\^/, 'major'],
  [/^-\^9/, 'major-minor'],
  [/^-\^7?/, 'major-minor'],
  [/^-13/, 'minor-13th'],
  [/^-11/, 'minor-11th'],
  [/^-9/, 'minor-ninth'],
  [/^-7b5/, 'half-diminished'],
  [/^-7/, 'minor-seventh'],
  [/^-69/, 'minor-sixth'],
  [/^-6/, 'minor-sixth'],
  [/^-/, 'minor'],
  [/^(ø|h)/, 'half-diminished'],
  [/^o7/, 'diminished-seventh'],
  [/^o/, 'diminished'],
  [/^\+/, 'augmented'],
  [/^13sus/, 'dominant-13th'],
  [/^9sus/, 'dominant-ninth'],
  [/^7sus/, 'dominant'],
  [/^sus2/, 'suspended-second'],
  [/^sus/, 'suspended-fourth'],
  [/^13/, 'dominant-13th'],
  [/^11/, 'dominant-11th'],
  [/^9/, 'dominant-ninth'],
  [/^7alt/, 'dominant'],
  [/^7/, 'dominant'],
  [/^69/, 'major-sixth'],
  [/^6/, 'major-sixth'],
  [/^5/, 'power'],
  [/^2/, 'major'],
  [/^add9/, 'major'],
  [/^$/, 'major'],
];

interface Degree {
  value: number;
  alter: number;
  type: 'add' | 'alter' | 'subtract';
}

/** Alterations MusicXML wants listed separately from the kind. */
function degreesOf(quality: string, kind: string): Degree[] {
  const degrees: Degree[] = [];
  const has = (token: string) => quality.includes(token);

  // A flat or sharp five is a degree unless the kind already implies it.
  if (has('b5') && kind !== 'half-diminished' && !kind.startsWith('diminished')) {
    degrees.push({ value: 5, alter: -1, type: 'alter' });
  }
  if (has('#5') && kind !== 'augmented') degrees.push({ value: 5, alter: 1, type: 'alter' });
  if (has('b9')) degrees.push({ value: 9, alter: -1, type: 'add' });
  if (has('#9')) degrees.push({ value: 9, alter: 1, type: 'add' });
  if (has('#11')) degrees.push({ value: 11, alter: 1, type: 'add' });
  if (has('b13')) degrees.push({ value: 13, alter: -1, type: 'add' });
  if (has('add9') && !kind.includes('ninth')) degrees.push({ value: 9, alter: 0, type: 'add' });
  if (has('69')) degrees.push({ value: 9, alter: 0, type: 'add' });

  // `alt` is shorthand for the altered tensions.
  if (has('alt')) {
    degrees.push({ value: 5, alter: 1, type: 'alter' });
    degrees.push({ value: 9, alter: -1, type: 'add' });
    degrees.push({ value: 9, alter: 1, type: 'add' });
  }
  return degrees;
}

function kindOf(quality: string): string {
  for (const [pattern, kind] of KINDS) {
    if (pattern.test(quality)) return kind;
  }
  return 'other';
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stepAndAlter(note: string): { step: string; alter: number } | null {
  const match = /^([A-G])(bb|##|[b#])?$/.exec(note);
  if (!match) return null;
  const accidental = match[2] ?? '';
  const alter =
    accidental === 'b' ? -1 : accidental === '#' ? 1 : accidental === 'bb' ? -2 : accidental === '##' ? 2 : 0;
  return { step: match[1]!, alter };
}

/** Position on the circle of fifths, which is what MusicXML records as a key. */
const FIFTHS: Readonly<Record<string, number>> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
};

function keyFifths(key: string): { fifths: number; mode: string } {
  const minor = isMinorKey(key);
  const name = minor ? key.replace(/-$/, '') : key;
  // A minor key shares its signature with the major a minor third above.
  const relative = minor
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][
        (((keyPitchClass(key) ?? 0) + 3) % 12)
      ]!
    : name;
  return { fifths: FIFTHS[relative] ?? 0, mode: minor ? 'minor' : 'major' };
}

/** Note type for a duration in quarter notes, with dots. */
function noteType(quarters: number): { type: string; dots: number } {
  const table: Array<[number, string, number]> = [
    [8, 'breve', 0],
    [6, 'whole', 1],
    [4, 'whole', 0],
    [3, 'half', 1],
    [2, 'half', 0],
    [1.5, 'quarter', 1],
    [1, 'quarter', 0],
    [0.75, 'eighth', 1],
    [0.5, 'eighth', 0],
    [0.375, '16th', 1],
    [0.25, '16th', 0],
  ];
  for (const [value, type, dots] of table) {
    if (Math.abs(quarters - value) < 0.001) return { type, dots };
  }
  // Anything else: name the nearest smaller type and let the duration carry the
  // truth, which is what MusicXML readers go by anyway.
  const nearest = table.reduce((best, entry) =>
    Math.abs(entry[0] - quarters) < Math.abs(best[0] - quarters) ? entry : best,
  );
  return { type: nearest[1], dots: nearest[2] };
}

function harmonyElement(chord: BarChord, indent: string): string {
  if (chord.kind === 'nc' || !chord.root) {
    return `${indent}<harmony><root><root-step text=""/></root><kind text="N.C.">none</kind></harmony>`;
  }
  const root = stepAndAlter(chord.root);
  if (!root) return '';

  const kind = kindOf(chord.quality);
  const degrees = degreesOf(chord.quality, kind);
  const bass = chord.bass ? stepAndAlter(chord.bass) : null;

  const lines = [`${indent}<harmony>`];
  lines.push(`${indent}  <root>`);
  lines.push(`${indent}    <root-step>${root.step}</root-step>`);
  if (root.alter !== 0) lines.push(`${indent}    <root-alter>${root.alter}</root-alter>`);
  lines.push(`${indent}  </root>`);
  // `text` keeps the symbol the user wrote, which no kind value can express.
  lines.push(`${indent}  <kind text="${escape(chord.root + chord.quality)}">${kind}</kind>`);
  if (bass) {
    lines.push(`${indent}  <bass>`);
    lines.push(`${indent}    <bass-step>${bass.step}</bass-step>`);
    if (bass.alter !== 0) lines.push(`${indent}    <bass-alter>${bass.alter}</bass-alter>`);
    lines.push(`${indent}  </bass>`);
  }
  for (const degree of degrees) {
    lines.push(`${indent}  <degree>`);
    lines.push(`${indent}    <degree-value>${degree.value}</degree-value>`);
    lines.push(`${indent}    <degree-alter>${degree.alter}</degree-alter>`);
    lines.push(`${indent}    <degree-type>${degree.type}</degree-type>`);
    lines.push(`${indent}  </degree>`);
  }
  lines.push(`${indent}</harmony>`);
  return lines.join('\n');
}

function directions(bar: Bar, indent: string): string {
  const out: string[] = [];

  if (bar.section) {
    out.push(
      `${indent}<direction placement="above"><direction-type>` +
        `<rehearsal>${escape(bar.section)}</rehearsal>` +
        `</direction-type></direction>`,
    );
  }
  if (bar.segno) {
    out.push(
      `${indent}<direction placement="above"><direction-type><segno/></direction-type>` +
        `<sound segno="segno"/></direction>`,
    );
  }
  if (bar.coda) {
    out.push(
      `${indent}<direction placement="above"><direction-type><coda/></direction-type>` +
        `<sound coda="coda"/></direction>`,
    );
  }
  for (const comment of bar.comments) {
    out.push(
      `${indent}<direction placement="above"><direction-type>` +
        `<words>${escape(comment)}</words></direction-type></direction>`,
    );
  }
  return out.join('\n');
}

function barlines(bar: Bar, indent: string): { left: string; right: string } {
  const left: string[] = [];
  const right: string[] = [];

  // One barline element carries all of it. MusicXML orders its children
  // bar-style, then ending, then repeat; two sibling barlines on the same side
  // is not what a reader expects to find.
  if (bar.open === 'repeat' || bar.ending !== null) {
    const parts = [`${indent}<barline location="left">`];
    if (bar.open === 'repeat') parts.push(`${indent}  <bar-style>heavy-light</bar-style>`);
    if (bar.ending !== null) {
      parts.push(`${indent}  <ending number="${bar.ending}" type="start"/>`);
    }
    if (bar.open === 'repeat') parts.push(`${indent}  <repeat direction="forward"/>`);
    parts.push(`${indent}</barline>`);
    left.push(parts.join('\n'));
  }

  const style =
    bar.close === 'final' ? 'light-heavy' : bar.close === 'repeat' ? 'light-heavy' : bar.close === 'double' ? 'light-light' : null;
  if (style || bar.close === 'repeat' || bar.ending !== null) {
    const parts = [`${indent}<barline location="right">`];
    if (style) parts.push(`${indent}  <bar-style>${style}</bar-style>`);
    if (bar.ending !== null) {
      parts.push(`${indent}  <ending number="${bar.ending}" type="stop"/>`);
    }
    if (bar.close === 'repeat') parts.push(`${indent}  <repeat direction="backward"/>`);
    parts.push(`${indent}</barline>`);
    right.push(parts.join('\n'));
  }

  return { left: left.join('\n'), right: right.join('\n') };
}

export interface MusicXmlOptions {
  /** Software name recorded in the file. */
  encoder?: string;
}

/** Render a song model as a MusicXML lead sheet. */
export function toMusicXml(model: SongModel, options: MusicXmlOptions = {}): string {
  const encoder = options.encoder ?? 'iFakePro';
  const key = keyFifths(model.meta.key || 'C');

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ' +
      '"http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    '  <work>',
    `    <work-title>${escape(model.meta.title)}</work-title>`,
    '  </work>',
    '  <identification>',
    `    <creator type="composer">${escape(model.meta.composer)}</creator>`,
    '    <encoding>',
    `      <software>${escape(encoder)}</software>`,
    `      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>`,
    '    </encoding>',
    '  </identification>',
    '  <part-list>',
    '    <score-part id="P1">',
    '      <part-name>Chords</part-name>',
    // Slash notes are unpitched, and an unpitched note has to name an
    // instrument the part actually declares — otherwise the reference dangles.
    '      <score-instrument id="P1-I1">',
    '        <instrument-name>Slash</instrument-name>',
    '      </score-instrument>',
    '    </score-part>',
    '  </part-list>',
    '  <part id="P1">',
  ];

  let previousTime: string | null = null;

  model.bars.forEach((bar, index) => {
    const timeKey = `${bar.time.beats}/${bar.time.beatType}`;
    lines.push(`    <measure number="${index + 1}">`);

    // Attributes only where something changes, which is what readers expect.
    if (index === 0 || timeKey !== previousTime) {
      lines.push('      <attributes>');
      if (index === 0) lines.push(`        <divisions>${DIVISIONS}</divisions>`);
      if (index === 0) {
        lines.push('        <key>');
        lines.push(`          <fifths>${key.fifths}</fifths>`);
        lines.push(`          <mode>${key.mode}</mode>`);
        lines.push('        </key>');
      }
      lines.push('        <time>');
      lines.push(`          <beats>${bar.time.beats}</beats>`);
      lines.push(`          <beat-type>${bar.time.beatType}</beat-type>`);
      lines.push('        </time>');
      if (index === 0) {
        lines.push('        <clef>');
        lines.push('          <sign>G</sign>');
        lines.push('          <line>2</line>');
        lines.push('        </clef>');
      }
      lines.push('      </attributes>');
      previousTime = timeKey;
    }

    if (index === 0 && model.meta.bpm > 0) {
      lines.push(
        `      <direction placement="above"><direction-type>` +
          `<metronome><beat-unit>quarter</beat-unit><per-minute>${model.meta.bpm}</per-minute></metronome>` +
          `</direction-type><sound tempo="${model.meta.bpm}"/></direction>`,
      );
    }

    const bars_ = barlines(bar, '      ');
    if (bars_.left) lines.push(bars_.left);

    const marks = directions(bar, '      ');
    if (marks) lines.push(marks);

    for (const chord of bar.chords) {
      const harmony = harmonyElement(chord, '      ');
      if (harmony) lines.push(harmony);

      const quarters = chord.beats * (4 / bar.time.beatType);
      const duration = Math.max(1, Math.round(quarters * DIVISIONS));
      const { type, dots } = noteType(quarters);

      lines.push('      <note>');
      // A slash notehead on an unpitched line: the rhythm is the information,
      // the chord symbol above carries the harmony.
      lines.push('        <unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>');
      lines.push(`        <duration>${duration}</duration>`);
      lines.push('        <instrument id="P1-I1"/>');
      lines.push('        <voice>1</voice>');
      lines.push(`        <type>${type}</type>`);
      for (let d = 0; d < dots; d++) lines.push('        <dot/>');
      lines.push('        <notehead>slash</notehead>');
      if (chord.fermata) lines.push('        <notations><fermata type="upright"/></notations>');
      lines.push('      </note>');
    }

    if (bars_.right) lines.push(bars_.right);
    lines.push('    </measure>');
  });

  lines.push('  </part>');
  lines.push('</score-partwise>');
  return `${lines.join('\n')}\n`;
}
