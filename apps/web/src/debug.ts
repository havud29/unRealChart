import { parsePlaylist } from '@unrealchart/ireal-format';
import { buildSongModel, buildTimemap, toMusicXml, transposeModel, unroll } from '@unrealchart/song-model';
import { PACKS, packById, renderGroove, selectPack } from '@unrealchart/groove-engine';
import { renderToBuffer } from '@unrealchart/audio-host';

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
    __unrealchart?: Record<string, unknown>;
  }
}

window.__unrealchart = {
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
