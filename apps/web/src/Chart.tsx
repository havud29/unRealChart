import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Bar, BarChord, SongModel } from '@unrealchart/song-model';
import { Coda, DimCircle, Fermata, Segno, Triangle } from './Glyphs.js';
import { soloTones } from '@unrealchart/groove-engine';
import type { SoloTone } from '@unrealchart/groove-engine';

/**
 * The chart, rendered from the musical model, as a page.
 *
 * iReal Pro's chart is not a document that reflows: it is a single page of 16
 * cells across and at most 12 systems down, scaled to fit the height of the
 * window and centred, so surplus width becomes margin rather than wider bars.
 * Measured off the Mac app, an eight-system page is 0.828 as wide as it is
 * tall, in a 557px stage and in a 769px one alike.
 *
 * So every dimension below is expressed in `--cell`, the one number this
 * component computes. Nothing in the page is set in pixels.
 */

const COLUMNS = 16;

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A written note name as a pitch class, or null if it is not a note. */
function pitchClassOf(note: string | null): number | null {
  if (!note) return null;
  const base = PITCH[note[0]!.toUpperCase()];
  if (base === undefined) return null;
  const rest = note.slice(1);
  const shift = (rest.match(/#/g)?.length ?? 0) - (rest.match(/b/g)?.length ?? 0);
  return (((base + shift) % 12) + 12) % 12;
}

/*
 * The page's proportions, in cells, fitted to the Mac app.
 *
 * Both measured screenshots hold eight systems and both come out at a width to
 * height of 0.828, whatever the window is doing around them — one with the
 * player panel open in a 557px stage, one with it closed in a 769px stage. So
 * these four numbers are chosen to reproduce 0.828 at eight systems:
 *
 *     (16 + 2·PAD_X) / (2·PAD_Y + HEADER + 8·SYSTEM) = 0.828
 */
const SYSTEM = 2.3;
const HEADER = 1.67;
const PAD_Y = 0.35;
const PAD_X = 0.6;

/**
 * The sheet.
 *
 * The page is a fixed portrait sheet, not a box that grows a row at a time.
 * Deriving its height from the system count -- which the two reference
 * screenshots could not rule out, both being eight-system charts -- makes a
 * twelve-bar blues a landscape letterbox and a long ballad a tall column, a
 * swing of better than two to one in aspect ratio. A sheet of paper does not
 * change shape because the song is short, so the height is fixed here and the
 * systems are laid out inside it.
 */
const SHEET = PAD_Y * 2 + HEADER + 8 * SYSTEM;

/**
 * How tall one system may be, in cells.
 *
 * A short chart spreads its systems out to use the sheet rather than huddling
 * at the top, but only so far: past this the staves float apart and the eye
 * loses the line. A long chart tightens them, down to the point where the
 * chord and its marks stop fitting. The floor is set below the 1.53 that
 * twelve systems need, so twelve -- iReal Pro's own documented maximum for one
 * page -- still fits the sheet exactly, and only a thirteenth grows it.
 */
const SYSTEM_MIN = 1.5;
const SYSTEM_MAX = 3.2;

/**
 * How small a symbol may end up, as a fraction of the default chord size.
 *
 * A limit on the *final* size, not on the correction. When the reader has set
 * chords larger, a symbol has proportionally further to shrink before it
 * reaches the same absolute size, so the floor on the correction is this
 * divided by the chosen chord size -- see `fitFloor`. Holding the correction
 * at 0.72 regardless meant that turning chords up to 120% put them back into
 * each other, because the fit was not allowed to undo what the setting did.
 *
 * Below this a symbol stops being readable at chart distance, and one that
 * still does not fit is better slightly overrunning its neighbour than
 * illegible -- iReal Pro lets a chord overrun a barline too.
 */
const MIN_FIT = 0.72;

/** The floor on the per-symbol correction, given the chosen chord size. */
export function fitFloor(chordSize: number): number {
  return MIN_FIT / (chordSize > 0 ? chordSize : 1);
}

/** Fit to this much of the slot, so a shrunk symbol still has air beside it. */
const FIT_MARGIN = 0.92;

/**
 * How much to shrink a symbol that is wider than its slot, or 1 to leave it.
 *
 * Kept separate from the DOM so the rule can be reasoned about and tested:
 * everything that fits is left at one size, and what does not is brought down
 * to a little inside its slot but never below what stays readable.
 */
export function fitScale(room: number, wanted: number, floor: number = MIN_FIT): number {
  if (room <= 0 || wanted <= room + 1) return 1;
  return Math.max(floor, (room * FIT_MARGIN) / wanted);
}

/**
 * The zoom ladder, in the steps a browser uses.
 *
 * Zoom multiplies the fitted cell rather than replacing it, so the page keeps
 * its proportions at every step -- 120% is the same sheet, larger, and the
 * stage scrolls to it. Everything on the page is a multiple of one cell, so
 * one number is all that has to change.
 */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

/**
 * How large the chords are set *within* the page.
 *
 * Distinct from zoom, and the distinction matters. Zoom scales the whole sheet
 * -- the chords and the page grow together and nothing moves relative to
 * anything else. This changes the chords against a page that stays put, which
 * is how you fit a dense chart on screen or make a sparse one readable from
 * further away. iReal Pro's `Aa` is this one.
 *
 * A narrower range than zoom on purpose: past these the symbols either crowd
 * their bars or rattle around in them.
 */
export const CHORD_STEPS = [0.75, 0.85, 0.925, 1, 1.1, 1.2, 1.35] as const;

/** The next step up or down a ladder from wherever a value currently sits. */
export function stepThrough(
  steps: readonly number[],
  value: number,
  direction: 1 | -1,
): number {
  if (direction > 0) {
    return steps.find((step) => step > value + 0.001) ?? steps[steps.length - 1]!;
  }
  const lower = steps.filter((step) => step < value - 0.001);
  return lower[lower.length - 1] ?? steps[0]!;
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return stepThrough(ZOOM_STEPS, zoom, direction);
}

/** Below this the page stops shrinking and the stage scrolls instead. */
const MIN_CELL = 13;
/** Above this it stops growing, so a huge display does not give huge chords. */
const MAX_CELL = 48;

/** The sheet's layout for a given number of systems. */
export function sheetMetrics(
  systems: number,
  /** Extra height each system needs, in cells. Chord tones want a line. */
  extra = 0,
): { system: number; page: number } {
  const rows = Math.max(1, systems);
  const room = SHEET - PAD_Y * 2 - HEADER;
  const system = Math.min(SYSTEM_MAX, Math.max(SYSTEM_MIN, room / rows)) + extra;
  // The sheet only stretches when even the tightest systems overrun it.
  const page = Math.max(SHEET, PAD_Y * 2 + HEADER + rows * system);
  return { system, page };
}

/** A line of chord tones is about this tall, in cells. */
export const TONES_HEIGHT = 0.78;

/**
 * Prettify a written symbol without changing what the user typed.
 *
 * Only the characters a text face carries. The major triangle and the
 * diminished circle are drawn instead — see `qualityNodes`.
 */
function prettify(text: string): string {
  return text.replace(/h/g, 'ø').replace(/b/g, '♭').replace(/#/g, '♯');
}

function noteLabel(note: string): string {
  return note.length > 1 ? note[0] + prettify(note.slice(1)) : note;
}

/**
 * A root, drawn the way iReal Pro draws one: the letter at full size with its
 * accidental raised beside it. The chord's look comes from these three sizes —
 * root, superscript accidental, subscript quality — not from one font size.
 */
function Note({ name }: { name: string }) {
  const accidental = name.slice(1);
  return (
    <>
      <span className="c-root">{name[0]}</span>
      {accidental ? <span className="c-acc">{prettify(accidental)}</span> : null}
    </>
  );
}

/**
 * A quality as renderable parts: text where a font has the character, drawn
 * shapes where it does not.
 */
function qualityNodes(quality: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push(prettify(buffer));
    buffer = '';
  };

  for (let i = 0; i < quality.length; i++) {
    const ch = quality[i]!;
    if (ch === '^') {
      flush();
      nodes.push(<Triangle key={`t${i}`} />);
    } else if (ch === 'o') {
      flush();
      nodes.push(<DimCircle key={`d${i}`} />);
    } else if (
      // `69` is a six-nine chord, and it is drawn as a fraction rather than as
      // the number sixty-nine. Only when it stands alone: `13b9` has no 69 in
      // it, but a stray digit either side would make one.
      ch === '6' &&
      quality[i + 1] === '9' &&
      !/[0-9]/.test(quality[i - 1] ?? '') &&
      !/[0-9]/.test(quality[i + 2] ?? '')
    ) {
      flush();
      nodes.push(
        <span className="c-sixnine" key={`f${i}`}>
          <span>6</span>
          <span>9</span>
        </span>,
      );
      i++;
    } else {
      buffer += ch;
    }
  }
  flush();
  return nodes;
}

/**
 * A chord symbol.
 *
 * Three sizes and two rows, which is most of what makes a chart look like a
 * chart: the root at full size, its accidental raised beside it, and a tail to
 * the right carrying the quality with the bass note stacked underneath it.
 *
 * The bass belongs under the quality rather than after it. Run inline, a bar of
 * slash chords -- `F^7/C G-7/C` -- is twice as wide as the bar it has to fit
 * in, and the symbols collide into each other. Stacked, a slash chord takes no
 * more width than a plain one.
 */
export function Symbol({
  root,
  quality,
  bass,
}: {
  root: string;
  quality?: string | undefined;
  bass?: string | null | undefined;
}) {
  const tail = quality ? qualityNodes(quality) : null;
  const under = bass ? noteLabel(bass) : null;

  return (
    <>
      <Note name={root} />
      {tail || under ? (
        <span className="c-tail">
          <span className="c-qual">{tail}</span>
          {under ? <span className="c-bass">/{under}</span> : null}
        </span>
      ) : null}
    </>
  );
}

export function ChordSymbol({ chord }: { chord: BarChord }) {
  if (chord.kind === 'nc') return <span className="c-root">N.C.</span>;
  if (chord.kind === 'repeat') return <span className="c-root">/</span>;
  if (!chord.root) return null;
  return <Symbol root={chord.root} quality={chord.quality} bass={chord.bass} />;
}

interface Row {
  bars: Bar[];
}

/** Pack bars into rows of 16 columns, each bar as wide as it was written. */
function layout(bars: readonly Bar[]): Row[] {
  const rows: Row[] = [{ bars: [] }];
  let column = 0;

  for (const bar of bars) {
    const span = Math.min(COLUMNS, Math.max(1, bar.cells[1] - bar.cells[0]));
    if (column + span > COLUMNS) {
      rows.push({ bars: [] });
      column = 0;
    }
    rows[rows.length - 1]!.bars.push(bar);
    column += span;
  }

  return rows.filter((row) => row.bars.length > 0);
}

/** The stacked time signature iReal Pro draws inside the first bar of a meter. */
function Meter({ beats, beatType }: { beats: number; beatType: number }) {
  return (
    <span className="meter" aria-label={`${beats}/${beatType}`}>
      <span>{beats}</span>
      <span>{beatType}</span>
    </span>
  );
}

/**
 * The notes to aim at under one chord.
 *
 * Guide tones -- the third and seventh -- carry the weight, because they are
 * what tell a major seventh from a minor from a dominant. A tone the next
 * chord also holds is marked as somewhere to sit through the change, and one
 * that leans a half step into the next chord's guide tone is marked as
 * somewhere to go. Everything else is drawn quietly: true, but not the point.
 */
function ToneLine({ tones }: { tones: SoloTone[] }) {
  if (tones.length === 0) return null;
  return (
    <span className="tones" aria-hidden="true">
      {tones.map((tone, i) => (
        <span
          key={i}
          className={`tone role-${tone.role}${tone.common ? ' common' : ''}${
            tone.resolvesTo ? ' resolves' : ''
          }`}
          title={
            tone.resolvesTo
              ? `${tone.name} — the ${tone.degree}, leans into ${tone.resolvesTo}`
              : tone.common
                ? `${tone.name} — the ${tone.degree}, held through the change`
                : `${tone.name} — the ${tone.degree}`
          }
        >
          {tone.name}
        </span>
      ))}
    </span>
  );
}

function BarView({
  bar,
  showBeats,
  showMeter,
  tonesFor,
  first,
  endingStart,
  playing,
  cued,
  selected,
  looped,
  onPointerDown,
  onPointerEnter,
}: {
  bar: Bar;
  showBeats: boolean;
  showMeter: boolean;
  /** Tones to draw under a chord, or null to draw none. */
  tonesFor: (barIndex: number, chordIndex: number) => SoloTone[] | null;
  /** First bar of a system, which always opens with a barline. */
  first: boolean;
  /** First bar of an ending: the only one that carries the number. */
  endingStart: boolean;
  playing: boolean;
  cued: boolean;
  selected: boolean;
  looped: boolean;
  onPointerDown?: ((bar: number, event: ReactPointerEvent) => void) | undefined;
  onPointerEnter?: ((bar: number) => void) | undefined;
}) {
  const span = Math.min(COLUMNS, Math.max(1, bar.cells[1] - bar.cells[0]));

  const classes = ['bar', `open-${bar.open}`, `close-${bar.close}`];
  // A system always opens with a barline, whether or not the chart wrote one:
  // a bar has to begin and end on the same line, so the line's edge is a bar
  // edge by definition.
  if (first && bar.open === 'none') classes.push('system-start');
  if (bar.ending !== null) classes.push('in-ending');
  if (endingStart) classes.push('ending-start');
  if (playing) classes.push('playing');
  if (cued) classes.push('cued');
  if (selected) classes.push('selected');
  if (looped) classes.push('looped');
  if (onPointerDown) classes.push('seekable');

  /*
   * Chords are all one size.
   *
   * We used to shrink a bar that held more than one chord, on the theory that
   * crowding needed relief. It does not: it makes `G-7 C7` visibly smaller than
   * the `F^7` beside it, and a page where the type size changes bar to bar
   * reads as badly set rather than as helpfully spaced. iReal Pro keeps one
   * size throughout and shrinks only what the chart itself marks small -- the
   * format's `s`, which is an authoring decision, not a layout one.
   */
  return (
    <div
      className={classes.join(' ')}
      style={{ gridColumn: `span ${span}` } as CSSProperties}
      onPointerDown={onPointerDown ? (event) => onPointerDown(bar.index, event) : undefined}
      onPointerEnter={onPointerEnter ? () => onPointerEnter(bar.index) : undefined}
    >
      {cued ? <span className="cue-mark" aria-hidden="true" /> : null}

      <div className="marks">
        {bar.section ? <span className="section">{bar.section}</span> : null}
        {bar.ending !== null && endingStart ? (
          <span className="ending">{bar.ending}.</span>
        ) : null}
        {bar.segno ? <Segno size={1.1} /> : null}
        {bar.coda ? <Coda size={1.1} /> : null}
        {bar.end ? <span className="glyph end">END</span> : null}
      </div>

      {bar.comments.length > 0 ? <div className="comment">{bar.comments.join(' · ')}</div> : null}

      <div className="chords">
        {showMeter ? <Meter beats={bar.time.beats} beatType={bar.time.beatType} /> : null}
        {bar.chords.map((chord, i) => {
          const alternate = chord.alternate?.root ? (
            <>
              <Note name={chord.alternate.root} />
              {chord.alternate.quality ? (
                <span className="c-qual">{qualityNodes(chord.alternate.quality)}</span>
              ) : null}
            </>
          ) : null;
          return (
            <span
              className={`chord${chord.small ? ' small' : ''}`}
              key={i}
              // Width in proportion to duration, so a two-beat chord reads as
              // twice the room of a one-beat chord.
              style={{ flexGrow: chord.beats }}
            >
              {alternate ? <span className="alternate">{alternate}</span> : null}
              {chord.fermata ? <Fermata size={0.7} /> : null}
              <ChordSymbol chord={chord} />
              {showBeats ? <span className="beats">{chord.beats}</span> : null}
              {(() => {
                const tones = tonesFor(bar.index, i);
                return tones ? <ToneLine tones={tones} /> : null;
              })()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export interface ChartProps {
  model: SongModel;
  showBeats?: boolean;
  /** Bar currently sounding, as an index into `model.bars`. */
  playingBar?: number | null;
  /** Play from a bar — a click that did not turn into a drag. */
  onSeek?: (bar: number) => void;
  /** A range dragged across the chart, which is how iReal Pro sets a loop. */
  onSelectRange?: (fromBar: number, toBar: number) => void;
  /**
   * The bar play will start from, set by clicking the chart while stopped.
   * Drawn only while stopped -- once playing, the playhead says where we are.
   */
  cuedBar?: number | null;
  /**
   * Page zoom, as a multiplier on the fitted size. 1 fits the stage; above
   * that the page grows and the stage scrolls, as a browser's zoom does.
   */
  zoom?: number;
  /**
   * How large chords are set within the page, as a multiplier. Independent of
   * `zoom`: this changes the chords against a page that does not move.
   */
  chordSize?: number;
  /** Draw the notes to aim at under every chord. */
  showTones?: boolean;
  /** Bar range being looped, drawn as a tint over the chart. */
  loop?: { fromBar: number; toBar: number } | null;
}

/**
 * The bars that open an ending.
 *
 * iReal Pro writes the number once, at the head of the bracket, and runs a
 * line over the bars it covers. Numbering every bar in the ending -- which is
 * what the model's per-bar `ending` invites -- turns a two-bar first ending
 * into "1. 1." and reads as noise rather than as structure.
 */
function endingStarts(bars: readonly Bar[]): Set<number> {
  const starts = new Set<number>();
  let previous: number | null = null;
  for (const bar of bars) {
    if (bar.ending !== null && bar.ending !== previous) starts.add(bar.index);
    previous = bar.ending;
  }
  return starts;
}

export function Chart({
  model,
  showBeats = false,
  playingBar = null,
  cuedBar = null,
  zoom = 1,
  chordSize = 1,
  showTones = false,
  onSeek,
  onSelectRange,
  loop = null,
}: ChartProps) {
  const rows = layout(model.bars);
  const starts = endingStarts(model.bars);

  /*
   * The tones under each chord, worked out once for the whole chart.
   *
   * Each chord is read against the one that follows it -- across the barline,
   * not just within the bar -- because that is where the interesting part is:
   * which note to hold through the change, and which one leans into it. A
   * chord read on its own can only be spelled.
   */
  const tones = useMemo(() => {
    if (!showTones) return null;

    const flat: Array<{ bar: number; chord: number; ref: { root: number; quality: string } | null }> =
      [];
    for (const bar of model.bars) {
      bar.chords.forEach((chord, index) => {
        const pc = pitchClassOf(chord.root);
        flat.push({
          bar: bar.index,
          chord: index,
          ref: pc === null ? null : { root: pc, quality: chord.quality },
        });
      });
    }

    const map = new Map<string, SoloTone[]>();
    flat.forEach((entry, i) => {
      if (!entry.ref) return;
      // The next chord that actually names a pitch: N.C. and repeat marks are
      // not a harmony to resolve into.
      const next = flat.slice(i + 1).find((candidate) => candidate.ref)?.ref ?? null;
      map.set(`${entry.bar}:${entry.chord}`, soloTones(entry.ref, next));
    });
    return map;
  }, [model, showTones]);

  const tonesFor = (bar: number, chord: number) => tones?.get(`${bar}:${chord}`) ?? null;

  const fitRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(30);
  const { system, page } = sheetMetrics(rows.length, showTones ? TONES_HEIGHT : 0);

  // One number decides the whole page. It comes from the height of the stage,
  // never from its width: that is what keeps the proportions stable when the
  // window is widened or a side panel is hidden.
  useLayoutEffect(() => {
    const element = fitRef.current;
    if (!element) return;

    const measure = () => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      // The stage's own padding and the page's border are not room for the
      // page, and counting them is what puts a scrollbar under a page that
      // was supposed to fit exactly.
      const width =
        box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      const height =
        box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
      if (height <= 0 || width <= 0) return;
      const byHeight = height / page;
      const byWidth = width / (COLUMNS + PAD_X * 2);
      // Clamp the fit, then zoom: the limits keep a page readable at 100%, and
      // zoom is the reader overriding that on purpose.
      const fitted = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.min(byHeight, byWidth)));
      setCell(fitted * zoom);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [page, zoom]);

  /*
   * Fit the few symbols that genuinely do not fit.
   *
   * Most chords fit their share of the bar with room to spare, and they are all
   * set at one size -- that is what makes a page look evenly typeset. But a
   * long symbol in a shared bar really can be wider than the space it has:
   * `Db^7#11` twice in one bar wants about 123px of an 88px slot, and without
   * help the two run straight through each other.
   *
   * So this measures rather than guesses. Shrinking every bar that holds two
   * chords -- which is what we did before -- makes `G-7 C7` smaller than the
   * `F^7` beside it for no reason a reader can see. Shrinking only what
   * overflows leaves those alone and touches the handful that need it.
   *
   * Two passes, never interleaved: clear every scale and let layout settle,
   * then measure them all, then apply. Measuring one chord while another is
   * still scaled would read a width that is about to change.
   */
  useLayoutEffect(() => {
    const element = fitRef.current;
    if (!element) return;

    const fit = () => {
      const chords = element.querySelectorAll<HTMLElement>('.chord');
      for (const chord of chords) chord.style.removeProperty('--fit');

      const scales: Array<[HTMLElement, number]> = [];
      for (const chord of chords) {
        const scale = fitScale(chord.clientWidth, chord.scrollWidth, fitFloor(chordSize));
        if (scale !== 1) scales.push([chord, scale]);
      }
      for (const [chord, scale] of scales) chord.style.setProperty('--fit', String(scale));
    };

    // Deliberately not observed. Clearing the scales makes the symbols wide
    // again, which can push the stage into showing a scrollbar, which resizes
    // the observed element, which runs the pass again -- the chords flicker
    // between two sizes forever. Layout only changes when the cell or the song
    // changes, and both are dependencies here, so a pass per change is enough.
    fit();
    // Chord size is a dependency: setting the chords larger is exactly what
    // makes a symbol outgrow its slot, so the fit pass has to run again.
  }, [model, cell, chordSize]);

  // A drag across the chart selects a range; a click that never moved is a
  // request to play from that bar.
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const beginDrag = (bar: number, event: ReactPointerEvent) => {
    if (!onSeek && !onSelectRange) return;
    event.preventDefault();
    dragRef.current = { from: bar, to: bar };
    setDrag(dragRef.current);

    const finish = () => {
      window.removeEventListener('pointerup', finish);
      const range = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!range) return;
      const low = Math.min(range.from, range.to);
      const high = Math.max(range.from, range.to);
      // iReal Pro needs at least two measures for a loop; one measure is a
      // request to start playing there.
      if (low === high) onSeek?.(low);
      else onSelectRange?.(low, high);
    };
    window.addEventListener('pointerup', finish);
  };

  const extendDrag = (bar: number) => {
    if (!dragRef.current) return;
    dragRef.current = { ...dragRef.current, to: bar };
    setDrag(dragRef.current);
  };

  const selection = drag
    ? { low: Math.min(drag.from, drag.to), high: Math.max(drag.from, drag.to) }
    : null;

  // The meter is drawn where it changes, which on most charts is bar one only.
  let lastMeter = '';

  return (
    <div className="chart-fit" ref={fitRef}>
      <article
        className="page"
        style={
          {
            '--cell': `${cell}px`,
            '--chord-size': chordSize,
            '--system': `${cell * system}px`,
            '--sheet': `${cell * page}px`,
          } as CSSProperties
        }
      >
        <header className="page-head">
          <span className="page-style">
            {model.meta.style ? `(${model.meta.style})` : ''}
          </span>
          <h1 className="page-title">{model.meta.title}</h1>
          <span className="page-composer">{model.meta.composer}</span>
        </header>

        <div className="systems">
          {rows.map((row, i) => (
            <div className="row" key={i}>
              {row.bars.map((bar) => {
                const meter = `${bar.time.beats}/${bar.time.beatType}`;
                const showMeter = meter !== lastMeter;
                lastMeter = meter;
                return (
                  <BarView
                    bar={bar}
                    showBeats={showBeats}
                    showMeter={showMeter}
                    tonesFor={tonesFor}
                    first={bar === row.bars[0]}
                    endingStart={starts.has(bar.index)}
                    playing={bar.index === playingBar}
                    cued={playingBar === null && bar.index === cuedBar}
                    selected={
                      selection !== null &&
                      bar.index >= selection.low &&
                      bar.index <= selection.high
                    }
                    looped={
                      loop !== null && bar.index >= loop.fromBar && bar.index <= loop.toBar
                    }
                    onPointerDown={onSeek || onSelectRange ? beginDrag : undefined}
                    onPointerEnter={onSeek || onSelectRange ? extendDrag : undefined}
                    key={bar.index}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
