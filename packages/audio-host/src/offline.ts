import type { NoteEvent } from '@unrealchart/groove-engine';
import { Mixer } from './mixer.js';
import { BuiltInInstruments } from './synth.js';
import type { InstrumentProvider } from './synth.js';

/**
 * Render events to an audio buffer, faster than real time.
 *
 * Two uses: bouncing a backing track to a file, and testing. The second is why
 * it exists now — it is the only way to assert that a groove actually makes
 * sound, that no part is silent, and that nothing clips, without a person
 * listening.
 */
export interface OfflineRenderOptions {
  durationMs: number;
  sampleRate?: number;
  channels?: number;
  instruments?: (context: BaseAudioContext) => InstrumentProvider;
}

export async function renderToBuffer(
  events: readonly NoteEvent[],
  options: OfflineRenderOptions,
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const seconds = Math.max(0.1, options.durationMs / 1000 + 1.5); // room for the tail
  const context = new OfflineAudioContext(options.channels ?? 2, Math.ceil(seconds * sampleRate), sampleRate);

  const instruments = options.instruments ? options.instruments(context) : new BuiltInInstruments(context);
  await instruments.prepare([]);
  const mixer = new Mixer(context, context.destination);

  for (const event of events) {
    instruments.play(event, event.startMs / 1000, mixer.channel(event.part));
  }

  return context.startRendering();
}
