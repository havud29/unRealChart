/**
 * The handful of musical signs a chord chart needs.
 *
 * Drawn rather than set in a font. The full SMuFL music face is 225 KB for
 * about 1350 glyphs, of which a chart uses six — and the Unicode alternatives
 * depend on whatever the reader happens to have installed, which on a phone is
 * usually nothing. A few hundred bytes of path data renders the same everywhere
 * and needs no font to load first.
 *
 * Each glyph draws in `currentColor` and scales with the surrounding text.
 */

interface GlyphProps {
  /** Height in ems, relative to the surrounding type. */
  size?: number;
  title?: string;
}

function frame(
  name: string,
  size: number,
  viewBox: string,
  title: string | undefined,
  children: React.ReactNode,
) {
  return (
    <svg
      className="glyph-svg"
      // Names the sign for styling and for tests, which otherwise have to match
      // on path data to tell a triangle from a circle.
      data-glyph={name}
      viewBox={viewBox}
      style={{ height: `${size}em` }}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/**
 * The major-seventh triangle.
 *
 * No text face reliably carries it — nor the diminished circle — so
 * these two would drop to the system font in the middle of a chord symbol,
 * which reads as a mistake. Drawn, they sit in the script's own weight.
 */
export function Triangle({ size = 0.62, title }: GlyphProps) {
  return frame(
    'triangle',
    size,
    '0 0 20 18',
    title,
    <path
      d="M10 1.6 18.6 16.4H1.4Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />,
  );
}

/** The diminished circle. */
export function DimCircle({ size = 0.46, title }: GlyphProps) {
  return frame(
    'dim',
    size,
    '0 0 16 16',
    title,
    <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  );
}

/** Segno: the S with a slash and two dots that a D.S. sends you back to. */
export function Segno({ size = 1, title = 'Segno' }: GlyphProps) {
  return frame(
    'segno',
    size,
    '0 0 24 24',
    title,
    <>
      <path
        d="M16.5 6.2c-1-1.6-3-2.4-4.8-1.8-2 .7-2.9 2.9-1.9 4.5.7 1.1 2 1.5 3.4 1.9 1.9.5 3.6 1 4.4 2.4 1.2 2 .2 4.7-2.3 5.6-2.2.8-4.7-.1-5.8-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <line x1="6.5" y1="19" x2="18.5" y2="5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7.4" cy="8.4" r="1.35" fill="currentColor" />
      <circle cx="17.6" cy="15.6" r="1.35" fill="currentColor" />
    </>,
  );
}

/** Coda: the crossed circle marking where a jump lands. */
export function Coda({ size = 1, title = 'Coda' }: GlyphProps) {
  return frame(
    'coda',
    size,
    '0 0 24 24',
    title,
    <>
      <ellipse cx="12" cy="12" rx="5.4" ry="6.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <line x1="12" y1="2.4" x2="12" y2="21.6" stroke="currentColor" strokeWidth="1.7" />
      <line x1="2.6" y1="12" x2="21.4" y2="12" stroke="currentColor" strokeWidth="1.7" />
    </>,
  );
}

/** Fermata: hold this one as long as you like. */
export function Fermata({ size = 1, title = 'Fermata' }: GlyphProps) {
  return frame(
    'fermata',
    size,
    '0 0 24 16',
    title,
    <>
      <path
        d="M2 14C2 6.8 6.5 2.4 12 2.4S22 6.8 22 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="11.4" r="1.9" fill="currentColor" />
    </>,
  );
}

/** The single-bar repeat sign: a slash with a dot either side. */
export function RepeatBar({ size = 1, title = 'Repeat previous bar' }: GlyphProps) {
  return frame(
    'repeat-bar',
    size,
    '0 0 24 24',
    title,
    <>
      <line x1="7" y1="18" x2="17" y2="6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="7.6" cy="7.6" r="1.5" fill="currentColor" />
      <circle cx="16.4" cy="16.4" r="1.5" fill="currentColor" />
    </>,
  );
}

/** Two-bar repeat: the same sign with a 2 above it. */
export function RepeatTwoBars({ size = 1, title = 'Repeat previous two bars' }: GlyphProps) {
  return frame(
    'repeat-two-bars',
    size,
    '0 0 24 24',
    title,
    <>
      <line x1="7" y1="18" x2="17" y2="6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="7.6" cy="9.6" r="1.4" fill="currentColor" />
      <circle cx="16.4" cy="16.4" r="1.4" fill="currentColor" />
      <text x="12" y="6.5" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="700">
        2
      </text>
    </>,
  );
}
