import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parsePlaylist } from '@unrealchart/ireal-format';
import { buildSongModel, transposeModel } from '@unrealchart/song-model';
import { Chart, sheetMetrics } from '../src/Chart.js';

/**
 * Smoke test for the chart renderer: a real parsed chart in, real markup out.
 * Cheap insurance that the grid keeps drawing what the model hands it.
 */

const MUSIC = '*A{T44C^7   |A-7 D-7 |G7/B   |N1C6(A-7) }|N2fC6   Z';

/**
 * What a reader sees, with the markup taken out.
 *
 * A chord symbol is three spans — root, accidental, quality — so asserting on
 * the HTML string would test the nesting rather than the reading.
 */
function text(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function chartModel(music = MUSIC) {
  const record = ['Test Chart', 'Anon', 'Medium Swing', 'C', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0]!;
  return buildSongModel(song);
}

describe('Chart', () => {
  const model = chartModel();
  const html = renderToStaticMarkup(<Chart model={model} />);

  it('puts title, style and composer at the top of the page', () => {
    expect(html).toContain('Test Chart');
    expect(html).toContain('(Medium Swing)');
    expect(html).toContain('Anon');
  });

  it('draws the chart as a page, not as a panel that stretches', () => {
    // The whole page is sized from one number, so its proportions cannot
    // drift apart the way they do when widths and heights are set separately.
    expect(html).toMatch(/class="[^"]*page[^"]*"/);
    expect(html).toContain('--cell:');
  });

  it('draws the time signature in the chart rather than in a header line', () => {
    expect(html).toContain('class="meter"');
    expect(html).toContain('4/4');
  });

  it('restates the meter only where it changes', () => {
    const changing = renderToStaticMarkup(
      <Chart model={chartModel('[T44C^7   |F7   |T34G7   |A-7   Z')} />,
    );
    expect((changing.match(/class="meter"/g) ?? []).length).toBe(2);
    expect((html.match(/class="meter"/g) ?? []).length).toBe(1);
  });

  it('writes accidentals as signs and draws the major triangle', () => {
    const bb = renderToStaticMarkup(<Chart model={chartModel('[T44Bb^7   Z')} />);
    expect(bb).toContain('♭');
    expect(bb).toContain('data-glyph="triangle"');
  });

  it('renders chord symbols with jazz glyphs', () => {
    // The major triangle is drawn, not typed: the chart face has no glyph for
    // it, so a text △ would drop to the system font mid-symbol.
    expect(html).toContain('data-glyph="triangle"');
    expect(text(html)).toContain('A-7');
    expect(text(html)).toContain('/B'); // slash chord bass note
  });

  it('draws the diminished circle too, and only where it belongs', () => {
    expect(renderToStaticMarkup(<Chart model={chartModel('[T44Co7   Z')} />)).toContain(
      'data-glyph="dim"',
    );
    // `sus` and `add` contain no diminished chord, whatever letters they share.
    const sus = renderToStaticMarkup(<Chart model={chartModel('[T44C7sus   |Cadd9   Z')} />);
    expect(sus).not.toContain('data-glyph="dim"');
  });

  it('keeps the accidentals as text, which the chart face does carry', () => {
    const flats = renderToStaticMarkup(<Chart model={chartModel('[T44Bb7   |F#-7   Z')} />);
    expect(flats).toContain('♭');
    expect(flats).toContain('♯');
  });

  it('renders the section marker and ending brackets', () => {
    expect(html).toContain('>A<');
    expect(html).toContain('in-ending');
  });

  it('renders alternate chords and fermatas', () => {
    expect(html).toContain('class="alternate"');
    // The fermata is a drawn glyph now, so assert the accessible name rather
    // than a class — that is what a reader actually gets.
    expect(html).toContain('aria-label="Fermata"');
    expect(html).toContain('<title>Fermata</title>');
  });

  it('draws the musical signs rather than relying on installed fonts', () => {
    const marked = renderToStaticMarkup(<Chart model={chartModel('[T44SC^7   |QF7   Z')} />);
    expect(marked).toContain('aria-label="Segno"');
    expect(marked).toContain('aria-label="Coda"');
    // No Unicode musical symbols, which a phone usually has no glyph for.
    expect(marked).not.toContain('\u{1D10B}');
    expect(marked).not.toContain('\u{1D10C}');
  });

  it('sets chords in one plain face', () => {
    // One face, no picker: the copyist script has been removed, so a chart
    // cannot be set in anything but readable text.
    expect(html).toContain('class="page"');
    expect(html).not.toContain('face-');
  });

  it('draws barlines on the bar, not as bars', () => {
    expect(html).toContain('open-repeat');
    expect(html).toContain('close-repeat');
    expect(html).toContain('close-final');
  });

  it('draws one element per bar, sized by how many cells it occupied', () => {
    expect(html.match(/class="bar /g)?.length).toBe(model.bars.length);
    expect(html).toContain('grid-column:span 4');
  });

  it('shows resolved beats when asked', () => {
    const withBeats = renderToStaticMarkup(<Chart model={model} showBeats />);
    expect(withBeats).toContain('class="beats"');
    expect(html).not.toContain('class="beats"');
  });

  it('renders a transposed model', () => {
    const up = renderToStaticMarkup(<Chart model={transposeModel(model, 2)} />);
    expect(up).toContain('>D<');
    expect(text(up)).toContain('B-7');
    expect(up).toContain('data-glyph="triangle"');
  });
});

describe('the sheet', () => {
  /**
   * The page is meant to read as a sheet of paper. Paper does not change shape
   * because the song is short, so every chart that fits on one page gets the
   * same rectangle -- only the systems inside it move.
   */
  it('keeps one shape for every chart that fits on a page', () => {
    const heights = new Set<number>();
    for (let systems = 1; systems <= 12; systems++) {
      heights.add(Number(sheetMetrics(systems).page.toFixed(4)));
    }
    expect(heights.size).toBe(1);
  });

  it('holds the proportions measured off the Mac app', () => {
    // 17.2 cells wide over the sheet's height, against a measured 0.828.
    const ratio = 17.2 / sheetMetrics(8).page;
    expect(ratio).toBeGreaterThan(0.81);
    expect(ratio).toBeLessThan(0.85);
  });

  it('spreads a short chart out and tightens a long one', () => {
    expect(sheetMetrics(3).system).toBeGreaterThan(sheetMetrics(8).system);
    expect(sheetMetrics(12).system).toBeLessThan(sheetMetrics(8).system);
  });

  it('grows the sheet only past the twelve systems iReal Pro allows', () => {
    expect(sheetMetrics(16).page).toBeGreaterThan(sheetMetrics(12).page);
  });
});

describe('the play-from cue', () => {
  const model = chartModel();

  /**
   * Clicking a bar while stopped marks where play will start. It has to be
   * visible before anything is playing -- that is the whole point of it -- and
   * it has to get out of the way once the playhead exists, or two marks
   * compete to say where we are.
   */
  it('marks the cued bar while nothing is playing', () => {
    const html = renderToStaticMarkup(<Chart model={model} cuedBar={2} />);
    expect(html).toContain('cue-mark');
    expect((html.match(/class="[^"]*cued/g) ?? []).length).toBe(1);
  });

  it('hides the cue once the playhead is on the chart', () => {
    const html = renderToStaticMarkup(<Chart model={model} cuedBar={2} playingBar={0} />);
    expect(html).not.toContain('cue-mark');
    expect(html).toContain('playing');
  });

  it('draws no cue when none is set', () => {
    expect(renderToStaticMarkup(<Chart model={model} />)).not.toContain('cue-mark');
  });
});

describe('chord symbols, as iReal Pro sets them', () => {
  const render = (music: string) => renderToStaticMarkup(<Chart model={chartModel(music)} />);

  it('stacks the bass under the quality instead of running it on inline', () => {
    // A bar of slash chords has to fit the bar. Inline, it does not.
    const html = render('[T44F^7/C G-7/C F^7/C D-7 Z');
    expect(html).toContain('c-tail');
    expect(html).toContain('c-bass');
    expect((html.match(/class="c-bass"/g) ?? []).length).toBe(3);
  });

  it('sets every part of the tail at one size', () => {
    // Quality and bass share .c-tail, so they cannot drift apart.
    const html = render('[T44F^7/C   Z');
    const tail = html.slice(html.indexOf('c-tail'));
    expect(tail.indexOf('c-qual')).toBeGreaterThan(-1);
    expect(tail.indexOf('c-bass')).toBeGreaterThan(-1);
  });

  it('draws a six-nine chord as a fraction', () => {
    expect(render('[T44Bb69   Z')).toContain('c-sixnine');
  });

  it('leaves other numbers alone', () => {
    // 13b9 has no six-nine in it, and must not grow one.
    expect(render('[T44D13b9   Z')).not.toContain('c-sixnine');
  });
});

describe('endings', () => {
  // Two bars of a first ending, then a second ending.
  const music = '[T44C^7   |N1F7   |G7   }|N2A-7   Z';

  it('numbers an ending once, at the bar it opens on', () => {
    const html = renderToStaticMarkup(<Chart model={chartModel(music)} />);
    // Three bars are inside endings, but only two brackets open.
    expect((html.match(/class="ending"/g) ?? []).length).toBe(2);
    expect((html.match(/in-ending/g) ?? []).length).toBeGreaterThan(2);
  });

  it('marks where each bracket opens', () => {
    const html = renderToStaticMarkup(<Chart model={chartModel(music)} />);
    expect((html.match(/ending-start/g) ?? []).length).toBe(2);
  });
});

describe('chord type size', () => {
  it('sets every chord at one size, however many share a bar', () => {
    // A bar of one and a bar of four, on the same page. Nothing may scale them
    // apart: only the chart's own small-chord marker changes size.
    const html = renderToStaticMarkup(
      <Chart model={chartModel('[T44F^7   |G-7 C7 A-7 D7 Z')} />,
    );
    expect(html).not.toContain('--chord-scale');
    expect(html).not.toContain('chord-scale');
  });

  it('still honours a chord the chart marks small', () => {
    const html = renderToStaticMarkup(<Chart model={chartModel('[T44sC^7 A-7 D-7 G7 Z')} />);
    expect(html).toContain('chord small');
  });
});
