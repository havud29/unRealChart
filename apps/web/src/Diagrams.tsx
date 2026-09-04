import { useMemo, useState } from 'react';
import type { BarChord } from '@unrealchart/song-model';
import { GUITAR, chordNoteNames, fingerings, pitchClassesOf } from '@unrealchart/groove-engine';
import type { Instrument } from '@unrealchart/groove-engine';

/**
 * Chord diagrams for the chord that is sounding.
 *
 * Everything here is computed from the parsed intervals, so a chart full of
 * `7b9#11` gets the same treatment as one full of triads — which is the point,
 * since the awkward chords are the ones a player needs the picture for.
 */

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchClass(name: string | null): number | null {
  if (!name) return null;
  const match = /^([A-G])(bb|##|[b#])?/.exec(name);
  if (!match) return null;
  const base = PITCH[match[1]!]!;
  const accidental = match[2] ?? '';
  const shift =
    accidental === 'b' ? -1 : accidental === '#' ? 1 : accidental === 'bb' ? -2 : accidental === '##' ? 2 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

/** One octave of keys, with the black ones positioned between the white. */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK: Array<[number, number]> = [
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
];

function Keyboard({ classes, root }: { classes: Set<number>; root: number | null }) {
  const keyWidth = 26;
  const width = keyWidth * WHITE.length;

  return (
    <svg className="keyboard" viewBox={`0 0 ${width} 96`} role="img" aria-label="Piano voicing">
      {WHITE.map((pc, i) => (
        <rect
          key={pc}
          x={i * keyWidth}
          y={0}
          width={keyWidth - 1}
          height={94}
          rx={2}
          className={`key white${classes.has(pc) ? ' on' : ''}${pc === root ? ' root' : ''}`}
        />
      ))}
      {BLACK.map(([pc, after]) => (
        <rect
          key={pc}
          x={(after + 1) * keyWidth - keyWidth * 0.3}
          y={0}
          width={keyWidth * 0.6}
          height={58}
          rx={2}
          className={`key black${classes.has(pc) ? ' on' : ''}${pc === root ? ' root' : ''}`}
        />
      ))}
    </svg>
  );
}

function Fretboard({
  instrument,
  frets,
  position,
}: {
  instrument: Instrument;
  frets: Array<number | null>;
  position: number;
}) {
  const strings = instrument.tuning.length;
  const shown = 5;
  // Open shapes are drawn from the nut; anything else from its own position.
  const start = position <= 1 ? 0 : position - 1;

  const left = 16;
  const top = 16;
  const stringGap = 15;
  const fretGap = 20;
  const width = left + (strings - 1) * stringGap + 16;
  const height = top + shown * fretGap + 14;

  return (
    <svg className="fretboard" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fingering">
      {/* Nut, when the shape sits at the top of the neck. */}
      {start === 0 ? (
        <rect x={left - 1} y={top - 3} width={(strings - 1) * stringGap + 2} height={3} className="nut" />
      ) : (
        <text x={2} y={top + 12} className="position">
          {start + 1}
        </text>
      )}

      {Array.from({ length: shown + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          x1={left}
          y1={top + i * fretGap}
          x2={left + (strings - 1) * stringGap}
          y2={top + i * fretGap}
          className="fret"
        />
      ))}
      {Array.from({ length: strings }, (_, i) => (
        <line
          key={`s${i}`}
          x1={left + i * stringGap}
          y1={top}
          x2={left + i * stringGap}
          y2={top + shown * fretGap}
          className="string"
        />
      ))}

      {frets.map((fret, i) => {
        const x = left + i * stringGap;
        if (fret === null) {
          return (
            <text key={i} x={x} y={top - 5} className="mute">
              ×
            </text>
          );
        }
        if (fret === 0) {
          return <circle key={i} cx={x} cy={top - 8} r={3.5} className="open" />;
        }
        const row = fret - start;
        if (row < 1 || row > shown) return null;
        return <circle key={i} cx={x} cy={top + (row - 0.5) * fretGap} r={5.5} className="dot" />;
      })}
    </svg>
  );
}

export interface DiagramsProps {
  chord: BarChord | null;
  label: string;
}

export function Diagrams({ chord, label }: DiagramsProps) {
  const [instrumentId, setInstrumentId] = useState<'piano' | 'guitar'>('guitar');
  const [variant, setVariant] = useState(0);

  const root = pitchClass(chord?.root ?? null);
  const bass = pitchClass(chord?.bass ?? null);
  const quality = chord?.quality ?? '';

  const instrument: Instrument | null = instrumentId === 'guitar' ? GUITAR : null;

  const shapes = useMemo(() => {
    if (root === null || !instrument) return [];
    return fingerings(root, quality, instrument, { bass: bass ?? undefined, limit: 4 });
  }, [root, quality, bass, instrument]);

  const classes = useMemo(
    () => (root === null ? new Set<number>() : pitchClassesOf(root, quality, bass ?? undefined)),
    [root, quality, bass],
  );

  const shape = shapes[variant % Math.max(1, shapes.length)];

  return (
    <div className="diagrams">
      <div className="diagram-head">
        <span className="chordname">{label || '—'}</span>
        <div className="picker">
          {(['piano', 'guitar'] as const).map((id) => (
            <button
              type="button"
              key={id}
              className={instrumentId === id ? 'on' : ''}
              onClick={() => {
                setInstrumentId(id);
                setVariant(0);
              }}
            >
              {id}
            </button>
          ))}
        </div>
        {instrument && shapes.length > 1 ? (
          <button
            type="button"
            className="variant"
            onClick={() => setVariant((v) => (v + 1) % shapes.length)}
          >
            shape {(variant % shapes.length) + 1}/{shapes.length}
          </button>
        ) : null}
      </div>

      {root === null ? (
        <p className="diagram-empty">No chord here.</p>
      ) : instrument ? (
        shape ? (
          <Fretboard instrument={instrument} frets={shape.frets} position={shape.position} />
        ) : (
          <p className="diagram-empty">No playable shape for this chord.</p>
        )
      ) : (
        <div className="piano-diagram">
          <Keyboard classes={classes} root={bass ?? root} />
          {/* The keys say where the hand goes; the names say what it is. */}
          <p className="note-names">
            {chordNoteNames(root, quality, bass ?? undefined).map((name, i) => (
              <span className="note-name" key={i}>
                {name}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
