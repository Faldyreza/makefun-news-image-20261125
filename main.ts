// news-image-20261125 v4 — "THE WORLD", Wednesday 25 November 2026.
// Written fresh from DESIGN.md. Node 22 stdlib only, no network at run time.
// Draws a 1024x1024 newspaper front page to /output/entry.png + /output/dossier.json.
// Facts (all verified 25 Nov 2026, sources in run-2026-11-26-v1.md):
//  LEAD Cartagena: dawn raid on Exito supermarket, ~30 hostages freed, 1 gunman
//  killed, 4 arrested. SPACE: Shenzhou-24, first Pakistani astronaut Muhammad
//  Zeeshan Ali docks at Tiangong. BANGLADESH: garment wage +36% to 17,000 taka,
//  from 1 Dec. INDONESIA: Pongkor gold-mine flood, 9 dead, 17 trapped.
//  EUROPE: Ukraine hits Savasleyka air base, 5 jets damaged (3 MiG-31, 2 Su-34).
//  BRIEFS: Hodeidah, Solomon Islands pact, Nvidia -8.3%, Chen Jining probe,
//  Cessna Mississippi (6 dead), Huawei guilty 10 of 12 counts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 4);

type RGB = [number, number, number];
const PAPER: RGB = [248, 243, 230];
const INK: RGB = [25, 21, 18];
const RED: RGB = [168, 35, 27];
const GOLD: RGB = [192, 138, 30];
const CARD_BG: RGB = [255, 253, 246];
const CARD_LINE: RGB = [216, 205, 180];
const BRIEF_BG: RGB = [23, 19, 14];
const BRIEF_TEXT: RGB = [239, 231, 211];
const BRIEF_GOLD: RGB = [216, 169, 60];

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}
function hline(x0: number, x1: number, y: number, c: RGB): void {
  fillRect(x0, y, x1 - x0, 1, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    fillRect(x - ((w - 1) >> 1), y - ((w - 1) >> 1), w, w, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const half = Math.floor(rx * Math.sqrt(t));
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}
function poly(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
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
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPx(x, y, c);
    }
  }
}

// ---- 5x7 text font (own glyphs, '#' = on) ----
const F5: Record<string, string[]> = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  'D': ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  'a': ['.....', '.....', '.###.', '....#', '.####', '#...#', '.###.'],
  'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  'c': ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  'e': ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  'f': ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '.#...'],
  'g': ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  'h': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'i': ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  'j': ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  'k': ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  'l': ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'm': ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  'n': ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  'p': ['.....', '.....', '####.', '#...#', '#...#', '####.', '#....'],
  'q': ['.....', '.....', '.####', '#...#', '#...#', '.####', '....#'],
  'r': ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  's': ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  't': ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.'],
  'u': ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  'v': ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'w': ['.....', '.....', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  'y': ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  'z': ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##.#.', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#.##.'],
  '+': ['.....', '..#..', '..#..', '.###.', '..#..', '..#..', '.....'],
  '&': ['.###.', '#...#', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '=': ['.....', '.....', '.###.', '.....', '.###.', '.....', '.....'],
  '*': ['.....', '.#.#.', '..#..', '.###.', '..#..', '.#.#.', '.....'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
};

// ---- 8x12 display font, bold with small serif ticks (own glyphs) ----
const D12: Record<string, string[]> = {
  'A': ['..####..', '.##..##.', '##....##', '##....##', '##....##', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '###..###'],
  'B': ['#######.', '##....##', '##....##', '##....##', '#######.', '##....##', '##....##', '##....##', '##....##', '##....##', '#######.', '#######.'],
  'C': ['..#####.', '##....##', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##....##', '..#####.', '..#####.'],
  'D': ['######..', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '######..', '######..'],
  'E': ['########', '##......', '##......', '##......', '######..', '##......', '##......', '##......', '##......', '##......', '########', '########'],
  'F': ['########', '##......', '##......', '##......', '######..', '##......', '##......', '##......', '##......', '##......', '##......', '##......'],
  'G': ['..#####.', '##....##', '##......', '##......', '##......', '##..####', '##....##', '##....##', '##....##', '##....##', '..###.##', '..#####.'],
  'H': ['##....##', '##....##', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##', '##....##', '##....##'],
  'I': ['.######.', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '.######.'],
  'J': ['..######', '......##', '......##', '......##', '......##', '......##', '......##', '......##', '##....##', '##....##', '.######.', '..####..'],
  'K': ['##....##', '##...##.', '##..##..', '##.##...', '####....', '##.##...', '##..##..', '##...##.', '##....##', '##....##', '##....##', '##....##'],
  'L': ['##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '##......', '########', '########'],
  'M': ['##....##', '###..###', '##.##.##', '##.##.##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##'],
  'N': ['##....##', '###...##', '##.#..##', '##..#.##', '##...###', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##'],
  'O': ['..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..', '........'],
  'P': ['#######.', '##....##', '##....##', '##....##', '#######.', '##......', '##......', '##......', '##......', '##......', '##......', '##......'],
  'Q': ['..####..', '.##..##.', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..###...', '....##..', '.....###'],
  'R': ['#######.', '##....##', '##....##', '##....##', '#######.', '##.##...', '##..##..', '##...##.', '##....##', '##....##', '##....##', '##....##'],
  'S': ['..####..', '.##..##.', '##......', '##......', '.#####..', '.....##.', '......##', '......##', '##....##', '.##..##.', '..####..', '........'],
  'T': ['########', '########', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '..####..'],
  'U': ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '..####..', '........'],
  'V': ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '.##..##.', '.##..##.', '..#..#..', '..#..#..', '...##...'],
  'W': ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##.##.##', '##.##.##', '###..###', '##....##', '##....##', '##....##'],
  'X': ['##....##', '##....##', '.##..##.', '..#..#..', '...##...', '...##...', '..#..#..', '.##..##.', '##....##', '##....##', '##....##', '##....##'],
  'Y': ['##....##', '##....##', '.##..##.', '..#..#..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  'Z': ['########', '########', '......##', '.....##.', '....##..', '...##...', '..##....', '.##.....', '##......', '##......', '########', '########'],
  ' ': ['........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '........'],
  '-': ['........', '........', '........', '........', '........', '.######.', '.######.', '........', '........', '........', '........', '........'],
  '.': ['........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '...##...', '...##...'],
};

function textWidth(s: string, scale: number, font: Record<string, string[]>, tight = false): number {
  const gw = font['A'][0].length;
  const adv = tight ? gw * scale : (gw + 1) * scale;
  return s.length * adv - (tight ? 0 : scale);
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB, font: Record<string, string[]>, tight = false): number {
  const gw = font['A'][0].length;
  const adv = tight ? gw * scale : (gw + 1) * scale;
  let cx = x;
  for (const ch of s) {
    const g = font[ch];
    if (g) {
      for (let r = 0; r < g.length; r++) {
        const row = g[r];
        for (let col = 0; col < row.length; col++) {
          if (row[col] === '#') fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += adv;
  }
  return cx - x - (tight ? 0 : scale);
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB, font: Record<string, string[]>, tight = false): void {
  drawText(s, cx - Math.floor(textWidth(s, scale, font, tight) / 2), y, scale, c, font, tight);
}

// ---- PNG encoder (zlib + CRC32, RGB) ----
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const byte of b) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4, di = y * (1 + W * 3) + 1 + x * 3;
      raw[di] = img[si]; raw[di + 1] = img[si + 1]; raw[di + 2] = img[si + 2];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- crowd figure ----
type Pose = 'stand' | 'cheer' | 'phone' | 'hat' | 'umbrella';
function figure(x: number, baseY: number, h: number, c: RGB, pose: Pose): void {
  const skin: RGB = [214, 178, 140];
  const hr = Math.max(2, Math.round(h * 0.11));
  const headY = baseY - h + hr;
  const shoulderY = baseY - h + hr * 2 + 1;
  const hipY = baseY - Math.round(h * 0.24);
  // legs
  line(x - 2, hipY, x - 4, baseY, INK, 2);
  line(x + 2, hipY, x + 4, baseY, INK, 2);
  // torso
  const tw = Math.max(4, Math.round(h * 0.18));
  fillRect(x - (tw >> 1), shoulderY, tw, hipY - shoulderY, c);
  // arms by pose
  if (pose === 'cheer') {
    line(x - 3, shoulderY + 2, x - 9, shoulderY - 8, c, 2);
    line(x + 3, shoulderY + 2, x + 9, shoulderY - 8, c, 2);
  } else if (pose === 'phone') {
    line(x - 3, shoulderY + 2, x - 6, shoulderY + 8, c, 2);
    line(x + 3, shoulderY + 2, x + 8, shoulderY - 10, c, 2);
    fillRect(x + 6, shoulderY - 16, 4, 7, INK); // phone held up
  } else if (pose === 'umbrella') {
    line(x - 3, shoulderY + 2, x - 6, shoulderY + 8, c, 2);
    line(x + 3, shoulderY + 2, x + 7, shoulderY - 4, c, 2);
    // red canopy dome above head
    poly([[x - 10, headY - hr - 2], [x - 7, headY - hr - 9], [x, headY - hr - 11], [x + 7, headY - hr - 9], [x + 10, headY - hr - 2]], RED);
    line(x, headY - hr - 10, x, headY - hr + 2, INK, 1);
  } else {
    line(x - 3, shoulderY + 2, x - 5, shoulderY + 9, c, 2);
    line(x + 3, shoulderY + 2, x + 5, shoulderY + 9, c, 2);
  }
  // head
  disc(x, headY, hr, skin);
  if (pose === 'hat') {
    fillRect(x - hr - 2, headY - hr - 1, hr * 2 + 4, 2, INK); // brim
    fillRect(x - hr + 1, headY - hr - 4, hr * 2 - 2, 3, INK); // crown
  }
}

// ---- masthead + headline + lead facts ----
function drawHeader(): void {
  fillRect(32, 10, 960, 3, INK);
  fillRect(32, 16, 960, 1, RED);
  drawTextCentered('THE WORLD', 512, 22, 6, INK, D12);
  drawTextCentered('WEDNESDAY, 25 NOVEMBER 2026', 512, 100, 2, INK, F5);
  fillRect(32, 122, 960, 2, INK);
  drawTextCentered('ALL HOSTAGES FREED', 512, 134, 3, INK, D12);
  drawTextCentered('IN CARTAGENA RAID', 512, 174, 3, RED, D12);
  drawTextCentered('Security forces storm Exito supermarket at dawn in Cartagena', 512, 218, 2, INK, F5);
  drawTextCentered('About 30 hostages freed; one gunman killed, four arrested', 512, 236, 2, INK, F5);
  drawTextCentered('Gang held shoppers after an armoured-car robbery failed', 512, 254, 2, INK, F5);
}

// ---- lead scene (x 32..992, y 276..524) ----
function drawLeadScene(): void {
  const x0 = 32, y0 = 276, x1 = 992, y1 = 524;
  // dawn sky, four bands
  fillRect(x0, 276, 960, 31, [246, 217, 138]);
  fillRect(x0, 307, 960, 31, [239, 185, 106]);
  fillRect(x0, 338, 960, 31, [229, 154, 82]);
  fillRect(x0, 369, 960, 33, [217, 127, 74]);
  // soft sun: pale halo rings, then disc, then short sparse pale rays
  disc(880, 326, 48, [249, 230, 176]);
  disc(880, 326, 38, [247, 220, 143]);
  const rayC: RGB = [245, 222, 154];
  const rayAngles = [-78, -52, -28, -4, 22, 48, 74, 100];
  for (const deg of rayAngles) {
    const a = (deg * Math.PI) / 180;
    line(
      Math.round(880 + 52 * Math.cos(a)), Math.round(326 + 52 * Math.sin(a)),
      Math.round(880 + 74 * Math.cos(a)), Math.round(326 + 74 * Math.sin(a)),
      rayC, 2,
    );
  }
  disc(880, 326, 26, [242, 193, 78]);
  // helicopter spotlight: pale cone landing on the open road (left-centre),
  // drawn BEFORE the buildings so it never crosses a building edge
  poly([[395, 348], [250, 468], [382, 468]], [247, 232, 168]);
  // left low building
  fillRect(x0 + 2, 428, 166, 42, [203, 191, 163]);
  fillRect(x0 + 2, 428, 166, 4, [120, 108, 88]);
  fillRect(x0 + 14, 440, 18, 16, [70, 62, 52]);
  fillRect(x0 + 44, 440, 18, 16, [70, 62, 52]);
  fillRect(x0 + 74, 440, 18, 16, [70, 62, 52]);
  // supermarket (right): facade, red sign band, EXITO, doors, windows
  fillRect(640, 398, 348, 72, [239, 227, 200]);
  fillRect(640, 398, 348, 28, RED);
  drawText('EXITO', 748, 402, 2, [255, 253, 246], D12);
  fillRect(660, 440, 34, 30, [60, 52, 44]);
  fillRect(706, 440, 34, 30, [60, 52, 44]);
  fillRect(820, 440, 26, 22, [120, 108, 88]);
  fillRect(860, 440, 26, 22, [120, 108, 88]);
  fillRect(900, 440, 26, 22, [120, 108, 88]);
  fillRect(940, 440, 26, 22, [120, 108, 88]);
  // Colombia flag on the supermarket roof
  line(972, 370, 972, 398, INK, 2);
  fillRect(972, 370, 26, 9, [252, 209, 22]);
  fillRect(972, 379, 26, 5, [0, 56, 147]);
  fillRect(972, 384, 26, 4, [206, 17, 38]);
  // helicopter (drawn over the cone)
  line(250, 312, 430, 312, INK, 2); // main rotor
  line(340, 312, 340, 318, INK, 2); // mast
  fillRect(280, 318, 120, 28, [46, 42, 38]); // body
  poly([[280, 332], [212, 322], [212, 338]], [46, 42, 38]); // tail boom
  fillRect(206, 310, 8, 18, [46, 42, 38]); // tail fin
  line(212, 308, 212, 342, INK, 2); // tail rotor
  fillRect(382, 322, 18, 16, [191, 227, 242]); // cockpit window
  line(292, 346, 292, 352, INK, 2);
  line(388, 346, 388, 352, INK, 2);
  line(286, 352, 394, 352, INK, 2); // skids
  // street: sidewalk, road, centre dashes
  fillRect(x0, 470, 960, 8, [138, 127, 112]);
  fillRect(x0, 478, 960, 44, [107, 98, 87]);
  for (let dx = 60; dx < 960; dx += 48) fillRect(dx, 498, 24, 3, [216, 205, 180]);
  // armoured vehicle on the road
  poly([[540, 486], [630, 486], [638, 500], [630, 508], [540, 508]], [58, 53, 47]);
  fillRect(566, 478, 34, 10, [58, 53, 47]);
  disc(560, 508, 7, INK);
  disc(612, 508, 7, INK);
  fillRect(632, 494, 6, 4, [242, 193, 78]); // headlight
  // back layer of the crowd (smaller, dimmer)
  const backC: RGB = [107, 91, 73];
  const backX = [80, 140, 210, 300, 380, 470, 700, 780, 860, 930];
  for (let i = 0; i < backX.length; i++) {
    figure(backX[i], 486, 18 + (i % 3) * 2, backC, 'stand');
  }
  // front row: varied heights and poses
  const front: Array<[number, number, RGB, Pose]> = [
    [60, 30, [46, 42, 38], 'stand'],
    [110, 34, [90, 58, 42], 'cheer'],
    [160, 28, [58, 74, 90], 'hat'],
    [215, 32, [122, 42, 42], 'umbrella'],
    [270, 30, [58, 74, 90], 'phone'],
    [330, 26, [74, 66, 52], 'stand'],
    [390, 34, [46, 42, 38], 'cheer'],
    [450, 28, [90, 58, 42], 'stand'],
    [500, 32, [58, 74, 90], 'hat'],
    [660, 30, [46, 42, 38], 'stand'],
    [720, 34, [122, 42, 42], 'umbrella'],
    [800, 28, [74, 66, 52], 'phone'],
    [870, 32, [90, 58, 42], 'hat'],
    [940, 30, [46, 42, 38], 'stand'],
  ];
  for (const [fx, fh, fc, pose] of front) figure(fx, 520, fh, fc, pose);
  // scene border
  fillRect(x0, y0, 960, 2, INK);
  fillRect(x0, y1 - 2, 960, 2, INK);
  fillRect(x0, y0, 2, 248, INK);
  fillRect(x1 - 2, y0, 2, 248, INK);
}

// ---- secondary cards ----
function cardFrame(cx: number, cy: number, accent: RGB): void {
  fillRect(cx, cy, 224, 240, CARD_BG);
  fillRect(cx, cy, 224, 5, accent);
  fillRect(cx, cy, 224, 1, CARD_LINE);
  fillRect(cx, cy + 239, 224, 1, CARD_LINE);
  fillRect(cx, cy, 1, 240, CARD_LINE);
  fillRect(cx + 223, cy, 1, 240, CARD_LINE);
}
function drawCardArts(ax: number, ay: number): void {
  // SPACE art (ax, ay, 200x84)
  fillRect(ax, ay, 200, 84, [27, 35, 64]);
  const stars: Array<[number, number]> = [[20, 12], [60, 8], [120, 18], [170, 10], [90, 26], [150, 30], [40, 40], [185, 44]];
  for (const [sx, sy] of stars) fillRect(ax + sx, ay + sy, 2, 2, [255, 255, 255]);
  // rocket, centre-left
  poly([[ax + 34, ay + 22], [ax + 48, ay + 22], [ax + 41, ay + 8]], RED);
  fillRect(ax + 34, ay + 22, 14, 44, [245, 245, 240]);
  poly([[ax + 34, ay + 56], [ax + 24, ay + 70], [ax + 34, ay + 66]], RED);
  poly([[ax + 48, ay + 56], [ax + 58, ay + 70], [ax + 48, ay + 66]], RED);
  disc(ax + 41, ay + 34, 4, [120, 180, 220]);
  poly([[ax + 36, ay + 66], [ax + 46, ay + 66], [ax + 41, ay + 82]], [232, 130, 30]);
  // station, top-right
  ellipse(ax + 150, ay + 26, 26, 8, [200, 204, 212]);
  fillRect(ax + 118, ay + 22, 18, 8, [138, 147, 166]);
  fillRect(ax + 164, ay + 22, 18, 8, [138, 147, 166]);
  fillRect(ax + 144, ay + 20, 12, 12, [200, 204, 212]);
}
function drawBangladeshArt(ax: number, ay: number): void {
  fillRect(ax, ay, 200, 84, [243, 233, 207]);
  // big 36% top-left, gold arrow top-right, wide clear gap between them
  drawText('36%', ax + 8, ay + 6, 5, GOLD, F5, true);
  line(ax + 158, ay + 60, ax + 192, ay + 10, GOLD, 4);
  poly([[ax + 192, ay + 10], [ax + 178, ay + 12], [ax + 190, ay + 26]], GOLD);
  // factory, bottom-right
  fillRect(ax + 128, ay + 30, 10, 26, [74, 63, 48]);
  poly([[ax + 120, ay + 56], [ax + 140, ay + 42], [ax + 160, ay + 56], [ax + 180, ay + 42], [ax + 200, ay + 56]], [74, 63, 48]);
  fillRect(ax + 120, ay + 56, 80, 28, [74, 63, 48]);
  fillRect(ax + 132, ay + 64, 12, 10, [243, 233, 207]);
  fillRect(ax + 152, ay + 64, 12, 10, [243, 233, 207]);
  fillRect(ax + 172, ay + 64, 12, 10, [243, 233, 207]);
}
function drawMineArt(ax: number, ay: number): void {
  fillRect(ax, ay, 200, 84, [232, 220, 200]);
  fillRect(ax, ay + 30, 200, 54, [122, 90, 56]);
  fillRect(ax, ay + 30, 200, 4, [107, 122, 58]);
  // shaft with water at the bottom and a rescue rope
  fillRect(ax + 88, ay + 8, 24, 60, [46, 33, 24]);
  fillRect(ax + 88, ay + 52, 24, 16, [62, 124, 166]);
  line(ax + 100, ay + 8, ax + 100, ay + 52, [216, 205, 180], 2);
  disc(ax + 100, ay + 6, 5, [232, 200, 50]); // helmet at the shaft mouth
  fillRect(ax + 20, ay + 44, 16, 8, [90, 66, 40]);
  fillRect(ax + 160, ay + 40, 18, 8, [90, 66, 40]);
  fillRect(ax + 40, ay + 62, 14, 8, [90, 66, 40]);
}
function drawEuropeArt(ax: number, ay: number): void {
  fillRect(ax, ay, 200, 84, [220, 230, 238]);
  // runway
  fillRect(ax, ay + 62, 200, 22, [90, 90, 90]);
  for (let dx = 8; dx < 200; dx += 32) fillRect(ax + dx, ay + 71, 16, 3, [255, 255, 255]);
  // jet 1 (intact, left)
  poly([[ax + 28, ay + 36], [ax + 66, ay + 44], [ax + 28, ay + 52]], [46, 42, 38]);
  poly([[ax + 32, ay + 36], [ax + 40, ay + 24], [ax + 44, ay + 36]], [46, 42, 38]);
  // jet 2 (hit, right) with explosion starburst and smoke
  poly([[ax + 118, ay + 22], [ax + 150, ay + 30], [ax + 118, ay + 38]], [46, 42, 38]);
  const bx = ax + 152, by = ay + 30;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const a2 = a + Math.PI / 8;
    poly([
      [bx, by],
      [Math.round(bx + 18 * Math.cos(a)), Math.round(by + 18 * Math.sin(a))],
      [Math.round(bx + 7 * Math.cos(a2)), Math.round(by + 7 * Math.sin(a2))],
    ], k % 2 === 0 ? [232, 130, 30] : [242, 193, 78]);
  }
  disc(ax + 140, ay + 12, 7, [154, 160, 168]);
  disc(ax + 158, ay + 8, 9, [154, 160, 168]);
  disc(ax + 172, ay + 16, 6, [154, 160, 168]);
}
function drawCards(): void {
  fillRect(32, 536, 960, 2, INK);
  const cy = 548;
  const cols: Array<{ x: number; accent: RGB; kicker: string; kickerC: RGB; title: string[]; fact: string[]; art: (ax: number, ay: number) => void }> = [
    { x: 28, accent: [27, 35, 64], kicker: 'SPACE', kickerC: [27, 35, 64], title: ['PAKISTAN', 'IN SPACE'], fact: ['First Pakistani', 'astronaut docks', 'at Tiangong'], art: drawCardArts },
    { x: 276, accent: GOLD, kicker: 'ECONOMY', kickerC: [140, 96, 10], title: ['WAGES UP 36%'], fact: ['Garment pay rises', 'to 17,000 taka', 'from Dec 1'], art: drawBangladeshArt },
    { x: 524, accent: [122, 90, 56], kicker: 'DISASTER', kickerC: [122, 90, 56], title: ['PONGKOR', 'MINE FLOOD'], fact: ['9 dead,', '17 trapped in', 'flooded gold mine'], art: drawMineArt },
    { x: 772, accent: RED, kicker: 'EUROPE - WAR', kickerC: RED, title: ['UKRAINE HITS', 'AIR BASE'], fact: ['Five jets', 'damaged at', 'Savasleyka base'], art: drawEuropeArt },
  ];
  for (const col of cols) {
    cardFrame(col.x, cy, col.accent);
    drawText(col.kicker, col.x + 12, cy + 16, 2, col.kickerC, F5);
    if (col.title.length === 1) {
      drawText(col.title[0], col.x + 12, cy + 50, 3, INK, F5, true);
    } else {
      drawText(col.title[0], col.x + 12, cy + 38, 3, INK, F5, true);
      drawText(col.title[1], col.x + 12, cy + 62, 3, INK, F5, true);
    }
    col.art(col.x + 12, cy + 92);
    // three short fact lines, tight advance so nothing bleeds past the card
    drawText(col.fact[0], col.x + 12, cy + 184, 2, INK, F5, true);
    drawText(col.fact[1], col.x + 12, cy + 202, 2, INK, F5, true);
    drawText(col.fact[2], col.x + 12, cy + 220, 2, INK, F5, true);
  }
}

// ---- briefs strip ----
function drawBriefs(): void {
  fillRect(0, 800, 1024, 216, BRIEF_BG);
  drawText('THE DAY IN BRIEF', 32, 812, 2, BRIEF_GOLD, F5);
  const rows: Array<[string, string]> = [
    ['HODEIDAH — ', 'Saudi-led coalition hits port; Jeddah threatened'],
    ['SOLOMON ISLANDS — ', 'Pact with Australia, no foreign bases'],
    ['NVIDIA — ', 'Shares slide 8.3% as Huang rally fades'],
    ['CHEN JINING — ', 'Beijing probes Shanghai party chief'],
    ['MISSISSIPPI — ', 'Six dead as Cessna crashes in Gulf'],
    ['HUAWEI — ', 'Guilty on 10 of 12 US counts'],
  ];
  let y = 840;
  for (const [kick, rest] of rows) {
    let x = 32;
    x += drawText(kick, x, y, 3, BRIEF_GOLD, F5, true);
    drawText(rest, x, y, 3, BRIEF_TEXT, F5, true);
    y += 26;
  }
}

// ---- build the page ----
fillRect(0, 0, W, H, PAPER);
drawHeader();
drawLeadScene();
drawCards();
drawBriefs();

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
fs.mkdirSync(outDir, { recursive: true });
const png = encodePNG();
fs.writeFileSync(path.join(outDir, 'entry.png'), png);
const dossier = {
  version: 4,
  title: 'THE WORLD',
  date: '2026-11-25',
  width: W,
  height: H,
  entry_png_sha256: crypto.createHash('sha256').update(png).digest('hex'),
  stories: [
    'Cartagena hostage rescue',
    'Shenzhou-24 / first Pakistani astronaut',
    'Bangladesh garment wage +36%',
    'Pongkor mine flood',
    'Savasleyka air base strike',
    'Hodeidah',
    'Solomon Islands pact',
    'Nvidia -8.3%',
    'Chen Jining probe',
    'Cessna Mississippi',
    'Huawei guilty 10 of 12',
  ],
};
fs.writeFileSync(path.join(outDir, 'dossier.json'), JSON.stringify(dossier, null, 2) + '\n');
