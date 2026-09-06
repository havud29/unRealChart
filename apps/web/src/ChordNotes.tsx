import { useMemo } from 'react';
import type { SongModel } from '@unrealchart/song-model';
import { chordNoteNames } from '@unrealchart/groove-engine';
import { Symbol } from './Chart.js';

/**
 * Every chord in the song, with its notes, in the order it is played.
 *
 * The diagram dock answers "how do I play the chord under the playhead"; this
 * answers "what is in this tune". Reading down the column is reading the
 * harmony of the song, which is a different job from reading the chart and
 * wants a different shape: one chord to a line, spelled out.
 *
 * Bar numbers are carried so a line can be found on the page. Consecutive
 * repeats of the same chord are collapsed into a span -- a tune that holds
 * F^7 for four bars is one harmonic event, and printing it four times pushes
 * the next chord off the screen for nothing.
 */

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchClass(note: string | null): number | null {
  if (!note) return null;
  const base = PITCH[note[0]!.toUpperCase()];
  if (base === undefined) return null;
  const accidental = note.slice(1);
  const shift = (accidental.match(/#/g)?.length ?? 0) - (accidental.match(/b/g)?.length ?? 0);
  return (((base + shift) % 12) + 12) % 12;
}

interface Entry {
  /** The chord's parts, so it can be drawn as the page draws it. */
  root: string;
  quality: string;
  bass: string | null;
  /** Plain text, for the tooltip and for telling two entries apart. */
  label: string;
  notes: string[];
  /** First bar it sounds in, 1-based for reading. */
  fromBar: number;
  /** Last bar of an unbroken run of the same chord. */
  toBar: number;
  /** Index into `model.bars`, for jumping to it. */
  barIndex: number;
}

function collect(model: SongModel): Entry[] {
  const entries: Entry[] = [];

  for (const bar of model.bars) {
    for (const chord of bar.chords) {
      if (!chord.root) continue;
      const label = `${chord.root}${chord.quality}${chord.bass ? `/${chord.bass}` : ''}`;

      const previous = entries[entries.length - 1];
      if (previous?.label === label) {
        previous.toBar = bar.index + 1;
        continue;
      }

      const root = pitchClass(chord.root);
      if (root === null) continue;
      entries.push({
        root: chord.root,
        quality: chord.quality,
        bass: chord.bass,
        label,
        notes: chordNoteNames(root, chord.quality, pitchClass(chord.bass) ?? undefined),
        fromBar: bar.index + 1,
        toBar: bar.index + 1,
        barIndex: bar.index,
      });
    }
  }

  return entries;
}

export interface ChordNotesProps {
  model: SongModel | null;
  /** The bar sounding or cued, so the reader can see where they are. */
  activeBar?: number | null;
  /** Jump the player to a bar. */
  onPick?: (bar: number) => void;
}

export function ChordNotes({ model, activeBar = null, onPick }: ChordNotesProps) {
  const entries = useMemo(() => (model ? collect(model) : []), [model]);

  return (
    <aside className="chordnotes" aria-label="Chords and their notes">
      <p className="cn-head">
        Chords
        <span className="cn-count">{entries.length}</span>
      </p>

      {entries.length === 0 ? (
        <p className="cn-empty">No chords here.</p>
      ) : (
        <ol className="cn-list">
          {entries.map((entry, i) => {
            const active =
              activeBar !== null && activeBar >= entry.barIndex && activeBar < entry.barIndex + 1;
            return (
              <li key={`${entry.label}-${entry.fromBar}-${i}`}>
                <button
                  type="button"
                  className={`cn-row${active ? ' active' : ''}`}
                  onClick={() => onPick?.(entry.barIndex)}
                  title={`${entry.label} — bar ${entry.fromBar}`}
                >
                  <span className="cn-bar">
                    {entry.fromBar === entry.toBar
                      ? entry.fromBar
                      : `${entry.fromBar}–${entry.toBar}`}
                  </span>
                  {/* Drawn, not typed: the same symbol the page shows, with a
                      real triangle, circle and accidentals. */}
                  <span className="cn-chord">
                    <Symbol root={entry.root} quality={entry.quality} bass={entry.bass} />
                  </span>
                  <span className="cn-notes">{entry.notes.join(' ')}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
