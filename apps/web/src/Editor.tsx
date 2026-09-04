import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { Cell, Song } from '@unrealchart/ireal-format';
import { chordToText, tokenize } from '@unrealchart/ireal-format';
import {
  CELLS_PER_ROW,
  EditHistory,
  ENDING,
  METER,
  SECTION,
  appendRow,
  buildSongModel,
  deleteCell,
  insertCell,
  parseChordInput,
  setAnnotation,
  setChord,
  setCloseBarline,
  setComment,
  setOpenBarline,
  setSpacer,
  toPayload,
  toggleAnnotation,
} from '@unrealchart/song-model';
import type { CloseBarline, OpenBarline } from '@unrealchart/song-model';
import { Coda, Fermata, RepeatBar, RepeatTwoBars, Segno } from './Glyphs.js';
import { Symbol } from './Chart.js';

/**
 * The chart editor.
 *
 * Editing happens on the cell grid, not on the resolved bars, because the grid
 * is what round-trips: everything the user types is written back through the
 * same serializer the corpus test exercises. The bar model is rebuilt on every
 * keystroke purely to show what the edit *means* — beats per chord, section
 * structure, and any warnings.
 */

const SECTIONS = ['A', 'B', 'C', 'D', 'i', 'v'];
const METERS = ['T44', 'T34', 'T24', 'T54', 'T64', 'T74', 'T68', 'T78', 'T98', 'T12', 'T22'];
const MARKS: Array<[string, string]> = [
  ['S', 'Segno'],
  ['Q', 'Coda'],
  ['U', 'End'],
  ['f', 'Fermata'],
  ['s', 'Small chords from here'],
  ['l', 'Normal chords from here'],
];

/** The glyph, where there is one; otherwise the label does the work. */
const MARK_GLYPHS: Record<string, () => ReactElement> = {
  S: () => <Segno size={1.1} />,
  Q: () => <Coda size={1.1} />,
  f: () => <Fermata size={0.8} />,
};

const OPEN_BARS: Array<[OpenBarline, string]> = [
  ['none', '·'],
  ['single', '|'],
  ['double', '‖'],
  ['repeat', '|:'],
];
const CLOSE_BARS: Array<[CloseBarline, string]> = [
  ['none', '·'],
  ['double', '‖'],
  ['repeat', ':|'],
  ['final', '𝄂'],
];

/** What a cell shows in the grid. The repeat signs are drawn, not typed. */
/**
 * A cell's chord, drawn the way the chart draws it.
 *
 * The editor used to show the payload text -- `Eb^7`, `C7b9`, and an alternate
 * appended as `(Bb7)` -- which is what the format stores but not what anyone
 * reads. You edit a chart by looking at it, so a cell has to show the same
 * symbol the page will: real accidentals, the major triangle, the quality
 * dropped and the bass stacked under it.
 */
export function cellLabel(cell: Cell): ReactNode {
  if (!cell.chord) return '';
  const chord = cell.chord;
  switch (chord.note) {
    case 'n':
      return <span className="c-root">N.C.</span>;
    case 'x':
      return <RepeatBar size={1.1} />;
    case 'r':
      return <RepeatTwoBars size={1.1} />;
    case 'p':
      return <span className="c-root">/</span>;
    case ' ':
    case 'W':
      return '';
    default:
      return (
        <Symbol
          root={chord.note}
          quality={chord.modifiers}
          bass={chord.over ? chord.over.note + chord.over.modifiers : null}
        />
      );
  }
}

/**
 * The marks on a cell, as marks rather than as their payload codes.
 *
 * `*A` is a section, `T44` a meter, `N1` an ending, `Q` a coda. Printed raw
 * they are a row of cryptic letters across the top of the grid; drawn, they
 * are the same signs the chart shows, so the grid reads as the chart it is.
 */
export function annotationNodes(annots: readonly string[]): ReactNode[] {
  return annots.map((annot, i) => {
    if (SECTION.test(annot)) {
      return (
        <span className="gridsection" key={i}>
          {annot.slice(1)}
        </span>
      );
    }
    if (METER.test(annot)) {
      const beats = annot.slice(1, 2);
      const unit = annot.slice(2);
      return (
        <span className="gridmeter" key={i}>
          <b>{beats}</b>
          <b>{unit}</b>
        </span>
      );
    }
    if (ENDING.test(annot)) {
      return (
        <span className="gridending" key={i}>
          {annot.slice(1)}.
        </span>
      );
    }
    if (annot === 'S') return <Segno size={0.9} key={i} />;
    if (annot === 'Q') return <Coda size={0.9} key={i} />;
    if (annot === 'f') return <Fermata size={0.7} key={i} />;
    if (annot === 'U') return <span className="gridend" key={i}>END</span>;
    // `s` and `l` are the small/normal chord size switches; they have no sign,
    // so they keep their letter rather than being invented one.
    return (
      <span className="gridflag" key={i}>
        {annot.startsWith('*') ? annot.slice(1) : annot}
      </span>
    );
  });
}

export interface EditorProps {
  song: Song;
  onSave: (payload: string) => void;
  onClose: () => void;
  /**
   * Where the Editor's controls belong. iReal Pro puts them in the right-hand
   * panel with the grid still in the middle of the window, so the controls are
   * portalled out rather than stacked above the chart.
   */
  panelHost?: HTMLElement | null;
}

/** The grid is a page too: one number, taken from the height, sizes all of it. */
const SYSTEM = 2.3;
const PAD = 0.5;
const MIN_CELL = 13;
const MAX_CELL = 46;

export function Editor({ song, onSave, onClose, panelHost = null }: EditorProps) {
  const historyRef = useRef(new EditHistory(tokenize(song.music)));
  const [cells, setCells] = useState<Cell[]>(() => historyRef.current.cells);
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start again when a different song is opened.
  useEffect(() => {
    const fresh = tokenize(song.music);
    historyRef.current.reset(fresh);
    setCells(fresh);
    setCursor(0);
    setDraft('');
    setDirty(false);
  }, [song]);

  const commit = useCallback((label: string, next: Cell[], coalesce = false) => {
    setCells(historyRef.current.apply(label, next, coalesce));
    setDirty(true);
  }, []);

  // The model is rebuilt on every edit so the beat counts and warnings shown
  // are the ones the player would actually use.
  const model = useMemo(() => {
    try {
      return buildSongModel({ ...song, cells, music: toPayload(cells) });
    } catch {
      return null;
    }
  }, [song, cells]);

  const rows = useMemo(() => {
    const out: Cell[][] = [];
    for (let i = 0; i < cells.length; i += CELLS_PER_ROW) {
      out.push(cells.slice(i, i + CELLS_PER_ROW));
    }
    return out;
  }, [cells]);

  const fitRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(28);

  useLayoutEffect(() => {
    const element = fitRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const width =
        box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
      const height =
        box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
      if (height <= 0 || width <= 0) return;
      const byHeight = height / (PAD * 2 + rows.length * SYSTEM);
      const byWidth = width / (CELLS_PER_ROW + PAD * 2);
      setCellPx(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.min(byHeight, byWidth))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows.length]);

  const move = useCallback(
    (delta: number) => {
      setCursor((c) => Math.max(0, Math.min(cells.length - 1, c + delta)));
      setDraft('');
    },
    [cells.length],
  );

  const commitDraft = useCallback(
    (advance: boolean) => {
      const text = draft.trim();
      if (text === '') {
        if (advance) move(1);
        return;
      }
      const chord = parseChordInput(text);
      if (!chord) return; // leave the draft in place so the typo can be fixed
      commit('Set chord', setChord(cells, cursor, chord));
      setDraft('');
      if (advance) move(1);
    },
    [draft, cells, cursor, commit, move],
  );

  // Keyboard: arrows navigate, typing edits, Ctrl+Z undoes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setCells(event.shiftKey ? historyRef.current.redo() : historyRef.current.undo());
        setDirty(true);
        return;
      }
      if (modifier) return;
      // Anything else while the chord box has focus belongs to the chord box.
      if (document.activeElement === inputRef.current && event.key.length === 1) return;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          move(-1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          move(CELLS_PER_ROW);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(-CELLS_PER_ROW);
          break;
        case 'Delete':
        case 'Backspace':
          if (document.activeElement === inputRef.current && draft !== '') return;
          event.preventDefault();
          commit('Clear cell', setChord(cells, cursor, null));
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cells, cursor, draft, move, commit, onClose]);

  const cell = cells[cursor];
  const openKind: OpenBarline = cell?.bars.includes('{')
    ? 'repeat'
    : cell?.bars.includes('[')
      ? 'double'
      : cell?.bars.includes('(')
        ? 'single'
        : 'none';
  const closeKind: CloseBarline = cell?.bars.includes('Z')
    ? 'final'
    : cell?.bars.includes('}')
      ? 'repeat'
      : cell?.bars.includes(']')
        ? 'double'
        : 'none';
  const section = cell?.annots.find((a) => SECTION.test(a))?.slice(1) ?? '';
  const meter = cell?.annots.find((a) => METER.test(a)) ?? '';
  const ending = cell?.annots.find((a) => ENDING.test(a))?.slice(1) ?? '';

  const warnings =
    model && model.warnings.length > 0 ? (
      <ul className="editor-warnings">
        {model.warnings.slice(0, 6).map((w, i) => (
          <li key={i}>
            {w.bar !== undefined ? `Bar ${w.bar + 1}: ` : ''}
            {w.message}
          </li>
        ))}
      </ul>
    ) : (
      <p className="editor-ok">
        {model ? `${model.bars.length} bars · no problems` : 'Chart cannot be read'}
      </p>
    );

  const panel = (
    <div className="editor-panel">
      <div className="editor-bar">
        <strong>Editing</strong>
        <input
          ref={inputRef}
          className="chord-input"
          value={draft}
          placeholder={`Cell ${cursor + 1} — type a chord`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft(true);
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              commitDraft(true);
            }
          }}
          aria-label="Chord for the selected cell"
        />
        <button type="button" onClick={() => commitDraft(false)} disabled={draft.trim() === ''}>
          Set
        </button>
        <button
          type="button"
          onClick={() => {
            setCells(historyRef.current.undo());
            setDirty(true);
          }}
          disabled={!historyRef.current.canUndo}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            setCells(historyRef.current.redo());
            setDirty(true);
          }}
          disabled={!historyRef.current.canRedo}
        >
          Redo
        </button>

        <span className="spacer-flex" />
        <button
          type="button"
          className="save"
          onClick={() => onSave(toPayload(cells))}
          disabled={!dirty}
        >
          {dirty ? 'Save' : 'Saved'}
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="editor-tools">
        <div className="tool">
          <span className="label">Bar opens</span>
          {OPEN_BARS.map(([kind, glyph]) => (
            <button
              type="button"
              key={kind}
              className={openKind === kind ? 'on' : ''}
              onClick={() => commit('Set barline', setOpenBarline(cells, cursor, kind))}
            >
              {glyph}
            </button>
          ))}
        </div>

        <div className="tool">
          <span className="label">closes</span>
          {CLOSE_BARS.map(([kind, glyph]) => (
            <button
              type="button"
              key={kind}
              className={closeKind === kind ? 'on' : ''}
              onClick={() => commit('Set barline', setCloseBarline(cells, cursor, kind))}
            >
              {glyph}
            </button>
          ))}
        </div>

        <div className="tool">
          <span className="label">Section</span>
          <select
            value={section}
            onChange={(e) =>
              commit(
                'Set section',
                setAnnotation(cells, cursor, SECTION, e.target.value ? `*${e.target.value}` : null),
              )
            }
          >
            <option value="">none</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="tool">
          <span className="label">Meter</span>
          <select
            value={meter}
            onChange={(e) =>
              commit('Set meter', setAnnotation(cells, cursor, METER, e.target.value || null))
            }
          >
            <option value="">—</option>
            {METERS.map((m) => (
              <option key={m} value={m}>
                {m === 'T12' ? '12/8' : `${m[1]}/${m[2]}`}
              </option>
            ))}
          </select>
        </div>

        <div className="tool">
          <span className="label">Ending</span>
          <select
            value={ending}
            onChange={(e) =>
              commit(
                'Set ending',
                setAnnotation(cells, cursor, ENDING, e.target.value ? `N${e.target.value}` : null),
              )
            }
          >
            <option value="">none</option>
            {['1', '2', '3'].map((n) => (
              <option key={n} value={n}>
                {n}.
              </option>
            ))}
          </select>
        </div>

        <div className="tool">
          <span className="label">Marks</span>
          {MARKS.map(([annot, title]) => {
            const Glyph = MARK_GLYPHS[annot];
            return (
              <button
                type="button"
                key={annot}
                title={title}
                className={cell?.annots.includes(annot) ? 'on' : ''}
                onClick={() => commit('Toggle mark', toggleAnnotation(cells, cursor, annot))}
              >
                {Glyph ? <Glyph /> : title.split(' ')[0]}
              </button>
            );
          })}
        </div>

        <div className="tool">
          <span className="label">Text</span>
          <input
            className="comment-input"
            value={cell?.comments[0] ?? ''}
            placeholder="D.C. al Fine…"
            onChange={(e) => commit('Set text', setComment(cells, cursor, e.target.value), true)}
          />
        </div>

        <div className="tool">
          <span className="label">Cells</span>
          <button type="button" onClick={() => commit('Insert cell', insertCell(cells, cursor))}>
            insert
          </button>
          <button type="button" onClick={() => commit('Delete cell', deleteCell(cells, cursor))}>
            delete
          </button>
          <button type="button" onClick={() => commit('Add row', appendRow(cells))}>
            + row
          </button>
          <button
            type="button"
            onClick={() => commit('Set spacer', setSpacer(cells, cursor, (cell?.spacer ?? 0) + 1))}
            title="Push this row down"
          >
            ↓
          </button>
        </div>
      </div>

      {warnings}
    </div>
  );

  return (
    <div className="editor" ref={fitRef}>
      {panelHost ? createPortal(panel, panelHost) : panel}

      <div className="cellgrid" style={{ '--cell': `${cellPx}px` } as CSSProperties}>
        {rows.map((row, r) => (
          <div className="cellrow" key={r}>
            {row.map((c, i) => {
              const index = r * CELLS_PER_ROW + i;
              const classes = ['gridcell'];
              if (index === cursor) classes.push('selected');
              if (c.bars.includes('(')) classes.push('bar-single');
              if (c.bars.includes('[')) classes.push('bar-double');
              if (c.bars.includes('{')) classes.push('bar-repeat');
              if (c.bars.includes(']') || c.bars.includes('}') || c.bars.includes('Z')) {
                classes.push('bar-close');
              }
              return (
                <button
                  type="button"
                  className={classes.join(' ')}
                  key={index}
                  onClick={() => {
                    setCursor(index);
                    setDraft('');
                    inputRef.current?.focus();
                  }}
                >
                  <span className="gridmarks">{annotationNodes(c.annots)}</span>
                  <span className="gridchord">
                    {c.chord?.alternate ? (
                      <span className="gridalt">
                        <Symbol
                          root={c.chord.alternate.note}
                          quality={c.chord.alternate.modifiers}
                          bass={
                            c.chord.alternate.over
                              ? c.chord.alternate.over.note + c.chord.alternate.over.modifiers
                              : null
                          }
                        />
                      </span>
                    ) : null}
                    {cellLabel(c)}
                  </span>
                  {c.comments.length > 0 ? <span className="gridcomment">{c.comments[0]}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

    </div>
  );
}
