import type { SongModel, TimemapEntry, UnrolledBar } from '@ifakepro/song-model';
import { buildTimemap, unroll } from '@ifakepro/song-model';
import { generateBass, rootOf } from './bass.js';
import type { BarChord } from '@ifakepro/song-model';
import { Random, seedFrom } from './random.js';
import { COMP_PATTERNS, DRUM_PATTERNS, SECTION_ACCENT, fitPattern } from './patterns.js';
import type {
  BassPart,
  CompPart,
  DrumPart,
  DrumVoice,
  GroovePack,
  NoteEvent,
  RenderOptions,
} from './types.js';
import { voice } from './voicing.js';

/**
 * Bars plus a groove become a timed event list.
 *
 * Positions are worked out in beats inside each bar — that is where swing and
 * anticipation make sense — then converted to milliseconds using the bar's own
 * entry in the timemap. Doing it that way means a tempo ramp, an odd meter or a
 * count-in all fall out for free instead of needing special cases.
 */

export interface RenderResult {
  events: NoteEvent[];
  bars: UnrolledBar[];
  timemap: TimemapEntry[];
  pack: GroovePack;
  durationMs: number;
}

/**
 * Move an offbeat eighth later, by the groove's swing ratio.
 * 0.5 leaves it where it was; 0.667 makes it the last of a triplet.
 */
function swung(beat: number, swing: number): number {
  const whole = Math.floor(beat);
  const fraction = beat - whole;
  if (Math.abs(fraction - 0.5) < 0.001) return whole + swing;
  return beat;
}

/** Convert a beat position inside a bar to absolute milliseconds. */
function msAt(entry: TimemapEntry, beat: number, barBeats: number): number {
  return entry.startMs + (beat / barBeats) * entry.durationMs;
}

function drumMidi(voiceName: DrumVoice): number {
  // General MIDI percussion, so the same events drive a soundfont or Web MIDI.
  const map: Record<DrumVoice, number> = {
    kick: 36,
    snare: 38,
    rim: 37,
    hatClosed: 42,
    hatOpen: 46,
    hatPedal: 44,
    ride: 51,
    rideBell: 53,
    crash: 49,
    tomLow: 45,
    tomMid: 47,
    tomHigh: 50,
  };
  return map[voiceName];
}

export function renderGroove(
  model: SongModel,
  pack: GroovePack,
  options: RenderOptions = {},
): RenderResult {
  const { bars } = unroll(model);
  const bpm = options.bpm ?? model.meta.bpm ?? 0;
  const timemap = buildTimemap(bars, {
    bpm: bpm > 0 ? bpm : 140,
    countInBars: options.countInBars ?? 0,
    tempoRampPerChorus: options.tempoRampPerChorus ?? 0,
  });

  const random = new Random(options.seed ?? seedFrom(`${model.meta.title}:${pack.id}`));
  const events: NoteEvent[] = [];

  const audible = (id: string) =>
    options.solo && options.solo.length > 0
      ? options.solo.includes(id)
      : !(options.mute ?? []).includes(id);

  const drumParts = pack.parts.filter((p): p is DrumPart => p.kind === 'drums' && audible(p.id));
  const bassParts = pack.parts.filter((p): p is BassPart => p.kind === 'bass' && audible(p.id));
  const compParts = pack.parts.filter((p): p is CompPart => p.kind === 'comp' && audible(p.id));

  // Carried across bars so lines connect rather than restarting each measure.
  let lastBassNote: number | null = null;
  const lastVoicing = new Map<string, number[]>();
  const lastPattern = new Map<string, string>();

  const keyCycle = options.keyCyclePerChorus ?? 0;

  bars.forEach((unrolledBar, index) => {
    const bar = unrolledBar.bar;
    const entry = timemap[index]!;
    const barBeats = bar.time.beats;
    const nextBar = bars[index + 1]?.bar;

    // Key cycling moves the band, not the page. Applied here rather than by
    // transposing the model so the reader keeps the written chart in front of
    // them while the band plays it somewhere else.
    const shift = keyCycle === 0 ? 0 : (((unrolledBar.chorus * keyCycle) % 12) + 12) % 12;
    const shifted = (pc: number | null) => (pc === null ? null : (pc + shift) % 12);

    const emit = (event: Omit<NoteEvent, 'bar'>) => {
      events.push({ ...event, bar: index });
    };

    // --- drums -----------------------------------------------------------
    for (const part of drumParts) {
      const isSectionStart = bar.section !== null && index > 0;
      const wantsFill =
        (part.fillEvery > 0 && (index + 1) % part.fillEvery === 0 && index > 0) ||
        (part.fillOnSectionChange && nextBar?.section != null && nextBar.section !== bar.section);

      const patternId = wantsFill
        ? (random.pick(part.fills) ?? part.patterns[0]!)
        : (random.pickAvoiding(part.patterns, lastPattern.get(part.id)) ?? part.patterns[0]!);
      lastPattern.set(part.id, patternId);

      const pattern = DRUM_PATTERNS[patternId];
      if (!pattern) continue;

      const hits = fitPattern(pattern.hits, barBeats);
      if (isSectionStart) hits.push(...SECTION_ACCENT.hits);

      for (const hit of hits) {
        if (hit.probability !== undefined && !random.chance(hit.probability)) continue;
        const beat = swung(hit.beat, pack.swing) + random.jitter(pack.humanize.time);
        emit({
          part: part.id,
          instrument: part.instrument,
          midi: drumMidi(hit.voice),
          drum: hit.voice,
          startMs: msAt(entry, Math.max(0, beat), barBeats),
          durationMs: Math.min(120, entry.durationMs / barBeats),
          velocity: clamp(hit.velocity * part.gain + random.jitter(pack.humanize.velocity)),
        });
      }
    }

    // --- bass ------------------------------------------------------------
    for (const part of bassParts) {
      const nextChord = nextBar?.chords[0];
      const notes = generateBass({
        chords: shift === 0 ? bar.chords : bar.chords.map((c) => transposeChord(c, shift)),
        beats: barBeats,
        nextRoot: nextChord ? shifted(rootOf(nextChord)) : null,
        nextQuality: nextChord?.quality ?? null,
        previous: lastBassNote,
        part,
        random,
      });

      for (const note of notes) {
        const beat = swung(note.beat, pack.swing) + random.jitter(pack.humanize.time);
        emit({
          part: part.id,
          instrument: part.instrument,
          midi: note.midi,
          startMs: msAt(entry, Math.max(0, beat), barBeats),
          durationMs: (note.durationBeats / barBeats) * entry.durationMs,
          velocity: clamp(note.velocity * part.gain + random.jitter(pack.humanize.velocity)),
        });
      }
      if (notes.length > 0) lastBassNote = notes[notes.length - 1]!.midi;
    }

    // --- comping ---------------------------------------------------------
    for (const part of compParts) {
      const patternId =
        random.pickAvoiding(part.patterns, lastPattern.get(part.id)) ?? part.patterns[0]!;
      lastPattern.set(part.id, patternId);
      const pattern = COMP_PATTERNS[patternId];
      if (!pattern) continue;

      // Where each chord starts, so a stab lands on whatever is sounding.
      const starts: number[] = [];
      let cursor = 0;
      for (const chord of bar.chords) {
        starts.push(cursor);
        cursor += chord.beats;
      }

      for (const hit of fitPattern(pattern.hits, barBeats)) {
        if (!random.chance(part.density)) continue;

        let chordIndex = 0;
        for (let c = 0; c < bar.chords.length; c++) if (starts[c]! <= hit.beat) chordIndex = c;
        const chord = bar.chords[chordIndex]!;
        const written = chord.root ? rootOf({ ...chord, bass: null }) : null;
        const root = shifted(written);
        if (root === null || chord.kind === 'nc') continue;

        const notes = voice({
          root,
          quality: chord.quality,
          style: part.voicing,
          low: part.low,
          high: part.high,
          previous: lastVoicing.get(part.id),
          embellish: options.embellish ?? false,
        });
        lastVoicing.set(part.id, notes);

        // Pushing a chord an eighth early is the single most characteristic
        // thing a comping player does; without it the part sits on the grid.
        const anticipated = hit.beat === 0 && random.chance(part.anticipate);
        const beat = anticipated
          ? -0.5
          : swung(hit.beat, pack.swing) + random.jitter(pack.humanize.time);

        const startMs = anticipated
          ? msAt(entry, 0, barBeats) - (0.5 / barBeats) * entry.durationMs
          : msAt(entry, Math.max(0, beat), barBeats);

        for (const midi of notes) {
          emit({
            part: part.id,
            instrument: part.instrument,
            midi,
            startMs: Math.max(0, startMs),
            durationMs: (hit.durationBeats / barBeats) * entry.durationMs,
            velocity: clamp(hit.velocity * part.gain + random.jitter(pack.humanize.velocity)),
          });
        }
      }
    }
  });

  events.sort((a, b) => a.startMs - b.startMs || a.part.localeCompare(b.part) || a.midi - b.midi);

  const last = events.reduce((end, e) => Math.max(end, e.startMs + e.durationMs), 0);
  const timemapEnd = timemap.length
    ? timemap[timemap.length - 1]!.startMs + timemap[timemap.length - 1]!.durationMs
    : 0;

  return { events, bars, timemap, pack, durationMs: Math.max(last, timemapEnd) };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0.05, value));
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Move a chord for key cycling.
 *
 * Spelling does not matter here — nothing reads these names, the bass
 * generator turns them straight back into pitch classes — so sharps throughout
 * is the simplest correct choice.
 */
function transposeChord(chord: BarChord, semitones: number): BarChord {
  const move = (name: string | null): string | null => {
    if (name === null) return null;
    const pc = rootOf({ root: name, bass: null } as BarChord);
    if (pc === null) return name;
    return SHARP_NAMES[(pc + semitones) % 12]!;
  };
  return { ...chord, root: move(chord.root), bass: move(chord.bass) };
}

/** A metronome click track, for the count-in and for practice. */
export function renderClick(
  timemap: readonly TimemapEntry[],
  bars: readonly UnrolledBar[],
  options: { countInBars?: number; barBeats?: number; bpm?: number } = {},
): NoteEvent[] {
  const countIn = options.countInBars ?? 0;
  if (countIn === 0 || bars.length === 0) return [];

  const first = timemap[0];
  if (!first) return [];
  const beats = bars[0]!.bar.time.beats;
  const beatMs = first.durationMs / beats;

  const events: NoteEvent[] = [];
  for (let bar = 0; bar < countIn; bar++) {
    for (let beat = 0; beat < beats; beat++) {
      const index = bar * beats + beat;
      events.push({
        part: 'click',
        instrument: 'click',
        midi: beat === 0 ? 84 : 77,
        drum: beat === 0 ? 'rim' : 'hatClosed',
        startMs: index * beatMs,
        durationMs: 60,
        velocity: beat === 0 ? 0.8 : 0.55,
        bar: -1,
      });
    }
  }
  return events;
}
