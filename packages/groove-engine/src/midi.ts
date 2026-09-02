import type { NoteEvent } from './types.js';

/**
 * Write the generated events as a Standard MIDI File.
 *
 * Nearly free once the engine's output is a note list, and it is the export
 * users ask for most: a backing track they can drop into a DAW, slow down,
 * re-voice, or play through better sounds than ours.
 *
 * Format 1, one track per part, so the parts stay separable.
 */

const TICKS_PER_QUARTER = 480;

/** General MIDI programs for the instruments the grooves name. */
const PROGRAMS: Readonly<Record<string, number>> = {
  'acoustic-piano': 0,
  'electric-piano': 4,
  'nylon-guitar': 24,
  'upright-bass': 32,
  'electric-bass': 33,
  click: 115,
};

const DRUM_CHANNEL = 9;

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function writeUint32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function writeUint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function chunk(id: string, body: number[]): number[] {
  return [...[...id].map((c) => c.charCodeAt(0)), ...writeUint32(body.length), ...body];
}

interface TimedMessage {
  tick: number;
  /** Note-offs sort before note-ons at the same tick, so repeats re-articulate. */
  order: number;
  bytes: number[];
}

/**
 * Serialize events to a MIDI file.
 *
 * Timing is written at a fixed tempo with the events' millisecond positions
 * converted to ticks, rather than as a tempo map. That keeps a tempo ramp or a
 * fermata sounding exactly as rendered instead of relying on the receiving
 * program to interpret it the same way.
 */
export function toMidiFile(events: readonly NoteEvent[], options: { bpm?: number } = {}): Uint8Array {
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : 120;
  const msPerTick = 60_000 / bpm / TICKS_PER_QUARTER;
  const toTicks = (ms: number) => Math.max(0, Math.round(ms / msPerTick));

  const parts = [...new Set(events.map((e) => e.part))];
  const tracks: number[][] = [];

  // Track 0 carries the tempo, which is what a DAW reads to set its grid.
  const microsecondsPerQuarter = Math.round(60_000_000 / bpm);
  const tempoTrack: number[] = [
    ...variableLength(0),
    0xff,
    0x51,
    0x03,
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
    ...variableLength(0),
    0xff,
    0x2f,
    0x00,
  ];
  tracks.push(tempoTrack);

  parts.forEach((part, index) => {
    const partEvents = events.filter((e) => e.part === part);
    const isDrums = partEvents.some((e) => e.drum);
    const channel = isDrums ? DRUM_CHANNEL : index % 16 === DRUM_CHANNEL ? 15 : index % 16;

    const messages: TimedMessage[] = [];

    // Name the track and pick a sound, so the file opens usefully.
    const name = [...part].map((c) => c.charCodeAt(0));
    messages.push({ tick: 0, order: 0, bytes: [0xff, 0x03, name.length, ...name] });
    if (!isDrums) {
      const program = PROGRAMS[partEvents[0]?.instrument ?? ''] ?? 0;
      messages.push({ tick: 0, order: 0, bytes: [0xc0 | channel, program] });
    }

    for (const event of partEvents) {
      const start = toTicks(event.startMs);
      const end = Math.max(start + 1, toTicks(event.startMs + event.durationMs));
      const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * 127)));
      const note = Math.max(0, Math.min(127, Math.round(event.midi)));
      messages.push({ tick: start, order: 1, bytes: [0x90 | channel, note, velocity] });
      messages.push({ tick: end, order: 0, bytes: [0x80 | channel, note, 0] });
    }

    messages.sort((a, b) => a.tick - b.tick || a.order - b.order);

    const track: number[] = [];
    let previousTick = 0;
    for (const message of messages) {
      track.push(...variableLength(message.tick - previousTick), ...message.bytes);
      previousTick = message.tick;
    }
    track.push(...variableLength(0), 0xff, 0x2f, 0x00); // end of track
    tracks.push(track);
  });

  const header = chunk('MThd', [
    ...writeUint16(1), // format 1
    ...writeUint16(tracks.length),
    ...writeUint16(TICKS_PER_QUARTER),
  ]);

  const bytes = [...header, ...tracks.flatMap((track) => chunk('MTrk', track))];
  return new Uint8Array(bytes);
}
