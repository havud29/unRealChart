import { describe, expect, it } from 'vitest';
import { toMusicXml } from '../src/musicxml.js';
import { model } from './helpers.js';

/**
 * XML is checked structurally rather than by string match wherever it matters,
 * so formatting changes do not break the suite but a wrong `kind` does. Node 20
 * has no DOMParser, and two small readers cover everything asserted here.
 */
const xmlOf = (music: string, meta: Parameters<typeof model>[1] = {}) =>
  toMusicXml(model(music, meta));

/** Every occurrence of an element's text, whether or not it carries attributes. */
function values(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]!);
}

/** Attribute values for a tag, e.g. kind text="...". */
function attrs(xml: string, tag: string, attr: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, 'g'))].map((m) => m[1]!);
}

describe('document shape', () => {
  const xml = xmlOf('*A[T44C^7   |A-7 D-7 |G7   |C6   Z');

  it('declares itself as MusicXML', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<!DOCTYPE score-partwise');
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml.trimEnd().endsWith('</score-partwise>')).toBe(true);
  });

  it('opens and closes every element it opens', () => {
    const opened = [...xml.matchAll(/<([a-z-]+)(?:\s[^>]*)?>/g)].map((m) => m[1]!);
    const closed = [...xml.matchAll(/<\/([a-z-]+)>/g)].map((m) => m[1]!);
    const selfClosing = [...xml.matchAll(/<([a-z-]+)[^>]*\/>/g)].map((m) => m[1]!);

    const counts = new Map<string, number>();
    for (const tag of opened) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    for (const tag of selfClosing) counts.set(tag, (counts.get(tag) ?? 0) - 1);
    for (const tag of closed) counts.set(tag, (counts.get(tag) ?? 0) - 1);

    const unbalanced = [...counts.entries()].filter(([, n]) => n !== 0);
    expect(unbalanced).toEqual([]);
  });

  it('carries the title and composer', () => {
    expect(values(xml, 'work-title')).toEqual(['Fixture']);
    expect(values(xml, 'creator')).toEqual(['Anon']);
  });

  it('writes one measure per bar', () => {
    expect(attrs(xml, 'measure', 'number')).toEqual(['1', '2', '3', '4']);
  });

  it('states divisions, key, time and clef once at the top', () => {
    expect(values(xml, 'divisions')).toEqual(['24']);
    expect(values(xml, 'fifths')).toHaveLength(1);
    expect(values(xml, 'sign')).toEqual(['G']);
  });
});

describe('harmony', () => {
  it('names the MusicXML kind for each quality', () => {
    const cases: Array<[string, string]> = [
      ['C^7', 'major-seventh'],
      ['C7', 'dominant'],
      ['C-7', 'minor-seventh'],
      ['C-7b5', 'half-diminished'],
      ['Ch7', 'half-diminished'],
      ['Co7', 'diminished-seventh'],
      ['Co', 'diminished'],
      ['C+', 'augmented'],
      ['C6', 'major-sixth'],
      ['C-6', 'minor-sixth'],
      ['Csus', 'suspended-fourth'],
      ['C13', 'dominant-13th'],
      ['C^9', 'major-ninth'],
      ['C-^7', 'major-minor'],
      ['C5', 'power'],
      ['C', 'major'],
    ];
    for (const [symbol, kind] of cases) {
      const xml = xmlOf(`[T44${symbol}   Z`);
      expect(values(xml, 'kind').length, symbol).toBeGreaterThan(0);
      expect(xml, symbol).toContain(`>${kind}</kind>`);
    }
  });

  it('keeps the written symbol as kind text', () => {
    expect(attrs(xmlOf('[T44F#-7b5   Z'), 'kind', 'text')).toEqual(['F#-7b5']);
  });

  it('writes the root with its accidental', () => {
    const xml = xmlOf('[T44Bb^7   |F#-7   Z');
    expect(values(xml, 'root-step')).toEqual(['B', 'F']);
    expect(values(xml, 'root-alter')).toEqual(['-1', '1']);
  });

  it('writes a slash chord bass', () => {
    const xml = xmlOf('[T44C^7/G   |F-7/Bb   Z');
    expect(values(xml, 'bass-step')).toEqual(['G', 'B']);
    expect(values(xml, 'bass-alter')).toEqual(['-1']);
  });

  it('lists alterations as degrees', () => {
    const xml = xmlOf('[T44G7b9#11   Z');
    expect(values(xml, 'degree-value')).toEqual(['9', '11']);
    expect(values(xml, 'degree-alter')).toEqual(['-1', '1']);
  });

  it('expands 7alt into its altered tensions', () => {
    const xml = xmlOf('[T44G7alt   Z');
    expect(values(xml, 'degree-value').sort()).toEqual(['5', '9', '9']);
  });

  it('writes N.C. as no harmony', () => {
    expect(xmlOf('[T44n   Z')).toContain('>none</kind>');
  });
});

describe('rhythm', () => {
  it('gives a whole bar to a single chord', () => {
    // 4 quarters at 24 divisions each.
    expect(values(xmlOf('[T44C^7   Z'), 'duration')).toEqual(['96']);
    expect(values(xmlOf('[T44C^7   Z'), 'type')).toEqual(['whole']);
  });

  it('splits a bar between two chords', () => {
    expect(values(xmlOf('[T44A-7 D-7 Z'), 'duration')).toEqual(['48', '48']);
    expect(values(xmlOf('[T44A-7 D-7 Z'), 'type')).toEqual(['half', 'half']);
  });

  it('scales by meter', () => {
    // 3/4: three quarters.
    expect(values(xmlOf('[T34C^7   Z'), 'duration')).toEqual(['72']);
    // 6/8: six eighths, which is three quarters.
    expect(values(xmlOf('[T68C^7   Z'), 'duration')).toEqual(['72']);
  });

  it('fills every measure to its meter', () => {
    for (const meter of ['24', '34', '44', '54', '68', '78', '98', '12', '22']) {
      const m = model(`[T${meter}C^7   |F7 G7 |A7   Z`);
      const xml = toMusicXml(m);
      const durations = values(xml, 'duration').map(Number);
      const perBar = m.bars[0]!.time.beats * (4 / m.bars[0]!.time.beatType) * 24;

      let total = 0;
      const sums: number[] = [];
      let i = 0;
      for (const bar of m.bars) {
        let sum = 0;
        for (let c = 0; c < bar.chords.length; c++) sum += durations[i++]!;
        sums.push(sum);
        total += sum;
      }
      for (const sum of sums) expect(sum, `meter ${meter}`).toBeCloseTo(perBar, 6);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('writes dotted notes where the model asks for them', () => {
    // A 3/4 bar split in two gives each chord a beat and a half.
    const xml = xmlOf('[T34G7 A7 Z');
    expect(values(xml, 'type')).toEqual(['quarter', 'quarter']);
    expect(xml.match(/<dot\/>/g) ?? []).toHaveLength(2);
  });

  it('uses slash noteheads, since this is a chart not an engraving', () => {
    expect(values(xmlOf('[T44C^7   Z'), 'notehead')).toEqual(['slash']);
  });

  it('marks fermatas', () => {
    expect(xmlOf('[T44fC^7   Z')).toContain('<fermata');
  });
});

describe('structure', () => {
  it('writes repeat barlines', () => {
    const xml = xmlOf('{T44C7   |F7   }');
    expect(xml).toContain('<repeat direction="forward"/>');
    expect(xml).toContain('<repeat direction="backward"/>');
  });

  it('writes endings', () => {
    const xml = xmlOf('{T44C7   |N1F7   }|N2G7   Z');
    expect(attrs(xml, 'ending', 'number')).toContain('1');
    expect(attrs(xml, 'ending', 'number')).toContain('2');
    expect(attrs(xml, 'ending', 'type')).toContain('start');
    expect(attrs(xml, 'ending', 'type')).toContain('stop');
  });

  it('writes sections as rehearsal marks', () => {
    expect(values(xmlOf('*A[T44C7   ]*B[F7   Z'), 'rehearsal')).toEqual(['A', 'B']);
  });

  it('writes segno, coda and text directions', () => {
    const xml = xmlOf('[T44SC7   |QF7   |G7<D.C. al Fine>   Z');
    expect(xml).toContain('<segno/>');
    expect(xml).toContain('<coda/>');
    expect(values(xml, 'words')).toContain('D.C. al Fine');
  });

  it('writes a time change mid-chart', () => {
    const xml = xmlOf('[T44C7   |T34F7   Z');
    expect(values(xml, 'beats')).toEqual(['4', '3']);
  });

  it('writes the final barline', () => {
    expect(xmlOf('[T44C7   Z')).toContain('<bar-style>light-heavy</bar-style>');
  });

  it('records the key signature', () => {
    expect(values(xmlOf('[T44C7   Z', { key: 'Eb' }), 'fifths')).toEqual(['-3']);
    expect(values(xmlOf('[T44C7   Z', { key: 'F-' }), 'fifths')).toEqual(['-4']);
    expect(values(xmlOf('[T44C7   Z', { key: 'F-' }), 'mode')).toEqual(['minor']);
  });
});

describe('safety', () => {
  it('escapes text rather than letting it break the document', () => {
    const xml = toMusicXml({
      ...model('[T44C7   Z'),
      meta: { ...model('[T44C7   Z').meta, title: 'Tune <&> "quoted"' },
    });
    expect(xml).toContain('&lt;&amp;&gt;');
    expect(xml).not.toContain('<&>');
  });

  it('handles an empty chart without producing invalid XML', () => {
    const empty = { ...model('[T44C7   Z'), bars: [] };
    const xml = toMusicXml(empty);
    expect(xml).toContain('</score-partwise>');
    expect(xml).not.toContain('<measure');
  });
});
