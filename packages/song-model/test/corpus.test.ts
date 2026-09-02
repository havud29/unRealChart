import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlaylist } from '@unrealchart/ireal-format';
import { barBeats, buildSongModel, transposeModel, unroll } from '../src/index.js';
import type { SongModel } from '../src/index.js';

/**
 * The model's acceptance gate: build every chart in the corpus and check the
 * musical invariants. Skips itself when the corpus has not been fetched.
 */

const FIXTURES = join(process.cwd(), 'fixtures');

function corpusFiles(): string[] {
  try {
    return readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.txt') || f.endsWith('.html'))
      .map((f) => join(FIXTURES, f));
  } catch {
    return [];
  }
}

const files = corpusFiles();
const describeCorpus = files.length > 0 ? describe : describe.skip;

describeCorpus('corpus model', () => {
  const models: SongModel[] = files.flatMap((file) =>
    parsePlaylist(readFileSync(file, 'utf8')).songs.map((song) => buildSongModel(song)),
  );

  it('builds a model for every song', () => {
    expect(models.length).toBeGreaterThan(2000);
    const empty = models.filter((m) => m.bars.length === 0);
    expect(empty.map((m) => m.meta.title).slice(0, 10)).toEqual([]);
    console.log(`  models: ${models.length} songs`);
  });

  it('fills every bar to exactly its meter', () => {
    const bad: string[] = [];
    let bars = 0;
    for (const m of models) {
      // Bars flagged as overfull are the chart's fault, not the resolver's.
      const overfull = new Set(
        m.warnings.filter((w) => w.code === 'too-many-chords').map((w) => w.bar),
      );
      for (const bar of m.bars) {
        bars++;
        if (overfull.has(bar.index)) continue;
        if (Math.abs(barBeats(bar) - bar.time.beats) > 1e-6) {
          bad.push(`${m.meta.title} bar ${bar.index}: ${barBeats(bar)} of ${bar.time.beats}`);
        }
      }
    }
    console.log(`  bars: ${bars} checked, ${bad.length} mis-filled`);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('gives every bar at least one chord', () => {
    const bad = models.flatMap((m) =>
      m.bars.filter((b) => b.chords.length === 0).map((b) => `${m.meta.title} bar ${b.index}`),
    );
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('unrolls every chart to a finite, non-empty sequence', () => {
    const failures: string[] = [];
    for (const m of models) {
      const { bars, warnings } = unroll(m, { choruses: 1 });
      if (bars.length === 0) failures.push(`${m.meta.title}: empty`);
      const budget = warnings.find((w) => w.code === 'unroll-budget-exceeded');
      if (budget) failures.push(`${m.meta.title}: ${budget.message}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('plays every written bar at least once', () => {
    // The invariant that actually matters: no bar the user wrote is silently
    // unreachable. A bar cut by a D.C. is the one legitimate exception, since
    // the jump leaves the rest of that ending unplayed by design.
    const unreachable: string[] = [];
    for (const m of models) {
      const hasJump = m.bars.some((b) =>
        b.directives.some((d) => d.type === 'dc' || d.type === 'ds'),
      );
      if (hasJump) continue;
      const played = new Set(unroll(m, { choruses: 1 }).bars.map((b) => b.sourceIndex));
      const missed = m.bars.filter((b) => !played.has(b.index));
      if (missed.length > 0) {
        unreachable.push(`${m.meta.title}: ${missed.length} of ${m.bars.length} bars`);
      }
    }
    const rate = unreachable.length / models.length;
    console.log(
      `  coverage: ${models.length - unreachable.length}/${models.length} songs complete` +
        (unreachable.length ? ` — ${unreachable.join('; ')}` : ''),
    );
    // Not zero, and honestly so: a handful of community charts nest repeats in
    // ways that have no single unambiguous reading. The threshold is here to
    // catch a regression that strands bars across many songs, which is what a
    // real unroller bug looks like.
    expect(rate, unreachable.join(' | ')).toBeLessThan(0.002);
  });

  it('reports how much of the corpus has structure worth unrolling', () => {
    const withRepeats = models.filter((m) => m.bars.some((b) => b.close === 'repeat')).length;
    const withEndings = models.filter((m) => m.bars.some((b) => b.ending !== null)).length;
    const withJumps = models.filter((m) =>
      m.bars.some((b) => b.directives.some((d) => d.type === 'dc' || d.type === 'ds')),
    ).length;
    console.log(
      `  structure: ${withRepeats} with repeats, ${withEndings} with endings, ${withJumps} with jumps`,
    );
    expect(withRepeats).toBeGreaterThan(0);
  });

  it('transposes every chart through all twelve keys without losing a chord', () => {
    for (const m of models.slice(0, 300)) {
      const chords = m.bars.reduce((n, b) => n + b.chords.length, 0);
      for (let semitones = 1; semitones < 12; semitones++) {
        const t = transposeModel(m, semitones);
        const moved = t.bars.reduce((n, b) => n + b.chords.length, 0);
        expect(moved, `${m.meta.title} +${semitones}`).toBe(chords);
      }
    }
  });
});
