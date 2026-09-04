#!/usr/bin/env node
/**
 * Render the app icons from the favicon.
 *
 * The icons used to be drawn twice: once as SVG for the tab, and once by a
 * hand-rolled PNG encoder for the installed app. Two drawings of one mark drift
 * -- and did, so the tab carried an `iF` monogram in a retired palette while
 * the app icon drew barlines in another. There is one drawing now, and these
 * are rasterised from it, so they cannot disagree again.
 *
 * Rasterising needs a renderer that understands SVG text and fonts, and the
 * repo already has one: Playwright, here for the end-to-end tests. No new
 * dependency, and it renders the file exactly as a browser will.
 *
 *   node tools/make-icons.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const SOURCE = join(PUBLIC, 'favicon.svg');
const SIZES = [192, 512];

const svg = await readFile(SOURCE, 'utf8');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const size of SIZES) {
    // The icon is drawn at its true size rather than scaled after the fact, so
    // the type is hinted for the size it will be seen at.
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>
         html, body { margin: 0; padding: 0; background: transparent; }
         svg { display: block; width: ${size}px; height: ${size}px; }
       </style>
       ${svg}`,
      { waitUntil: 'load' },
    );
    await page.evaluate(() => document.fonts.ready);

    const png = await page.screenshot({ omitBackground: true });
    const file = join(PUBLIC, `icon-${size}.png`);
    await writeFile(file, png);
    console.log(`  wrote icon-${size}.png (${(png.length / 1024).toFixed(1)} KB)`);
  }
} finally {
  await browser.close();
}

console.log('icons ready, rendered from favicon.svg');
