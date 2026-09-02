/**
 * Print a parsed chart as plain text, for eyeballing a parse against the app.
 *
 *   npx vite-node tools/print-chart.ts -- fixtures/jazz1460.txt "All Blues"
 *   npx vite-node tools/print-chart.ts -- fixtures/jazz1460.txt        # list titles
 */

import { readFileSync } from 'node:fs';
import { formatSong, parsePlaylist } from '../packages/ireal-format/src/index.js';

const [file, ...titleParts] = process.argv.slice(2);
if (!file) {
  console.error('usage: print-chart <playlist file> [song title]');
  process.exit(1);
}

const playlist = parsePlaylist(readFileSync(file, 'utf8'));
const query = titleParts.join(' ').toLowerCase();

if (!query) {
  console.log(`${playlist.name ?? '(unnamed)'} — ${playlist.songs.length} songs, ${playlist.failures.length} failed\n`);
  for (const song of playlist.songs) console.log(`  ${song.title} — ${song.composer}`);
  process.exit(0);
}

const matches = playlist.songs.filter((s) => s.title.toLowerCase().includes(query));
if (matches.length === 0) {
  console.error(`No song matching "${query}".`);
  process.exit(1);
}
for (const song of matches) console.log(`${formatSong(song)}\n`);
