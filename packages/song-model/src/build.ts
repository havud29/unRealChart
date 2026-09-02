import type { Cell, Chord, Song } from '@ifakepro/ireal-format';
import { DEFAULT_TIME, meterFromAnnotation } from './meter.js';
import { parseDirectives } from './directives.js';
import type {
  Bar,
  BarChord,
  BarlineClose,
  BarlineOpen,
  ChordSpelling,
  ModelWarning,
  Section,
  SongModel,
  TimeSignature,
} from './types.js';

/**
 * Cells to bars.
 *
 * Two jobs, in order: group cells into bars using the barline markers, then
 * resolve how long each chord lasts. The second is the undocumented part — see
 * `resolveDurations`.
 */

/** A chord still accumulating padding cells. */
interface PendingChord extends ChordSpelling {
  kind: BarChord['kind'];
  small: boolean;
  fermata: boolean;
  alternate: ChordSpelling | null;
  /** Empty cells absorbed after this chord. */
  spaces: number;
}

interface PendingBar {
  time: TimeSignature;
  chords: PendingChord[];
  open: BarlineOpen;
  close: BarlineClose;
  section: string | null;
  ending: number | null;
  segno: boolean;
  coda: boolean;
  end: boolean;
  comments: string[];
  /** 1 for `x`, 2 for `r`, 0 otherwise. */
  repeatPrevious: number;
  cellStart: number;
  cellEnd: number;
}

const OPENERS = /[[{(]/;
const CLOSERS = /[)\]}Z]/;

function openKind(bars: string): BarlineOpen {
  if (bars.includes('[')) return 'double';
  if (bars.includes('{')) return 'repeat';
  if (bars.includes('(')) return 'single';
  return 'none';
}

function closeKind(bars: string): BarlineClose {
  if (bars.includes('Z')) return 'final';
  if (bars.includes('}')) return 'repeat';
  if (bars.includes(']')) return 'double';
  if (bars.includes(')')) return 'single';
  return 'none';
}

function spellingOf(chord: Chord): ChordSpelling {
  const isPseudoRoot = chord.note === 'W' || chord.note === 'n' || chord.note === 'p';
  return {
    root: isPseudoRoot ? null : chord.note,
    quality: chord.modifiers,
    bass: chord.over ? chord.over.note + chord.over.modifiers : null,
  };
}

function kindOf(chord: Chord): BarChord['kind'] {
  if (chord.note === 'n') return 'nc';
  if (chord.note === 'p') return 'repeat';
  return 'chord';
}

/**
 * Decide how many beats each chord in a closed bar lasts.
 *
 * Undocumented by iReal Pro; derived by observing playback. The rules, in order:
 *
 *   1. Every chord is at least one beat.
 *   2. Empty cells before the first chord are discarded (done while grouping).
 *   3. Each remaining empty cell adds a beat to the chord before it.
 *   4. Over the meter: walk the chords round-robin giving padding back.
 *   5. Under the meter: walk them round-robin adding a beat per pass, skipping
 *      chords written small — those stay at one beat however much room is left.
 *   6. More chords than beats is a hard error the editor must prevent.
 */
function resolveDurations(
  bar: PendingBar,
  index: number,
  warn: (w: ModelWarning) => void,
): BarChord[] {
  const { time, chords } = bar;
  const unit = time.beatUnit;

  // `s` is primarily a display size, and plenty of charts switch it on and
  // never switch it back with `l`. It only constrains duration when there is a
  // full-size chord in the bar for it to defer to — otherwise a bar of small
  // chords would play as one beat and leave the rest of the bar silent.
  const allSmall = chords.length > 0 && chords.every((c) => c.small);
  const isShort = (c: PendingChord) => c.small && !allSmall;

  const beatsOf = (c: PendingChord) => (isShort(c) ? 1 : 1 + c.spaces);
  const total = () => chords.reduce((sum, c) => sum + beatsOf(c) * unit, 0);

  if (chords.length > time.beats) {
    warn({
      code: 'too-many-chords',
      bar: index,
      message: `${chords.length} chords in a ${time.beats}/${time.beatType} bar`,
    });
  }

  const expandable = chords.filter((c) => !isShort(c));

  let beats = total();
  if (beats > time.beats && expandable.length > 0) {
    let i = 0;
    let changedThisCycle = false;
    while (beats > time.beats) {
      const chord = chords[i]!;
      if (!isShort(chord) && chord.spaces > 0) {
        chord.spaces--;
        beats -= unit;
        changedThisCycle = true;
      }
      i = (i + 1) % chords.length;
      if (i === 0) {
        if (!changedThisCycle) break; // nothing left to give back
        changedThisCycle = false;
      }
    }
  } else if (beats < time.beats && expandable.length > 0) {
    let i = 0;
    while (beats < time.beats) {
      const chord = chords[i]!;
      if (!isShort(chord)) {
        chord.spaces++;
        beats += unit;
      }
      i = (i + 1) % chords.length;
    }
  }

  return chords.map((c) => ({
    root: c.root,
    quality: c.quality,
    bass: c.bass,
    kind: c.kind,
    beats: beatsOf(c) * unit,
    small: c.small,
    fermata: c.fermata,
    alternate: c.alternate,
  }));
}

/**
 * Copy a bar's chords for an `x` or `r` repeat, refilling them for the target
 * meter.
 *
 * Charts do change meter across a bar repeat — a 4/4 bar repeated inside a 2/4
 * passage, say — and copying the resolved beats verbatim would leave the new
 * bar the wrong length. Same meter is the overwhelmingly common case and is
 * copied untouched.
 */
function refit(
  source: Bar,
  time: TimeSignature,
  index: number,
  warn: (w: ModelWarning) => void,
): BarChord[] {
  if (source.time.beats === time.beats && source.time.beatType === time.beatType) {
    return source.chords.map((c) => ({ ...c }));
  }
  const chords: PendingChord[] = source.chords.map((c) => ({
    root: c.root,
    quality: c.quality,
    bass: c.bass,
    kind: c.kind,
    small: c.small,
    fermata: c.fermata,
    alternate: c.alternate,
    spaces: Math.max(0, Math.round(c.beats / source.time.beatUnit) - 1),
  }));
  return resolveDurations({ ...emptyPendingBar(time), chords }, index, warn);
}

function emptyPendingBar(time: TimeSignature): PendingBar {
  return {
    time,
    chords: [],
    open: 'none',
    close: 'none',
    section: null,
    ending: null,
    segno: false,
    coda: false,
    end: false,
    comments: [],
    repeatPrevious: 0,
    cellStart: 0,
    cellEnd: 0,
  };
}

export interface BuildOptions {
  /** Meter to assume before any `T..` token. iReal Pro assumes 4/4 too. */
  defaultTime?: TimeSignature;
}

/** Build the musical model from a parsed song. */
export function buildSongModel(song: Song, options: BuildOptions = {}): SongModel {
  const warnings: ModelWarning[] = [];
  const warn = (w: ModelWarning) => warnings.push(w);

  const bars: Bar[] = [];
  let time = options.defaultTime ?? DEFAULT_TIME;
  let small = false; // `s` and `l` are sticky across cells
  let currentEnding: number | null = null;
  let pending: PendingBar | null = null;
  let swallowNextEmptyBar = false;

  const startBar = (open: BarlineOpen, cellIndex: number): PendingBar => ({
    time,
    chords: [],
    open,
    close: 'none',
    section: null,
    ending: currentEnding,
    segno: false,
    coda: false,
    end: false,
    comments: [],
    repeatPrevious: 0,
    cellStart: cellIndex,
    cellEnd: cellIndex,
  });

  const flush = () => {
    const bar = pending;
    pending = null;
    if (!bar) return;

    const index = bars.length;

    // `x` copies the previous bar; `r` copies the previous two and occupies two
    // bars of chart space, the second of which is written empty.
    if (bar.repeatPrevious > 0) {
      const sources = bars.slice(-bar.repeatPrevious);
      if (sources.length < bar.repeatPrevious) {
        warn({
          code: 'no-previous-bar',
          bar: index,
          message: `Bar repeat needs ${bar.repeatPrevious} previous bar(s), found ${sources.length}`,
        });
      }
      sources.forEach((source, n) => {
        bars.push({
          index: bars.length,
          time: bar.time,
          chords: refit(source, bar.time, index, warn),
          // The first copy keeps this bar's own barlines and marks; a second
          // copy is a plain continuation bar.
          open: n === 0 ? bar.open : 'single',
          close: n === sources.length - 1 ? bar.close : 'none',
          section: n === 0 ? bar.section : null,
          ending: bar.ending,
          segno: n === 0 && bar.segno,
          coda: n === 0 && bar.coda,
          end: n === sources.length - 1 && bar.end,
          comments: n === 0 ? bar.comments : [],
          directives: n === 0 ? parseDirectives(bar.comments) : [],
          cells: [bar.cellStart, bar.cellEnd],
        });
      });
      if (bar.repeatPrevious === 2) swallowNextEmptyBar = true;
      return;
    }

    if (bar.chords.length === 0) {
      // Trailing row padding, and the empty second bar of an `r` pair.
      if (swallowNextEmptyBar) {
        swallowNextEmptyBar = false;
        return;
      }
      const decorated = bar.section || bar.segno || bar.coda || bar.end || bar.comments.length > 0;
      if (decorated) {
        warn({ code: 'empty-bar', bar: index, message: 'Bar carries marks but no chord' });
      }
      return;
    }
    swallowNextEmptyBar = false;

    bars.push({
      index,
      time: bar.time,
      chords: resolveDurations(bar, index, warn),
      open: bar.open,
      close: bar.close,
      section: bar.section,
      ending: bar.ending,
      segno: bar.segno,
      coda: bar.coda,
      end: bar.end,
      comments: bar.comments,
      directives: parseDirectives(bar.comments),
      cells: [bar.cellStart, bar.cellEnd],
    });
  };

  song.cells.forEach((cell, cellIndex) => {
    const opens = OPENERS.test(cell.bars);
    const closes = CLOSERS.test(cell.bars);

    if (opens) {
      flush();
      pending = startBar(openKind(cell.bars), cellIndex);
    }
    if (!pending) pending = startBar('none', cellIndex);
    pending.cellEnd = cellIndex + 1;

    let fermata = false;
    for (const annot of cell.annots) {
      const meter = meterFromAnnotation(annot);
      if (meter) {
        time = meter;
        pending.time = meter;
        continue;
      }
      if (annot.startsWith('*')) {
        pending.section = annot.slice(1);
        continue;
      }
      const ending = /^N(\d)/.exec(annot);
      if (ending) {
        // `N0` is not a zeroth ending: charts use it to close the bracket so
        // the bars after a long final ending are not drawn under it.
        const number = Number(ending[1]);
        currentEnding = number === 0 ? null : number;
        pending.ending = currentEnding;
        continue;
      }
      switch (annot) {
        case 'S':
          pending.segno = true;
          break;
        case 'Q':
          pending.coda = true;
          break;
        case 'U':
          pending.end = true;
          break;
        case 'f':
          fermata = true;
          break;
        case 's':
          small = true;
          break;
        case 'l':
          small = false;
          break;
        default:
          break;
      }
    }

    pending.comments.push(...cell.comments);

    const chord = cell.chord;
    if (chord && (chord.note === 'x' || chord.note === 'r')) {
      pending.repeatPrevious = chord.note === 'x' ? 1 : 2;
    } else if (chord) {
      pending.chords.push({
        ...spellingOf(chord),
        kind: kindOf(chord),
        small,
        fermata,
        alternate: chord.alternate ? spellingOf(chord.alternate) : null,
        spaces: 0,
      });
    } else {
      // Rule 3: padding lengthens the chord before it. Rule 2: padding before
      // the first chord of a bar is discarded.
      const last = pending.chords[pending.chords.length - 1];
      if (last) last.spaces++;
    }

    if (closes) {
      pending.close = closeKind(cell.bars);
      // Only a repeat sign or the final barline ends an ending bracket. A plain
      // double barline is a section divider and happily occurs *inside* a first
      // ending — treating it as a terminator cuts the bracket short and leaves
      // the bars after it stranded on every pass.
      if (pending.close === 'repeat' || pending.close === 'final') currentEnding = null;
      flush();
    }
  });
  flush();

  return {
    meta: {
      title: song.title,
      composer: song.composer,
      style: song.style,
      key: song.key,
      groove: song.groove || song.style,
      bpm: song.bpm,
      repeats: song.repeats,
      transpose: song.transpose,
    },
    bars,
    sections: collectSections(bars),
    warnings,
  };
}

function collectSections(bars: Bar[]): Section[] {
  const sections: Section[] = [];
  bars.forEach((bar, i) => {
    if (!bar.section) return;
    const previous = sections[sections.length - 1];
    if (previous) previous.endBar = i;
    sections.push({ name: bar.section, startBar: i, endBar: bars.length });
  });
  return sections;
}

/** Total beats in a bar — should always equal its meter. */
export function barBeats(bar: Bar): number {
  return bar.chords.reduce((sum, c) => sum + c.beats, 0);
}
