import { describe, expect, it } from 'vitest';
import { extractPayload, IRealFormatError, splitPayload } from '../src/index.js';

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
