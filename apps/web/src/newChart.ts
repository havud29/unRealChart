import type { Song } from '@unrealchart/ireal-format';
import { parsePlaylist } from '@unrealchart/ireal-format';

/**
 * A blank chart to start writing on.
 *
 * It is built by parsing a record rather than by constructing a `Song` object
 * directly, so a new chart takes exactly the same path through the format as
 * an imported one. There is no second way to make a song that could drift from
 * the first, and anything the parser normalises is normalised here too.
 *
 * The tonic in the first bar is not decoration. The musical model drops bars
 * that hold no chord -- in an imported chart those are the row padding at the
 * end of a system, and dropping them is right -- so a chart with nothing
 * written in it builds to zero bars and draws as an empty page with nothing to
 * click. One chord gives the chart somewhere to start; the remaining bars are
 * real cells in the format and appear as they are filled in. The editor shows
 * the whole grid either way, which is where a new chart opens.
 */

/** Bars of space a new chart reserves: two systems of four. */
const BARS = 8;

export const NEW_CHART_TITLE = 'Untitled';
export const NEW_CHART_KEY = 'C';
export const NEW_CHART_STYLE = 'Medium Swing';

export function blankSong(title: string = NEW_CHART_TITLE): Song {
  // Four cells to a bar, a barline between each, and a final double bar.
  //
  // The barline attaches to the cell after it rather than taking a cell of its
  // own, so a following bar is a `|` plus four cells of its own. The last bar
  // gets three, because the closing `Z` occupies the fourth rather than adding
  // one -- which is why it is written separately instead of in the repeat.
  const music =
    `[T44${NEW_CHART_KEY}   ` + `${'|    '.repeat(BARS - 2)}` + '|   Z';
  const record = [title, '', NEW_CHART_STYLE, NEW_CHART_KEY, 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0];
  if (!song) throw new Error('could not build a blank chart');
  return song;
}
