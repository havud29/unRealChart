import { describe, expect, it } from 'vitest';
import { extractPayload, findLinks, IRealFormatError, parsePlaylist, splitPayload } from '../src/index.js';

const htmlExport = (uri: string) => `<!DOCTYPE html>
<html><body style="color: rgb(230, 227, 218);">
<br/><h3><a href="${uri}">My Set</a> (2 Songs)</h3>
<p>1. One<br>2. Two<br></p>
<br/>Made with iReal Pro
</body></html>`;

describe('extractPayload', () => {
  it('pulls the URI out of an HTML export', () => {
    const uri = `irealb://${encodeURIComponent('Song=Composer==Style=C==1r34LbKcu7xyz==0=0===My Set')}`;
    const { scheme, payload } = extractPayload(htmlExport(uri));
    expect(scheme).toBe('irealb');
    expect(payload).toBe('Song=Composer==Style=C==1r34LbKcu7xyz==0=0===My Set');
  });

  it('accepts a bare pasted URI', () => {
    const { scheme, payload } = extractPayload('irealbook://Song=X=Style=C=n=T44C^7');
    expect(scheme).toBe('irealbook');
    expect(payload).toBe('Song=X=Style=C=n=T44C^7');
  });

  it('accepts a .txt dump with leading noise', () => {
    const { scheme } = extractPayload('exported 2026-01-01\n\nirealb://Song=A==B=C==1r34LbKcu7z');
    expect(scheme).toBe('irealb');
  });

  it('decodes percent-escaped chord text', () => {
    const { payload } = extractPayload(`irealb://${encodeURIComponent('A=B==C=D==1r34LbKcu7[C^7 |F#-7b5]')}`);
    expect(payload).toContain('[C^7 |F#-7b5]');
  });

  it('survives a malformed percent escape rather than losing the playlist', () => {
    const { payload } = extractPayload('irealb://Song%=A==B=C==1r34LbKcu7z');
    expect(payload).toContain('Song%');
  });

  it('throws when there is no iReal URI', () => {
    expect(() => extractPayload('<html>nothing here</html>')).toThrow(IRealFormatError);
  });
});

describe('splitPayload', () => {
  it('takes the trailing segment as the playlist name', () => {
    const { records, name } = splitPayload('A=1===B=2===My Playlist');
    expect(name).toBe('My Playlist');
    expect(records).toEqual(['A=1', 'B=2']);
  });

  it('leaves a single shared song unnamed', () => {
    const { records, name } = splitPayload('Song=Composer==Style=C==1r34LbKcu7z==0=0===');
    expect(name).toBeNull();
    expect(records).toHaveLength(1);
  });

  it('does not mistake a song record for a playlist name', () => {
    const { records, name } = splitPayload('A=1===B=2');
    expect(name).toBeNull();
    expect(records).toEqual(['A=1', 'B=2']);
  });

  it('handles an empty payload', () => {
    expect(splitPayload('')).toEqual({ records: [], name: null });
  });
});

describe('findLinks', () => {
  // A link as the iReal Pro forum hands it out.
  const KEEP_ON =
    'irealb://Keep%20On%3DMist%20Alfa%3D%3DSoul%3DC-%3D3%3D1r34LbKcu7%7CQyX94C-9XX7%5EA%7CQyX11-FZLx%20%20ZL%20x%20ZL%20lcKQyyQ%7CBb4TA*%5BG-11XyQKcl%20LZAb%5E7XyQ%7CBb9XyQZ%20%3DPop-Soul%3D100%3D1';
  const SECOND = 'irealbook://Two%3DAnon%3DBallad%3DF%3Dn%3D%5BT44F%5E7%20%20%20Z';

  it('takes a bare link whole', () => {
    expect(findLinks(KEEP_ON)).toEqual([KEEP_ON]);
    const song = parsePlaylist(findLinks(KEEP_ON)[0]!).songs[0]!;
    expect(song.title).toBe('Keep On');
    expect(song.composer).toBe('Alfa Mist');
    expect(song.repeats).toBe(1);
  });

  it('ends an encoded link at the words after it', () => {
    // Read to the end of the line, " enjoy!" lands in the repeat count.
    const [link] = findLinks(`Here you go: ${KEEP_ON} enjoy!`);
    expect(link).toBe(KEEP_ON);
    expect(parsePlaylist(link!).songs[0]!.repeats).toBe(1);
  });

  it('finds every link in a post, however they are separated', () => {
    expect(findLinks(`${KEEP_ON}\n\nand also ${SECOND}`)).toEqual([KEEP_ON, SECOND]);
    expect(findLinks(`${KEEP_ON} ${SECOND}`)).toEqual([KEEP_ON, SECOND]);
  });

  it('keeps the spaces of a link pasted already decoded', () => {
    const decoded = decodeURIComponent(KEEP_ON);
    expect(findLinks(`${decoded}\nnext line`)).toEqual([decoded]);
    expect(parsePlaylist(decoded).songs[0]!.title).toBe('Keep On');
  });

  it('reads a link out of copied markup, once', () => {
    expect(findLinks(`<a href="${KEEP_ON}">${KEEP_ON}</a>`)).toEqual([KEEP_ON]);
  });

  it('finds nothing in text without a link', () => {
    expect(findLinks('https://forums.irealpro.com/ and a chord: C^7')).toEqual([]);
    expect(findLinks('irealb:// ')).toEqual([]);
  });
});
