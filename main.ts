// news-image-20261125 v9 — "THE WORLD — Wednesday, 25 November 2026"
// Fresh build from DESIGN.md. Node 22 stdlib only, no network at run time.
// Writes /output/entry.png (1024x1024, <=1 MiB) + /output/dossier.json, deterministic.
import * as fs from 'node:fs';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [245, 239, 227];
const INK: RGB = [26, 23, 18];
const GOLD: RGB = [201, 162, 39];
const GOLD_DARK: RGB = [138, 109, 27];
const RED: RGB = [192, 57, 43];
const BLUE: RGB = [46, 95, 163];
const YELLOW: RGB = [232, 185, 12];
const NAVY: RGB = [31, 58, 95];
const TEAL: RGB = [42, 127, 127];
const GREEN: RGB = [62, 122, 62];
const ORANGE: RGB = [217, 123, 41];
const PURPLE: RGB = [122, 74, 158];
const WHITE: RGB = [250, 248, 242];
const SKIN: RGB = [232, 185, 138];
const PANTS: RGB = [58, 58, 66];
const BAND: RGB = [20, 16, 12];
const BAND_TEXT: RGB = [246, 240, 225];
const SEPARATOR: RGB = [58, 50, 38];
const SUN: RGB = [242, 201, 76];
const HALO: RGB = [247, 220, 111];
const SPOT: RGB = [240, 223, 160];
const SKY1: RGB = [199, 222, 236];
const SKY2: RGB = [158, 196, 222];
const SKY3: RGB = [126, 174, 208];
const SKY4: RGB = [111, 165, 201];
const STREET: RGB = [138, 127, 112];
const PLAZA: RGB = [154, 143, 126];
const HELI: RGB = [58, 63, 68];

// ---------------- rasteriser ----------------
function P(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function R(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) { img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; i += 3; }
  }
}
function L(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    P(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function C(cx: number, cy: number, r: number, c: RGB): void {
  E(cx, cy, r, r, c);
}
function E(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    const t = 1 - ((y - cy) * (y - cy)) / (ry * ry);
    if (t < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(t));
    R(cx - dx, y, dx * 2 + 1, 1, c);
  }
}
function LW(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  const r = Math.max(1, Math.floor(w / 2));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    C(x, y, r, c);
  }
}
function POLY(pts: [number, number][], c: RGB): void {
  let minY = H, maxY = 0;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) R(xs[k], y, xs[k + 1] - xs[k] + 1, 1, c);
  }
}
function STAR5(cx: number, cy: number, ro: number, ri: number, c: RGB): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  POLY(pts, c);
}

// ---------------- PNG encoder ----------------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let cc = n;
  for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
  CRC_TABLE[n] = cc >>> 0;
}
function crc32(b: Buffer): number {
  let cc = 0xffffffff;
  for (const x of b) cc = CRC_TABLE[(cc ^ x) & 0xff] ^ (cc >>> 8);
  return (cc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------- 5x7 bitmap font ----------------
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
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
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
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['.....', '..#..', '.....', '.##..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '...#.', '##...'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.###.'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '.####', '....#'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
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
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.#...', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '/': ['....#', '....#', '...#.', '...#.', '..#..', '.#...', '#....'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#....', '...##', '...##'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '+': ['.....', '..#..', '..#..', '.###.', '..#..', '..#..', '.....'],
  '&': ['.###.', '#...#', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '~': ['.....', '.....', '.#.#.', '#.#.#', '.....', '.....', '.....'],
  '?2': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};
function glyph(ch: string): string[] {
  return F5[ch] ?? F5['?'];
}
function boldOff(sc: number): number {
  return sc >= 6 ? 2 : 1;
}
interface TextOpts {
  bold?: boolean;
  tracking?: number;
  wordGap?: number;
  stretch?: number[];
}
function textW(s: string, sc: number, o: TextOpts = {}): number {
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w += 3 * sc + (o.wordGap ?? 0);
    else w += 6 * sc + (o.bold ? boldOff(sc) : 0) + (o.tracking ?? 0);
  }
  return w - (o.tracking ?? 0);
}
function text(s: string, x: number, y: number, sc: number, c: RGB, o: TextOpts = {}): void {
  let cx = x;
  const bo = o.bold ? boldOff(sc) : 0;
  for (const ch of s) {
    if (ch === ' ') {
      cx += 3 * sc + (o.wordGap ?? 0);
      continue;
    }
    const g = glyph(ch);
    let yy = y;
    for (let r = 0; r < 7; r++) {
      const rh = o.stretch ? o.stretch[r] : sc;
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === '#') {
          R(cx + col * sc, yy, sc, rh, c);
          if (o.bold) R(cx + col * sc + bo, yy, sc, rh, c);
        }
      }
      yy += rh;
    }
    cx += 6 * sc + bo + (o.tracking ?? 0);
  }
}
function textC(s: string, cx: number, y: number, sc: number, c: RGB, o: TextOpts = {}): void {
  text(s, Math.round(cx - textW(s, sc, o) / 2), y, sc, c, o);
}

// ---------------- crowd figures ----------------
const SHIRTS: RGB[] = [RED, BLUE, GREEN, YELLOW, WHITE, PURPLE, TEAL, ORANGE];
function figure(x: number, yBase: number, h: number, shirt: RGB, pose: string): void {
  const headR = Math.max(2, Math.round(h * 0.13));
  const headY = yBase - h + headR;
  const hipY = yBase - Math.round(h * 0.35);
  const torsoW = Math.max(3, Math.round(h * 0.24));
  C(x, headY, headR, SKIN);
  R(x - Math.floor(torsoW / 2), headY + headR, torsoW, hipY - headY - headR, shirt);
  LW(x, hipY, x - Math.round(h * 0.16), yBase, 2, PANTS);
  LW(x, hipY, x + Math.round(h * 0.16), yBase, 2, PANTS);
  const shY = headY + headR + 2;
  if (pose === 'cheer') {
    LW(x - 2, shY, x - Math.round(h * 0.22), shY - Math.round(h * 0.3), 2, shirt);
    LW(x + 2, shY, x + Math.round(h * 0.22), shY - Math.round(h * 0.3), 2, shirt);
  } else if (pose === 'photo') {
    LW(x + 2, shY, x + Math.round(h * 0.24), shY - 2, 2, shirt);
    LW(x - 2, shY, x + Math.round(h * 0.24), shY - 2, 2, shirt);
    R(x + Math.round(h * 0.24) - 1, shY - 5, 4, 3, INK);
  } else if (pose === 'hat') {
    R(x - headR - 2, headY - headR + 1, headR * 2 + 4, 2, GOLD_DARK);
    R(x - headR + 1, headY - headR - 3, headR * 2 - 2, 4, GOLD_DARK);
    LW(x - 2, shY, x - Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
    LW(x + 2, shY, x + Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
  } else if (pose === 'umbrella') {
    LW(x + 2, shY, x + Math.round(h * 0.2), shY - Math.round(h * 0.42), 2, shirt);
    E(x + Math.round(h * 0.2), shY - Math.round(h * 0.42) - 2, Math.round(h * 0.26), Math.round(h * 0.13), RED);
    LW(x - 2, shY, x - Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
  } else if (pose === 'flag') {
    LW(x + 2, shY, x + Math.round(h * 0.2), shY - Math.round(h * 0.34), 2, shirt);
    L(x + Math.round(h * 0.2), shY - Math.round(h * 0.34), x + Math.round(h * 0.2), shY - Math.round(h * 0.34) - 12, INK);
    R(x + Math.round(h * 0.2) + 1, shY - Math.round(h * 0.34) - 12, 14, 4, YELLOW);
    R(x + Math.round(h * 0.2) + 1, shY - Math.round(h * 0.34) - 8, 14, 3, BLUE);
    R(x + Math.round(h * 0.2) + 1, shY - Math.round(h * 0.34) - 5, 14, 3, RED);
    LW(x - 2, shY, x - Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
  } else {
    LW(x - 2, shY, x - Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
    LW(x + 2, shY, x + Math.round(h * 0.18), shY + Math.round(h * 0.2), 2, shirt);
  }
}
function childOnShoulders(x: number, yBase: number, h: number, shirt: RGB): void {
  figure(x, yBase, h, shirt, 'plain');
  const topY = yBase - h - Math.round(h * 0.4);
  C(x, topY, 5, SKIN);
  R(x - 4, topY + 5, 8, 9, RED);
  LW(x - 4, topY + 14, x - 10, topY + 18, 2, PANTS);
  LW(x + 4, topY + 14, x + 10, topY + 18, 2, PANTS);
  LW(x - 4, topY + 7, x - 12, topY - 1, 2, RED);
  LW(x + 4, topY + 7, x + 12, topY - 1, 2, RED);
}

// ---------------- page ----------------
function drawMasthead(): void {
  R(0, 0, W, 3, INK);
  R(0, H - 3, W, 3, INK);
  R(0, 0, 3, H, INK);
  R(W - 3, 0, 3, H, INK);
  textC('THE WORLD', 512, 18, 9, INK, { bold: true, tracking: 8 });
  textC('WEDNESDAY, 25 NOVEMBER 2026', 512, 90, 2, INK, { tracking: 2 });
  textC('IN ONE IMAGE', 512, 108, 2, GOLD_DARK, { bold: true, tracking: 4 });
  R(24, 128, 976, 3, GOLD);
  R(24, 133, 976, 1, INK);
}
function drawLeadHead(): void {
  textC('HOSTAGES FREED IN CARTAGENA', 512, 146, 4, INK, { bold: true, tracking: 2 });
  textC('~30 HOSTAGES FREED IN DAWN RAID', 512, 182, 2, INK, {});
  textC('1 GUNMAN KILLED — 4 HELD IN CARTAGENA', 512, 200, 2, INK, {});
}
function drawLeadScene(): void {
  const SX = 24, SY = 224, SW = 976, SH = 332;
  // sky, 4 layers
  R(SX, SY, SW, 25, SKY1);
  R(SX, SY + 25, SW, 25, SKY2);
  R(SX, SY + 50, SW, 25, SKY3);
  R(SX, SY + 75, SW, 25, SKY4);
  // sun + rays (r 100, two parallel lines each)
  C(880, 268, 36, HALO);
  C(880, 268, 30, SUN);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x0 = Math.round(880 + 38 * Math.cos(a)), y0 = Math.round(268 + 38 * Math.sin(a));
    const x1 = Math.round(880 + 100 * Math.cos(a)), y1 = Math.round(268 + 100 * Math.sin(a));
    LW(x0, y0, x1, y1, 2, SUN);
    LW(x0 + 2, y0 + 1, x1 + 2, y1 + 1, 1, HALO);
  }
  // buildings
  const bcols: RGB[] = [[140, 123, 102], [122, 106, 88], [107, 91, 74], [151, 131, 108]];
  const bldgs: [number, number, number, number][] = [
    [24, 330, 90, 140], [114, 312, 80, 158], [194, 344, 70, 126], [264, 318, 86, 152],
    [350, 340, 78, 130], [428, 316, 88, 154], [516, 348, 72, 122], [588, 322, 90, 148],
    [678, 346, 76, 124], [754, 318, 84, 152], [838, 342, 80, 128], [918, 324, 82, 146],
  ];
  for (let i = 0; i < bldgs.length; i++) {
    const [bx, by, bw, bh] = bldgs[i];
    R(bx, by, bw, bh, bcols[i % 4]);
    for (let wy = by + 12; wy < by + bh - 8; wy += 22) {
      for (let wx = bx + 8; wx < bx + bw - 8; wx += 18) {
        R(wx, wy, 8, 10, (wx + wy) % 36 === 0 ? [242, 217, 140] : [42, 38, 32]);
      }
    }
  }
  // EXITO supermarket facade (left)
  R(40, 336, 280, 134, [168, 154, 128]);
  R(40, 336, 280, 8, YELLOW);
  R(40, 344, 280, 6, BLUE);
  R(40, 350, 280, 6, RED);
  R(52, 364, 256, 34, WHITE);
  text('EXITO', 62, 370, 4, RED, { bold: true, tracking: 2 });
  R(52, 404, 256, 3, INK);
  R(52, 414, 120, 22, [58, 58, 66]);
  R(196, 414, 112, 22, [58, 58, 66]);
  // helicopter
  E(430, 292, 46, 15, HELI);
  R(470, 288, 34, 4, HELI);
  L(430, 274, 430, 266, HELI);
  L(392, 266, 470, 266, HELI);
  E(452, 290, 12, 8, [168, 204, 226]);
  LW(414, 306, 402, 312, 3, HELI);
  LW(446, 306, 458, 312, 3, HELI);
  // spotlight cone down to open plaza
  POLY([[425, 306], [308, 552], [378, 552]], SPOT);
  L(425, 306, 308, 552, [247, 235, 190]);
  L(425, 306, 378, 552, [247, 235, 190]);
  // street / plaza
  R(SX, 470, SW, 86, STREET);
  E(343, 540, 90, 12, PLAZA);
  R(SX, 470, SW, 2, [110, 100, 86]);
  // armored vehicle
  R(700, 512, 92, 24, [74, 74, 66]);
  R(716, 498, 34, 14, [74, 74, 66]);
  C(716, 540, 7, INK);
  C(744, 540, 7, INK);
  C(772, 540, 7, INK);
  R(700, 512, 92, 3, [100, 100, 90]);
  // crowd — third row (small, 14–18 px)
  const row3x = [100, 190, 280, 370, 460, 550, 640, 730, 820, 900];
  const row3h = [15, 18, 14, 17, 15, 18, 14, 16, 15, 17];
  for (let i = 0; i < row3x.length; i++) {
    figure(row3x[i], 502, row3h[i], SHIRTS[(i + 3) % 8], 'plain');
  }
  // flags waved by three third-row figures
  for (const fx of [190, 460, 730]) {
    L(fx + 8, 470, fx + 8, 448, INK);
    R(fx + 9, 448, 16, 4, YELLOW);
    R(fx + 9, 452, 16, 3, BLUE);
    R(fx + 9, 455, 16, 3, RED);
  }
  // crowd — second row (20–26 px) + placards
  const row2x = [70, 125, 180, 235, 290, 345, 400, 455, 510, 565, 620, 675, 730, 785, 840, 895];
  const row2h = [22, 25, 21, 26, 23, 20, 24, 22, 25, 21, 26, 23, 20, 24, 22, 25];
  const row2p = ['plain', 'cheer', 'plain', 'photo', 'plain', 'cheer', 'hat', 'plain', 'photo', 'plain', 'cheer', 'plain', 'hat', 'plain', 'photo', 'plain'];
  for (let i = 0; i < row2x.length; i++) {
    figure(row2x[i], 524, row2h[i], SHIRTS[i % 8], row2p[i]);
  }
  // placards: gold framed square, red circle, white tall banner with 5-point star
  R(286, 470, 28, 22, GOLD);
  R(288, 472, 24, 18, [232, 185, 12]);
  R(286, 470, 28, 2, INK); R(286, 490, 28, 2, INK);
  C(565, 478, 12, RED);
  C(565, 478, 9, [220, 80, 70]);
  R(776, 458, 24, 30, WHITE);
  R(776, 458, 24, 30, INK);
  R(778, 460, 20, 26, WHITE);
  STAR5(788, 473, 8, 3, GOLD);
  // crowd — front row (28–34 px), 8 shirt colours, varied poses
  const row1x = [90, 144, 198, 252, 306, 360, 414, 468, 522, 576, 630, 684, 738, 792];
  const row1h = [30, 33, 28, 32, 30, 34, 29, 31, 30, 33, 28, 32, 30, 31];
  const row1p = ['cheer', 'photo', 'hat', 'umbrella', 'plain', 'cheer', 'photo', 'hat', 'plain', 'umbrella', 'cheer', 'photo', 'hat', 'plain'];
  for (let i = 0; i < row1x.length; i++) {
    if (i === 8) childOnShoulders(row1x[i], 550, row1h[i], SHIRTS[i % 8]);
    else figure(row1x[i], 550, row1h[i], SHIRTS[i % 8], row1p[i]);
  }
  // journalist with tripod camera (left edge)
  figure(45, 550, 46, [40, 40, 48], 'plain');
  R(45 - 6, 550 - 46 - 6, 12, 4, INK);
  L(30, 550, 38, 522, INK);
  L(60, 550, 52, 522, INK);
  L(45, 550, 45, 520, INK);
  R(38, 512, 14, 9, INK);
  C(52, 516, 3, [168, 204, 226]);
  // uniformed officer (right edge), arm raised pointing
  figure(955, 550, 48, NAVY, 'plain');
  R(955 - 8, 550 - 48 - 7, 16, 4, NAVY);
  R(947, 550 - 30, 16, 3, GOLD);
  LW(957, 516, 972, 496, 2, NAVY);
  // street vendor with small cart (right of front row)
  R(838, 524, 52, 20, [120, 84, 50]);
  R(838, 524, 52, 4, [232, 185, 12]);
  C(850, 548, 5, INK);
  C(878, 548, 5, INK);
  R(842, 512, 44, 4, RED);
  R(842, 516, 44, 3, WHITE);
  R(842, 519, 44, 3, RED);
  L(842, 512, 838, 524, INK);
  L(886, 512, 890, 524, INK);
  figure(864, 524, 30, GREEN, 'plain');
}
function drawCard(x: number, y: number, kicker: string, title: string, facts: string[], art: (ax: number, ay: number) => void): void {
  R(x, y, 472, 142, PAPER);
  R(x, y, 472, 1, INK);
  R(x, y, 1, 142, INK);
  text(kicker, x + 12, y + 10, 2, GOLD_DARK, { bold: true, tracking: 1 });
  text(title, x + 12, y + 30, 3, INK, { bold: true });
  R(x + 12, y + 56, 40, 3, GOLD);
  for (let i = 0; i < facts.length; i++) text(facts[i], x + 12, y + 66 + i * 18, 2, INK, {});
  const ax = x + 472 - 158, ay = y + 8;
  R(ax, ay, 150, 126, WHITE);
  R(ax, ay, 150, 1, INK); R(ax, ay + 125, 150, 1, INK);
  R(ax, ay, 1, 126, INK); R(ax + 149, ay, 1, 126, INK);
  art(ax + 1, ay + 1);
}
function artSpace(ax: number, ay: number): void {
  R(ax, ay, 148, 124, [22, 35, 58]);
  const stars: [number, number, number, RGB][] = [
    [10, 12, 1, WHITE], [30, 30, 2, WHITE], [52, 10, 1, [242, 217, 140]], [74, 26, 1, WHITE],
    [96, 12, 2, [191, 217, 232]], [118, 34, 1, WHITE], [136, 16, 1, WHITE], [18, 52, 2, [242, 217, 140]],
    [44, 66, 1, WHITE], [70, 58, 1, WHITE], [108, 60, 2, WHITE], [130, 48, 1, [242, 217, 140]],
    [24, 88, 1, WHITE], [58, 96, 1, WHITE], [124, 92, 2, WHITE],
  ];
  for (const [sx, sy, sr, sc] of stars) {
    C(ax + sx, ay + sy, sr, sc);
    if (sr === 2) { L(ax + sx - 3, ay + sy, ax + sx + 3, ay + sy, sc); L(ax + sx, ay + sy - 3, ax + sx, ay + sy + 3, sc); }
  }
  // rocket
  R(ax + 96, ay + 44, 12, 34, WHITE);
  POLY([[ax + 96, ay + 44], [ax + 102, ay + 30], [ax + 108, ay + 44]], RED);
  R(ax + 92, ay + 62, 5, 12, RED);
  R(ax + 107, ay + 62, 5, 12, RED);
  POLY([[ax + 98, ay + 78], [ax + 102, ay + 94], [ax + 106, ay + 78]], [242, 160, 60]);
  C(ax + 102, ay + 54, 3, BLUE);
  // Earth, whole inside the box
  C(ax + 40, ay + 92, 24, [62, 122, 194]);
  E(ax + 34, ay + 86, 8, 5, [78, 154, 78]);
  E(ax + 48, ay + 100, 7, 4, [78, 154, 78]);
  E(ax + 30, ay + 100, 5, 3, [78, 154, 78]);
}
function artBangladesh(ax: number, ay: number): void {
  R(ax, ay, 148, 124, [239, 230, 210]);
  text('36', ax + 10, ay + 12, 3, INK, { bold: true });
  text('%', ax + 52, ay + 12, 3, INK, { bold: true });
  POLY([[ax + 96, ay + 34], [ax + 116, ay + 10], [ax + 124, ay + 10], [ax + 104, ay + 34]], GOLD);
  L(ax + 96, ay + 34, ax + 128, ay + 34, GOLD);
  L(ax + 96, ay + 38, ax + 128, ay + 38, GOLD);
  // factory with smoking chimneys
  R(ax + 10, ay + 78, 128, 46, [74, 74, 66]);
  R(ax + 10, ay + 78, 128, 4, [58, 58, 66]);
  R(ax + 18, ay + 52, 10, 26, [58, 58, 66]);
  R(ax + 34, ay + 58, 10, 20, [58, 58, 66]);
  for (const [px, py, pr] of [[23, 44, 5], [25, 34, 6], [28, 24, 7], [39, 50, 5], [41, 40, 6]] as [number, number, number][]) {
    C(ax + px, ay + py, pr, [210, 205, 195]);
  }
  R(ax + 60, ay + 88, 14, 12, [242, 217, 140]);
  R(ax + 84, ay + 88, 14, 12, [242, 217, 140]);
  R(ax + 108, ay + 88, 14, 12, [242, 217, 140]);
}
function artIndonesia(ax: number, ay: number): void {
  R(ax, ay, 148, 124, SKY1);
  E(ax + 30, ay + 96, 60, 22, [94, 138, 78]);
  E(ax + 110, ay + 100, 66, 24, [62, 106, 62]);
  // trees
  for (const [tx, ty, tr] of [[24, 78, 8], [48, 84, 7], [72, 76, 9], [100, 86, 7], [126, 80, 8]] as [number, number, number][]) {
    R(ax + tx - 1, ay + ty, 3, 10, [90, 60, 40]);
    C(ax + tx, ay + ty - 4, tr, [46, 96, 46]);
  }
  // small birds
  for (const [bx, by] of [[30, 24], [52, 18], [96, 26]] as [number, number][]) {
    L(ax + bx - 4, ay + by, ax + bx, ay + by + 2, INK);
    L(ax + bx, ay + by + 2, ax + bx + 4, ay + by, INK);
  }
  // mine shaft + water
  R(ax + 58, ay + 92, 32, 32, [42, 38, 32]);
  R(ax + 58, ay + 92, 32, 4, [90, 80, 66]);
  R(ax + 58, ay + 108, 32, 16, [62, 122, 194]);
  L(ax + 62, ay + 114, ax + 86, ay + 114, WHITE);
  L(ax + 64, ay + 120, ax + 82, ay + 120, WHITE);
}
function artEurope(ax: number, ay: number): void {
  R(ax, ay, 148, 124, [191, 217, 232]);
  // layered clouds
  for (const [cx, cy, cr] of [[26, 22, 10], [44, 18, 8], [92, 16, 9], [112, 24, 7], [128, 34, 8], [60, 30, 7]] as [number, number, number][]) {
    C(ax + cx, ay + cy, cr, WHITE);
    C(ax + cx + 8, ay + cy + 2, Math.max(5, cr - 3), [232, 238, 244]);
  }
  // hangar + runway + jets
  R(ax + 12, ay + 62, 124, 50, [74, 74, 66]);
  POLY([[ax + 12, ay + 62], [ax + 74, ay + 40], [ax + 136, ay + 62]], [58, 58, 66]);
  R(ax + 52, ay + 78, 44, 34, [42, 38, 32]);
  R(ax + 12, ay + 112, 124, 12, [120, 118, 112]);
  L(ax + 16, ay + 118, ax + 132, ay + 118, WHITE);
  // white jets with motion lines
  POLY([[ax + 60, ay + 84], [ax + 74, ay + 74], [ax + 88, ay + 84], [ax + 74, ay + 92]], WHITE);
  L(ax + 40, ay + 82, ax + 56, ay + 82, WHITE);
  POLY([[ax + 96, ay + 100], [ax + 108, ay + 92], [ax + 120, ay + 100], [ax + 108, ay + 106]], WHITE);
  L(ax + 80, ay + 98, ax + 94, ay + 98, WHITE);
  C(ax + 30, ay + 70, 4, [210, 205, 195]);
  C(ax + 36, ay + 64, 5, [210, 205, 195]);
}
function drawCards(): void {
  drawCard(24, 566, 'SPACE', "PAKISTAN'S FIRST", ['Muhammad Zeeshan Ali', 'first Pakistani in space', 'Shenzhou-24 docked 3.5h'], artSpace);
  drawCard(528, 566, 'BANGLADESH', 'WAGES UP 36%', ['Garment pay to 17,000', 'taka from Dec 1', 'after weeks of protest'], artBangladesh);
  drawCard(24, 716, 'INDONESIA', 'MINE FLOOD', ['9 killed, 17 trapped', 'Pongkor mine, Bogor', 'shaft 100 m deep'], artIndonesia);
  drawCard(528, 716, 'EUROPE', 'AIRBASE STRUCK', ['5 jets damaged', '3 MiG-31, 2 Su-34', 'Savasleyka — Reuters'], artEurope);
}
function drawBriefs(): void {
  R(24, 864, 976, 150, BAND);
  const rows = [
    'HODEIDAH — Saudi-led strikes hit Yemen port',
    'SOLOMON ISLANDS — security pact with Australia',
    'NVIDIA — shares fall 8.3% as rally fades',
    'CHEN JINING — Shanghai party chief probed',
    'MISSISSIPPI — 6 dead after Cessna crash',
    'HUAWEI — guilty on 10 of 12 US charges',
  ];
  const stretch = [3, 3, 3, 4, 3, 3, 3];
  for (let i = 0; i < rows.length; i++) {
    const y = 864 + i * 25;
    text(rows[i], 36, y + 1, 3, BAND_TEXT, { stretch, wordGap: 2 });
    if (i < rows.length - 1) R(24, y + 24, 976, 1, SEPARATOR);
  }
}
function drawPage(): void {
  R(0, 0, W, H, PAPER);
  drawMasthead();
  drawLeadHead();
  drawLeadScene();
  drawCards();
  drawBriefs();
}
function main(): void {
  drawPage();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(W, H, img);
  fs.writeFileSync(outDir + '/entry.png', png);
  const sha = crypto.createHash('sha256').update(png).digest('hex');
  const dossier = {
    title: 'THE WORLD — Wednesday, 25 November 2026',
    width: W,
    height: H,
    bytes: png.length,
    entry_png_sha256: sha,
  };
  fs.writeFileSync(outDir + '/dossier.json', JSON.stringify(dossier, null, 2) + '\n');
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
}
main();
