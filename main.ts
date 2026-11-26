// news-image-20261125 v3 — "THE WORLD", Wednesday, 25 November 2026.
// One-day world news front page, drawn procedurally. Node 22 stdlib only,
// no network at run time. Writes /output/entry.png (1024x1024) and
// /output/dossier.json. Deterministic: two runs produce identical bytes.
//
// Facts (all first reported / happened 25 Nov 2026, verified from
// AP / Reuters / Nature / SpacePolicyOnline / TBS / US Coast Guard):
//   LEAD  Cartagena, Colombia — security forces storm Exito supermarket
//         at dawn; ~30 hostages freed, 1 gunman killed, 4 held.
//   SPACE Shenzhou-24 lifts off 08:18 Beijing carrying Muhammad Zeeshan
//         Ali, the first Pakistani astronaut, to Tiangong; docks 11:56.
//   BANGLADESH garment minimum wage up 36% to 17,000 taka, from 1 Dec.
//   INDONESIA flood in Pongkor gold mine, Bogor: 9 dead, 17 trapped.
//   EUROPE Ukraine hits Savasleyka air base, Russia: 5 jets damaged
//         (3 MiG-31, 2 Su-34) — Reuters, 25 Nov 2026.
//   BRIEFS Hodeidah / Solomon Islands / Nvidia -8.3% / Chen Jining /
//         Cessna crash Mississippi (6 dead) / Huawei guilty 10 of 12.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// ---- palette: paper, ink, one red accent ----
const PAPER: RGB = [246, 242, 231];
const INK: RGB = [22, 19, 14];
const RED: RGB = [178, 32, 42];
const BLUE: RGB = [31, 78, 121];
const GOLD: RGB = [216, 164, 65];
const GREEN: RGB = [58, 110, 72];
const GREY: RGB = [104, 102, 96];
const DARKBAND: RGB = [24, 21, 16];
const CREAM: RGB = [238, 231, 214];

type RGB = [number, number, number];

const img = new Uint8Array(W * H * 3);
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPx(i, j, c);
}
function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = x0; x <= x1; x++) setPx(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) setPx(x, y, c);
}
// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let x = cx - dx; x <= cx + dx; x++) setPx(x, cy + dy, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(t));
    for (let x = cx - dx; x <= cx + dx; x++) setPx(x, cy + dy, c);
  }
}
// Scanline polygon fill (convex or concave, even-odd).
function poly(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) setPx(x, y, c);
    }
  }
}

// ---- PNG encoder (filter 0 scanlines, zlib deflate, CRC32) ----
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}
function encodePNG(): Buffer {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
}

// ---- bitmap fonts, drawn fresh for this entry ----
// FONT5: 5 wide x 7 tall, body text. "#" = on, "." = off.
const FONT5: Record<string, string[]> = {
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
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "11110", "10001", "10001", "11110", "10000", "10000"],
  q: ["00000", "01111", "10001", "10001", "01111", "00001", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11110", "01000", "01000", "01000", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "01110", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
};

// FONT12: 8 wide x 12 tall display face, 2px stems with serif feet,
// used for the masthead and the lead headline only.
const FONT12: Record<string, string[]> = {
  A: ["...##...", "..#..#..", "..#..#..", ".#....#.", ".#....#.", ".#....#.", ".######.", ".#....#.", ".#....#.", ".#....#.", ".#....#.", "##....##"],
  B: ["######..", "##....#.", "##....#.", "##....#.", "######..", "##....#.", "##....#.", "##....#.", "##....#.", "##....#.", "##....#.", "######.."],
  C: ["..####..", ".##....#", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", ".##....#", "..####.."],
  D: ["#####...", "##...##.", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##...##.", "#####..."],
  E: ["#######.", "##......", "##......", "##......", "#####...", "##......", "##......", "##......", "##......", "##......", "##......", "#######."],
  F: ["#######.", "##......", "##......", "##......", "#####...", "##......", "##......", "##......", "##......", "##......", "##......", "##......"],
  G: ["..####..", ".##....#", "##......", "##......", "##......", "##..###.", "##...##.", "##....##", "##....##", "##....##", ".##...##", "..####.."],
  H: ["##....##", "##....##", "##....##", "##....##", "##....##", "########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##"],
  I: [".######.", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", ".######."],
  J: ["..#####.", ".....##.", ".....##.", ".....##.", ".....##.", ".....##.", ".....##.", ".....##.", ".....##.", ".##..##.", ".##..##.", "..####.."],
  K: ["##....##", "##...##.", "##..##..", "##..##..", "##.##...", "####....", "##.##...", "##..##..", "##..##..", "##...##.", "##....##", "##....##"],
  L: ["##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "##......", "#######."],
  M: ["##....##", "###..###", "##.##.##", "##.##.##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##"],
  N: ["##....##", "###...##", "####..##", "##.#..##", "##..#.##", "##...###", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##"],
  O: ["..####..", ".##..##.", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", ".##..##.", "..####.."],
  P: ["######..", "##....##", "##....##", "##....##", "##....##", "######..", "##......", "##......", "##......", "##......", "##......", "##......"],
  Q: ["..####..", ".##..##.", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##..#.##", ".##..##.", "..####..", "....###."],
  R: ["######..", "##....##", "##....##", "##....##", "##....##", "######..", "##.##...", "##..##..", "##...##.", "##....##", "##....##", "##....##"],
  S: ["..####..", ".##..##.", "##....##", "##......", ".#####..", ".....##.", "......##", "##....##", "##....##", ".##..##.", "..####..", "........"],
  T: ["########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##..."],
  U: ["##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", ".##..##.", "..####.."],
  V: ["##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", ".##..##.", ".##..##.", "..#..#..", "..#..#..", "...##..."],
  W: ["##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##.##.##", "##.##.##", "###..###", "###..###", "##....##", "##....##"],
  X: ["##....##", "##....##", ".##..##.", ".##..##.", "..#..#..", "...##...", "...##...", "..#..#..", ".##..##.", ".##..##.", "##....##", "##....##"],
  Y: ["##....##", "##....##", "##....##", ".##..##.", ".##..##.", "..#..#..", "...##...", "...##...", "...##...", "...##...", "...##...", "...##..."],
  Z: ["########", "......##", ".....##.", "....##..", "...##...", "..##....", ".##.....", "##......", "##......", "##......", "##......", "########"],
  " ": ["........", "........", "........", "........", "........", "........", "........", "........", "........", "........", "........", "........"],
  ".": ["........", "........", "........", "........", "........", "........", "........", "........", "........", "........", "...##...", "...##..."],
  ",": ["........", "........", "........", "........", "........", "........", "........", "........", "........", "...##...", "...##...", "..##...."],
  "-": ["........", "........", "........", "........", "........", ".######.", "........", "........", "........", "........", "........", "........"],
  "'": ["...##...", "...##...", "..##....", "........", "........", "........", "........", "........", "........", "........", "........", "........"],
};

// ---- text helpers ----
type FontMap = Record<string, string[]>;
function charW(f: FontMap, ch: string): number {
  const g = f[ch];
  return g ? g[0].length : 5;
}
function textW(str: string, f: FontMap, s: number): number {
  let w = 0;
  for (const ch of str) w += (charW(f, ch) + 1) * s;
  return w - s;
}
function drawText(str: string, x: number, y: number, f: FontMap, s: number, c: RGB): void {
  let cx = x;
  for (const ch of str) {
    const g = f[ch];
    if (g) {
      for (let r = 0; r < g.length; r++) {
        const row = g[r];
        for (let col = 0; col < row.length; col++) {
          if (row[col] === "#" || row[col] === "1") rect(cx + col * s, y + r * s, s, s, c);
        }
      }
    }
    cx += (charW(f, ch) + 1) * s;
  }
}
function drawTextCentered(str: string, cx: number, y: number, f: FontMap, s: number, c: RGB): void {
  drawText(str, Math.round(cx - textW(str, f, s) / 2), y, f, s, c);
}
// Bold by double-striking 1px to the right (scale 2 only).
function drawTextBold2(str: string, x: number, y: number, f: FontMap, c: RGB): void {
  drawText(str, x, y, f, 2, c);
  drawText(str, x + 1, y, f, 2, c);
}
// Top half of a filled disc (umbrella canopy).
function halfDiscTop(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= 0; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let x = cx - dx; x <= cx + dx; x++) setPx(x, cy + dy, c);
  }
}
// One crowd figure: stick body, varied height, optional hat / umbrella.
function figure(x: number, baseY: number, h: number, hat: boolean, umbrella: boolean): void {
  const headY = baseY - h;
  disc(x, headY + 2, 3, INK);
  line(x, headY + 5, x, baseY - 9, INK);
  line(x, baseY - 9, x - 5, baseY, INK);
  line(x, baseY - 9, x + 5, baseY, INK);
  line(x, headY + 8, x - 6, headY + 14, INK);
  line(x, headY + 8, x + 6, headY + 14, INK);
  if (hat) {
    rect(x - 5, headY - 3, 10, 2, INK);
    rect(x - 3, headY - 6, 6, 3, INK);
  }
  if (umbrella) {
    halfDiscTop(x, headY - 8, 12, RED);
    vline(x, headY - 8, headY + 6, INK);
  }
}

// ---- layout ----
const SKY1: RGB = [201, 220, 232];
const SKY2: RGB = [247, 217, 168];
const SKY3: RGB = [242, 165, 107];
const SKY4: RGB = [232, 126, 78];
const BEAM: RGB = [250, 238, 180];
const HELI: RGB = [52, 62, 72];
const SHOP: RGB = [168, 158, 140];
const SHOPROOF: RGB = [120, 110, 94];
const STREET: RGB = [74, 70, 64];

function drawMasthead(): void {
  // "THE WORLD" in the 8x12 display face at scale 8, flanked by red diamonds.
  const w = textW("THE WORLD", FONT12, 8);
  drawText("THE WORLD", Math.round((W - w) / 2), 6, FONT12, 8, INK);
  disc(160, 54, 6, RED);
  disc(864, 54, 6, RED);
  drawTextCentered("WEDNESDAY, 25 NOVEMBER 2026 - IN ONE IMAGE", W / 2, 110, FONT5, 2, INK);
  hline(24, 999, 130, INK);
  hline(24, 999, 133, INK);
}

function drawLeadScene(): void {
  const x0 = 24;
  const x1 = 999;
  const y0 = 142;
  const y1 = 468;
  // Dawn sky in four bands.
  rect(x0, y0, x1 - x0 + 1, 82, SKY1);
  rect(x0, y0 + 82, x1 - x0 + 1, 82, SKY2);
  rect(x0, y0 + 164, x1 - x0 + 1, 82, SKY3);
  rect(x0, y0 + 246, x1 - x0 + 1, y1 - (y0 + 246) + 1, SKY4);
  // Sun with short rays, top right, fully inside the scene.
  disc(880, 200, 30, GOLD);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const sx = Math.round(880 + Math.cos(a) * 36);
    const sy = Math.round(200 + Math.sin(a) * 36);
    const ex = Math.round(880 + Math.cos(a) * 54);
    const ey = Math.round(200 + Math.sin(a) * 54);
    line(sx, sy, ex, ey, GOLD);
  }
  // Searchlight beam: from the helicopter down to open street on the
  // left (x 148..240 at the ground), clear of both buildings. Drawn
  // before the buildings so it never crosses an edge.
  poly([[196, 228], [214, 228], [240, 458], [148, 458]], BEAM);
  // Low building, left, kept narrow (ends x 140) so the beam lands clear.
  rect(24, 400, 116, 68, [90, 84, 76]);
  rect(24, 400, 116, 6, [70, 64, 56]);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) rect(36 + c * 22, 414 + r * 16, 10, 10, [246, 242, 231]);
  }
  // Supermarket EXITO, right.
  rect(520, 300, 460, 168, SHOP);
  rect(520, 300, 460, 10, SHOPROOF);
  rect(520, 330, 460, 30, RED);
  drawText("EXITO", 710, 334, FONT12, 2, PAPER);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 12; c++) rect(536 + c * 38, 372 + r * 22, 18, 12, [246, 242, 231]);
  }
  rect(700, 420, 60, 48, [60, 54, 48]); // entrance
  // Colombian flag on the roof.
  vline(940, 272, 300, INK);
  rect(940, 272, 40, 12, [252, 209, 22]);
  rect(940, 284, 40, 6, [0, 56, 147]);
  rect(940, 290, 40, 6, [206, 17, 38]);
  // Street.
  rect(24, 430, 976, 38, STREET);
  hline(24, 999, 430, [50, 46, 40]);
  // Armoured vehicle in front of the supermarket.
  rect(600, 436, 90, 22, [58, 74, 58]);
  rect(630, 426, 30, 10, [58, 74, 58]);
  line(660, 430, 694, 424, INK);
  disc(618, 460, 6, INK);
  disc(672, 460, 6, INK);
  // Helicopter, big, top left, over the beam's origin.
  poly([[155, 202], [108, 192], [108, 212]], HELI); // tail boom
  poly([[108, 192], [96, 172], [104, 192]], HELI); // tail fin
  ellipse(205, 210, 55, 18, HELI); // body
  ellipse(245, 208, 16, 10, [180, 215, 230]); // cockpit window
  vline(205, 178, 192, INK); // rotor mast
  hline(140, 270, 177, INK);
  hline(140, 270, 178, INK);
  line(165, 232, 245, 232, INK); // skid bar
  vline(175, 226, 232, INK);
  vline(235, 226, 232, INK);
  // Crowd on the street: varied heights, hats, umbrellas.
  const crowd: Array<[number, number, boolean, boolean]> = [
    [250, 30, false, false], [290, 26, true, false], [330, 34, false, false],
    [370, 28, false, false], [410, 32, false, true], [450, 26, true, false],
    [490, 30, false, false], [530, 34, false, false], [720, 28, false, false],
    [760, 30, false, false], [800, 26, true, false], [840, 34, false, false],
    [880, 28, false, true], [920, 32, false, false], [960, 26, false, false],
  ];
  for (const [fx, fh, hat, umb] of crowd) figure(fx, 468, fh, hat, umb);
}

function drawHeadline(): void {
  drawTextCentered("HOSTAGES FREED", W / 2, 478, FONT12, 4, INK);
  drawTextCentered("IN CARTAGENA", W / 2, 528, FONT12, 4, RED);
  drawTextCentered("~30 HOSTAGES FREED AT DAWN; 1 GUNMAN KILLED, 4 HELD", W / 2, 586, FONT5, 2, INK);
  drawTextCentered("ARMED ROBBERY GONE WRONG SPARKED DAY-LONG SIEGE", W / 2, 604, FONT5, 2, INK);
  hline(24, 999, 622, INK);
  hline(24, 999, 623, INK);
}

// ---- secondary cards ----
const CARD_X = [24, 270, 516, 762];
function drawCardArtSpace(ax: number): void {
  rect(ax, 660, 222, 66, [20, 32, 58]);
  const stars: Array<[number, number]> = [[15, 668], [60, 664], [120, 670], [180, 666], [200, 690], [90, 712], [150, 706], [30, 694]];
  for (const [sx, sy] of stars) rect(ax + sx, sy, 2, 2, PAPER);
  // Earth arc, fully inside the art box.
  poly([[ax, 726], [ax, 716], [ax + 30, 708], [ax + 80, 704], [ax + 140, 704], [ax + 190, 708], [ax + 222, 716], [ax + 222, 726]], BLUE);
  rect(ax + 100, 706, 30, 6, GREEN);
  // Rocket with flame, in front of the arc.
  rect(ax + 40, 672, 14, 34, PAPER);
  poly([[ax + 40, 672], [ax + 54, 672], [ax + 47, 660]], PAPER);
  poly([[ax + 40, 700], [ax + 32, 714], [ax + 40, 706]], RED);
  poly([[ax + 54, 700], [ax + 62, 714], [ax + 54, 706]], RED);
  poly([[ax + 43, 706], [ax + 51, 706], [ax + 47, 720]], GOLD);
}
function drawCardArtBangladesh(ax: number): void {
  rect(ax, 660, 222, 66, [232, 226, 210]);
  // "36%" big at top left; arrow far right — 110px clear gap, no overlap.
  drawText("36%", ax + 10, 664, FONT5, 4, RED);
  drawText("36%", ax + 12, 664, FONT5, 4, RED);
  poly([[ax + 188, 686], [ax + 212, 686], [ax + 200, 664]], GOLD);
  rect(ax + 196, 684, 8, 18, GOLD);
  // Factory low at bottom right, clear of both.
  rect(ax + 120, 704, 102, 22, GREY);
  rect(ax + 130, 710, 12, 8, INK);
  rect(ax + 150, 710, 12, 8, INK);
  rect(ax + 170, 710, 12, 8, INK);
}
function drawCardArtEurope(ax: number): void {
  rect(ax, 660, 222, 66, [228, 222, 208]);
  poly([[ax + 10, 726], [ax + 70, 660], [ax + 120, 660], [ax + 60, 726]], GREY);
  poly([[ax + 80, 700], [ax + 104, 696], [ax + 84, 708]], INK);
  poly([[ax + 100, 676], [ax + 124, 672], [ax + 104, 684]], INK);
  disc(ax + 150, 700, 5, RED);
  disc(ax + 170, 692, 8, GREY);
  disc(ax + 180, 680, 6, GREY);
  disc(ax + 188, 670, 5, GREY);
}
function drawCardArtIndonesia(ax: number): void {
  rect(ax, 660, 222, 66, [214, 228, 210]);
  poly([[ax, 726], [ax, 700], [ax + 60, 672], [ax + 140, 676], [ax + 222, 700], [ax + 222, 726]], GREEN);
  rect(ax + 96, 696, 34, 6, GREY);
  rect(ax + 100, 700, 26, 26, INK);
  rect(ax, 716, 222, 10, BLUE);
  disc(ax + 60, 690, 3, PAPER);
  disc(ax + 170, 694, 3, PAPER);
}
function drawCards(): void {
  const cards = [
    { kicker: "SPACE", color: BLUE, art: drawCardArtSpace, t1: "PAKISTAN'S FIRST", t2: "ASTRONAUT IN ORBIT", f1: "SHENZHOU-24 DOCKS", f2: "AT TIANGONG" },
    { kicker: "BANGLADESH", color: GREEN, art: drawCardArtBangladesh, t1: "GARMENT PAY UP 36%", t2: "TO 17,000 TAKA", f1: "BOARD VOTES 4-2", f2: "FROM DEC 1" },
    { kicker: "EUROPE", color: RED, art: drawCardArtEurope, t1: "UKRAINE HITS", t2: "RUSSIAN AIR BASE", f1: "3 MIG-31, 2 SU-34", f2: "DAMAGED" },
    { kicker: "INDONESIA", color: INK, art: drawCardArtIndonesia, t1: "MINE FLOOD", t2: "IN BOGOR, 9 DEAD", f1: "17 STILL TRAPPED", f2: "SHAFT 100 M DEEP" },
  ];
  for (let i = 0; i < 4; i++) {
    const x = CARD_X[i];
    const c = cards[i];
    drawText(c.kicker, x, 634, FONT5, 2, c.color);
    rect(x, 652, 44, 3, c.color);
    c.art(x + 8);
    drawTextBold2(c.t1, x, 732, FONT5, INK);
    drawTextBold2(c.t2, x, 750, FONT5, INK);
    drawText(c.f1, x, 772, FONT5, 2, GREY);
    drawText(c.f2, x, 788, FONT5, 2, GREY);
  }
}

// ---- briefs: dark band, light text, 20px type for thumbnail contrast ----
function drawBriefs(): void {
  rect(24, 814, 976, 202, DARKBAND);
  drawText("IN BRIEF", 40, 822, FONT5, 2, GOLD);
  const briefs = [
    "HODEIDAH: SAUDI-LED STRIKES; HOUTHIS THREATEN JEDDAH",
    "SOLOMON IS.: SECURITY PACT WITH AUSTRALIA SIGNED",
    "NVIDIA -8.3% AS HUANG COMEBACK RALLY FADES",
    "CHEN JINING: BEIJING PROBES SHANGHAI PARTY CHIEF",
    "CESSNA CRASH: 6 DEAD OFF MISSISSIPPI COAST",
    "HUAWEI GUILTY ON 10 OF 12 U.S. CHARGES",
  ];
  for (let i = 0; i < briefs.length; i++) {
    const y = 848 + i * 29;
    rect(28, y + 8, 6, 6, RED);
    drawText(briefs[i], 40, y, FONT5, 3, CREAM);
  }
}

function main(): void {
  rect(0, 0, W, H, PAPER);
  drawMasthead();
  drawLeadScene();
  drawHeadline();
  drawCards();
  drawBriefs();
  const png = encodePNG();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/entry.png`, png);
  const sha = createHash("sha256").update(png).digest("hex");
  const dossier = {
    title: "THE WORLD",
    date: "2026-11-25",
    competition: "news-image-20261125",
    version: 3,
    width: W,
    height: H,
    entry_png_sha256: sha,
    stories: [
      "Cartagena hostage rescue: ~30 freed, 1 gunman killed, 4 held",
      "Shenzhou-24: first Pakistani astronaut Muhammad Zeeshan Ali to Tiangong",
      "Bangladesh garment wage up 36% to 17,000 taka",
      "Pongkor mine flood, Bogor: 9 dead, 17 trapped",
      "Ukraine hits Savasleyka air base: 5 jets damaged (3 MiG-31, 2 Su-34)",
      "Briefs: Hodeidah, Solomon Islands, Nvidia, Chen Jining, Cessna crash, Huawei",
    ],
  };
  writeFileSync(`${OUT}/dossier.json`, JSON.stringify(dossier, null, 2) + "\n");
}

main();
