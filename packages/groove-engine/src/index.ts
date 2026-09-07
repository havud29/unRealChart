export type {
  BassPart,
  BassStyle,
  CompHit,
  CompPart,
  CompPattern,
  DrumHit,
  DrumPart,
  DrumPattern,
  DrumVoice,
  GroovePack,
  NoteEvent,
  Part,
  PartSpec,
  RenderOptions,
} from './types.js';

export { chordTones, chordPitches, chordScale, fold, midiOf, parsePitch } from './harmony.js';
export type { ChordTones } from './harmony.js';

export { voice } from './voicing.js';
export type { VoicingRequest, VoicingStyle } from './voicing.js';

export { generateBass, rootOf } from './bass.js';
export type { BassContext, BassNote } from './bass.js';

export { COMP_PATTERNS, DRUM_PATTERNS, SECTION_ACCENT, fitPattern } from './patterns.js';

export { Random, seedFrom } from './random.js';

export {
  AFRO,
  BALLAD,
  BOLERO,
  BOSSA_NOVA,
  COUNTRY,
  EVEN_EIGHTHS,
  FUNK,
  GYPSY_JAZZ,
  JAZZ_WALTZ,
  MEDIUM_SWING,
  PACKS,
  REGGAE,
  ROCK,
  SAMBA,
  SECOND_LINE,
  SHUFFLE,
  SLOW_ROCK,
  SOUL,
  TWO_FEEL,
  UP_TEMPO_SWING,
  packById,
  selectPack,
} from './packs.js';

export { renderGroove, renderClick } from './render.js';
export { toMidiFile } from './midi.js';

export {
  GUITAR,
  INSTRUMENTS,
  UKULELE,
  chordNoteNames,
  chordSpelling,
  fingerings,
  pianoVoicing,
  pitchClassesOf,
} from './diagrams.js';
export type { FretShape, Instrument } from './diagrams.js';
export type { RenderResult } from './render.js';
export { soloTones } from './solo.js';
export type { SoloTone, ToneRole, ChordRef } from './solo.js';
