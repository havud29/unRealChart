#!/usr/bin/env node
/**
 * Screenshot the running app. Starts its own dev server unless one is already
 * listening, so it works both interactively and in CI.
 *
 *   node tools/screenshot.mjs [outfile.png]
 *   node tools/screenshot.mjs out.png --import fixtures/jazz1460.txt --song "Autumn Leaves"
 *
 * This is the seed of the M3 visual regression suite — same mechanism, but that
 * one will compare against committed baselines instead of just capturing.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const URL = flag('url') ?? 'http://localhost:5173/';
const out = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'screenshot.png';
const importFile = flag('import');
const songQuery = flag('song');

async function isUp() {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await isUp())) {
  console.log('starting dev server…');
  server = spawn('npm', ['run', 'dev', '--workspace', '@unrealchart/web'], {
    stdio: 'ignore',
    shell: true,
  });
  for (let i = 0; i < 60 && !(await isUp()); i++) await sleep(500);
  if (!(await isUp())) {
    server.kill();
    throw new Error('dev server did not come up on ' + URL);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.page', { timeout: 10000 });

// Drive the real import path rather than poking state, so this exercises what
// a user actually does.
if (importFile) {
  await page.setInputFiles('.titlebar input[type=file]', importFile);
  await page.waitForFunction(() => document.querySelectorAll('.sl-rows li').length > 1);
}
if (songQuery) {
  await page.fill('.search', songQuery);
  await page.waitForSelector('.sl-rows button');
  await page.click('.sl-rows button');
  await page.waitForSelector('.page');
}

const title = await page.textContent('.page-title');
const chords = await page.locator('.chord').evaluateAll((els) =>
  els.map((e) => e.textContent?.trim()).filter(Boolean),
);

// The page is the point: report its proportions, so a regression in the fit
// shows up as a number rather than as a picture someone has to squint at.
const page_ = await page.locator('.page').evaluate((el) => {
  const b = el.getBoundingClientRect();
  const stage = document.querySelector('.chart-fit').getBoundingClientRect();
  return {
    w: Math.round(b.width),
    h: Math.round(b.height),
    ratio: +(b.width / b.height).toFixed(3),
    cell: getComputedStyle(el).getPropertyValue('--cell').trim(),
    systems: el.querySelectorAll('.row').length,
    stageW: Math.round(stage.width),
    leftMargin: Math.round(b.left - stage.left),
    rightMargin: Math.round(stage.right - b.right),
  };
});

await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (server) server.kill();

console.log(`chart:  ${title}`);
console.log(
  `page:   ${page_.w}x${page_.h} ratio ${page_.ratio} · ${page_.systems} systems · cell ${page_.cell}`,
);
console.log(
  `stage:  ${page_.stageW}px wide · margins ${page_.leftMargin}/${page_.rightMargin}`,
);
console.log(`chords: ${chords.join('  ')}`);
console.log(errors.length ? `errors: ${errors.join('\n        ')}` : 'errors: none');
console.log(`saved:  ${out}`);
