import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { Cell, Song } from '@unrealchart/ireal-format';
import { chordToText, serialize, tokenize } from '@unrealchart/ireal-format';
import {
  CELLS_PER_ROW,
  EditHistory,
  ENDING,
  METER,
  SECTION,
  appendRow,
  buildSongModel,
  clearCells,
  copyCells,
  deleteCells,
  insertCell,
  parseChordInput,
  pasteCells,
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

/**
 * A cell's chord as text for the edit box.
 *
 * Without the alternate and the private note: neither can be typed back in, so
 * showing them would invite an edit that cannot survive the round trip. They
 * are preserved on commit instead -- see `commitDraft`.
 */
export function chordTextOf(cell: Cell | undefined): string {
  if (!cell?.chord) return '';
  return chordToText({ ...cell.chord, alternate: null, text: null });
}

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

/**
 * Cells on the clipboard.
 *
 * Kept outside the editor so a copy outlives it: carrying a progression from
 * one chart into another is half the point. The system clipboard gets the
 * cells' payload text too, and a paste is only taken as these cells when that
 * text comes back — copy something else in between and that is what pastes.
 */
let clipboard: { cells: Cell[]; text: string } | null = null;

function isClipboardText(text: string): boolean {
  if (!clipboard) return false;
  return text === clipboard.text || (text.trim() !== '' && text.trim() === clipboard.text.trim());
}

/** Every index from one to the other, in order, whichever comes first. */
function span(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(i);
  return out;
}

export interface EditorProps {
  song: Song;
  /**
   * Save the chart. `payload` is null when only the title changed, so a rename
   * leaves the music exactly as it was written.
   */
  onSave: (payload: string | null, title: string) => void;
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
  const [title, setTitle] = useState(song.title);
  /*
   * The picked cells, in chart order, always including the cursor. The anchor
   * is where a Shift-extended range starts from: the last cell picked on its
   * own.
   */
  const [selection, setSelection] = useState<number[]>([0]);
  const anchorRef = useRef(0);
  const [hasClip, setHasClip] = useState(clipboard !== null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start again when a different song is opened.
  useEffect(() => {
    const fresh = tokenize(song.music);
    historyRef.current.reset(fresh);
    setCells(fresh);
    setCursor(0);
    setDraft(chordTextOf(fresh[0]));
    setDirty(false);
    setTitle(song.title);
    setSelection([0]);
    anchorRef.current = 0;
  }, [song]);

  // Undo can shorten the chart from under the cursor and the selection.
  useEffect(() => {
    const last = Math.max(0, cells.length - 1);
    setCursor((c) => Math.min(c, last));
    setSelection((picked) => {
      const kept = picked.filter((i) => i <= last);
      return kept.length > 0 ? kept : [last];
    });
  }, [cells.length]);

  /*
   * Select the box's contents when the cursor lands on a cell.
   *
   * The chord is there to be changed, so typing should replace it rather than
   * append to it -- landing on `C-7` and typing `F` must give `F`, not `C-7F`.
   * Only when the box already has focus: moving with the arrow keys should not
   * steal focus from the grid.
   */
  useEffect(() => {
    if (document.activeElement === inputRef.current) inputRef.current?.select();
  }, [cursor]);

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

  const picked = useMemo(() => new Set(selection), [selection]);

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

  /** Move the cursor; with `extend`, the selection stretches from the anchor to it. */
  const move = useCallback(
    (delta: number, extend = false) => {
      const next = Math.max(0, Math.min(cells.length - 1, cursor + delta));
      setCursor(next);
      setDraft(chordTextOf(cells[next]));
      if (!extend) anchorRef.current = next;
      setSelection(span(anchorRef.current, next));
    },
    [cells, cursor],
  );

  /** A click picks one cell; Shift stretches from the anchor; Ctrl (⌘) adds or removes one. */
  const pick = useCallback(
    (index: number, how: 'only' | 'extend' | 'toggle') => {
      let next = index;
      if (how === 'extend') {
        setSelection(span(anchorRef.current, index));
      } else if (how === 'toggle' && selection.includes(index) && selection.length > 1) {
        // Dropping the cursor's own cell hands the cursor to one still picked.
        const rest = selection.filter((i) => i !== index);
        next = rest[rest.length - 1]!;
        anchorRef.current = next;
        setSelection(rest);
      } else if (how === 'toggle') {
        anchorRef.current = index;
        setSelection([...new Set([...selection, index])].sort((a, b) => a - b));
      } else {
        anchorRef.current = index;
        setSelection([index]);
      }
      setCursor(next);
      setDraft(chordTextOf(cells[next]));
    },
    [cells, selection],
  );

  /* Several cells at once. Each acts on the whole selection, one cell or many. */

  const copySelection = useCallback(() => {
    const copied = copyCells(cells, selection);
    clipboard = { cells: copied, text: serialize(copied) };
    setHasClip(true);
    return clipboard.text;
  }, [cells, selection]);

  const clearSelection = useCallback(() => {
    commit(selection.length > 1 ? 'Clear cells' : 'Clear cell', clearCells(cells, selection));
    setDraft('');
  }, [cells, selection, commit]);

  /** Paste over the chart from the first picked cell, then pick what landed. */
  const pasteClipboard = useCallback(() => {
    if (!clipboard || clipboard.cells.length === 0) return;
    const at = Math.min(...selection);
    const next = pasteCells(cells, at, clipboard.cells);
    commit('Paste', next);
    anchorRef.current = at;
    setSelection(span(at, at + clipboard.cells.length - 1));
    setCursor(at);
    setDraft(chordTextOf(next[at]));
  }, [cells, selection, commit]);

  /** Take the picked cells out of the chart, closing the gaps behind them. */
  const removeSelection = useCallback(() => {
    const next = deleteCells(cells, selection);
    commit(selection.length > 1 ? 'Delete cells' : 'Delete cell', next);
    const at = Math.max(0, Math.min(Math.min(...selection), next.length - 1));
    anchorRef.current = at;
    setSelection([at]);
    setCursor(at);
    setDraft(chordTextOf(next[at]));
  }, [cells, selection, commit]);

  /** Copy for a button press: no clipboard event to write into, so ask the browser. */
  const copyToSystem = useCallback(
    (cut: boolean) => {
      const text = copySelection();
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      if (cut) clearSelection();
    },
    [copySelection, clearSelection],
  );

  const commitDraft = useCallback(
    (advance: boolean) => {
      const text = draft.trim();
      const existing = cells[cursor]?.chord ?? null;

      // The box now shows what is there, so emptying it is a deliberate
      // deletion rather than the no-op it was when the box always started
      // blank.
      if (text === '') {
        if (existing) commit('Clear chord', setChord(cells, cursor, null));
        if (advance) move(1);
        return;
      }

      const chord = parseChordInput(text);
      if (!chord) return; // leave the draft in place so the typo can be fixed

      /*
       * Keep what the box cannot show.
       *
       * An alternate chord and the writer's own `*note*` are not part of what
       * is typed here and cannot be typed back in, so replacing the chord
       * wholesale would delete them without saying so -- and with the chord
       * pre-filled, pressing Enter without changing anything would be enough
       * to do it. They are carried across unless the typed chord names its own.
       */
      const merged =
        chord.alternate === null && chord.text === null && existing
          ? { ...chord, alternate: existing.alternate, text: existing.text }
          : chord;

      commit('Set chord', setChord(cells, cursor, merged));
      if (advance) move(1);
      else setDraft(chordTextOf({ ...cells[cursor]!, chord: merged }));
    },
    [draft, cells, cursor, commit, move],
  );

  /*
   * Whether a key belongs to the grid or to the text in the chord box.
   *
   * The box has focus nearly all the time, so "is the box focused" cannot be
   * the test. The box owns its keys only while it holds text of the user's
   * own: once they have typed, Ctrl+C copies what they typed. While it still
   * shows the cell's chord untouched, or several cells are picked, there is no
   * text to act on, and Ctrl+C means the cells.
   */
  const gridOwns = useCallback(
    (target: EventTarget | null) =>
      target !== inputRef.current || selection.length > 1 || draft === chordTextOf(cells[cursor]),
    [selection, draft, cells, cursor],
  );

  // Keyboard: arrows navigate (Shift extends), typing edits, Ctrl+Z undoes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setCells(event.shiftKey ? historyRef.current.redo() : historyRef.current.undo());
        setDirty(true);
        return;
      }

      // The other fields -- a cell's text, the dropdowns -- keep their own keys.
      // Backspace in the text box used to clear the cell's chord, not a letter.
      const target = event.target as HTMLElement | null;
      const inBox = target === inputRef.current;
      if (!inBox && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (modifier) {
        const key = event.key.toLowerCase();
        if (key === 'a' && gridOwns(target)) {
          event.preventDefault();
          anchorRef.current = 0;
          setSelection(span(0, cells.length - 1));
        }
        // In the chord box, copy and paste arrive as clipboard events, which
        // can read and write the system clipboard -- see below. Anywhere else
        // there may be no such event at all, so the keys are taken here.
        if (!inBox && (key === 'c' || key === 'x')) {
          event.preventDefault();
          copyToSystem(key === 'x');
        }
        if (!inBox && key === 'v' && clipboard) {
          event.preventDefault();
          pasteClipboard();
        }
        return;
      }
      // Anything else typed while the chord box has focus belongs to the chord box.
      if (inBox && event.key.length === 1) return;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          move(1, event.shiftKey);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          move(-1, event.shiftKey);
          break;
        case 'ArrowDown':
          event.preventDefault();
          move(CELLS_PER_ROW, event.shiftKey);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(-CELLS_PER_ROW, event.shiftKey);
          break;
        case 'Delete':
        case 'Backspace':
          if (inBox && selection.length === 1 && draft !== '') return;
          event.preventDefault();
          clearSelection();
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
  }, [cells, selection, draft, move, gridOwns, copyToSystem, clearSelection, pasteClipboard, onClose]);

  // Copy, cut and paste from the chord box, when the cells own them.
  useEffect(() => {
    const fromBox = (event: ClipboardEvent) =>
      event.target === inputRef.current && gridOwns(event.target);
    const onCopy = (event: ClipboardEvent) => {
      if (!fromBox(event) || !event.clipboardData) return;
      event.preventDefault();
      event.clipboardData.setData('text/plain', copySelection());
      if (event.type === 'cut') clearSelection();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!fromBox(event)) return;
      // Text from anywhere else goes into the box, as typed.
      if (!isClipboardText(event.clipboardData?.getData('text/plain') ?? '')) return;
      event.preventDefault();
      pasteClipboard();
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, [gridOwns, copySelection, clearSelection, pasteClipboard]);

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

  // A blank title is not a rename: it keeps the one the chart has.
  const nextTitle = title.trim() || song.title;
  const changed = dirty || nextTitle !== song.title;

  const panel = (
    <div className="editor-panel">
      <div className="tool">
        <span className="label">Title</span>
        <input
          className="title-input"
          value={title}
          placeholder={song.title}
          aria-label="Chart title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Its keys are its own -- Ctrl+Z here undoes typing, not the grid.
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              inputRef.current?.focus();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setTitle(song.title);
            }
          }}
        />
      </div>

      <div className="editor-bar">
        <strong>Editing</strong>
        <input
          ref={inputRef}
          className="chord-input"
          value={draft}
          // Only seen on an empty cell now that the box carries the chord.
          placeholder={`Cell ${cursor + 1} — empty`}
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
          onClick={() => onSave(dirty ? toPayload(cells) : null, nextTitle)}
          disabled={!changed}
        >
          {changed ? 'Save' : 'Saved'}
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="editor-tools">
        <div className="tool">
          <span className="label">
            {selection.length > 1
              ? `${selection.length} cells selected`
              : 'Selection — Shift- or Ctrl-click to pick more'}
          </span>
          <button type="button" onClick={() => copyToSystem(false)} title="Copy (Ctrl+C)">
            copy
          </button>
          <button type="button" onClick={() => copyToSystem(true)} title="Cut the chords (Ctrl+X)">
            cut
          </button>
          <button
            type="button"
            onClick={pasteClipboard}
            disabled={!hasClip}
            title="Paste from the first selected cell on (Ctrl+V)"
          >
            paste
          </button>
          <button type="button" onClick={clearSelection} title="Clear the chords (Delete)">
            clear
          </button>
        </div>

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
          <button
            type="button"
            onClick={removeSelection}
            title="Remove the selected cells; the rest move back to fill the gap"
          >
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
              else if (picked.has(index)) classes.push('picked');
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
                  onClick={(e) => {
                    pick(index, e.shiftKey ? 'extend' : e.ctrlKey || e.metaKey ? 'toggle' : 'only');
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
