#!/usr/bin/env node
/**
 * Generate the app icons.
 *
 * A PNG writer in fifty lines beats a build-time image dependency for two flat
 * shapes. The mark is the chart itself: barlines on the slate the chart is
 * drawn on, which is what the app looks like from across a room.
 *
 *   node tools/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');

const SLATE = [0x1b, 0x27, 0x30];
const INK = [0xe6, 0xe3, 0xda];
const ACCENT = [0x5c, 0xc4, 0xb2];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Write an RGB pixel buffer as a PNG. */
function png(width, height, pixels) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    pixels.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The icon: a slate card with three barlines and a chord block, which is what a
 * chart looks like at a glance.
 */
function draw(size) {
  const pixels = Buffer.alloc(size * size * 3);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const at = (y * size + x) * 3;
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
  };
  const rect = (x0, y0, w, h, colour) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, colour);
  };

  rect(0, 0, size, size, SLATE);

  const unit = size / 16;
  const barWidth = Math.max(2, Math.round(unit * 0.34));
  const top = Math.round(unit * 5);
  const height = Math.round(unit * 6);

  // Three barlines, kept inside the middle 70% so a maskable icon can crop to
  // a circle without slicing the outer one off.
  for (let i = 0; i < 3; i++) {
    rect(Math.round(unit * (4 + i * 4)), top, barWidth, height, INK);
  }
  // A chord block on the first beat, in the accent colour.
  rect(
    Math.round(unit * 4 + barWidth + unit * 0.5),
    Math.round(top + unit * 1.1),
    Math.round(unit * 2.4),
    Math.round(unit * 1.7),
    ACCENT,
  );

  return png(size, size, pixels);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`  wrote icon-${size}.png`);
}
console.log('icons ready');
