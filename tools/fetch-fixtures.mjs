#!/usr/bin/env node
/**
 * Download the community playlists used as the parser's corpus.
 *
 * These are user-contributed transcriptions of copyrighted songs, so they are
 * fetched on demand into a git-ignored directory rather than committed. The
 * corpus tests skip themselves when the directory is empty, so a fresh clone
 * still runs green without this step.
 *
 *   npm run fixtures:fetch
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures');

const BASE = 'https://raw.githubusercontent.com/infojunkie/ireal-musicxml/main/test/data';

const FILES = [
  'playlist.html', // small, 6 songs — the shape of a real HTML export
  'irealbook.txt', // legacy scheme
  'jazz1460.txt', // the big one
  'pop400.txt',
  'blues50.txt',
  'country.txt',
  'dixieland1.txt',
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await mkdir(OUT, { recursive: true });

let downloaded = 0;
for (const name of FILES) {
  const target = join(OUT, name);
  if (await exists(target)) {
    console.log(`  skip  ${name} (already present)`);
    continue;
  }
  process.stdout.write(`  get   ${name} ... `);
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) {
    console.log(`failed (${response.status})`);
    continue;
  }
  const body = await response.text();
  await writeFile(target, body, 'utf8');
  console.log(`${(body.length / 1024).toFixed(0)} KB`);
  downloaded++;
}

console.log(`\nfixtures/ ready — ${downloaded} new file(s). Run: npm test`);
