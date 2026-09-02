import type { Bar, ModelWarning, SongModel, UnrolledBar } from './types.js';

/**
 * Flatten a chart into the order it is actually played.
 *
 * Everything downstream — the player, the timemap, the playhead — reads this,
 * so it never has to know what a repeat sign is. Each entry keeps a
 * `sourceIndex` back-pointer, which is what lets the playhead highlight the
 * right bar on the fourth chorus of a chart with two endings and a D.S.
 *
 * Conventions applied, matching how these charts are actually played:
 *   - A repeat with no endings is played twice; with endings, once per ending.
 *   - After a D.C. or D.S., inner repeats are not taken again.
 *   - `al Coda` plays to the first coda mark, then jumps to the second.
 *   - `al Fine` stops after the bar marked Fine.
 */

export interface UnrollOptions {
  /** How many times to play the form. Defaults to the chart's repeat count. */
  choruses?: number;
  /** Safety budget; a malformed chart must not hang the player. */
  maxBars?: number;
}

interface RepeatFrame {
  start: number;
  pass: number;
  passes: number;
  /** Last bar belonging to this block, trailing endings included. */
  blockEnd: number;
  /** Highest ending number in the block; 0 when it has none. */
  maxEnding: number;
}

export interface UnrollResult {
  bars: UnrolledBar[];
  warnings: ModelWarning[];
}

/**
 * How many passes the repeat block starting at `start` takes, and where the
 * block ends.
 *
 * `blockEnd` matters because later endings are written *after* the closing bar,
 * so the block outlives its own repeat sign. Without it there is no way to tell
 * a frame we are still inside from one we have left.
 */
function analyzeRepeat(
  bars: readonly Bar[],
  start: number,
): { passes: number; blockEnd: number; maxEnding: number } {
  let depth = 0;
  let maxEnding = 0;
  let explicit = 0;
  let blockEnd = bars.length - 1;

  for (let j = start; j < bars.length; j++) {
    const bar = bars[j]!;
    if (j > start && bar.open === 'repeat') depth++;
    if (bar.ending) maxEnding = Math.max(maxEnding, bar.ending);
    for (const directive of bar.directives) {
      if (directive.type === 'times') explicit = Math.max(explicit, directive.count);
    }
    if (bar.close === 'repeat') {
      if (depth === 0) {
        blockEnd = j;
        for (let k = j + 1; k < bars.length && bars[k]!.ending; k++) {
          maxEnding = Math.max(maxEnding, bars[k]!.ending!);
          blockEnd = k;
        }
        break;
      }
      depth--;
    }
  }

  return { passes: Math.max(explicit, maxEnding, 2), blockEnd, maxEnding };
}

/** Play the form once, returning the source bar indices in play order. */
function playOnce(model: SongModel, maxBars: number, warn: (w: ModelWarning) => void): number[] {
  const bars = model.bars;
  const order: number[] = [];
  if (bars.length === 0) return order;

  const codaBars = bars.map((b, i) => (b.coda ? i : -1)).filter((i) => i >= 0);
  const segnoBar = bars.findIndex((b) => b.segno);

  const stack: RepeatFrame[] = [];
  const implicitRepeatsUsed = new Set<number>();

  let i = 0;
  let guard = 0;
  let jumped = false; // a D.C./D.S. fires at most once
  let takeRepeats = true;
  let forcedEnding: number | null = null;
  let stopAtFine = false;
  let pendingCoda = false; // set by `al Coda`, discharged at the first coda mark

  while (i < bars.length) {
    if (++guard > maxBars) {
      warn({
        code: 'unroll-budget-exceeded',
        bar: i,
        message: `Stopped after ${maxBars} bars — the chart's repeat structure does not terminate`,
      });
      break;
    }

    const bar = bars[i]!;

    if (takeRepeats && bar.open === 'repeat') {
      // Retire frames we have genuinely left behind. A frame whose closing bar
      // sat inside a skipped ending is still on the stack, and leaving it there
      // would make a later block read the old block's pass number. A frame we
      // are still *inside* — an outer repeat on its final pass — must stay.
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (top.start === i || top.pass < top.passes || i <= top.blockEnd) break;
        stack.pop();
      }
      const top = stack[stack.length - 1];
      if (!top || top.start !== i) {
        const { passes, blockEnd, maxEnding } = analyzeRepeat(bars, i);
        stack.push({ start: i, pass: 1, passes, blockEnd, maxEnding });
      }
    }

    // Endings with no repeat bracket anywhere: some charts open a section with
    // `[` and rely on the endings alone to imply the repeat. Synthesise the
    // frame at the section start so the later endings are reachable.
    if (bar.ending !== null && forcedEnding === null && takeRepeats && stack.length === 0) {
      const start = lastSectionStartAtOrBefore(bars, i);
      const { passes, blockEnd, maxEnding } = analyzeRepeat(bars, start);
      const endings = Math.max(maxEnding, bar.ending);
      if (endings > 1 && !implicitRepeatsUsed.has(start)) {
        implicitRepeatsUsed.add(start);
        stack.push({ start, pass: 1, passes: Math.max(passes, endings), blockEnd, maxEnding: endings });
      }
    }

    // Endings: play only the bracket belonging to this pass.
    if (bar.ending !== null) {
      const pass = forcedEnding ?? stack[stack.length - 1]?.pass ?? 1;
      if (bar.ending !== pass) {
        const frame = stack[stack.length - 1];
        // Some charts put the repeat sign at the end of the *last* ending
        // rather than the first. Skipping that ending would step straight past
        // the only way back, so the block would play once and the other endings
        // would never be heard. Taking the repeat here is what the writer meant.
        if (
          frame &&
          takeRepeats &&
          bar.close === 'repeat' &&
          bar.ending === frame.maxEnding &&
          frame.pass < frame.passes
        ) {
          frame.pass++;
          i = frame.start;
          continue;
        }
        // Otherwise do NOT retire the frame, even though this bar may carry the
        // repeat sign: the later endings still need its pass number to know
        // whether they are the one to play.
        i++;
        continue;
      }
    }

    order.push(i);

    if (stopAtFine && bar.directives.some((d) => d.type === 'fine')) break;

    const jump = bar.directives.find((d) => d.type === 'dc' || d.type === 'ds');
    if (jump && !jumped) {
      jumped = true;
      takeRepeats = false;
      stack.length = 0;

      const target = jump.type === 'ds' ? segnoBar : 0;
      if (jump.type === 'ds' && segnoBar < 0) {
        warn({ code: 'jump-target-missing', bar: i, message: 'D.S. with no segno; using the top' });
      }

      if (jump.target === 'fine') {
        stopAtFine = true;
      } else if (jump.target === 'ending') {
        // "al 2nd ending" selects which bracket to take on the way back; it
        // does not end the piece there. What ends it is a Fine, if the chart
        // has one — usually written inside that very ending.
        forcedEnding = jump.ending ?? 2;
        stopAtFine = true;
      } else if (jump.target === 'coda') {
        if (codaBars.length >= 2) {
          pendingCoda = true;
        } else {
          warn({
            code: 'jump-target-missing',
            bar: i,
            message: 'al Coda needs two coda marks; playing to the end instead',
          });
        }
      }

      i = Math.max(0, target);
      continue;
    }

    // On the jump pass the first coda mark is "To Coda": play this bar, then
    // leap to the coda section.
    if (pendingCoda && bar.coda) {
      pendingCoda = false;
      i = codaBars[codaBars.length - 1]!;
      continue;
    }

    if (bar.close === 'repeat' && takeRepeats) {
      const frame = stack[stack.length - 1];
      if (frame) {
        if (frame.pass < frame.passes) {
          frame.pass++;
          i = frame.start;
          continue;
        }
        stack.pop();
      } else if (!implicitRepeatsUsed.has(i)) {
        // A closing repeat with no opening one: go back to the start of the
        // section, which is what the writer meant.
        implicitRepeatsUsed.add(i);
        const sectionStart = lastSectionStartAtOrBefore(bars, i);
        warn({
          code: 'unmatched-repeat-close',
          bar: i,
          message: `Repeat close with no opening bracket; repeating from bar ${sectionStart}`,
        });
        i = sectionStart;
        continue;
      }
    }

    // Leaving an ending with passes still owed. Happens when the repeat sign
    // sits at the end of an earlier ending, so nothing sends us back for the
    // remaining ones — without this the last ending is never heard.
    if (takeRepeats && bar.ending !== null && forcedEnding === null) {
      const frame = stack[stack.length - 1];
      const next = bars[i + 1];
      const leavingEnding = !next || next.ending !== bar.ending;
      if (frame && leavingEnding && frame.pass < frame.passes && bar.ending === frame.pass) {
        frame.pass++;
        i = frame.start;
        continue;
      }
    }

    i++;
  }

  // A frame that reached its final pass did its job — the closing bar just sat
  // inside an ending we skipped on the way out. Only an unfinished one is a
  // genuinely malformed chart.
  const unfinished = stack.find((frame) => frame.pass < frame.passes);
  if (unfinished) {
    warn({
      code: 'unclosed-repeat',
      bar: unfinished.start,
      message: `Repeat opened at bar ${unfinished.start} never closed`,
    });
  }

  return order;
}

function lastSectionStartAtOrBefore(bars: readonly Bar[], index: number): number {
  for (let j = index; j >= 0; j--) {
    if (bars[j]!.section) return j;
  }
  return 0;
}

/** Flatten a chart into its play order, `choruses` times through. */
export function unroll(model: SongModel, options: UnrollOptions = {}): UnrollResult {
  const warnings: ModelWarning[] = [];
  const maxBars = options.maxBars ?? 20_000;
  const choruses = Math.max(1, options.choruses ?? model.meta.repeats ?? 3);

  const order = playOnce(model, maxBars, (w) => warnings.push(w));

  const bars: UnrolledBar[] = [];
  for (let chorus = 0; chorus < choruses; chorus++) {
    for (const sourceIndex of order) {
      bars.push({
        index: bars.length,
        sourceIndex,
        bar: model.bars[sourceIndex]!,
        chorus,
      });
    }
  }

  return { bars, warnings };
}

/** Bars in one pass of the form, without chorus repetition. */
export function formLength(model: SongModel, options: UnrollOptions = {}): number {
  return playOnce(model, options.maxBars ?? 20_000, () => {}).length;
}
