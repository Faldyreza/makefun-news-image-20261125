// news-image-20261125 v5 — "THE WORLD", Wednesday 25 November 2026.
// Fresh build: software rasteriser + bitmap fonts + PNG encoder, Node 22 stdlib only.
// No network at run time. Deterministic: two runs write identical bytes.
// Facts: 11 stories of 25 Nov 2026 (lead Cartagena hostage rescue; Pakistan's first
// astronaut to Tiangong; Bangladesh garment wages +36%; Pongkor mine flood; Savasleyka
// air base strike; briefs Hodeidah, Solomon Islands, Nvidia, Chen Jining, Cessna, Huawei).
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;

// ---- palette ----
const PAPER: number[] = [244, 239, 228];
const CARD: number[] = [251, 248, 240];
const INK: number[] = [26, 23, 18];
const RED: number[] = [179, 38, 30];
const GOLD: number[] = [201, 150, 46];
const BAND: number[] = [20, 16, 12];
const LIGHT: number[] = [238, 231, 214];
const STREET: number[] = [58, 51, 44];
const SKIN: number[] = [201, 141, 100];
const SKY1: number[] = [237, 190, 114];
const SKY2: number[] = [224, 164, 94];
const SKY3: number[] = [209, 141, 85];
const SKY4: number[] = [192, 127, 86];
const SUN: number[] = [249, 226, 154];
const HALO: number[] = [242, 217, 140];
const BEAM: number[] = [246, 222, 138];
const HELI: number[] = [34, 38, 43];
const GLASS: number[] = [159, 195, 217];
const BLD1: number[] = [90, 74, 58];
const BLD2: number[] = [107, 91, 74];
const STORE: number[] = [122, 106, 88];
const ROOF: number[] = [138, 122, 102];
const WIN: number[] = [216, 201, 168];
const FACT: number[] = [58, 51, 44];

const img: Buffer = Buffer.alloc(W * H * 3);

// ---- raster primitives ----
function px(x: number, y: number, c: number[]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: number[]): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const f = 1 - (dy * dy) / (ry * ry);
    if (f < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(f));
    rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}

function poly(pts: number[][], c: number[]): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(xs[k]);
      const x1 = Math.floor(xs[k + 1]);
      if (x1 >= x0) rect(x0, y, x1 - x0 + 1, 1, c);
    }
  }
}

// ---- bitmap fonts (own designs) ----
// FONT5: 5x7, rows as 5-bit numbers, bit 4 = leftmost pixel.
const FONT5: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 1, 14],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], "-": [0, 0, 0, 14, 0, 0, 0],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "%": [24, 24, 2, 4, 8, 3, 3],
  "'": [4, 4, 8, 0, 0, 0, 0], ":": [0, 12, 12, 0, 12, 12, 0],
  "!": [4, 4, 4, 4, 4, 0, 4], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "&": [12, 18, 20, 8, 21, 18, 13],
  "+": [0, 4, 4, 31, 4, 4, 0], "=": [0, 0, 31, 0, 31, 0, 0],
  "?": [14, 17, 1, 6, 4, 0, 4], '"': [10, 10, 10, 0, 0, 0, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "_": [0, 0, 0, 0, 0, 0, 31],
  "*": [0, 4, 21, 14, 21, 4, 0], "$": [4, 15, 20, 14, 5, 30, 4],
};

// FONT8: 8x12 bold display, rows as 8-bit numbers, bit 7 = leftmost pixel.
// The "%" glyph is redrawn clean: two small corner circles joined by a thin
// diagonal, with empty space around the diagonal so it never clumps.
const FONT8: Record<string, number[]> = {
  A: [0b00011000, 0b00111100, 0b01100110, 0b01100110, 0b01111110, 0b01111110, 0b01100110, 0b01100110, 0b01100110, 0b01100110, 0b11100111, 0b11100111],
  B: [0b11111100, 0b11000110, 0b11000110, 0b11000110, 0b11111100, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11111100, 0b11111100],
  C: [0b00111110, 0b01100011, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b01100011, 0b00111110, 0b00000000],
  D: [0b11111000, 0b11001100, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11001100, 0b11111000],
  E: [0b11111111, 0b11000000, 0b11000000, 0b11000000, 0b11111100, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11111111, 0b11111111],
  F: [0b11111111, 0b11000000, 0b11000000, 0b11000000, 0b11111100, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000],
  G: [0b00111110, 0b01100011, 0b11000000, 0b11000000, 0b11000000, 0b11001111, 0b11000110, 0b11000110, 0b11000110, 0b01100011, 0b00111111, 0b00000000],
  H: [0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11111110, 0b11111110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110],
  I: [0b00111100, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00111100, 0b00111100],
  J: [0b00011111, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b11001100, 0b11001100, 0b01111000, 0b00000000],
  K: [0b11000110, 0b11001100, 0b11010100, 0b11101000, 0b11110000, 0b11100000, 0b11110000, 0b11101000, 0b11010100, 0b11001100, 0b11000110, 0b11000110],
  L: [0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11111111, 0b11111111],
  M: [0b11000011, 0b11100111, 0b11111111, 0b11011011, 0b11011011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011],
  N: [0b11000011, 0b11100011, 0b11110011, 0b11011011, 0b11001111, 0b11000111, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011],
  O: [0b00111100, 0b01100110, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b01100110, 0b00111100],
  P: [0b11111100, 0b11000110, 0b11000110, 0b11000110, 0b11111100, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000, 0b11000000],
  Q: [0b00111100, 0b01100110, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000111, 0b01100110, 0b00111100, 0b00001110],
  R: [0b11111100, 0b11000110, 0b11000110, 0b11000110, 0b11111100, 0b11101000, 0b11010100, 0b11001100, 0b11000110, 0b11000110, 0b11000110, 0b11000110],
  S: [0b00111111, 0b01100000, 0b11000000, 0b11000000, 0b01111100, 0b00000110, 0b00000110, 0b00000110, 0b00000110, 0b11000110, 0b01111100, 0b00000000],
  T: [0b11111111, 0b11111111, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000],
  U: [0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b01100110, 0b00111100],
  V: [0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b01100110, 0b01100110, 0b00111100, 0b00111100, 0b00011000, 0b00011000],
  W: [0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11000011, 0b11011011, 0b11011011, 0b11111111, 0b11100111, 0b11000011, 0b11000011, 0b11000011],
  X: [0b11000011, 0b11000011, 0b01100110, 0b01100110, 0b00111100, 0b00111100, 0b00111100, 0b01100110, 0b01100110, 0b11000011, 0b11000011, 0b11000011],
  Y: [0b11000011, 0b11000011, 0b01100110, 0b01100110, 0b00111100, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000],
  Z: [0b11111111, 0b11111111, 0b00000110, 0b00001100, 0b00011000, 0b00110000, 0b01100000, 0b11000000, 0b11000000, 0b11000000, 0b11111111, 0b11111111],
  "0": [0b00111100, 0b01100110, 0b11000011, 0b11000111, 0b11001111, 0b11011011, 0b11100011, 0b11000011, 0b11000011, 0b11000011, 0b01100110, 0b00111100],
  "1": [0b00011000, 0b00111000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00111100, 0b00111100],
  "2": [0b00111100, 0b01100110, 0b11000011, 0b00000110, 0b00001100, 0b00011000, 0b00110000, 0b01100000, 0b11000000, 0b11000000, 0b11111111, 0b11111111],
  "3": [0b11111100, 0b00000110, 0b00000110, 0b00000110, 0b00111100, 0b00000110, 0b00000110, 0b00000110, 0b00000110, 0b00000110, 0b11111100, 0b00000000],
  "4": [0b00001100, 0b00011100, 0b00101100, 0b01001100, 0b10001100, 0b11111111, 0b11111111, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100],
  "5": [0b11111111, 0b11000000, 0b11000000, 0b11111100, 0b00000110, 0b00000110, 0b00000110, 0b00000110, 0b00000110, 0b11000110, 0b01111100, 0b00000000],
  "6": [0b00111100, 0b01100110, 0b11000000, 0b11000000, 0b11111100, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b11000110, 0b01100110, 0b00111100],
  "7": [0b11111111, 0b11111111, 0b00000110, 0b00001100, 0b00011000, 0b00110000, 0b00110000, 0b01100000, 0b01100000, 0b01100000, 0b01100000, 0b01100000],
  "8": [0b00111100, 0b01100110, 0b11000011, 0b11000011, 0b01100110, 0b00111100, 0b01100110, 0b11000011, 0b11000011, 0b11000011, 0b01100110, 0b00111100],
  "9": [0b00111100, 0b01100110, 0b11000011, 0b11000110, 0b11000110, 0b11000110, 0b01111110, 0b00000110, 0b00000110, 0b01100110, 0b00111100, 0b00000000],
  " ": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ",": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0b00011000, 0b00110000],
  ".": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0b00110000, 0b00110000],
  "-": [0, 0, 0, 0, 0, 0b11111111, 0, 0, 0, 0, 0, 0],
  "/": [0b00000011, 0b00000110, 0b00000110, 0b00001100, 0b00001100, 0b00011000, 0b00011000, 0b00110000, 0b00110000, 0b01100000, 0b01100000, 0b11000000],
  "%": [0b01100000, 0b01100000, 0b00000000, 0b00001000, 0b00010000, 0b00100000, 0b01000000, 0b00000000, 0b00000000, 0b00000110, 0b00000110, 0b00000000],
  "'": [0b00011000, 0b00011000, 0b00110000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ":": [0, 0, 0, 0, 0b00011000, 0b00011000, 0, 0, 0b00011000, 0b00011000, 0, 0],
  "!": [0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0b00011000, 0, 0, 0, 0b00011000],
  "(": [0b00001100, 0b00011000, 0b00110000, 0b00110000, 0b00110000, 0b00110000, 0b00110000, 0b00110000, 0b00110000, 0b00110000, 0b00011000, 0b00001100],
  ")": [0b00110000, 0b00011000, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00001100, 0b00011000, 0b00110000],
  "+": [0, 0, 0, 0, 0b00011000, 0b00011000, 0b01111110, 0b00011000, 0b00011000, 0, 0, 0],
};

function text5(str: string, x: number, y: number, s: number, c: number[]): void {
  const up = str.toUpperCase();
  let cx = x;
  for (const ch of up) {
    const g = FONT5[ch] || FONT5[" "];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if ((g[r] >> (4 - col)) & 1) rect(cx + col * s, y + r * s, s, s, c);
      }
    }
    cx += 6 * s;
  }
}

function text8(str: string, x: number, y: number, s: number, c: number[]): void {
  const up = str.toUpperCase();
  let cx = x;
  for (const ch of up) {
    const g = FONT8[ch] || FONT8[" "];
    for (let r = 0; r < 12; r++) {
      for (let col = 0; col < 8; col++) {
        if ((g[r] >> (7 - col)) & 1) rect(cx + col * s, y + r * s, s, s, c);
      }
    }
    cx += 9 * s;
  }
}

function w5(str: string, s: number): number {
  return str.length * 6 * s - s;
}

function w8(str: string, s: number): number {
  return str.length * 9 * s - s;
}

function center5(str: string, s: number, y: number, c: number[]): void {
  text5(str, Math.round((W - w5(str, s)) / 2), y, s, c);
}

function center8(str: string, s: number, y: number, c: number[]): void {
  text8(str, Math.round((W - w8(str, s)) / 2), y, s, c);
}

// ---- crowd figures ----
interface Fig {
  x: number;
  h: number;
  shirt: number[];
  pose: string;
  hat: boolean;
  umb: boolean;
}

const SHIRTS: number[][] = [
  [179, 38, 30], [43, 94, 167], [62, 122, 74], [217, 164, 65],
  [237, 230, 214], [122, 74, 138], [46, 122, 122], [201, 106, 46],
];
const MUTED: number[][] = [
  [122, 58, 52], [43, 74, 122], [51, 86, 58], [138, 106, 46],
  [110, 98, 88], [90, 58, 106], [46, 90, 90], [138, 74, 46],
];

function figure(f: Fig, baseY: number): void {
  const headR = Math.max(3, Math.round(f.h * 0.13));
  const bodyH = Math.round(f.h * 0.52);
  const legH = Math.max(2, f.h - headR * 2 - bodyH);
  const cx = f.x;
  const topY = baseY - f.h;
  const bodyTop = baseY - legH - bodyH;
  // legs
  rect(cx - 3, baseY - legH, 2, legH, INK);
  rect(cx + 1, baseY - legH, 2, legH, INK);
  // body
  rect(cx - 4, bodyTop, 9, bodyH, f.shirt);
  // arms
  if (f.pose === "cheer") {
    line(cx - 4, bodyTop + 3, cx - 9, bodyTop - 6, f.shirt);
    line(cx + 5, bodyTop + 3, cx + 10, bodyTop - 6, f.shirt);
  } else if (f.pose === "photo") {
    line(cx + 5, bodyTop + 3, cx + 9, bodyTop - 8, f.shirt);
    rect(cx + 7, bodyTop - 14, 5, 7, INK);
  } else {
    line(cx - 4, bodyTop + 3, cx - 5, baseY - legH - 2, f.shirt);
    line(cx + 5, bodyTop + 3, cx + 6, baseY - legH - 2, f.shirt);
  }
  // head
  ellipse(cx, topY + headR, headR, headR, SKIN);
  if (f.hat) rect(cx - headR - 1, topY - 1, headR * 2 + 3, 3, INK);
  if (f.umb) {
    // red canopy arc above the head
    for (let a = 0; a <= 180; a += 6) {
      const rad = Math.PI + (a * Math.PI) / 180;
      const ux = Math.round(cx + Math.cos(rad) * 11);
      const uy = Math.round(topY - 8 + Math.sin(rad) * 7);
      px(ux, uy, RED);
      px(ux, uy + 1, RED);
    }
    line(cx, topY - 8, cx, topY + 1, INK);
  }
}

// ---- page sections ----
function drawMasthead(): void {
  center8("THE WORLD", 5, 6, INK);
  center5("WEDNESDAY, 25 NOVEMBER 2026 - IN ONE IMAGE", 2, 70, INK);
  rect(24, 88, 976, 3, INK);
}

function drawLead(): void {
  // dawn sky, four bands
  rect(0, 92, 1024, 60, SKY1);
  rect(0, 152, 1024, 60, SKY2);
  rect(0, 212, 1024, 60, SKY3);
  rect(0, 272, 1024, 58, SKY4);
  // soft sun top right: pale halo discs, short sparse rays, bright core.
  // Rays use the bright sun colour and reach past the halo so they read
  // as soft light against the orange sky.
  ellipse(880, 150, 64, 64, HALO);
  ellipse(880, 150, 52, 52, HALO);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x0 = Math.round(880 + Math.cos(a) * 46);
    const y0 = Math.round(150 + Math.sin(a) * 46);
    const x1 = Math.round(880 + Math.cos(a) * 80);
    const y1 = Math.round(150 + Math.sin(a) * 80);
    line(x0, y0, x1, y1, SUN);
    line(x0 + 1, y0, x1 + 1, y1, SUN);
  }
  ellipse(880, 150, 40, 40, SUN);
  // left block + mid block (the plaza between them stays open for the beam)
  rect(24, 330, 116, 140, BLD1);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      rect(36 + c * 26, 344 + r * 24, 12, 10, WIN);
    }
  }
  rect(430, 350, 90, 120, BLD2);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      rect(444 + c * 26, 364 + r * 24, 10, 9, WIN);
    }
  }
  // supermarket EXITO
  rect(520, 360, 480, 110, STORE);
  rect(520, 360, 480, 12, ROOF);
  rect(520, 372, 480, 38, RED);
  text8("EXITO", Math.round(520 + (480 - w8("EXITO", 3)) / 2), 374, 3, LIGHT);
  rect(560, 420, 80, 50, [46, 42, 36]);
  rect(680, 420, 80, 50, [46, 42, 36]);
  rect(800, 420, 80, 50, [46, 42, 36]);
  // Colombia flag on the roof
  line(975, 300, 975, 360, INK);
  rect(938, 302, 37, 12, [242, 194, 48]);
  rect(938, 314, 37, 6, [43, 94, 167]);
  rect(938, 320, 37, 6, RED);
  // street
  rect(0, 470, 1024, 46, STREET);
  for (let x = 40; x < 984; x += 48) rect(x, 491, 24, 3, WIN);
  // helicopter spotlight: lands on the open plaza, clear of every building edge
  poly([[360, 232], [400, 232], [290, 470], [200, 470]], BEAM);
  // armoured vehicle
  rect(750, 470, 90, 12, HELI);
  rect(720, 482, 160, 26, HELI);
  ellipse(745, 508, 9, 9, INK);
  ellipse(800, 508, 9, 9, INK);
  ellipse(855, 508, 9, 9, INK);
  rect(872, 488, 6, 6, BEAM);
  // crowd, back row first (smaller, muted), then front row (varied colours + poses)
  const backX = [70, 140, 210, 280, 350, 420, 490, 560, 640, 930];
  for (let i = 0; i < backX.length; i++) {
    figure({ x: backX[i], h: 18 + (i % 3) * 2, shirt: MUTED[i % MUTED.length], pose: "walk", hat: false, umb: false }, 500);
  }
  const frontX = [60, 110, 160, 215, 270, 325, 380, 435, 490, 545, 600, 655, 905, 960];
  const frontPose = ["walk", "cheer", "walk", "photo", "walk", "cheer", "walk", "walk", "photo", "walk", "walk", "cheer", "walk", "walk"];
  const frontHat = [false, false, true, false, false, false, true, false, false, false, true, false, false, false];
  const frontUmb = [false, false, false, false, true, false, false, false, false, false, false, true, false, false];
  for (let i = 0; i < frontX.length; i++) {
    figure({ x: frontX[i], h: 26 + (i % 4) * 3, shirt: SHIRTS[i % SHIRTS.length], pose: frontPose[i], hat: frontHat[i], umb: frontUmb[i] }, 516);
  }
  // helicopter, big, above the plaza
  ellipse(380, 200, 95, 32, HELI);
  poly([[470, 192], [560, 178], [560, 198], [470, 208]], HELI);
  line(556, 168, 556, 206, INK);
  line(548, 187, 564, 187, INK);
  line(280, 158, 480, 158, INK);
  line(380, 158, 380, 170, INK);
  poly([[300, 186], [348, 182], [352, 200], [306, 206]], GLASS);
  line(320, 238, 440, 238, INK);
  line(330, 232, 330, 238, INK);
  line(430, 232, 430, 238, INK);
  rect(370, 228, 20, 6, [58, 58, 58]);
}

function drawHeadline(): void {
  center8("CARTAGENA STANDOFF ENDS", 3, 518, INK);
  center8("ALL HOSTAGES FREED", 3, 556, RED);
  center5("ABOUT 30 FREED - 1 GUNMAN KILLED, 4 HELD", 2, 596, FACT);
}

// secondary card art, drawn inside the art box (ax, ay) 124 x 106
function artSpace(ax: number, ay: number): void {
  rect(ax, ay, 124, 106, [27, 35, 64]);
  const stars: number[][] = [[14, 14], [38, 8], [70, 18], [100, 10], [22, 34], [96, 40], [30, 58], [108, 66], [16, 84], [52, 96]];
  for (const s of stars) rect(ax + s[0], ay + s[1], 2, 2, LIGHT);
  // rocket, nose up
  poly([[ax + 52, ay + 20], [ax + 72, ay + 20], [ax + 62, ay + 6]], RED);
  rect(ax + 52, ay + 20, 20, 44, [237, 230, 214]);
  poly([[ax + 52, ay + 52], [ax + 42, ay + 68], [ax + 52, ay + 64]], RED);
  poly([[ax + 72, ay + 52], [ax + 82, ay + 68], [ax + 72, ay + 64]], RED);
  poly([[ax + 56, ay + 64], [ax + 68, ay + 64], [ax + 62, ay + 80]], GOLD);
  // Earth, kept fully inside the box
  ellipse(ax + 26, ay + 86, 16, 16, [43, 94, 167]);
  ellipse(ax + 22, ay + 82, 6, 6, [62, 122, 74]);
  ellipse(ax + 30, ay + 90, 4, 4, [62, 122, 74]);
}

function artBangladesh(ax: number, ay: number): void {
  rect(ax, ay, 124, 106, [232, 217, 176]);
  // big "36" then "%" with a clear gap — the % glyph is redrawn clean
  text8("36", ax + 8, ay + 10, 3, INK);
  text8("%", ax + 68, ay + 10, 3, INK);
  // gold arrow, top right, clear of the text
  line(ax + 98, ay + 62, ax + 112, ay + 34, GOLD);
  line(ax + 99, ay + 62, ax + 113, ay + 34, GOLD);
  poly([[ax + 116, ay + 28], [ax + 104, ay + 32], [ax + 112, ay + 44]], GOLD);
  // factory at the bottom
  rect(ax + 14, ay + 62, 10, 44, [74, 58, 46]);
  rect(ax + 8, ay + 76, 108, 30, [90, 74, 58]);
  poly([[ax + 8, ay + 76], [ax + 26, ay + 64], [ax + 44, ay + 76]], [74, 58, 46]);
  poly([[ax + 44, ay + 76], [ax + 62, ay + 64], [ax + 80, ay + 76]], [74, 58, 46]);
  poly([[ax + 80, ay + 76], [ax + 98, ay + 64], [ax + 116, ay + 76]], [74, 58, 46]);
  rect(ax + 20, ay + 84, 10, 8, [242, 217, 140]);
  rect(ax + 56, ay + 84, 10, 8, [242, 217, 140]);
  rect(ax + 92, ay + 84, 10, 8, [242, 217, 140]);
}

function artIndonesia(ax: number, ay: number): void {
  rect(ax, ay, 124, 106, [201, 177, 138]);
  poly([[ax + 2, ay + 104], [ax + 40, ay + 40], [ax + 80, ay + 104]], [138, 122, 94]);
  rect(ax + 52, ay + 56, 20, 48, [46, 42, 36]);
  for (let r = 0; r < 4; r++) rect(ax + 56, ay + 62 + r * 10, 12, 2, [216, 201, 168]);
  rect(ax + 2, ay + 88, 120, 16, [43, 94, 167]);
  line(ax + 8, ay + 94, ax + 30, ay + 94, LIGHT);
  line(ax + 60, ay + 98, ax + 92, ay + 98, LIGHT);
  poly([[ax + 92, ay + 30], [ax + 104, ay + 52], [ax + 80, ay + 52]], GOLD);
  rect(ax + 90, ay + 38, 4, 8, INK);
}

function artEurope(ax: number, ay: number): void {
  rect(ax, ay, 124, 106, [185, 201, 217]);
  // smoke above the hangar
  ellipse(ax + 30, ay + 30, 10, 10, [150, 150, 150]);
  ellipse(ax + 44, ay + 20, 12, 12, [170, 170, 170]);
  ellipse(ax + 58, ay + 12, 9, 9, [190, 190, 190]);
  // hangar
  rect(ax + 8, ay + 56, 60, 48, [90, 90, 90]);
  rect(ax + 18, ay + 66, 40, 38, [58, 58, 58]);
  // runway
  rect(ax + 2, ay + 92, 120, 12, [58, 58, 58]);
  for (let x = 8; x < 116; x += 20) rect(ax + x, ay + 97, 10, 2, LIGHT);
  // two jets in the sky
  poly([[ax + 72, ay + 34], [ax + 96, ay + 30], [ax + 96, ay + 36], [ax + 72, ay + 40]], HELI);
  poly([[ax + 80, ay + 34], [ax + 86, ay + 24], [ax + 90, ay + 34]], HELI);
  poly([[ax + 88, ay + 52], [ax + 108, ay + 49], [ax + 108, ay + 54], [ax + 88, ay + 57]], HELI);
  poly([[ax + 94, ay + 52], [ax + 99, ay + 44], [ax + 102, ay + 52]], HELI);
}

function card(x0: number, y0: number, kicker: string, t1: string, t2: string, facts: string[], art: (ax: number, ay: number) => void): void {
  rect(x0, y0, 480, 122, CARD);
  rect(x0, y0, 480, 2, INK);
  rect(x0, y0 + 120, 480, 2, INK);
  rect(x0, y0, 2, 122, INK);
  rect(x0 + 478, y0, 2, 122, INK);
  text5(kicker, x0 + 12, y0 + 8, 2, RED);
  text5(t1, x0 + 12, y0 + 26, 3, INK);
  if (t2) text5(t2, x0 + 12, y0 + 48, 3, INK);
  for (let i = 0; i < facts.length; i++) {
    text5(facts[i], x0 + 12, y0 + 74 + i * 16, 2, FACT);
  }
  // art on the right, a tall box (124 x 106) so it has room to breathe
  const ax = x0 + 344;
  const ay = y0 + 8;
  art(ax, ay);
  rect(ax, ay, 124, 2, INK);
  rect(ax, ay + 104, 124, 2, INK);
  rect(ax, ay, 2, 106, INK);
  rect(ax + 122, ay, 2, 106, INK);
}

function drawCards(): void {
  card(24, 616, "SPACE - PAKISTAN", "FIRST PAKISTANI", "IN SPACE",
    ["SHENZHOU-24 DOCKS AT", "TIANGONG STATION", "ALI STAYS ABOUT A WEEK"], artSpace);
  card(520, 616, "BANGLADESH - WAGES", "WAGES UP 36%", "17,000 TAKA",
    ["GARMENT PAY RISES 36%", "EFFECTIVE 1 DECEMBER"], artBangladesh);
  card(24, 740, "INDONESIA - MINE", "PONGKOR", "MINE FLOOD",
    ["9 DEAD, 17 TRAPPED", "SHAFT 100 M DEEP"], artIndonesia);
  card(520, 740, "EUROPE - WAR", "UKRAINE HITS", "AIR BASE",
    ["5 JETS DAMAGED", "3 MIG-31, 2 SU-34"], artEurope);
}

function drawBriefs(): void {
  rect(0, 868, 1024, 156, BAND);
  rect(0, 868, 1024, 4, RED);
  const briefs = [
    "SAUDI-LED COALITION HITS PORT; JEDDAH THREATENED",
    "PACT WITH AUSTRALIA, NO FOREIGN BASES",
    "SHARES SLIDE 8.3% AS HUANG RALLY FADES",
    "BEIJING PROBES SHANGHAI PARTY CHIEF CHEN JINING",
    "SIX DEAD AS CESSNA CRASHES IN GULF",
    "GUILTY ON 10 OF 12 US COUNTS",
  ];
  for (let i = 0; i < briefs.length; i++) {
    const y = 874 + i * 25;
    rect(30, y + 7, 8, 8, RED);
    text5(briefs[i], 46, y, 3, LIGHT);
  }
}

function drawPage(): void {
  rect(0, 0, W, H, PAPER);
  drawMasthead();
  drawLead();
  drawHeadline();
  drawCards();
  drawBriefs();
}

// ---- PNG encoder ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    img.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  drawPage();
  const png = encodePNG();
  fs.writeFileSync(outDir + "/entry.png", png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  const dossier = {
    title: "THE WORLD",
    date: "2026-11-25",
    version: 5,
    stories: 11,
    width: W,
    height: H,
    entry_png_sha256: sha,
  };
  fs.writeFileSync(outDir + "/dossier.json", JSON.stringify(dossier, null, 2) + "\n");
  console.log("wrote " + outDir + "/entry.png " + png.length + " bytes sha256 " + sha);
}

main();
