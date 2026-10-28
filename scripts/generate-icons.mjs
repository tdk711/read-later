/**
 * Generates the PWA PNG icons without any image dependencies.
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(root, 'public', 'icons');
mkdirSync(outputDir, { recursive: true });

const BACKGROUND = [54, 109, 153]; // orange-600 54, 109, 153
const FOREGROUND = [255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function bookmarkPolygon(maskable) {
  const top = maskable ? 0.295 : 0.265;
  const bottom = maskable ? 0.725 : 0.74;
  const notch = maskable ? 0.64 : 0.655;
  const left = maskable ? 0.385 : 0.355;
  const right = 1 - left;
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [0.5, notch],
    [left, bottom],
  ];
}

function renderIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const polygon = bookmarkPolygon(maskable);
  const samples = 3;
  const sampleCount = samples * samples;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let glyphCoverage = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          if (insidePolygon(px, py, polygon)) glyphCoverage += 1;
        }
      }

      const ratio = glyphCoverage / sampleCount;
      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(BACKGROUND[0] * (1 - ratio) + FOREGROUND[0] * ratio);
      rgba[offset + 1] = Math.round(BACKGROUND[1] * (1 - ratio) + FOREGROUND[1] * ratio);
      rgba[offset + 2] = Math.round(BACKGROUND[2] * (1 - ratio) + FOREGROUND[2] * ratio);
      rgba[offset + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

const icons = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];

for (const [name, size, maskable] of icons) {
  writeFileSync(join(outputDir, name), renderIcon(size, maskable));
  console.log(`Generated public/icons/${name}`);
}

writeFileSync(join(root, 'public', 'apple-touch-icon.png'), renderIcon(180, false));
console.log('Generated public/apple-touch-icon.png');
