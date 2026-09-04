/**
 * Fetch the sampled instrument banks.
 *
 * The app plays through a synthesised instrument set by default: it is a few
 * kilobytes, it needs no network, and it is why the whole app installs at
 * under a megabyte. Recorded instruments sound better, and they are tens of
 * megabytes, so they are fetched on demand rather than committed -- the same
 * bargain `fetch-fixtures.mjs` makes with the test corpus.
 *
 * Source: Benjamin Gleitzman's pre-rendered FluidR3_GM soundfont, which is
 * released under Creative Commons Attribution 3.0. Attribution is a condition
 * of that licence, so `sounds/CREDITS.md` is written alongside the banks and
 * the app shows it. MusyngKite from the same project sounds better still but
 * is Attribution-ShareAlike, which reaches further than a sample bank in a
 * repository that means to be permissively licensed, so it is not used here.
 *
 *   npm run sounds:fetch
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public/sounds');
const BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';

/**
 * Our instrument ids against General MIDI names.
 *
 * Drum kits are deliberately absent: this soundfont carries no General MIDI
 * kit, and the synthesised drums are the part of the built-in set that holds
 * up best. A kit under a compatible licence would be a separate errand.
 */
const BANKS = {
  'acoustic-piano': 'acoustic_grand_piano',
  'electric-piano': 'electric_piano_1',
  'upright-bass': 'acoustic_bass',
  'electric-bass': 'electric_bass_finger',
  'nylon-guitar': 'acoustic_guitar_nylon',
};

/**
 * Keep one sample every `STRIDE` semitones.
 *
 * All 88 notes of a piano is 2.6 MB, and most of it is redundant: a sample
 * shifted by a semitone or two is indistinguishable in this context, and the
 * player pitches the nearest one. Every third semitone cuts the bank to about
 * a third with no audible cost at chart-reading volume.
 */
const STRIDE = 3;

// Letter, accidental and octave as separate groups: combining the first two
// leaves the destructuring below one short, and every sample lands as
// `undefined` -- which JSON.stringify drops without a word, giving a bank
// that loads, reports its note count, and contains nothing.
const NOTE_RE = /"([A-G])([b#]?)(-?\d)":\s*"(data:audio\/mp3;base64,[^"]+)"/g;
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiOf(letter, accidental, octave) {
  const base = PITCH[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return base + (Number(octave) + 1) * 12;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await mkdir(OUT, { recursive: true });

let fetched = 0;
let bytes = 0;

for (const [id, gm] of Object.entries(BANKS)) {
  const target = join(OUT, `${id}.json`);
  if (await exists(target)) {
    console.log(`have    ${id}`);
    continue;
  }

  process.stdout.write(`fetch   ${id} (${gm}) … `);
  const response = await fetch(`${BASE}/${gm}-mp3.js`);
  if (!response.ok) {
    console.log(`failed (HTTP ${response.status})`);
    continue;
  }

  const source = await response.text();
  const notes = {};
  let kept = 0;
  let seen = 0;
  for (const [, letter, accidental, octave, data] of source.matchAll(NOTE_RE)) {
    // The regex splits the note name into letter and accidental; octave is
    // whatever follows. `matchAll` gives them in written order, which is
    // ascending, so striding over the index samples the range evenly.
    const midi = midiOf(letter, accidental, octave);
    if (seen++ % STRIDE !== 0) continue;
    notes[midi] = data;
    kept++;
  }

  if (kept === 0) {
    console.log('failed (no samples found)');
    continue;
  }

  const json = JSON.stringify({ instrument: id, source: gm, notes });
  await writeFile(target, json);
  fetched++;
  bytes += json.length;
  console.log(`${kept} samples, ${(json.length / 1e6).toFixed(1)} MB`);
}

await writeFile(
  join(OUT, 'CREDITS.md'),
  `# Sampled instruments

These banks are rendered from the **FluidR3_GM** soundfont, via Benjamin
Gleitzman's [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts).

FluidR3_GM is released under the **Creative Commons Attribution 3.0** licence.
Attribution is a condition of use, which is what this file is for.

Fetched by \`npm run sounds:fetch\`; not committed to the repository. The app
falls back to its synthesised instruments when these are absent, so it works
without them.
`,
);

console.log(
  fetched === 0
    ? '\nNothing to fetch — all banks present.'
    : `\n${fetched} banks, ${(bytes / 1e6).toFixed(1)} MB total, in apps/web/public/sounds/`,
);
