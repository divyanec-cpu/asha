/**
 * generate-icons.mjs — builds the PWA / apple-touch icon set.
 *
 *   node scripts/generate-icons.mjs
 *
 * WHY A SCRIPT RATHER THAN CHECKED-IN ARTWORK. These are geometric, derived
 * entirely from the design system's own values (ink #12151A, brass #B8863B —
 * see src/app/globals.css). Generating them keeps the brand values traceable to
 * one source instead of baked into binaries nobody can diff, and regenerating
 * after a palette change is one command. If a designer ever supplies real
 * artwork, delete this script rather than trying to keep both in sync.
 *
 * No image dependency: Next dropped `sharp` from the tree (see the overrides
 * note in package.json), and pulling an encoder back in for four static files
 * would be a poor trade. PNG is a simple enough container to write directly with
 * node's built-in zlib.
 *
 * The mark is a geometric "A" — the wordmark's initial, in brass on ink. It
 * reads at 32px, which a full "ASHA" wordmark would not.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "icons");

const INK = [0x12, 0x15, 0x1a];
const BRASS = [0xb8, 0x86, 0x3b];

// ─── Minimal RGBA canvas ─────────────────────────────────────────────────────

function canvas(size, [r, g, b]) {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return { size, px };
}

function setPx(c, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (Math.floor(y) * c.size + Math.floor(x)) * 4;
  c.px[i] = r;
  c.px[i + 1] = g;
  c.px[i + 2] = b;
  c.px[i + 3] = 255;
}

/**
 * Thick line as a swept disc. Crude but correct, and it gives round joins where
 * the A's strokes meet without any path maths.
 */
function line(c, x0, y0, x1, y1, thickness, colour) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  const radius = thickness / 2;
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) setPx(c, cx + dx, cy + dy, colour);
      }
    }
  }
}

/**
 * Draws the A.
 *
 * `inset` is the fraction of the canvas kept clear on every side. Maskable
 * icons get a larger inset because Android crops them to arbitrary shapes and
 * only the centre ~80% is guaranteed visible — artwork drawn to the edge gets
 * its corners eaten.
 */
function drawMark(c, inset) {
  const S = c.size;
  const span = 1 - inset * 2;
  const at = (fx, fy) => [inset * S + fx * span * S, inset * S + fy * span * S];

  const thickness = Math.max(2, Math.round(span * S * 0.13));
  const [lx, ly] = at(0.06, 0.94);
  const [ax, ay] = at(0.5, 0.06);
  const [rx, ry] = at(0.94, 0.94);
  const [c0x, c0y] = at(0.24, 0.62);
  const [c1x, c1y] = at(0.76, 0.62);

  line(c, lx, ly, ax, ay, thickness, BRASS);
  line(c, rx, ry, ax, ay, thickness, BRASS);
  line(c, c0x, c0y, c1x, c1y, thickness, BRASS);
}

// ─── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.size, 0);
  ihdr.writeUInt32BE(c.size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 = none. Fine here, the
  // images are tiny and flat.
  const stride = c.size * 4;
  const raw = Buffer.alloc((stride + 1) * c.size);
  for (let y = 0; y < c.size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(c.px.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Build ───────────────────────────────────────────────────────────────────

const TARGETS = [
  // PWA manifest
  { file: "icon-192.png", size: 192, inset: 0.2 },
  { file: "icon-512.png", size: 512, inset: 0.2 },
  // Android maskable — larger inset so cropping can't clip the mark.
  { file: "icon-maskable-512.png", size: 512, inset: 0.3 },
  // iOS home screen. iOS ignores the manifest's icons array entirely and reads
  // apple-touch-icon, which must be 180x180 and must NOT be transparent — it
  // does not composite a background behind it.
  { file: "apple-touch-icon.png", size: 180, inset: 0.2 },
  // Favicon-sized, for browser tabs.
  { file: "icon-32.png", size: 32, inset: 0.14 },
];

mkdirSync(OUT, { recursive: true });

for (const t of TARGETS) {
  const c = canvas(t.size, INK);
  drawMark(c, t.inset);
  writeFileSync(join(OUT, t.file), encodePng(c));
  console.log(`  ${t.file.padEnd(26)} ${t.size}x${t.size}`);
}

console.log(`\n${TARGETS.length} icons written to public/icons/`);
