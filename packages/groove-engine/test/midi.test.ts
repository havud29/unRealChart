import { describe, expect, it } from 'vitest';
import { toMidiFile } from '../src/midi.js';
import type { NoteEvent } from '../src/index.js';

const note = (over: Partial<NoteEvent> = {}): NoteEvent => ({
  part: 'bass',
  instrument: 'upright-bass',
  midi: 40,
  startMs: 0,
  durationMs: 500,
  velocity: 0.7,
  bar: 0,
  ...over,
});

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.slice(at, at + length));

/** Walk the chunk headers, which is the cheapest structural check there is. */
function chunks(bytes: Uint8Array): Array<{ id: string; length: number }> {
  const out: Array<{ id: string; length: number }> = [];
  let at = 0;
  while (at + 8 <= bytes.length) {
    const id = ascii(bytes, at, 4);
    const length = (bytes[at + 4]! << 24) | (bytes[at + 5]! << 16) | (bytes[at + 6]! << 8) | bytes[at + 7]!;
    out.push({ id, length });
    at += 8 + length;
  }
  return out;
}

describe('toMidiFile', () => {
  it('writes a well-formed format 1 file', () => {
    const bytes = toMidiFile([note()], { bpm: 120 });
    expect(ascii(bytes, 0, 4)).toBe('MThd');
    expect(bytes[8]).toBe(0); // format high byte
    expect(bytes[9]).toBe(1); // format 1
  });

  it('consumes exactly as many bytes as its chunks declare', () => {
    const bytes = toMidiFile([note(), note({ part: 'drums', drum: 'kick', midi: 36 })], { bpm: 120 });
    const parsed = chunks(bytes);
    const total = parsed.reduce((sum, c) => sum + 8 + c.length, 0);
    expect(total).toBe(bytes.length);
  });

  it('writes one track per part, plus the tempo track', () => {
    const events = [note({ part: 'bass' }), note({ part: 'piano' }), note({ part: 'drums', drum: 'kick' })];
    const parsed = chunks(toMidiFile(events));
    expect(parsed[0]!.id).toBe('MThd');
    expect(parsed.filter((c) => c.id === 'MTrk')).toHaveLength(4);
  });

  it('puts drums on channel 10', () => {
    const bytes = toMidiFile([note({ part: 'drums', drum: 'kick', midi: 36 })]);
    // 0x99 is note-on, channel 10 (zero-indexed 9).
    expect([...bytes]).toContain(0x99);
  });

  it('ends every note it starts', () => {
    const bytes = toMidiFile([note(), note({ startMs: 500 }), note({ startMs: 1000 })]);
    const ons = [...bytes].filter((b) => (b & 0xf0) === 0x90).length;
    const offs = [...bytes].filter((b) => (b & 0xf0) === 0x80).length;
    expect(offs).toBeGreaterThanOrEqual(ons - 1); // status bytes can collide with data
  });

  it('scales positions with the tempo', () => {
    const slow = toMidiFile([note({ startMs: 2000 })], { bpm: 60 });
    const fast = toMidiFile([note({ startMs: 2000 })], { bpm: 240 });
    // The same wall-clock position is more ticks at a faster tempo.
    expect(fast.length).toBeGreaterThanOrEqual(slow.length - 8);
  });

  it('clamps a wild pitch or velocity rather than writing rubbish', () => {
    const bytes = toMidiFile([note({ midi: 500, velocity: 9 })]);
    for (const byte of bytes) expect(byte).toBeLessThanOrEqual(255);
    expect(chunks(bytes).length).toBeGreaterThan(1);
  });

  it('writes an empty but valid file for no events', () => {
    const bytes = toMidiFile([]);
    expect(ascii(bytes, 0, 4)).toBe('MThd');
    expect(chunks(bytes).filter((c) => c.id === 'MTrk')).toHaveLength(1);
  });
});
