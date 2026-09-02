/**
 * A small seeded generator.
 *
 * Humanisation has to be random enough to sound alive and reproducible enough
 * to test. Seeding on the song and groove means the same chart always renders
 * to the same event list, so an audio regression is a readable diff rather than
 * a waveform comparison.
 */
export class Random {
  private state: number;

  constructor(seed = 1) {
    // Any non-zero state will do; mix the seed so nearby seeds diverge.
    this.state = (seed * 2654435761) >>> 0 || 1;
  }

  /** Uniform in [0, 1). */
  next(): number {
    // xorshift32 — fast, adequate for jitter, and dependency-free.
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 0x100000000;
  }

  /** Uniform in [-amount, amount]. */
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount;
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick from `items`, avoiding `avoid` unless it is the only option. */
  pickAvoiding<T>(items: readonly T[], avoid: T | undefined): T | undefined {
    if (items.length === 0) return undefined;
    if (items.length === 1 || avoid === undefined) return this.pick(items);
    const others = items.filter((i) => i !== avoid);
    return this.pick(others.length > 0 ? others : items);
  }
}

/** Turn a string into a stable seed, so a song title alone can seed a render. */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
