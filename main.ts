// news-image-20261125 v6 — "THE WORLD — Wednesday, 25 November 2026"
// Fresh build from DESIGN.md. Node 22 stdlib only, no network at run time.
// Writes /output/entry.png (1024x1024, <=1 MiB) + /output/dossier.json, deterministic.
//
// Facts (all 25 Nov 2026, verified — sources in run-2026-11-26-v1.md):
// LEAD Cartagena: security forces storm Exito supermarket at dawn; ~30 hostages freed,
//   1 gunman killed, 4 held (AP, Colombia Reports, Reuters).
// SPACE: Shenzhou-24 launches 08:18 Beijing, docks 11:56 at Tiangong; Muhammad Zeeshan Ali,
//   first Pakistani astronaut, first foreign guest aboard (Nature, SpacePolicyOnline).
// BANGLADESH: garment minimum wage +36% to 17,000 taka/month, wage board 4-2, from Dec 1
//   (Reuters, TBS News).
// INDONESIA: flood at unlicensed Pongkor gold mine, Bogor, shaft 100 m; 9 dead, 17 trapped
//   (AP, Reuters).
// EUROPE: Ukraine strikes Savasleyka air base, Russia; 5 jets damaged (3 MiG-31, 2 Su-34)
//   (Reuters).
// BRIEFS: Hodeidah (Saudi-led strikes; Houthis threaten Jeddah), Solomon Islands security
//   pact with Australia (no foreign bases), Nvidia -8.3%, Chen Jining probed, Cessna crash
//   in the Gulf kills six, Huawei guilty on 10 of 12 counts.
// Hormuz (3 tankers) was the 24 Nov lead — NOT the lead today.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------- CRC32 + PNG
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- raster
const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [245, 240, 230];
const INK: RGB = [20, 16, 12];
const RED: RGB = [176, 30, 30];
const GOLD: RGB = [196, 148, 44];
const CARD: RGB = [252, 249, 242];
const BRIEF_BG: RGB = [20, 16, 12];
const BRIEF_TX: RGB = [238, 231, 214];

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const half = Math.floor(t / 2);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / Math.max(1, steps));
    const y = Math.round(y0 + (dy * i) / Math.max(1, steps));
    fillRect(x - half, y - half, t, t, c);
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(t));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}

function poly(pts: [number, number][], c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      fillRect(Math.ceil(xs[k]), y, Math.floor(xs[k + 1]) - Math.ceil(xs[k]) + 1, 1, c);
    }
  }
}

function mix(a: RGB, b: RGB, f: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// ---------------------------------------------------------------- fonts
// FONT5: 5x7 bitmap caps, digits, punctuation. Hand-drawn for this entry.
const F5: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '..#..', '.....', '.....', '.....', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.##.', '#..#.', '.##.#'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
};

// FONT8: 8x12 bold display caps for masthead + headlines. Hand-drawn for this entry.
const F8: Record<string, string[]> = {
  A: ['..####..', '.##..##.', '##....##', '##....##', '##....##', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##'],
  B: ['######..', '##....##', '##....##', '##....##', '######..', '##....##', '##....##', '##....##', '##....##', '##....##', '######..', '........'],
  C: ['..####..', '.##..##.', '##....##', '##......', '##......', '##......', '##......', '##......', '##....##', '.##..##.', '..####..', '........'],
  D: ['######..', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '######..', '........'],
  E: ['########', '##......', '##......', '##......', '#####...', '##......', '##......', '##......', '##......', '##......', '########', '........'],
  F: ['########', '##......', '##......', '##......', '#####...', '##......', '##......', '##......', '##......', '##......', '##......', '........'],
  G: ['..####..', '.##..##.', '##....##', '##......', '##......', '##..####', '##....##', '##....##', '##....##', '.##..##.', '..####..', '........'],
  H: ['##....##', '##....##', '##....##', '##....##', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '........'],
  I: ['..####..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '..####..', '........'],
  J: ['....####', '.....##.', '.....##.', '.....##.', '.....##.', '.....##.', '.....##.', '##...##.', '##...##.', '.##..##.', '..####..', '........'],
  K: ['##....##', '##...##.', '##..##..', '##.##...', '####....', '##.##...', '##..##..', '##...##.', '##....##', '##....##', '##....##', '........'],
  L: ['##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '########', '........'],
  M: ['##....##', '###..###', '##.##.##', '##.##.##', '##.##.##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '........'],
  N: ['##....##', '###...##', '####..##', '##.##.##', '##..####', '##...###', '##....##', '##....##', '##....##', '##....##', '##....##', '........'],
  O: ['..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..', '........'],
  P: ['######..', '##....##', '##....##', '##....##', '######..', '##......', '##......', '##......', '##......', '##......', '##......', '........'],
  Q: ['..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '##..#.##', '##...###', '##....##', '.##..##.', '..####.#', '........'],
  R: ['######..', '##....##', '##....##', '##....##', '######..', '##..##..', '##...##.', '##....##', '##....##', '##....##', '##....##', '........'],
  S: ['..####..', '.##..##.', '##....##', '##......', '.####...', '....##..', '.....##.', '.....##.', '##....##', '.##..##.', '..####..', '........'],
  T: ['########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '........'],
  U: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..', '........'],
  V: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '.##..##.', '..####..', '...##...', '........'],
  W: ['##....##', '##....##', '##....##', '##....##', '##....##', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '.##..##.', '.##..##.', '........'],
  X: ['##....##', '##....##', '.##..##.', '..####..', '...##...', '..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '........'],
  Y: ['##....##', '##....##', '.##..##.', '..####..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '........'],
  Z: ['########', '......##', '.....##.', '....##..', '...##...', '..##....', '.##.....', '##......', '##......', '##......', '########', '........'],
  ' ': ['........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '........'],
};

function drawGlyph5(g: string[], x: number, y: number, s: number, c: RGB, tall: boolean): void {
  let yy = y;
  for (let r = 0; r < 7; r++) {
    const rh = tall ? (r === 3 ? 4 : 3) : s;
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row[col] === '#') fillRect(x + col * s, yy, s, rh, c);
    }
    yy += rh;
  }
}

function drawText5(s: string, x: number, y: number, scale: number, c: RGB, track = 1, tall = false): void {
  let cx = x;
  for (const ch of s) {
    const g = F5[ch];
    if (g) drawGlyph5(g, cx, y, scale, c, tall);
    cx += (5 + track) * scale;
  }
}

function width5(s: string, scale: number, track = 1): number {
  if (s.length === 0) return 0;
  return (s.length - 1) * (5 + track) * scale + 5 * scale;
}

function drawGlyph8(g: string[], x: number, y: number, s: number, c: RGB): void {
  for (let r = 0; r < 12; r++) {
    const row = g[r];
    for (let col = 0; col < 8; col++) {
      if (row[col] === '#') fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}

function drawText8(s: string, x: number, y: number, scale: number, c: RGB, track = 1): void {
  let cx = x;
  for (const ch of s) {
    const g = F8[ch];
    if (g) drawGlyph8(g, cx, y, scale, c);
    cx += (8 + track) * scale;
  }
}

function width8(s: string, scale: number, track = 1): number {
  if (s.length === 0) return 0;
  return (s.length - 1) * (8 + track) * scale + 8 * scale;
}

// ---------------------------------------------------------------- crowd
const SKIN: RGB = [200, 155, 108];
const PANTS: RGB = [40, 36, 32];
const SHIRTS: RGB[] = [
  [200, 60, 50],
  [50, 90, 180],
  [60, 140, 70],
  [220, 180, 40],
  [240, 235, 225],
  [120, 80, 170],
  [40, 150, 150],
  [230, 120, 40],
];
const DIM: RGB = [120, 115, 105];

type Pose = 'stand' | 'cheer' | 'phone' | 'hat' | 'umbrella' | 'placard';

function figure(x: number, baseY: number, h: number, shirt: RGB, pose: Pose, board: RGB | null): void {
  const headY = baseY - h + 3;
  const shoulderY = baseY - h + 7;
  const torsoH = Math.round(h * 0.42);
  const waistY = shoulderY + torsoH;
  // head
  ellipse(x, headY, 3, 3, SKIN);
  // torso
  fillRect(x - 2, shoulderY, 5, torsoH, shirt);
  // legs
  line(x, waistY, x - 4, baseY, PANTS, 2);
  line(x, waistY, x + 4, baseY, PANTS, 2);
  // arms
  if (pose === 'cheer') {
    line(x - 2, shoulderY + 2, x - 7, shoulderY - 6, SKIN, 2);
    line(x + 2, shoulderY + 2, x + 7, shoulderY - 6, SKIN, 2);
  } else if (pose === 'phone') {
    line(x - 2, shoulderY + 2, x - 6, shoulderY + 10, SKIN, 2);
    line(x + 2, shoulderY + 2, x + 6, shoulderY - 6, SKIN, 2);
    fillRect(x + 4, shoulderY - 11, 4, 6, INK);
  } else if (pose === 'placard') {
    line(x - 2, shoulderY + 2, x - 6, shoulderY + 10, SKIN, 2);
    line(x + 2, shoulderY + 2, x + 4, shoulderY - 10, SKIN, 2);
    line(x + 4, shoulderY - 10, x + 4, shoulderY - 22, [90, 80, 60], 2);
    if (board) fillRect(x - 4, shoulderY - 32, 16, 10, board);
  } else {
    line(x - 2, shoulderY + 2, x - 6, shoulderY + 10, SKIN, 2);
    line(x + 2, shoulderY + 2, x + 6, shoulderY + 10, SKIN, 2);
  }
  // hat
  if (pose === 'hat') {
    fillRect(x - 4, headY - 5, 9, 3, [30, 28, 26]);
    fillRect(x - 5, headY - 3, 11, 2, [30, 28, 26]);
  }
  // umbrella
  if (pose === 'umbrella') {
    line(x, headY - 2, x, headY - 14, [90, 80, 60], 2);
    poly(
      [
        [x - 11, headY - 14],
        [x + 11, headY - 14],
        [x, headY - 22],
      ],
      [200, 50, 45],
    );
  }
}

// ---------------------------------------------------------------- lead scene
function drawLeadScene(): void {
  const sx = 24;
  const sy = 210;
  const sw = 976;
  const sh = 310;
  // sky: four dawn bands
  const bands: RGB[] = [
    [240, 192, 120],
    [227, 154, 94],
    [232, 207, 160],
    [216, 220, 200],
  ];
  for (let i = 0; i < 4; i++) {
    fillRect(sx, sy + i * 37, sw, 37, bands[i]);
  }
  // sun: disc, halo rings, double rays (slightly longer + thicker than v5)
  const sunX = 885;
  const sunY = 262;
  const sunC: RGB = [245, 215, 110];
  const rayC: RGB = [239, 201, 94];
  ellipse(sunX, sunY, 52, 52, [242, 227, 161]);
  ellipse(sunX, sunY, 42, 42, [244, 224, 140]);
  const angles = [-2.8, -2.2, -1.6, -1.0, -0.4, 0.2, 0.8, 1.4, 2.0, 2.6];
  for (const a of angles) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = -sa;
    const py = ca;
    for (const off of [-3, 3]) {
      line(
        Math.round(sunX + ca * 58 + px * off),
        Math.round(sunY + sa * 58 + py * off),
        Math.round(sunX + ca * 100 + px * off),
        Math.round(sunY + sa * 100 + py * off),
        rayC,
        2,
      );
    }
  }
  ellipse(sunX, sunY, 30, 30, sunC);
  // helicopter spotlight beam (lands on open plaza, clear of both buildings)
  poly(
    [
      [395, 322],
      [425, 322],
      [345, 462],
      [245, 462],
    ],
    [242, 227, 161],
  );
  ellipse(295, 462, 55, 10, [247, 236, 192]);
  // helicopter (large, upper sky)
  poly(
    [
      [355, 292],
      [290, 272],
      [290, 282],
      [355, 308],
    ],
    [70, 82, 63],
  );
  poly(
    [
      [290, 272],
      [278, 250],
      [290, 250],
    ],
    [58, 70, 54],
  );
  line(282, 250, 282, 266, INK, 2);
  line(320, 272, 540, 272, INK, 3);
  fillRect(425, 272, 6, 14, INK);
  ellipse(430, 300, 80, 22, [70, 82, 63]);
  ellipse(495, 298, 22, 14, [127, 168, 184]);
  line(380, 326, 480, 326, INK, 3);
  line(400, 324, 395, 332, INK, 2);
  line(460, 324, 465, 332, INK, 2);
  // buildings
  // left block
  fillRect(sx, 358, 176, 107, [90, 100, 112]);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const lit = (r + c) % 3 === 0;
      fillRect(38 + c * 28, 372 + r * 22, 12, 12, lit ? [232, 217, 138] : [60, 68, 78]);
    }
  }
  // supermarket EXITO
  fillRect(520, 350, 300, 115, [232, 220, 200]);
  fillRect(520, 350, 300, 18, RED);
  drawText5('EXITO', 641, 354, 2, [255, 248, 240]);
  fillRect(540, 382, 120, 20, [180, 200, 210]);
  fillRect(700, 382, 100, 20, [180, 200, 210]);
  fillRect(560, 412, 56, 53, [90, 80, 70]);
  fillRect(700, 412, 56, 53, [90, 80, 70]);
  fillRect(640, 412, 40, 53, [120, 110, 96]);
  // Colombia flag on the supermarket
  line(740, 318, 740, 350, INK, 2);
  fillRect(742, 318, 44, 13, [252, 210, 30]);
  fillRect(742, 331, 44, 6, [30, 60, 150]);
  fillRect(742, 337, 44, 7, [210, 40, 35]);
  // right block
  fillRect(820, 365, 180, 100, [107, 90, 68]);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const lit = (r * 2 + c) % 3 === 0;
      fillRect(834 + c * 34, 378 + r * 26, 14, 14, lit ? [232, 217, 138] : [70, 60, 46]);
    }
  }
  // armored vehicle on the street
  fillRect(620, 438, 140, 20, [74, 82, 64]);
  fillRect(660, 424, 50, 16, [74, 82, 64]);
  fillRect(700, 416, 24, 10, [60, 68, 54]);
  ellipse(650, 462, 8, 8, [30, 28, 24]);
  ellipse(730, 462, 8, 8, [30, 28, 24]);
  // street
  fillRect(sx, 465, sw, 55, [55, 51, 44]);
  for (let x = 40; x < 990; x += 48) fillRect(x, 490, 24, 3, [201, 194, 176]);
  // crowd: back row (smaller, dimmer, deeper) then front row (taller, coloured)
  const backPoses: Pose[] = ['stand', 'stand', 'placard', 'stand', 'hat', 'stand', 'stand', 'placard', 'stand', 'stand', 'hat', 'stand', 'placard', 'stand', 'stand', 'hat'];
  const backBoards: (RGB | null)[] = [null, null, GOLD, null, null, null, null, [200, 60, 50], null, null, null, null, [240, 235, 225], null, null, null];
  for (let i = 0; i < 16; i++) {
    const x = 56 + i * 60;
    const h = 20 + ((i * 7) % 7);
    const shirt = mix(SHIRTS[i % 8], DIM, 0.55);
    figure(x, 500, h, shirt, backPoses[i], backBoards[i]);
  }
  const frontPoses: Pose[] = ['cheer', 'phone', 'stand', 'hat', 'cheer', 'phone', 'stand', 'hat', 'umbrella', 'cheer', 'phone', 'stand', 'hat', 'umbrella'];
  for (let i = 0; i < 14; i++) {
    const x = 62 + i * 66;
    const h = 26 + ((i * 11) % 9);
    figure(x, 516, h, SHIRTS[i % 8], frontPoses[i], null);
  }
  // frame
  fillRect(sx, sy, sw, 2, INK);
  fillRect(sx, sy + sh - 2, sw, 2, INK);
  fillRect(sx, sy, 2, sh, INK);
  fillRect(sx + sw - 2, sy, 2, sh, INK);
}

// ---------------------------------------------------------------- cards
function drawCard(cx: number, cy: number, kicker: string, t1: string, t2: string, facts: string[], art: (bx: number, by: number, bw: number, bh: number) => void): void {
  const cw = 482;
  const ch = 134;
  fillRect(cx, cy, cw, ch, CARD);
  fillRect(cx, cy, cw, 2, INK);
  fillRect(cx, cy + ch - 2, cw, 2, INK);
  fillRect(cx, cy, 2, ch, INK);
  fillRect(cx + cw - 2, cy, 2, ch, INK);
  drawText5(kicker, cx + 12, cy + 9, 2, RED);
  drawText5(t1, cx + 12, cy + 28, 3, INK);
  drawText5(t2, cx + 12, cy + 50, 3, INK);
  for (let i = 0; i < facts.length; i++) {
    drawText5(facts[i], cx + 12, cy + 78 + i * 17, 2, INK);
  }
  // side art box, widened to 140 (v5: 124) — text column tightened to pay for it
  const abx = cx + cw - 140 - 10;
  const aby = cy + 8;
  const abw = 140;
  const abh = ch - 16;
  fillRect(abx, aby, abw, abh, [232, 228, 218]);
  fillRect(abx, aby, abw, 2, INK);
  fillRect(abx, aby + abh - 2, abw, 2, INK);
  fillRect(abx, aby, 2, abh, INK);
  fillRect(abx + abw - 2, aby, 2, abh, INK);
  art(abx + 2, aby + 2, abw - 4, abh - 4);
}

function artSpace(bx: number, by: number, bw: number, bh: number): void {
  fillRect(bx, by, bw, bh, [16, 24, 48]);
  const stars: [number, number][] = [
    [12, 10], [30, 26], [52, 8], [74, 20], [96, 12], [116, 28], [20, 44], [44, 56], [110, 48],
  ];
  for (const [sx, sy] of stars) fillRect(bx + sx, by + sy, 2, 2, [240, 235, 220]);
  // Earth arc, fully inside the box (lesson from v4)
  ellipse(bx + 18, by + bh - 8, 26, 18, [40, 90, 180]);
  ellipse(bx + 12, by + bh - 14, 10, 7, [60, 140, 70]);
  // rocket, vertical
  poly(
    [
      [bx + 84, by + 12],
      [bx + 94, by + 30],
      [bx + 74, by + 30],
    ],
    RED,
  );
  fillRect(bx + 74, by + 30, 20, 44, [240, 235, 225]);
  poly(
    [
      [bx + 74, by + 74],
      [bx + 66, by + 88],
      [bx + 74, by + 84],
    ],
    RED,
  );
  poly(
    [
      [bx + 94, by + 74],
      [bx + 102, by + 88],
      [bx + 94, by + 84],
    ],
    RED,
  );
  poly(
    [
      [bx + 79, by + 74],
      [bx + 89, by + 74],
      [bx + 84, by + 94],
    ],
    [240, 160, 50],
  );
  fillRect(bx + 78, by + 44, 12, 8, [40, 90, 180]);
}

function artBangladesh(bx: number, by: number, bw: number, bh: number): void {
  fillRect(bx, by, bw, bh, [243, 233, 210]);
  // "36" then "%" drawn apart with a clean 9 px gap (v5 fix kept)
  drawText5('36', bx + 8, by + 10, 4, INK);
  drawText5('%', bx + 65, by + 10, 4, INK);
  // gold arrow climbing to the top right
  line(bx + 96, by + 66, bx + 124, by + 26, GOLD, 4);
  poly(
    [
      [bx + 128, by + 18],
      [bx + 116, by + 22],
      [bx + 126, by + 36],
    ],
    GOLD,
  );
  // factory silhouette along the bottom
  fillRect(bx + 8, by + 78, 84, 30, [70, 66, 60]);
  fillRect(bx + 14, by + 62, 9, 18, [70, 66, 60]);
  fillRect(bx + 96, by + 88, 32, 20, [70, 66, 60]);
  fillRect(bx + 18, by + 86, 8, 8, [240, 220, 140]);
  fillRect(bx + 34, by + 86, 8, 8, [240, 220, 140]);
  fillRect(bx + 50, by + 86, 8, 8, [240, 220, 140]);
  fillRect(bx + 66, by + 86, 8, 8, [240, 220, 140]);
}

function artIndonesia(bx: number, by: number, bw: number, bh: number): void {
  fillRect(bx, by, bw, bh, [220, 232, 216]);
  // hills
  poly(
    [
      [bx, by + 70],
      [bx + 50, by + 34],
      [bx + 100, by + 70],
    ],
    [90, 122, 74],
  );
  poly(
    [
      [bx + 60, by + 76],
      [bx + 110, by + 44],
      [bx + 136, by + 76],
    ],
    [122, 90, 58],
  );
  // mine shaft with flood water at the bottom
  fillRect(bx + 58, by + 52, 18, 42, [30, 28, 24]);
  fillRect(bx + 54, by + 88, 26, 14, [40, 90, 180]);
  fillRect(bx + 52, by + 46, 30, 6, [60, 56, 50]);
  // warning marker
  poly(
    [
      [bx + 116, by + 58],
      [bx + 126, by + 76],
      [bx + 106, by + 76],
    ],
    GOLD,
  );
  fillRect(bx + 115, by + 64, 2, 7, INK);
  fillRect(bx + 115, by + 73, 2, 2, INK);
}

function artEurope(bx: number, by: number, bw: number, bh: number): void {
  fillRect(bx, by, bw, bh, [216, 221, 226]);
  // smoke puffs
  ellipse(bx + 34, by + 26, 10, 8, [150, 150, 148]);
  ellipse(bx + 52, by + 18, 12, 9, [170, 170, 168]);
  ellipse(bx + 74, by + 26, 9, 7, [150, 150, 148]);
  // hangar
  fillRect(bx + 12, by + 40, 96, 52, [120, 124, 128]);
  ellipse(bx + 60, by + 92, 30, 26, [70, 72, 76]);
  fillRect(bx + 44, by + 66, 32, 26, [50, 52, 56]);
  // runway
  fillRect(bx + 8, by + 96, 120, 6, [60, 60, 62]);
  for (let x = 14; x < 120; x += 20) fillRect(bx + x, by + 98, 10, 2, [220, 220, 215]);
  // two jets on the runway
  poly(
    [
      [bx + 26, by + 92],
      [bx + 46, by + 92],
      [bx + 36, by + 84],
    ],
    [40, 42, 46],
  );
  poly(
    [
      [bx + 78, by + 92],
      [bx + 98, by + 92],
      [bx + 88, by + 84],
    ],
    [40, 42, 46],
  );
}

// ---------------------------------------------------------------- page
function build(): void {
  // paper
  fillRect(0, 0, W, H, PAPER);
  // masthead
  const mast = 'THE WORLD';
  drawText8(mast, Math.floor((W - width8(mast, 6)) / 2), 16, 6, INK);
  // dateline + tag
  drawText5('WEDNESDAY, 25 NOVEMBER 2026', Math.floor((W - width5('WEDNESDAY, 25 NOVEMBER 2026', 2)) / 2), 96, 2, INK);
  drawText5('IN ONE IMAGE', 1000 - width5('IN ONE IMAGE', 2), 96, 2, RED);
  fillRect(24, 118, 976, 2, INK);
  // lead headline (two lines, ink + red)
  const h1 = 'HOSTAGES FREED';
  const h2 = 'IN CARTAGENA';
  drawText8(h1, Math.floor((W - width8(h1, 3)) / 2), 128, 3, INK);
  drawText8(h2, Math.floor((W - width8(h2, 3)) / 2), 168, 3, RED);
  // lead scene
  drawLeadScene();
  // lead facts
  drawText5('30 HOSTAGES FREED AT EXITO SUPERMARKET', 24, 528, 2, INK);
  drawText5('1 GUNMAN KILLED, 4 HELD AFTER DAWN RAID', 24, 548, 2, INK);
  // secondary cards, 2x2
  drawCard(24, 580, 'SPACE', 'PAKISTAN', 'IN SPACE', ['SHENZHOU-24 DOCKS', 'AT TIANGONG', '1ST PAKISTANI ASTRONAUT'], artSpace);
  drawCard(518, 580, 'BANGLADESH', 'WAGES UP', '36%', ['GARMENT PAY RISES', 'TO 17,000 TAKA', 'FROM DEC 1'], artBangladesh);
  drawCard(24, 724, 'INDONESIA', 'PONGKOR', 'MINE FLOOD', ['9 DEAD, 17 TRAPPED', 'IN FLOODED GOLD MINE', 'SHAFT 100 M DEEP'], artIndonesia);
  drawCard(518, 724, 'EUROPE', 'UKRAINE HITS', 'AIR BASE', ['5 JETS DAMAGED', '3 MIG-31, 2 SU-34', 'AT SAVASLEYKA BASE'], artEurope);
  // briefs strip: dark band, light text, 22 px tall (tall stretch of the 5x7 font)
  fillRect(0, 866, W, 158, BRIEF_BG);
  const briefs = [
    'SAUDI-LED STRIKES HIT HODEIDAH; JEDDAH THREATENED',
    'SOLOMON PACT WITH AUSTRALIA; NO FOREIGN BASES',
    'NVIDIA SLIDES 8.3% AS HUANG RALLY FADES',
    'BEIJING PROBES SHANGHAI PARTY CHIEF',
    'CESSNA CRASH IN GULF KILLS SIX',
    'HUAWEI GUILTY ON 10 OF 12 COUNTS',
  ];
  for (let i = 0; i < briefs.length; i++) {
    const top = 874 + i * 25;
    fillRect(24, top + 8, 6, 6, GOLD);
    drawText5(briefs[i], 38, top, 3, BRIEF_TX, 1, true);
  }
}

function main(): void {
  build();
  const png = encodePNG(W, H, img);
  const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  mkdirSync(out, { recursive: true });
  writeFileSync(out + '/entry.png', png);
  const sha = createHash('sha256').update(png).digest('hex');
  const dossier = {
    title: 'THE WORLD',
    date: '2026-11-25',
    version: 6,
    width: W,
    height: H,
    entry_png_sha256: sha,
    stories: 11,
  };
  writeFileSync(out + '/dossier.json', JSON.stringify(dossier, null, 2) + '\n');
}

main();
