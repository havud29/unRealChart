import { describe, expect, it } from 'vitest';
import { buildSongModel } from '@unrealchart/song-model';
import { serialize } from '@unrealchart/ireal-format';
import { NEW_CHART_KEY, NEW_CHART_TITLE, blankSong } from '../src/newChart.js';

/**
 * A new chart has to be a real song, not a special case.
 *
 * It goes through the parser like an imported one, so what matters is that
 * what comes out the far side is a chart the rest of the app can treat exactly
 * like any other: it builds a model with something to click, it reserves room
 * to write in, and it round-trips back to the format so saving it keeps it.
 */
describe('a new chart', () => {
  const song = blankSong();

  it('is titled, and in a key and style that can be played', () => {
    expect(song.title).toBe(NEW_CHART_TITLE);
    expect(song.key).toBe(NEW_CHART_KEY);
    expect(song.style).toBe('Medium Swing');
  });

  it('reserves two systems of bars to write in', () => {
    // 8 bars of 4 cells: the space exists in the format from the start, even
    // though the model only draws the bars that have something in them.
    expect(song.cells.length).toBe(32);
  });

  it('draws something, so the page is never blank and unclickable', () => {
    const model = buildSongModel(song);
    expect(model.bars.length).toBeGreaterThan(0);
    expect(model.bars[0]?.chords[0]?.root).toBe(NEW_CHART_KEY);
    expect(model.bars[0]?.time.beats).toBe(4);
  });

  it('takes a title', () => {
    expect(blankSong('Blues for Ada').title).toBe('Blues for Ada');
  });

  it('round-trips through the format, so saving it keeps it', () => {
    const music = serialize(song.cells);
    expect(music).toContain('T44');
    expect(music).toContain(NEW_CHART_KEY);
    // The reserved bars survive serialisation rather than being trimmed away.
    expect(music.split('|').length).toBeGreaterThan(4);
  });
});
