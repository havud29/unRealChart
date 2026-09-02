/**
 * Per-part gain, a shared reverb send, and a master limiter.
 *
 * The mixer owns the graph so the transport only has to ask for "the node this
 * part plays into". Mute and solo live here rather than in the renderer,
 * because a musician expects them to take effect on the next beat, not on the
 * next re-render of the whole song.
 */

export interface ChannelState {
  gain: number;
  muted: boolean;
  reverb: number;
}

const DEFAULT_CHANNEL: ChannelState = { gain: 0.8, muted: false, reverb: 0.16 };

/** A short, cheap room. Generated rather than fetched, like the instruments. */
function impulseResponse(context: BaseAudioContext, seconds = 1.6, decay = 3.2): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let state = 987654321;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const noise = (state / 0x40000000) - 1;
      data[i] = noise * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export class Mixer {
  readonly master: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbReturn: GainNode;
  private readonly channels = new Map<string, { input: GainNode; send: GainNode; state: ChannelState }>();
  private soloed = new Set<string>();

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.master = context.createGain();
    this.master.gain.value = 0.85;

    // A soft limiter, so a dense chorus does not clip.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;

    this.reverb = context.createConvolver();
    this.reverb.buffer = impulseResponse(context);
    this.reverbReturn = context.createGain();
    this.reverbReturn.gain.value = 0.9;

    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
    this.master.connect(limiter);
    limiter.connect(destination);
  }

  /** The node a part should play into. Channels are created on demand. */
  channel(part: string): AudioNode {
    return this.ensure(part).input;
  }

  private ensure(part: string) {
    let channel = this.channels.get(part);
    if (!channel) {
      const input = this.context.createGain();
      const send = this.context.createGain();
      input.connect(this.master);
      input.connect(send);
      send.connect(this.reverb);
      channel = { input, send, state: { ...DEFAULT_CHANNEL } };
      this.channels.set(part, channel);
      this.apply(part);
    }
    return channel;
  }

  set(part: string, changes: Partial<ChannelState>): void {
    const channel = this.ensure(part);
    channel.state = { ...channel.state, ...changes };
    this.apply(part);
  }

  get(part: string): ChannelState {
    return { ...this.ensure(part).state };
  }

  /** Solo is a view over the channels, not a state each one owns. */
  solo(parts: readonly string[]): void {
    this.soloed = new Set(parts);
    for (const part of this.channels.keys()) this.apply(part);
  }

  get soloedParts(): string[] {
    return [...this.soloed];
  }

  setMasterGain(gain: number): void {
    this.master.gain.value = Math.max(0, Math.min(1.5, gain));
  }

  private apply(part: string): void {
    const channel = this.channels.get(part);
    if (!channel) return;
    const silencedBySolo = this.soloed.size > 0 && !this.soloed.has(part);
    const audible = !channel.state.muted && !silencedBySolo;
    channel.input.gain.value = audible ? channel.state.gain : 0;
    channel.send.gain.value = audible ? channel.state.reverb : 0;
  }

  get parts(): string[] {
    return [...this.channels.keys()];
  }
}
