// news-image-20261125 v1 — "THE WORLD — WEDNESDAY, 25 NOVEMBER 2026"
// A newspaper front page drawn procedurally with Node 22 stdlib only.
// No network at run time. Deterministic: two runs write identical bytes.
// Writes /output/entry.png (1024x1024) and /output/dossier.json.
//
// Facts verified live 26 Nov 2026 (all events of / first reported 25 Nov 2026):
//  LEAD Cartagena hostage rescue — AP, Colombia Reports, Reuters/Devdiscourse
//  SPACE Shenzhou-24 / first Pakistani astronaut — Nature, SpacePolicyOnline
//  BANGLADESH garment wage +36% to 17,000 taka — Reuters, TBS News
//  INDONESIA Pongkor mine flood, 9 dead — AP, Reuters
//  BRIEFS Hodeidah (Reuters), Solomon Islands treaty (AP), Nvidia (StockAnalysis),
//         Chen Jining probe (Reuters/NPR), Mississippi Cessna (US Coast Guard),
//         Huawei verdict (AP/The Register).

import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [246, 241, 231];
const INK: RGB = [25, 23, 19];
const MUTED: RGB = [92, 84, 72];
const RED: RGB = [166, 38, 38];
const BLUE: RGB = [32, 80, 122];
const GOLD: RGB = [201, 162, 39];
const NAVY: RGB = [16, 30, 51];
const CREAM: RGB = [239, 227, 194];

// ---------------------------------------------------------------- canvas
class Canvas {
  readonly w = W;
  readonly h = H;
  readonly data = new Uint8Array(W * H * 3);

  constructor() {
    this.fillRect(0, 0, W, H, PAPER);
  }

  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
    }
  }

  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
  }

  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.fillRect(x, y, t, h, c);
  }

  // Bresenham line.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
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

  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const span = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -span; x <= span; x++) this.set(cx + x, cy + y, c);
    }
  }

  ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.set(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
      }
    }
  }

  // Filled ellipse via horizontal spans.
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const span = Math.floor(rx * Math.sqrt(t));
      for (let x = -span; x <= span; x++) this.set(cx + x, cy + y, c);
    }
  }

  // Filled polygon (scanline).
  poly(pts: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
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
        const x0 = Math.ceil(xs[k]);
        const x1 = Math.floor(xs[k + 1]);
        for (let x = x0; x <= x1; x++) this.set(x, y, c);
      }
    }
  }

  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    this.poly(
      [
        [x0, y0],
        [x1, y1],
        [x2, y2],
      ],
      c,
    );
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 bits, written fresh for this entry.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "10110", "11001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01101", "10011", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01001", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "10001", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
};

const CHAR_ADV = 6; // glyph cells per character, including 1 cell gap

function textWidth(s: number, text: string): number {
  return text.length * CHAR_ADV * s - s;
}

function drawChar(cv: Canvas, x: number, y: number, s: number, ch: string, c: RGB, bold: boolean): void {
  const g = GLYPHS[ch] ?? GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") {
        const w = bold ? s + 1 : s;
        cv.fillRect(x + col * s, y + r * s, w, s, c);
      }
    }
  }
}

function drawText(cv: Canvas, x: number, y: number, s: number, text: string, c: RGB, bold = false): void {
  let cx = x;
  for (const ch of text) {
    drawChar(cv, cx, y, s, ch, c, bold);
    cx += CHAR_ADV * s;
  }
}

function drawTextCentered(cv: Canvas, cx: number, y: number, s: number, text: string, c: RGB, bold = false): void {
  drawText(cv, Math.round(cx - textWidth(s, text) / 2), y, s, text, c, bold);
}

// Greedy word wrap to maxW pixels at scale s.
function wrapText(text: string, s: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(s, trial) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- figures
function person(cv: Canvas, x: number, y: number, hgt: number, shirt: RGB, pants: RGB, skin: RGB): void {
  // y = feet baseline. Simple front-facing figure.
  const headR = Math.max(2, Math.round(hgt * 0.14));
  const bodyH = Math.round(hgt * 0.42);
  const legH = hgt - headR * 2 - bodyH;
  cv.circle(x, y - hgt + headR, headR, skin);
  cv.fillRect(x - Math.round(hgt * 0.13), y - hgt + headR * 2, Math.round(hgt * 0.26), bodyH, shirt);
  cv.fillRect(x - Math.round(hgt * 0.13), y - legH, Math.round(hgt * 0.11), legH, pants);
  cv.fillRect(x + Math.round(hgt * 0.02), y - legH, Math.round(hgt * 0.11), legH, pants);
}

function officer(cv: Canvas, x: number, y: number, hgt: number): void {
  person(cv, x, y, hgt, [24, 42, 66], [24, 42, 66], [198, 164, 128]);
  // cap
  cv.fillRect(x - 5, y - hgt - 1, 10, 3, [24, 42, 66]);
  // vest stripe
  cv.fillRect(x - 4, y - Math.round(hgt * 0.55), 8, 3, [201, 162, 39]);
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter none
    raw.set(cv.data.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- scenes
function drawLeadScene(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  // Box is 148 px tall: sky 0..56, building 56..118, street 118..148.
  const skyTop: RGB = [44, 66, 96];
  const skyMid: RGB = [206, 122, 74];
  const skyLow: RGB = [239, 196, 128];
  cv.fillRect(x0, y0, x1 - x0, 24, skyTop);
  cv.fillRect(x0, y0 + 24, x1 - x0, 20, skyMid);
  cv.fillRect(x0, y0 + 44, x1 - x0, 12, skyLow);
  // Sun.
  cv.circle(x0 + 830, y0 + 30, 18, [246, 217, 138]);
  cv.ring(x0 + 830, y0 + 30, 21, [246, 217, 138], 2);
  // Distant skyline along the horizon.
  const sil: RGB = [74, 74, 84];
  const bases = [0, 60, 150, 700, 800, 900];
  const heights = [12, 20, 15, 18, 11, 16];
  const widths = [52, 80, 64, 70, 58, 64];
  for (let i = 0; i < bases.length; i++) {
    cv.fillRect(x0 + bases[i], y0 + 56 - heights[i], widths[i], heights[i], sil);
  }
  // Helicopter, top left.
  const hx = x0 + 96;
  const hy = y0 + 22;
  cv.ellipse(hx, hy, 30, 10, [30, 30, 36]);
  cv.fillRect(hx + 26, hy - 3, 40, 6, [30, 30, 36]);
  cv.fillRect(hx + 60, hy - 10, 4, 15, [30, 30, 36]);
  cv.fillRect(hx - 46, hy - 10, 92, 3, [30, 30, 36]);
  cv.fillRect(hx - 8, hy + 8, 16, 4, [30, 30, 36]);
  // Street.
  cv.fillRect(x0, y1 - 30, x1 - x0, 30, [107, 98, 87]);
  cv.fillRect(x0, y1 - 30, x1 - x0, 3, [80, 72, 62]);
  // Supermarket building.
  const bx0 = x0 + 100;
  const bx1 = x1 - 100;
  const by0 = y0 + 56;
  const by1 = y1 - 30;
  cv.fillRect(bx0, by0, bx1 - bx0, by1 - by0, CREAM);
  cv.fillRect(bx0, by0, bx1 - bx0, 10, RED); // roof band
  // Sign band.
  cv.fillRect(bx0, by0 + 10, bx1 - bx0, 24, [242, 194, 0]);
  drawTextCentered(cv, (bx0 + bx1) / 2, by0 + 15, 3, "EXITO", INK, true);
  // Shop windows.
  const glass: RGB = [159, 195, 216];
  const frame: RGB = [60, 60, 66];
  for (const wx of [bx0 + 16, bx0 + 96, bx1 - 176, bx1 - 96]) {
    cv.fillRect(wx, by0 + 40, 64, 22, frame);
    cv.fillRect(wx + 3, by0 + 43, 58, 16, glass);
    cv.line(wx + 32, by0 + 43, wx + 32, by0 + 59, frame);
  }
  // Open glass doors, centre.
  const dx0 = (bx0 + bx1) / 2 - 44;
  cv.fillRect(dx0, by0 + 40, 88, by1 - by0 - 40, frame);
  cv.fillRect(dx0 + 3, by0 + 43, 38, by1 - by0 - 46, glass);
  cv.fillRect(dx0 + 47, by0 + 43, 38, by1 - by0 - 46, glass);
  cv.line(dx0 + 44, by0 + 43, dx0 + 44, by1 - 3, frame);
  // Police tape across the front.
  const ty = y1 - 40;
  cv.fillRect(x0 + 40, ty, x1 - x0 - 80, 5, [242, 194, 0]);
  for (let tx = x0 + 44; tx < x1 - 44; tx += 16) {
    cv.fillRect(tx, ty, 6, 5, INK);
  }
  // Rescued people walking out onto the street.
  const shirts: RGB[] = [
    [166, 38, 38],
    [32, 80, 122],
    [60, 120, 80],
    [201, 162, 39],
    [120, 70, 130],
    [200, 90, 60],
  ];
  const spots = [300, 360, 430, 500, 560, 620];
  for (let i = 0; i < spots.length; i++) {
    person(cv, x0 + spots[i], y1 - 4, 24, shirts[i], [40, 40, 48], [214, 180, 146]);
  }
  // Officers at the flanks.
  officer(cv, x0 + 96, y1 - 4, 28);
  officer(cv, x1 - 96, y1 - 4, 28);
  // Dawn caption pill.
  cv.fillRect(x0 + 14, y0 + 8, 150, 22, INK);
  drawText(cv, x0 + 24, y0 + 13, 2, "DAWN, CARTAGENA", PAPER, true);
}

function drawSpaceScene(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  cv.fillRect(x0, y0, x1 - x0, y1 - y0, NAVY);
  // Stars.
  const stars: Array<[number, number]> = [
    [12, 10], [40, 26], [70, 8], [120, 20], [160, 12], [180, 34], [30, 48], [100, 44], [150, 52], [190, 16],
  ];
  for (const [sx, sy] of stars) cv.fillRect(x0 + sx, y0 + sy, 2, 2, PAPER);
  // Earth arc at the bottom, kept inside this scene's box.
  cv.ellipse(x0 + 99, y1 + 34, 90, 40, [46, 110, 180]);
  cv.ellipse(x0 + 99, y1 + 34, 78, 32, [32, 80, 122]);
  // Tiangong station: gold core + blue panels.
  const sx = x0 + 118;
  const sy = y0 + 22;
  cv.fillRect(sx - 34, sy + 6, 26, 10, [32, 90, 140]);
  cv.fillRect(sx + 8, sy + 6, 26, 10, [32, 90, 140]);
  cv.fillRect(sx - 8, sy, 16, 22, [201, 162, 39]);
  cv.fillRect(sx - 3, sy - 6, 6, 6, [201, 162, 39]);
  // Rocket rising.
  const rx = x0 + 52;
  const ry = y0 + 34;
  cv.tri(rx - 9, ry + 26, rx + 9, ry + 26, rx, ry - 2, [220, 40, 40]);
  cv.fillRect(rx - 9, ry + 26, 18, 26, PAPER);
  cv.tri(rx - 9, ry + 52, rx - 18, ry + 62, rx - 9, ry + 40, RED);
  cv.tri(rx + 9, ry + 52, rx + 18, ry + 62, rx + 9, ry + 40, RED);
  cv.tri(rx - 6, ry + 52, rx + 6, ry + 52, rx, ry + 68, [242, 160, 40]);
  cv.fillRect(rx - 3, ry + 30, 6, 6, BLUE);
}

function drawWageScene(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  cv.fillRect(x0, y0, x1 - x0, y1 - y0, [232, 220, 196]);
  // Factory block.
  cv.fillRect(x0 + 10, y0 + 26, 92, 50, [176, 106, 74]);
  cv.fillRect(x0 + 10, y0 + 26, 92, 6, [140, 80, 56]);
  for (let i = 0; i < 4; i++) {
    cv.fillRect(x0 + 18 + i * 20, y0 + 40, 12, 12, [246, 241, 231]);
  }
  cv.fillRect(x0 + 86, y0 + 6, 10, 22, [140, 80, 56]);
  // Folded shirts stack.
  const cols: RGB[] = [
    [32, 80, 122],
    [166, 38, 38],
    [60, 120, 80],
    [201, 162, 39],
  ];
  for (let i = 0; i < 4; i++) {
    cv.fillRect(x0 + 118, y0 + 56 - i * 9, 66, 7, cols[i]);
  }
  // Price tag.
  cv.poly(
    [
      [x0 + 118, y0 + 8],
      [x0 + 184, y0 + 8],
      [x0 + 184, y0 + 30],
      [x0 + 118, y0 + 30],
    ],
    PAPER,
  );
  cv.circle(x0 + 126, y0 + 19, 3, RED);
  drawText(cv, x0 + 134, y0 + 12, 2, "17,000", INK, true);
}

function drawMineScene(cv: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  cv.fillRect(x0, y0, x1 - x0, 30, [201, 214, 222]);
  cv.fillRect(x0, y0 + 30, x1 - x0, y1 - y0 - 30, [122, 90, 58]);
  cv.fillRect(x0, y0 + 30, x1 - x0, 4, [90, 66, 42]);
  // Hills.
  cv.tri(x0, y0 + 30, x0 + 60, y0 + 30, x0 + 30, y0 + 12, [90, 120, 80]);
  cv.tri(x0 + 120, y0 + 30, x0 + 198, y0 + 30, x0 + 160, y0 + 10, [90, 120, 80]);
  // Shaft.
  const shx = x0 + 84;
  cv.fillRect(shx, y0 + 30, 30, y1 - y0 - 30, [30, 24, 20]);
  cv.fillRect(shx + 4, y1 - 22, 22, 18, [46, 110, 180]);
  cv.fillRect(shx - 6, y0 + 30, 42, 5, [60, 44, 32]);
  // Pump + hose.
  cv.fillRect(x0 + 14, y0 + 44, 26, 18, [90, 96, 102]);
  cv.circle(x0 + 27, y0 + 53, 6, [60, 64, 70]);
  cv.line(x0 + 40, y0 + 52, shx + 2, y0 + 40, [60, 64, 70]);
  // Warning triangle.
  cv.tri(x0 + 158, y0 + 66, x0 + 182, y0 + 66, x0 + 170, y0 + 44, [242, 194, 0]);
  drawText(cv, x0 + 167, y0 + 52, 2, "!", INK, true);
  // Rescuer with helmet.
  person(cv, x0 + 148, y1 - 4, 22, [32, 80, 122], [40, 40, 48], [214, 180, 146]);
  cv.circle(x0 + 148, y1 - 22, 4, [242, 194, 0]);
}

// ---------------------------------------------------------------- layout
function main(): void {
  const cv = new Canvas();
  const M = 30;

  // Frame.
  cv.fillRect(6, 6, W - 12, 3, INK);
  cv.fillRect(6, H - 9, W - 12, 3, INK);
  cv.fillRect(6, 6, 3, H - 12, INK);
  cv.fillRect(W - 9, 6, 3, H - 12, INK);

  // Masthead.
  drawTextCentered(cv, W / 2, 28, 12, "THE WORLD", INK, true);
  drawTextCentered(cv, W / 2, 122, 3, "WEDNESDAY, 25 NOVEMBER 2026", INK, true);
  cv.hline(M, 152, W - 2 * M, INK, 3);
  cv.hline(M, 158, W - 2 * M, INK, 1);

  // ---- Lead story.
  drawText(cv, M, 172, 3, "CARTAGENA, COLOMBIA", RED, true);
  drawText(cv, W - M - textWidth(2, "HOSTAGE SIEGE ENDS AT DAWN"), 176, 2, "HOSTAGE SIEGE ENDS AT DAWN", MUTED, true);
  drawLeadScene(cv, M, 196, W - M, 344);
  drawTextCentered(cv, W / 2, 356, 5, "ALL FREED IN CARTAGENA", INK, true);
  const leadFacts = [
    "Gunmen seized about 30 people at an Exito supermarket after a failed armoured-truck robbery.",
    "Police and troops stormed the store at dawn; every hostage was freed and one gunman was killed.",
    "President de la Espriella hailed an 'extraordinary' joint operation; four gunmen were detained.",
  ];
  let fy = 400;
  for (const f of leadFacts) {
    const lines = wrapText(f, 3, W - 2 * M);
    for (const ln of lines) {
      drawTextCentered(cv, W / 2, fy, 3, ln, INK);
      fy += 24;
    }
  }

  // ---- Secondary stories: three bands.
  cv.hline(M, 552, W - 2 * M, INK, 3);
  cv.hline(M, 558, W - 2 * M, INK, 1);
  const bands = [
    {
      kicker: "SPACE - CHINA / PAKISTAN",
      color: BLUE,
      headline: "PAKISTAN'S FIRST ASTRONAUT IN ORBIT",
      f1: "Shenzhou-24 lifted off at 08:18 Beijing time with Ali aboard.",
      f2: "Docked with Tiangong 3.5 hours later; Ali stays about a week.",
      scene: drawSpaceScene,
    },
    {
      kicker: "BANGLADESH - GARMENT WAGES",
      color: [60, 120, 80] as RGB,
      headline: "GARMENT PAY RISES 36% IN BANGLADESH",
      f1: "Wage board sets 17,000 taka a month after weeks of protests.",
      f2: "Board approved 4-2; the new rate takes effect on 1 December.",
      scene: drawWageScene,
    },
    {
      kicker: "INDONESIA - WEST JAVA",
      color: [140, 80, 40] as RGB,
      headline: "NINE DEAD IN FLOODED GOLD MINE",
      f1: "Floodwater filled a 100-metre shaft at Pongkor, Bogor.",
      f2: "Nine dead and 17 still trapped as rescuers pump out water.",
      scene: drawMineScene,
    },
  ];
  let by = 568;
  for (const b of bands) {
    b.scene(cv, M, by, M + 198, by + 76);
    drawText(cv, M + 214, by + 2, 2, b.kicker, b.color, true);
    drawText(cv, M + 214, by + 22, 3, b.headline, INK, true);
    drawText(cv, M + 214, by + 46, 2, b.f1, INK);
    drawText(cv, M + 214, by + 62, 2, b.f2, INK);
    by += 84;
  }

  // ---- In brief.
  cv.hline(M, 820, W - 2 * M, INK, 3);
  cv.hline(M, 826, W - 2 * M, INK, 1);
  drawText(cv, M, 836, 3, "IN BRIEF", INK, true);
  const briefs = [
    { k: "HODEIDAH", body: "Coalition hits Hodeidah; Houthis threaten Jeddah and Saudi ports." },
    { k: "SOLOMON ISLANDS", body: "Solomons sign a security treaty with Australia; no foreign base on its soil." },
    { k: "NVIDIA", body: "Nvidia falls 8.3% in Wednesday trade as the Huang comeback rally fades." },
    { k: "CHINA", body: "Shanghai party chief Chen Jining probed for graft by Beijing." },
    { k: "MISSISSIPPI", body: "Six found dead after a Cessna crashes off Horn Island, Mississippi." },
    { k: "HUAWEI", body: "U.S. jury convicts Huawei on 10 of 12 counts, including trade-secret theft." },
  ];
  const colW = 472;
  const colX = [M, M + 492];
  for (let i = 0; i < briefs.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = colX[col];
    const byy = 860 + row * 45;
    drawText(cv, bx, byy, 2, briefs[i].k, RED, true);
    const lines = wrapText(briefs[i].body, 2, colW);
    drawText(cv, bx, byy + 15, 2, lines[0] ?? "", INK);
    if (lines[1]) drawText(cv, bx, byy + 29, 2, lines[1], INK);
  }

  // Credit line.
  drawTextCentered(
    cv,
    W / 2,
    1000,
    2,
    "Sources: AP, Reuters, Nature, SpacePolicyOnline, TBS News, The Register",
    MUTED,
  );

  // ---- Write outputs.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(cv);
  const pngPath = path.join(outDir, "entry.png");
  fs.writeFileSync(pngPath, png);
  const dossier = {
    date: "2026-11-25",
    title: "THE WORLD — WEDNESDAY, 25 NOVEMBER 2026",
    entry_png_sha256: createHash("sha256").update(png).digest("hex"),
    entry_png_bytes: png.length,
    width: W,
    height: H,
    stories: [
      {
        place: "lead",
        headline: "ALL FREED IN CARTAGENA",
        facts: leadFacts,
        sources: ["AP", "Colombia Reports", "Reuters"],
      },
      {
        place: "secondary",
        headline: "PAKISTAN'S FIRST ASTRONAUT IN ORBIT",
        facts: [bands[0].f1, bands[0].f2],
        sources: ["Nature", "SpacePolicyOnline"],
      },
      {
        place: "secondary",
        headline: "GARMENT PAY RISES 36% IN BANGLADESH",
        facts: [bands[1].f1, bands[1].f2],
        sources: ["Reuters", "TBS News"],
      },
      {
        place: "secondary",
        headline: "NINE DEAD IN FLOODED GOLD MINE",
        facts: [bands[2].f1, bands[2].f2],
        sources: ["AP", "Reuters"],
      },
    ],
    briefs: briefs.map((b) => ({ kicker: b.k, body: b.body })),
    brief_sources: ["Reuters", "AP", "StockAnalysis", "U.S. Coast Guard", "The Register"],
  };
  fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256 ${dossier.entry_png_sha256}`);
}

main();
