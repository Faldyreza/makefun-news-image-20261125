// news-image-20261125 v7 — "THE WORLD — Wednesday, 25 November 2026"
// Fresh build from DESIGN.md. Procedural newspaper front page.
// Node 22 stdlib only, no network at run time, deterministic output.
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";
import * as path from "node:path";

// ---------------- palette ----------------
const INK = 0x1c1712;
const PAPER = 0xf6f0e1;
const CARD = 0xfffdf6;
const ACCENT = 0xb3372a;
const GOLD = 0xd9a441;
const BAND = 0x14100c;
const BRIEF = 0xf6f0e1;
const SEPARATOR = 0x3a3226;
const SKIN = 0xe8b88a;
const PANTS = 0x2e2a26;

// ---------------- PNG encoder ----------------
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

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- canvas ----------------
class Canvas {
  w: number;
  h: number;
  buf: Uint8Array;
  constructor(w: number, h: number, bg: number) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  px(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = (c >> 16) & 0xff;
    this.buf[i + 1] = (c >> 8) & 0xff;
    this.buf[i + 2] = c & 0xff;
  }
  fillRect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.px(xx, yy, c);
    }
  }
  hline(x0: number, x1: number, y: number, c: number, t = 1): void {
    for (let k = 0; k < t; k++) for (let x = x0; x <= x1; x++) this.px(x, y + k, c);
  }
  vline(x: number, y0: number, y1: number, c: number, t = 1): void {
    for (let k = 0; k < t; k++) for (let y = y0; y <= y1; y++) this.px(x + k, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (;;) {
      for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) this.px(x + a, y + b, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: number): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      this.fillRect(cx - half, cy + y, half * 2 + 1, 1, c);
    }
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      this.fillRect(cx - half, cy + y, half * 2 + 1, 1, c);
    }
  }
  fillPoly(pts: [number, number][], c: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.fillRect(Math.ceil(xs[k]), y, Math.floor(xs[k + 1]) - Math.ceil(xs[k]) + 1, 1, c);
      }
    }
  }
  outlineRect(x: number, y: number, w: number, h: number, c: number, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
}

// ---------------- bitmap fonts (own design) ----------------
// FONT5: 5 wide x 7 tall. Used for dateline, facts, card text, briefs, signs.
const F5: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
};

// FONT12: 8 wide x 12 tall, bold display face. Masthead + lead headline.
const F12: Record<string, string[]> = {
  A: ["..####..", ".##..##.", "##....##", "##....##", "##....##", "########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##"],
  B: ["#######.", "##....##", "##....##", "##....##", "#######.", "##....##", "##....##", "##....##", "##....##", "##....##", "#######.", "........"],
  C: ["..#####.", ".##...##", "##.....#", "##......", "##......", "##......", "##......", "##......", "##.....#", ".##...##", "..#####.", "........"],
  D: ["######..", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "######..", "........"],
  E: ["########", "##......", "##......", "##......", "#####...", "##......", "##......", "##......", "##......", "##......", "########", "........"],
  F: ["########", "##......", "##......", "##......", "#####...", "##......", "##......", "##......", "##......", "##......", "##......", "........"],
  G: ["..#####.", ".##...##", "##.....#", "##......", "##......", "##..####", "##....##", "##....##", "##....##", ".##...##", "..####..", "........"],
  H: ["##....##", "##....##", "##....##", "##....##", "########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##"],
  I: ["########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "########", "........"],
  L: ["##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "########", "........"],
  N: ["##....##", "###...##", "###...##", "####..##", "##.#..##", "##..#.##", "##...###", "##...###", "##....##", "##....##", "##....##", "##....##"],
  O: ["..####..", ".##..##.", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", ".##..##.", "..####.."],
  P: ["#######.", "##....##", "##....##", "##....##", "#######.", "##......", "##......", "##......", "##......", "##......", "##......", "........"],
  R: ["#######.", "##....##", "##....##", "##....##", "#######.", "##..##..", "##...##.", "##....##", "##....##", "##....##", "##....##", "........"],
  S: ["..#####.", ".##...##", "##.....#", "##......", ".#####..", "......##", "......##", "##.....#", "##.....#", ".##...##", "..#####.", "........"],
  T: ["########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "........"],
  U: ["##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", ".##..##.", "..####.."],
  W: ["##....##", "##....##", "##....##", "##....##", "##....##", "##.##.##", "##.##.##", "##.##.##", "##.##.##", ".##..##.", ".##..##.", "........"],
  " ": ["........", "........", "........", "........", "........", "........", "........", "........", "........", "........", "........", "........"],
};

function glyphRows(font: Record<string, string[]>, ch: string): string[] {
  const g = font[ch];
  if (g) return g;
  return font[" "] || [];
}

function textWidth(s: string, font: Record<string, string[]>, scale: number, gap: number): number {
  const sample = glyphRows(font, "A");
  const gw = sample.length ? sample[0].length : 5;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += gw * scale + gap;
  return w - gap;
}

// rowExtra: glyph-row indices drawn 1 px taller (briefs 22/23 px stretch).
function drawText(cv: Canvas, x: number, y: number, s: string, font: Record<string, string[]>, scale: number, color: number, gap = 2, rowExtra: number[] = []): number {
  const sample = glyphRows(font, "A");
  const rows = sample.length;
  const gw = sample[0].length;
  const rh: number[] = [];
  for (let r = 0; r < rows; r++) rh.push(scale + (rowExtra.includes(r) ? 1 : 0));
  let cx = x;
  for (let i = 0; i < s.length; i++) {
    const g = glyphRows(font, s[i]);
    let ry = y;
    for (let r = 0; r < rows; r++) {
      const row = g[r] || "";
      for (let col = 0; col < gw; col++) {
        if (row[col] === "#") cv.fillRect(cx + col * scale, ry, scale, rh[r], color);
      }
      ry += rh[r];
    }
    cx += gw * scale + gap;
  }
  return cx - gap - x;
}

function drawTextCentered(cv: Canvas, cx: number, y: number, s: string, font: Record<string, string[]>, scale: number, color: number, gap = 2): void {
  const w = textWidth(s, font, scale, gap);
  drawText(cv, Math.round(cx - w / 2), y, s, font, scale, color, gap);
}

// ---------------- figures ----------------
const SHIRTS = [0xc0392b, 0x2471a3, 0x229954, 0xd4ac0d, 0xf6f0e1, 0x7d3c98, 0x148f77, 0xe67e22];

// pose: 0 arms down, 1 cheering, 2 phone up, 3 hat, 4 umbrella
function drawFigure(cv: Canvas, x: number, baseY: number, h: number, shirt: number, pose: number): void {
  const headR = Math.max(2, Math.round(h * 0.11));
  const headY = baseY - h + headR;
  cv.fillCircle(x, headY, headR, SKIN);
  const bodyTop = headY + headR + 1;
  const bodyH = Math.round(h * 0.42);
  const bw = Math.max(4, Math.round(h * 0.18));
  cv.fillRect(x - Math.floor(bw / 2), bodyTop, bw, bodyH, shirt);
  const legTop = bodyTop + bodyH;
  const legH = baseY - legTop;
  cv.fillRect(x - 3, legTop, 2, legH, PANTS);
  cv.fillRect(x + 1, legTop, 2, legH, PANTS);
  const armY = bodyTop + 2;
  if (pose === 1) {
    cv.line(x - 4, armY, x - 8, armY - 7, shirt, 2);
    cv.line(x + 4, armY, x + 8, armY - 7, shirt, 2);
  } else if (pose === 2) {
    cv.line(x - 4, armY, x - 6, armY + 5, shirt, 2);
    cv.line(x + 4, armY, x + 8, armY - 8, shirt, 2);
    cv.fillRect(x + 6, armY - 12, 4, 6, INK);
  } else {
    cv.line(x - 4, armY, x - 6, armY + 6, shirt, 2);
    cv.line(x + 4, armY, x + 6, armY + 6, shirt, 2);
    if (pose === 3) {
      cv.fillRect(x - headR - 1, headY - headR - 2, headR * 2 + 2, 3, 0x7d3c98);
    } else if (pose === 4) {
      cv.fillEllipse(x, headY - headR - 6, 10, 5, 0xc0392b);
      cv.vline(x, headY - headR - 6, headY - headR + 2, INK, 1);
    }
  }
}

// Foreground detail: journalist with camera on tripod (bigger, at left edge).
function drawJournalist(cv: Canvas, x: number, baseY: number): void {
  const h = 46;
  const headY = baseY - h + 5;
  cv.fillCircle(x, headY, 5, SKIN);
  cv.fillRect(x - 6, headY - 6, 12, 3, INK); // cap
  cv.fillRect(x - 6, headY + 6, 12, 16, 0x2e4053); // jacket
  cv.fillRect(x - 6, headY + 22, 4, baseY - (headY + 22), INK); // legs
  cv.fillRect(x + 2, headY + 22, 4, baseY - (headY + 22), INK);
  const tx = x + 16;
  const ty = baseY - 26;
  cv.line(tx, ty, tx - 10, baseY, INK, 2);
  cv.line(tx, ty, tx + 10, baseY, INK, 2);
  cv.line(tx, ty, tx, baseY, INK, 2);
  cv.fillRect(tx - 7, ty - 8, 14, 9, INK); // camera body
  cv.fillCircle(tx + 8, ty - 4, 3, 0x5d6d7e); // lens
}

// Foreground detail: uniformed officer with cap, arm raised (right edge).
function drawOfficer(cv: Canvas, x: number, baseY: number): void {
  const h = 48;
  const headY = baseY - h + 5;
  const navy = 0x1f3864;
  cv.fillCircle(x, headY, 5, SKIN);
  cv.fillRect(x - 6, headY - 6, 12, 4, navy); // cap
  cv.fillRect(x - 6, headY - 2, 14, 2, 0x0f1e33); // brim
  cv.fillRect(x - 6, headY + 6, 12, 17, navy); // uniform
  cv.fillRect(x - 6, headY + 18, 12, 2, GOLD); // belt
  cv.fillRect(x - 6, headY + 23, 4, baseY - (headY + 23), INK);
  cv.fillRect(x + 2, headY + 23, 4, baseY - (headY + 23), INK);
  cv.line(x + 5, headY + 8, x + 13, headY - 2, navy, 2); // raised arm
}

function drawSun(cv: Canvas, cx: number, cy: number): void {
  const halo = 0xf5d67a;
  const disc = 0xffe9a8;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    for (const off of [-2, 2]) {
      cv.line(
        Math.round(cx + dx * 50 + px * off),
        Math.round(cy + dy * 50 + py * off),
        Math.round(cx + dx * 100 + px * off),
        Math.round(cy + dy * 100 + py * off),
        halo,
        2
      );
    }
  }
  cv.fillCircle(cx, cy, 46, halo);
  cv.fillCircle(cx, cy, 34, disc);
}

function drawHelicopter(cv: Canvas, cx: number, cy: number): void {
  const body = 0x2e2a26;
  cv.fillRect(cx - 105, cy - 4, 60, 8, body); // tail boom
  cv.fillPoly([[cx - 105, cy - 4], [cx - 112, cy - 22], [cx - 100, cy - 4]], body); // tail fin
  cv.vline(cx - 108, cy - 22, cy + 2, body, 2); // tail rotor
  cv.fillEllipse(cx, cy + 6, 52, 16, body); // body
  cv.fillEllipse(cx + 32, cy + 2, 14, 8, 0xbfe3d8); // cockpit window
  cv.hline(cx - 40, cx + 40, cy + 26, body, 2); // skids
  cv.line(cx - 30, cy + 20, cx - 34, cy + 26, body, 2);
  cv.line(cx + 30, cy + 20, cx + 34, cy + 26, body, 2);
  cv.hline(cx - 70, cx + 70, cy - 16, body, 3); // main rotor
  cv.vline(cx, cy - 16, cy - 8, body, 2);
}

// ---------------- lead scene ----------------
function drawScene(cv: Canvas): void {
  const x0 = 16;
  const x1 = 1008;
  const y0 = 226;
  const y1 = 556;
  const sky = [0xf9dc9f, 0xf2c078, 0xe8a85c, 0xd98e4a];
  const bandH = Math.ceil((y1 - y0) / 4);
  for (let i = 0; i < 4; i++) cv.fillRect(x0, y0 + i * bandH, x1 - x0, bandH, sky[i]);
  drawSun(cv, 920, 292);
  // side buildings
  cv.fillRect(16, 380, 284, 120, 0x6b4a2f);
  cv.fillRect(700, 392, 308, 108, 0x7a5636);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r * 7 + c * 3) % 4 !== 0) cv.fillRect(30 + c * 33, 394 + r * 26, 14, 14, 0xffe9a8);
      if ((r * 5 + c * 2) % 3 !== 0) cv.fillRect(714 + c * 36, 404 + r * 24, 14, 12, 0xffe9a8);
    }
  }
  // street + sidewalk
  cv.fillRect(16, 500, 992, 56, 0x7a5a3e);
  cv.fillRect(16, 496, 992, 6, 0xa8855f);
  // supermarket EXITO (centre)
  cv.fillRect(330, 400, 360, 110, 0x2e6b5e);
  cv.fillRect(330, 400, 360, 16, 0x1e4a42);
  drawTextCentered(cv, 510, 424, "EXITO", F5, 3, 0xffffff, 3);
  cv.fillRect(360, 462, 60, 48, 0xbfe3d8);
  cv.fillRect(600, 462, 60, 48, 0xbfe3d8);
  cv.vline(390, 462, 510, 0x1e4a42, 2);
  cv.vline(630, 462, 510, 0x1e4a42, 2);
  // Colombian flag at the entrance
  cv.vline(668, 428, 500, INK, 2);
  cv.fillRect(670, 428, 34, 12, 0xfcd116);
  cv.fillRect(670, 440, 34, 6, 0x003087);
  cv.fillRect(670, 446, 34, 6, 0xce1126);
  // armored vehicle at the entrance
  cv.fillRect(560, 480, 96, 24, 0x2e2a26);
  cv.fillRect(600, 466, 40, 16, 0x2e2a26);
  cv.fillRect(608, 470, 24, 8, 0xbfe3d8);
  cv.fillCircle(580, 506, 7, INK);
  cv.fillCircle(612, 506, 7, INK);
  cv.fillCircle(644, 506, 7, INK);
  // helicopter + spotlight beam landing in the open plaza
  drawHelicopter(cv, 400, 300);
  cv.line(392, 326, 372, 502, 0xffe9a8, 2);
  cv.line(416, 326, 444, 502, 0xffe9a8, 2);
  cv.fillEllipse(408, 508, 40, 7, 0xffe9a8);
  // crowd — background row, 16 figures, varied heights, 3 placards
  const poses = [1, 2, 3, 0, 4, 1, 0, 2, 3, 1, 0, 4, 2, 1, 3, 0];
  for (let i = 0; i < 16; i++) {
    const x = 60 + i * 58;
    const h = 20 + ((i * 7) % 7);
    drawFigure(cv, x, 538, h, SHIRTS[i % 8], poses[i]);
    if (i === 3 || i === 8 || i === 12) {
      const pc = i === 3 ? GOLD : i === 8 ? 0xc0392b : 0xf6f0e1;
      cv.vline(x + 6, 538 - h - 14, 538 - h + 2, INK, 2);
      cv.fillRect(x - 1, 538 - h - 24, 14, 10, pc);
      cv.outlineRect(x - 1, 538 - h - 24, 14, 10, INK, 1);
    }
  }
  // crowd — front row, 14 figures, coloured + posed
  const fposes = [1, 2, 3, 4, 0, 1, 2, 3, 0, 4, 1, 2, 3, 0];
  for (let i = 0; i < 14; i++) {
    const x = 100 + i * 62;
    const h = 28 + ((i * 5) % 7);
    drawFigure(cv, x, 552, h, SHIRTS[(i + 3) % 8], fposes[i]);
  }
  // foreground detail figures
  drawJournalist(cv, 40, 556);
  drawOfficer(cv, 972, 556);
}

// ---------------- secondary cards ----------------
function drawCardArt(cv: Canvas, ax: number, ay: number, aw: number, ah: number, art: number): void {
  if (art === 0) {
    // SPACE: rocket + Earth
    cv.fillRect(ax, ay, aw, ah, 0x141b33);
    const stars: [number, number][] = [[12, 10], [40, 22], [90, 8], [120, 30], [20, 44], [70, 38], [130, 50], [100, 60], [30, 70], [55, 14]];
    for (const s of stars) cv.fillRect(ax + s[0], ay + s[1], 2, 2, 0xffffff);
    const rx = ax + 68;
    const ry = ay + 12;
    cv.fillRect(rx - 7, ry + 10, 14, 34, 0xffffff);
    cv.fillPoly([[rx - 7, ry + 10], [rx, ry], [rx + 7, ry + 10]], 0xc0392b);
    cv.fillPoly([[rx - 7, ry + 44], [rx - 13, ry + 56], [rx - 7, ry + 50]], 0xc0392b);
    cv.fillPoly([[rx + 7, ry + 44], [rx + 13, ry + 56], [rx + 7, ry + 50]], 0xc0392b);
    cv.fillPoly([[rx - 4, ry + 44], [rx, ry + 60], [rx + 4, ry + 44]], 0xe67e22);
    cv.fillRect(rx - 7, ry + 22, 14, 4, 0x2471a3);
    cv.fillCircle(ax + 75, ay + 112, 26, 0x3a6fd8);
    cv.fillEllipse(ax + 66, ay + 106, 9, 5, 0x4caf50);
    cv.fillEllipse(ax + 84, ay + 118, 7, 4, 0x4caf50);
    cv.fillEllipse(ax + 74, ay + 122, 10, 3, 0xffffff);
  } else if (art === 1) {
    // BANGLADESH: "36 %" + gold arrow + factory
    cv.fillRect(ax, ay, aw, ah, 0xf2e3c0);
    drawText(cv, ax + 27, ay + 12, "36 %", F5, 4, INK, 4);
    cv.line(ax + 112, ay + 58, ax + 140, ay + 22, GOLD, 4);
    cv.line(ax + 140, ay + 22, ax + 126, ay + 22, GOLD, 4);
    cv.line(ax + 140, ay + 22, ax + 140, ay + 36, GOLD, 4);
    cv.fillRect(ax + 8, ay + 96, 134, 44, 0x3a2e22);
    cv.fillRect(ax + 20, ay + 66, 12, 30, 0x3a2e22);
    cv.fillRect(ax + 44, ay + 76, 12, 20, 0x3a2e22);
    cv.fillCircle(ax + 26, ay + 60, 6, 0x9a9a9a);
    cv.fillCircle(ax + 50, ay + 70, 5, 0x9a9a9a);
    for (let i = 0; i < 6; i++) cv.fillRect(ax + 16 + i * 20, ay + 108, 10, 10, 0xffe9a8);
  } else if (art === 2) {
    // INDONESIA: flooded mine shaft
    cv.fillRect(ax, ay, aw, ah, 0xe8d9b0);
    cv.fillPoly([[ax, ay + 140], [ax, ay + 84], [ax + 60, ay + 56], [ax + 110, ay + 88], [ax + 150, ay + 76], [ax + 150, ay + 140]], 0x5a7a3a);
    cv.fillRect(ax + 66, ay + 60, 16, 66, INK);
    cv.fillRect(ax + 60, ay + 54, 28, 8, 0x3a2e22);
    cv.fillPoly([[ax + 74, ay + 40], [ax + 88, ay + 54], [ax + 60, ay + 54]], GOLD);
    cv.fillRect(ax + 73, ay + 46, 2, 5, INK);
    cv.fillRect(ax, ay + 122, 150, 18, 0x3a6fd8);
    cv.hline(ax + 8, ax + 60, ay + 128, 0xffffff, 2);
    cv.hline(ax + 90, ax + 140, ay + 132, 0xffffff, 2);
  } else {
    // EUROPE: hangar + jets + smoke
    cv.fillRect(ax, ay, aw, ah, 0xc9cfd6);
    cv.fillRect(ax + 10, ay + 66, 130, 74, 0x5d6d7e);
    cv.fillPoly([[ax + 10, ay + 66], [ax + 75, ay + 40], [ax + 140, ay + 66]], 0x2e4053);
    cv.fillRect(ax + 55, ay + 96, 40, 44, INK);
    cv.fillCircle(ax + 34, ay + 52, 7, 0x9a9a9a);
    cv.fillCircle(ax + 46, ay + 38, 6, 0xb0b0b0);
    cv.fillCircle(ax + 30, ay + 26, 5, 0xc0c0c0);
    cv.fillRect(ax, ay + 122, 150, 18, 0x8a8a8a);
    for (let i = 0; i < 5; i++) cv.fillRect(ax + 10 + i * 28, ay + 129, 14, 3, 0xffffff);
    // jets in light paint so they read against the grey hangar/runway
    cv.fillPoly([[ax + 96, ay + 108], [ax + 128, ay + 118], [ax + 96, ay + 122]], 0xffffff);
    cv.fillPoly([[ax + 60, ay + 112], [ax + 86, ay + 120], [ax + 60, ay + 124]], 0xffffff);
    cv.hline(ax + 88, ax + 94, ay + 118, 0xffffff, 2);
    cv.hline(ax + 52, ax + 58, ay + 120, 0xffffff, 2);
  }
}

function drawCard(cv: Canvas, x: number, y: number, kicker: string, title: string, facts: string[], art: number): void {
  cv.fillRect(x, y, 488, 140, CARD);
  cv.outlineRect(x, y, 488, 140, INK, 2);
  const ax = x + 338;
  drawCardArt(cv, ax, y, 150, 140, art);
  cv.outlineRect(ax, y, 150, 140, INK, 2);
  drawText(cv, x + 12, y + 12, kicker, F5, 2, ACCENT, 2);
  drawText(cv, x + 12, y + 30, title, F5, 3, INK, 3);
  cv.fillRect(x + 12, y + 56, 40, 3, GOLD);
  drawText(cv, x + 12, y + 64, facts[0], F5, 2, INK, 2);
  drawText(cv, x + 12, y + 82, facts[1], F5, 2, INK, 2);
  drawText(cv, x + 12, y + 100, facts[2], F5, 2, INK, 2);
}

// ---------------- page ----------------
function drawPage(): Canvas {
  const cv = new Canvas(1024, 1024, PAPER);
  cv.outlineRect(10, 10, 1004, 1004, INK, 2);
  // masthead
  drawTextCentered(cv, 512, 22, "THE WORLD", F12, 6, INK, 6);
  drawTextCentered(cv, 512, 102, "WEDNESDAY, 25 NOVEMBER 2026", F5, 2, INK, 2);
  drawText(cv, 866, 102, "IN ONE IMAGE", F5, 2, ACCENT, 2);
  cv.hline(16, 1008, 122, INK, 2);
  // lead headline + facts
  drawTextCentered(cv, 512, 132, "HOSTAGES FREED IN CARTAGENA", F12, 3, INK, 3);
  drawTextCentered(cv, 512, 176, "30 HOSTAGES FREED - 1 GUNMAN KILLED, 4 HELD", F5, 2, INK, 2);
  drawTextCentered(cv, 512, 196, "SECURITY FORCES STORM EXITO SUPERMARKET AT DAWN", F5, 2, INK, 2);
  cv.hline(16, 1008, 218, INK, 2);
  // lead scene
  drawScene(cv);
  // secondary cards (2 x 2)
  drawCard(cv, 16, 566, "SPACE - SHENZHOU-24", "SPACE", ["FIRST PAKISTANI ASTRONAUT", "REACHES TIANGONG STATION", "DOCKED IN 3.5 HOURS"], 0);
  drawCard(cv, 520, 566, "ECONOMY - WAGES", "BANGLADESH", ["GARMENT PAY UP 36% TO", "17,000 TAKA FROM DEC 1", "WAGE BOARD VOTE 4-2"], 1);
  drawCard(cv, 16, 716, "DISASTER - PONGKOR", "INDONESIA", ["17 MINERS STILL TRAPPED", "9 DEAD, FLOODED GOLD SHAFT", "SHAFT 100 M DEEP"], 2);
  drawCard(cv, 520, 716, "WAR - SAVASLEYKA", "EUROPE", ["UKRAINE HITS RUSSIAN BASE", "5 JETS DAMAGED", "3 MIG-31, 2 SU-34"], 3);
  // briefs band (dark): 6 lines, 23 px, step 25, thin separators
  cv.fillRect(16, 864, 992, 150, BAND);
  const briefs = [
    "HODEIDAH: SAUDI-LED STRIKES HIT YEMEN PORT",
    "SOLOMON ISLANDS SIGNS SECURITY PACT WITH AUSTRALIA",
    "NVIDIA -8.3% AS HUANG RALLY FADES",
    "CHINA PROBES SHANGHAI PARTY CHIEF CHEN JINING",
    "CESSNA CRASH OFF MISSISSIPPI: 6 DEAD",
    "HUAWEI GUILTY ON 10 OF 12 US CHARGES",
  ];
  const rowExtra = [0, 3];
  for (let i = 0; i < briefs.length; i++) {
    const y = 865 + i * 25;
    drawText(cv, 32, y, briefs[i], F5, 3, BRIEF, 3, rowExtra);
    if (i < 5) cv.hline(32, 992, y + 24, SEPARATOR, 1);
  }
  return cv;
}

// ---------------- main ----------------
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const cv = drawPage();
  const png = encodePNG(1024, 1024, cv.buf);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  const dossier = {
    bounty: "news-image-20261125",
    title: "THE WORLD",
    date: "2026-11-25",
    version: 7,
    width: 1024,
    height: 1024,
    entry_png_sha256: sha,
    entry_png_bytes: png.length,
  };
  fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
}

main();
