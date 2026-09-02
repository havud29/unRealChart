#!/usr/bin/env node
/**
 * Render a groove offline in a real browser and measure the result.
 *
 * Unit tests prove the engine emits the right *events*. This proves those
 * events actually make sound: every part audible, nothing clipping, no long
 * silences. It is the closest thing to listening that a test can do, and it
 * runs against the same Web Audio implementation the app uses.
 *
 *   node tools/audio-check.mjs [groove-id] [--bars N]
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const URL = 'http://localhost:5173/';
const groove = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'medium-swing';

async function isUp() {
  try {
    return (await fetch(URL, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await isUp())) {
  server = spawn('npm', ['run', 'dev', '--workspace', '@unrealchart/web'], { stdio: 'ignore', shell: true });
  for (let i = 0; i < 60 && !(await isUp()); i++) await sleep(500);
  if (!(await isUp())) {
    server.kill();
    throw new Error(`dev server did not start on ${URL}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle' });

const report = await page.evaluate(async (grooveId) => {
  // The app exposes its packages on window for exactly this purpose.
  const api = window.__unrealchart;
  if (!api) throw new Error('window.__unrealchart is not exposed');

  const { parsePlaylist, buildSongModel, renderGroove, packById, renderToBuffer } = api;

  const music =
    '*A[T44F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |G-7   |C7   |F7   |C7   Z';
  const record = ['Audio Check', 'Anon', 'Medium Swing', 'F', 'n', music].join('=');
  const song = parsePlaylist(`irealbook://${encodeURIComponent(record)}`).songs[0];
  song.bpm = 160;
  song.repeats = 1;

  const model = buildSongModel(song);
  const pack = packById(grooveId);
  if (!pack) throw new Error(`no groove named ${grooveId}`);

  const rendered = renderGroove(model, pack, { seed: 1 });

  // Whole mix, then each part on its own, so a silent part cannot hide.
  const measure = async (events, durationMs) => {
    const buffer = await renderToBuffer(events, { durationMs });
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sum = 0;
    let clipped = 0;
    let longestSilence = 0;
    let silence = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      peak = Math.max(peak, v);
      sum += v * v;
      if (v >= 0.999) clipped++;
      if (v < 0.0005) {
        silence++;
        longestSilence = Math.max(longestSilence, silence);
      } else {
        silence = 0;
      }
    }
    return {
      peak: Number(peak.toFixed(4)),
      rms: Number(Math.sqrt(sum / data.length).toFixed(4)),
      clippedSamples: clipped,
      longestSilenceMs: Math.round((longestSilence / buffer.sampleRate) * 1000),
      seconds: Number((buffer.length / buffer.sampleRate).toFixed(2)),
    };
  };

  const parts = [...new Set(rendered.events.map((e) => e.part))];
  const perPart = {};
  for (const part of parts) {
    perPart[part] = await measure(
      rendered.events.filter((e) => e.part === part),
      rendered.durationMs,
    );
  }

  return {
    groove: pack.name,
    events: rendered.events.length,
    bars: rendered.bars.length,
    mix: await measure(rendered.events, rendered.durationMs),
    parts: perPart,
  };
}, groove);

await browser.close();
if (server) server.kill();

console.log(`groove: ${report.groove}`);
console.log(`events: ${report.events} across ${report.bars} bars`);
console.log(
  `mix:    peak ${report.mix.peak}  rms ${report.mix.rms}  clipped ${report.mix.clippedSamples}` +
    `  longest silence ${report.mix.longestSilenceMs}ms  (${report.mix.seconds}s)`,
);
for (const [part, m] of Object.entries(report.parts)) {
  console.log(`  ${part.padEnd(7)} peak ${String(m.peak).padEnd(7)} rms ${String(m.rms).padEnd(7)} silence ${m.longestSilenceMs}ms`);
}
if (errors.length) console.log(`errors: ${errors.join('; ')}`);

const problems = [];
if (report.mix.peak < 0.05) problems.push('mix is essentially silent');
if (report.mix.clippedSamples > 0) problems.push(`${report.mix.clippedSamples} clipped samples`);
if (report.mix.longestSilenceMs > 1500) problems.push(`${report.mix.longestSilenceMs}ms gap in the mix`);
for (const [part, m] of Object.entries(report.parts)) {
  if (m.peak < 0.01) problems.push(`${part} is silent`);
}
if (errors.length) problems.push('page errors');

if (problems.length) {
  console.error(`\nFAIL: ${problems.join(', ')}`);
  process.exit(1);
}
console.log('\nOK');
