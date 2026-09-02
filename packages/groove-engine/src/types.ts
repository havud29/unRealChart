import type { VoicingStyle } from './voicing.js';

/**
 * What the engine produces, and what a groove is made of.
 *
 * Events carry absolute milliseconds because the transport schedules against
 * the Web Audio clock, and because a tempo ramp means beats and seconds are not
 * proportional across a whole song. Positions *within* a bar are worked out in
 * beats first, so swing and anticipation stay musical, then converted once the
 * bar's real duration is known.
 */

export type DrumVoice =
  | 'kick'
  | 'snare'
  | 'rim'
  | 'hatClosed'
  | 'hatOpen'
  | 'hatPedal'
  | 'ride'
  | 'rideBell'
  | 'crash'
  | 'tomLow'
  | 'tomMid'
  | 'tomHigh';

export interface NoteEvent {
  /** Which part played it: `bass`, `drums`, `piano`, … */
  part: string;
  /** Sound to play it with, resolved by the audio host. */
  instrument: string;
  /** MIDI note number. For drums, the voice is in `drum` instead. */
  midi: number;
  drum?: DrumVoice;
  startMs: number;
  durationMs: number;
  /** 0–1. */
  velocity: number;
  /** Index into the unrolled bar list, for debugging and the playhead. */
  bar: number;
}

/** One hit in a drum pattern. Positions are in beats from the bar start. */
export interface DrumHit {
  voice: DrumVoice;
  beat: number;
  velocity: number;
  /** 0–1; hits below a roll of the seeded RNG are skipped. Defaults to 1. */
  probability?: number;
}

export interface DrumPattern {
  id: string;
  /** Meter this pattern is written for. */
  beats: number;
  hits: DrumHit[];
}

/** One chord stab in a comping rhythm. */
export interface CompHit {
  beat: number;
  durationBeats: number;
  velocity: number;
}

export interface CompPattern {
  id: string;
  beats: number;
  hits: CompHit[];
}

export type BassStyle =
  | 'walking' // generated line, one note per beat
  | 'twoFeel' // root and fifth on 1 and 3
  | 'rootFive' // country and rock
  | 'bossa' // two-bar ostinato
  | 'samba' // surdo feel: the weight lands on beat 2
  | 'tumbao' // Cuban: anticipates the bar, lands on the "and" of 2
  | 'reggae' // sparse and low, leaving beat 1 open
  | 'funk' // syncopated root with octave pops
  | 'boogie' // shuffle eighths walking up the chord
  | 'pedal'; // hold the root

export interface PartSpec {
  id: string;
  instrument: string;
  gain: number;
}

export interface DrumPart extends PartSpec {
  kind: 'drums';
  patterns: string[];
  fills: string[];
  /** Play a fill every N bars. 0 disables. */
  fillEvery: number;
  fillOnSectionChange: boolean;
}

export interface BassPart extends PartSpec {
  kind: 'bass';
  style: BassStyle;
  /** Register, as MIDI numbers. */
  low: number;
  high: number;
  /** 0–1: how often the beat before a chord change is an approach note. */
  approach: number;
  /** Largest interval the line will leap, in semitones. */
  leapLimit: number;
}

export interface CompPart extends PartSpec {
  kind: 'comp';
  voicing: VoicingStyle;
  low: number;
  high: number;
  patterns: string[];
  /** 0–1: how busy the comping is. */
  density: number;
  /** 0–1: chance of pushing a chord an eighth ahead of the barline. */
  anticipate: number;
}

export type Part = DrumPart | BassPart | CompPart;

export interface GroovePack {
  id: string;
  name: string;
  family: 'jazz' | 'latin' | 'pop';
  /** Meters this groove suits; the first is its home meter. */
  meters: string[];
  tempoRange: [number, number];
  /**
   * Where the offbeat eighth sits. 0.5 is straight, 0.667 is a triplet feel.
   * Swing is a continuum and the useful jazz range is roughly 0.55–0.66.
   */
  swing: number;
  /** Timing and velocity jitter, as fractions of a beat and of full velocity. */
  humanize: { time: number; velocity: number };
  parts: Part[];
}

export interface RenderOptions {
  /** Overrides the chart's tempo. */
  bpm?: number;
  /** Bars of count-in before the form. */
  countInBars?: number;
  /** Extra BPM added at the start of each chorus. */
  tempoRampPerChorus?: number;
  /**
   * Semitones to move the whole band each chorus. The standard way to learn a
   * tune in all twelve keys: 1 walks up chromatically, 5 goes round the cycle
   * of fourths. The chart on screen does not move — that is the exercise.
   */
  keyCyclePerChorus?: number;
  /** Seed for humanisation, so a render is reproducible. */
  seed?: number;
  /** Add 9ths and 13ths to plain chords. */
  embellish?: boolean;
  /** Parts to silence, by id. */
  mute?: string[];
  /** If set, only these parts play. */
  solo?: string[];
}
