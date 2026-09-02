import { parsePlaylist } from '@ifakepro/ireal-format';
import { buildSongModel, buildTimemap, toMusicXml, transposeModel, unroll } from '@ifakepro/song-model';
import { PACKS, packById, renderGroove, selectPack } from '@ifakepro/groove-engine';
import { renderToBuffer } from '@ifakepro/audio-host';

/**
 * A handle on the packages from the page, for tooling.
 *
 * `tools/audio-check.mjs` uses this to render a groove offline in a real
 * browser and measure it — the closest a test gets to listening. It costs a few
 * hundred bytes and it is the only way to catch "the engine emits perfect
 * events that make no sound".
 */
declare global {
  interface Window {
    __ifakepro?: Record<string, unknown>;
  }
}

window.__ifakepro = {
  parsePlaylist,
  buildSongModel,
  buildTimemap,
  toMusicXml,
  transposeModel,
  unroll,
  renderGroove,
  selectPack,
  packById,
  PACKS,
  renderToBuffer,
};

export {};
