/**
 * One-shot placeholder icon generator.
 *
 * Creates `assets/icon.png` (512×512, full-color Sepia badge used by
 * electron-builder to produce .icns/.ico) and `assets/trayTemplate.png`
 * (16×16 monochrome template icon for the macOS menu bar).
 *
 * This is a stand-in until a designed icon is dropped in. Dependency-free
 * PNG encoding via zlib keeps the repo installable on a fresh clone without
 * pulling in `sharp` or `canvas`.
 *
 * Run with:  node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');
mkdirSync(assetsDir, { recursive: true });

// --- minimal PNG encoder (RGBA, 8-bit per channel) -----------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([u32(data.length), typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk(
    'IHDR',
    Buffer.concat([
      u32(width),
      u32(height),
      // bitDepth=8, colorType=6 (RGBA), compression=0, filter=0, interlace=0
      Buffer.from([8, 6, 0, 0, 0]),
    ]),
  );
  // Prepend a 0 filter byte to each row.
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    filtered[y * (1 + stride)] = 0;
    rgba.copy(filtered, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const idat = chunk('IDAT', deflateSync(filtered));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// --- image painters ------------------------------------------------------

function setPx(buf, w, x, y, r, g, b, a) {
  const i = (y * w + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

/**
 * 512×512 full-color badge: instrument-black ground with a rounded amber
 * square and a pure-white inner dot — reads as an aperture / loupe at any
 * size. Simple enough to anti-alias cleanly with a basic SDF.
 */
function makeAppIcon(size = 512) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36; // outer disc radius
  const ringInner = r - size * 0.08;
  const dot = size * 0.10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      // Background: instrument-black
      let R = 0x0f, G = 0x10, B = 0x0f, A = 255;
      if (d < r) {
        // Amber outer ring
        R = 0xe8; G = 0xa2; B = 0x3b;
      }
      if (d < ringInner) {
        // Inside ring: back to ground
        R = 0x0f; G = 0x10; B = 0x0f;
      }
      if (d < dot) {
        // Warm ivory center dot
        R = 0xf0; G = 0xe8; B = 0xdc;
      }
      // Anti-alias the outer edge by fading to transparent near r.
      if (d > r - 1 && d < r) {
        const t = r - d;
        // Blend with ground (already set).
      }
      setPx(buf, size, x, y, R, G, B, A);
    }
  }
  return encodePNG(size, size, buf);
}

/**
 * 16×16 template icon for the macOS menu bar. Pure black with alpha for
 * shape — macOS inverts/retints based on the menu bar theme. Draws a
 * simple open circle with a center dot, mimicking a picker reticle.
 */
function makeTrayIcon(size = 16) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2 - 0.5, cy = size / 2 - 0.5;
  const rOuter = 6, rInner = 4, rDot = 1.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let A = 0;
      // Ring: opaque where rInner <= d <= rOuter
      if (d >= rInner && d <= rOuter) A = 255;
      // Center dot
      if (d <= rDot) A = 255;
      setPx(buf, size, x, y, 0, 0, 0, A);
    }
  }
  return encodePNG(size, size, buf);
}

// --- write files ---------------------------------------------------------

writeFileSync(join(assetsDir, 'icon.png'), makeAppIcon(512));
writeFileSync(join(assetsDir, 'trayTemplate.png'), makeTrayIcon(16));
// A 2x template for retina menu bars.
writeFileSync(join(assetsDir, 'trayTemplate@2x.png'), makeTrayIcon(32));

console.log('Wrote assets/icon.png, assets/trayTemplate.png, assets/trayTemplate@2x.png');
