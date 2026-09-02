import type { DrumVoice, NoteEvent } from '@ifakepro/groove-engine';

/**
 * The built-in instrument set.
 *
 * Synthesised rather than sampled, on purpose: it ships with zero assets, works
 * offline from the first load, and is good enough to judge whether a groove
 * *plays* well — which is the question this milestone has to answer. Sample
 * quality is a separate problem, and `InstrumentProvider` is the seam where a
 * SoundFont or sample-pack backend drops in without the engine noticing.
 */

export interface InstrumentProvider {
  /** Load whatever the given instruments need. Called before playback. */
  prepare(instruments: readonly string[]): Promise<void>;
  /** Schedule one event to sound at `when` (AudioContext seconds). */
  play(event: NoteEvent, when: number, destination: AudioNode): void;
  /** Release anything still ringing. */
  allOff?(): void;
}

const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface ToneSpec {
  /** Partials as [harmonic, gain] pairs. */
  partials: Array<[number, number]>;
  type: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Lowpass cutoff in Hz, scaled by pitch. */
  cutoff: number;
  /** Downward pitch bend at the attack, in semitones. */
  bend?: number;
  gain: number;
}

const TONES: Readonly<Record<string, ToneSpec>> = {
  'upright-bass': {
    // A round, woody tone: mostly fundamental, a touch of second harmonic, and
    // a quick downward bend that reads as a finger pulling the string.
    partials: [
      [1, 1],
      [2, 0.28],
      [3, 0.08],
    ],
    type: 'triangle',
    attack: 0.008,
    decay: 0.28,
    sustain: 0.32,
    release: 0.12,
    cutoff: 2.6,
    bend: 0.35,
    gain: 0.9,
  },
  'electric-bass': {
    partials: [
      [1, 1],
      [2, 0.4],
      [3, 0.16],
      [4, 0.06],
    ],
    type: 'sawtooth',
    attack: 0.005,
    decay: 0.22,
    sustain: 0.4,
    release: 0.1,
    cutoff: 3.2,
    gain: 0.8,
  },
  'acoustic-piano': {
    partials: [
      [1, 1],
      [2, 0.42],
      [3, 0.18],
      [4, 0.1],
      [6, 0.04],
    ],
    type: 'triangle',
    attack: 0.004,
    decay: 0.9,
    sustain: 0.16,
    release: 0.3,
    cutoff: 5,
    gain: 0.42,
  },
  'electric-piano': {
    partials: [
      [1, 1],
      [2, 0.2],
      [4, 0.12],
      [7, 0.05],
    ],
    type: 'sine',
    attack: 0.006,
    decay: 1.1,
    sustain: 0.22,
    release: 0.35,
    cutoff: 4,
    gain: 0.5,
  },
  'nylon-guitar': {
    partials: [
      [1, 1],
      [2, 0.3],
      [3, 0.16],
      [5, 0.06],
    ],
    type: 'triangle',
    attack: 0.003,
    decay: 0.5,
    sustain: 0.1,
    release: 0.25,
    cutoff: 4.5,
    gain: 0.5,
  },
  click: {
    partials: [[1, 1]],
    type: 'square',
    attack: 0.001,
    decay: 0.04,
    sustain: 0,
    release: 0.02,
    cutoff: 8,
    gain: 0.35,
  },
};

const DEFAULT_TONE = TONES['acoustic-piano']!;

/** Drum voices, each a small piece of synthesis rather than a sample. */
interface DrumSpec {
  kind: 'noise' | 'tone';
  /** Noise: filter type and frequency. Tone: starting pitch. */
  frequency: number;
  endFrequency?: number;
  filter?: BiquadFilterType;
  q?: number;
  decay: number;
  gain: number;
  /** Blend a noise layer into a tonal drum. */
  noiseMix?: number;
}

const DRUMS: Readonly<Record<DrumVoice, DrumSpec>> = {
  kick: { kind: 'tone', frequency: 130, endFrequency: 45, decay: 0.32, gain: 1.1, noiseMix: 0.06 },
  snare: { kind: 'noise', frequency: 1900, filter: 'bandpass', q: 0.7, decay: 0.19, gain: 0.7, noiseMix: 1 },
  rim: { kind: 'noise', frequency: 2600, filter: 'bandpass', q: 3, decay: 0.05, gain: 0.5 },
  hatClosed: { kind: 'noise', frequency: 8500, filter: 'highpass', q: 1, decay: 0.045, gain: 0.32 },
  hatOpen: { kind: 'noise', frequency: 8000, filter: 'highpass', q: 1, decay: 0.32, gain: 0.3 },
  hatPedal: { kind: 'noise', frequency: 6500, filter: 'highpass', q: 1, decay: 0.07, gain: 0.28 },
  ride: { kind: 'noise', frequency: 6200, filter: 'highpass', q: 0.8, decay: 0.55, gain: 0.24 },
  rideBell: { kind: 'noise', frequency: 4200, filter: 'bandpass', q: 2.5, decay: 0.5, gain: 0.3 },
  crash: { kind: 'noise', frequency: 5200, filter: 'highpass', q: 0.6, decay: 1.4, gain: 0.32 },
  tomLow: { kind: 'tone', frequency: 150, endFrequency: 95, decay: 0.35, gain: 0.75, noiseMix: 0.12 },
  tomMid: { kind: 'tone', frequency: 210, endFrequency: 130, decay: 0.3, gain: 0.72, noiseMix: 0.12 },
  tomHigh: { kind: 'tone', frequency: 280, endFrequency: 180, decay: 0.26, gain: 0.7, noiseMix: 0.12 },
};

/** A shared noise buffer, since every drum hit wants one. */
function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const seconds = 2;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  // A fixed pseudo-random sequence, so an offline render is reproducible.
  let state = 22222;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (state / 0x40000000) - 1;
  }
  return buffer;
}

export class BuiltInInstruments implements InstrumentProvider {
  private noise: AudioBuffer | null = null;
  private readonly active = new Set<{ stop: (at: number) => void }>();

  constructor(private readonly context: BaseAudioContext) {}

  async prepare(): Promise<void> {
    // Nothing to fetch — that is the point of the built-in set.
    this.noise ??= noiseBuffer(this.context);
  }

  play(event: NoteEvent, when: number, destination: AudioNode): void {
    if (event.drum) this.playDrum(event, when, destination);
    else this.playTone(event, when, destination);
  }

  allOff(): void {
    const now = this.context.currentTime;
    for (const node of this.active) node.stop(now);
    this.active.clear();
  }

  private playTone(event: NoteEvent, when: number, destination: AudioNode): void {
    const spec = TONES[event.instrument] ?? DEFAULT_TONE;
    const context = this.context;
    const frequency = midiToHz(event.midi);
    const seconds = Math.max(0.05, event.durationMs / 1000);

    const amp = context.createGain();
    amp.gain.value = 0;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(18000, frequency * spec.cutoff + 220);
    filter.Q.value = 0.6;
    filter.connect(amp);
    amp.connect(destination);

    const oscillators: OscillatorNode[] = [];
    for (const [harmonic, level] of spec.partials) {
      const osc = context.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = frequency * harmonic;
      if (spec.bend) {
        // Start slightly sharp and settle, which reads as a plucked attack.
        osc.frequency.setValueAtTime(frequency * harmonic * Math.pow(2, spec.bend / 12), when);
        osc.frequency.exponentialRampToValueAtTime(frequency * harmonic, when + 0.06);
      }
      const partialGain = context.createGain();
      partialGain.gain.value = level;
      osc.connect(partialGain);
      partialGain.connect(filter);
      oscillators.push(osc);
    }

    // A plain ADSR. Exponential ramps because loudness is perceived that way.
    const peak = Math.max(0.001, event.velocity * spec.gain);
    const sustain = Math.max(0.0001, peak * spec.sustain);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + spec.attack);
    amp.gain.exponentialRampToValueAtTime(sustain, when + spec.attack + spec.decay);
    const releaseAt = when + Math.max(spec.attack + 0.02, seconds);
    amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), releaseAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, releaseAt + spec.release);

    const stopAt = releaseAt + spec.release + 0.02;
    for (const osc of oscillators) {
      osc.start(when);
      osc.stop(stopAt);
    }

    const handle = {
      stop: (at: number) => {
        try {
          amp.gain.cancelScheduledValues(at);
          amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), at);
          amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
          for (const osc of oscillators) osc.stop(at + 0.06);
        } catch {
          // Already stopped; nothing to do.
        }
      },
    };
    this.active.add(handle);
    if (oscillators[0]) {
      oscillators[0].onended = () => this.active.delete(handle);
    }
  }

  private playDrum(event: NoteEvent, when: number, destination: AudioNode): void {
    const spec = DRUMS[event.drum!];
    if (!spec) return;
    const context = this.context;
    this.noise ??= noiseBuffer(context);

    const amp = context.createGain();
    amp.connect(destination);
    const peak = Math.max(0.001, event.velocity * spec.gain);
    amp.gain.setValueAtTime(peak, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + spec.decay);

    const stopAt = when + spec.decay + 0.02;

    if (spec.kind === 'tone') {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(spec.frequency, when);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, spec.endFrequency ?? spec.frequency),
        when + spec.decay * 0.7,
      );
      osc.connect(amp);
      osc.start(when);
      osc.stop(stopAt);
    }

    if (spec.kind === 'noise' || spec.noiseMix) {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      // Start at a varying offset so repeated hits do not phase against
      // each other and sound like a loop.
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = spec.filter ?? 'bandpass';
      filter.frequency.value = spec.frequency;
      filter.Q.value = spec.q ?? 1;
      const noiseGain = context.createGain();
      noiseGain.gain.value = spec.kind === 'noise' ? 1 : (spec.noiseMix ?? 0.1);
      source.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(amp);
      source.start(when, (when * 7.31) % 1.5);
      source.stop(stopAt);
    }
  }
}

export const BUILT_IN_INSTRUMENTS = Object.keys(TONES);
