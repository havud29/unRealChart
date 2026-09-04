import type { NoteEvent } from '@unrealchart/groove-engine';
import { BuiltInInstruments } from './synth.js';
import type { InstrumentProvider } from './synth.js';

/**
 * Recorded instruments, where they are available.
 *
 * The synthesised set is what the app ships with: a few kilobytes, no network,
 * and it works the moment the page loads. Recorded samples sound better and
 * cost megabytes, so they are an upgrade the app reaches for rather than a
 * dependency it has -- anything missing falls through to the built-in voice,
 * which is why the drums still play when only the piano bank has arrived.
 *
 * Banks hold one sample every few semitones and the rest are pitched from the
 * nearest neighbour. Shifting by a semitone or two is inaudible in this
 * context and saves two thirds of the download; shifting further is not, which
 * is why `NEAREST_LIMIT` gives up and lets the synth take the note instead of
 * playing an obviously wrong one.
 */

interface Bank {
  /** MIDI number to decoded audio. */
  samples: Map<number, AudioBuffer>;
  /** Sorted, for nearest-neighbour lookup. */
  pitches: number[];
}

/** Semitones a sample may be shifted before it stops sounding like itself. */
const NEAREST_LIMIT = 4;

/** Where the banks live, relative to the site root. */
const BANK_PATH = (id: string) => `/sounds/${id}.json`;

function decodeDataUri(uri: string): ArrayBuffer {
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export class SampledInstruments implements InstrumentProvider {
  private readonly banks = new Map<string, Bank>();
  private readonly missing = new Set<string>();
  private readonly fallback: BuiltInInstruments;
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(private readonly context: BaseAudioContext) {
    this.fallback = new BuiltInInstruments(context);
  }

  /** Which instruments are playing from samples. For telling the user. */
  get loaded(): string[] {
    return [...this.banks.keys()];
  }

  async prepare(instruments: readonly string[]): Promise<void> {
    await this.fallback.prepare();

    await Promise.all(
      instruments.map(async (id) => {
        if (this.banks.has(id) || this.missing.has(id)) return;
        try {
          const response = await fetch(BANK_PATH(id));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as { notes: Record<string, string> };

          const samples = new Map<number, AudioBuffer>();
          await Promise.all(
            Object.entries(data.notes).map(async ([midi, uri]) => {
              // decodeAudioData detaches the buffer it is given, so each note
              // decodes from its own copy.
              const buffer = await this.context.decodeAudioData(decodeDataUri(uri));
              samples.set(Number(midi), buffer);
            }),
          );

          if (samples.size === 0) throw new Error('bank held no samples');
          this.banks.set(id, {
            samples,
            pitches: [...samples.keys()].sort((a, b) => a - b),
          });
        } catch {
          // A bank that is not there is the normal case, not an error: the
          // app is meant to run without any of them.
          this.missing.add(id);
        }
      }),
    );
  }

  play(event: NoteEvent, when: number, destination: AudioNode): void {
    const bank = event.drum ? undefined : this.banks.get(event.instrument);
    if (!bank) {
      this.fallback.play(event, when, destination);
      return;
    }

    const nearest = closest(bank.pitches, event.midi);
    if (nearest === null || Math.abs(nearest - event.midi) > NEAREST_LIMIT) {
      this.fallback.play(event, when, destination);
      return;
    }

    const buffer = bank.samples.get(nearest);
    if (!buffer) {
      this.fallback.play(event, when, destination);
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (event.midi - nearest) / 12);

    const amp = this.context.createGain();
    amp.gain.value = event.velocity;

    // Let the note ring past its written length and fade, rather than cutting
    // at the release: a piano string does not stop when the hand leaves it,
    // and a hard stop is the most synthetic thing a sampler can do.
    const seconds = Math.max(0.08, event.durationMs / 1000);
    const end = when + seconds;
    amp.gain.setValueAtTime(event.velocity, Math.max(when, end - 0.12));
    amp.gain.exponentialRampToValueAtTime(0.0001, end + 0.18);

    source.connect(amp).connect(destination);
    source.start(when);
    source.stop(end + 0.2);

    this.active.add(source);
    source.onended = () => this.active.delete(source);
  }

  allOff(): void {
    const now = this.context.currentTime;
    for (const source of this.active) {
      try {
        source.stop(now);
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.active.clear();
    this.fallback.allOff();
  }
}

/** The sampled pitch nearest a wanted one. */
export function closest(pitches: readonly number[], midi: number): number | null {
  if (pitches.length === 0) return null;
  let best = pitches[0]!;
  for (const pitch of pitches) {
    if (Math.abs(pitch - midi) < Math.abs(best - midi)) best = pitch;
  }
  return best;
}
