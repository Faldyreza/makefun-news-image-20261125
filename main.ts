// news-image-20261125 v8 — "THE WORLD — Wednesday, 25 November 2026"
// Fresh program written from DESIGN.md. Node 22 stdlib only, no network,
// deterministic: two runs write identical bytes to /output (or $MAKEFUN_OUTPUT_DIR).
// Renders a 1024x1024 newspaper front page: masthead, lead story (Cartagena
// hostage rescue), four secondary cards (Space, Bangladesh, Indonesia, Europe),
// six briefs. All drawing is procedural; fonts are bitmap fonts defined here.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// ---- palette ----
const PAPER: RGB = [245, 239, 224];
const CARD: RGB = [251, 247, 236];
const INK: RGB = [26, 23, 18];
const GOLD: RGB = [176, 141, 46];
const GOLD_LT: RGB = [201, 162, 39];
const BAND: RGB = [20, 16, 12];
const BAND_TXT: RGB = [246, 240, 225];
const SEPARATOR: RGB = [58, 50, 38];
const SKY0: RGB = [247, 226, 160];
const SKY1: RGB = [241, 205, 126];
const SKY2: RGB = [232, 185, 95];
const SKY3: RGB = [223, 169, 75];
const SUN: RGB = [246, 201, 69];
const RAY: RGB = [249, 222, 142];
const EXITO_FACADE: RGB = [232, 220, 192];
const EXITO_SIGN: RGB = [176, 58, 46];
const BLD2: RGB = [217, 201, 168];
const PLAZA: RGB = [214, 203, 178];
const STREET: RGB = [183, 169, 140];
const HELI: RGB = [62, 92, 118];
const SPOT: RGB = [251, 234, 158];
const NAVY: RGB = [31, 58, 95];
const FLAG_Y: RGB = [252, 209, 22];
const FLAG_B: RGB = [0, 48, 135];
const FLAG_R: RGB = [206, 17, 38];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [120, 120, 118];
const SMOKE: RGB = [168, 168, 160];

type RGB = [number, number, number];

// ---- raster ----
const img = new Uint8Array(W * H * 3);
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) px(xx, yy, c);
  }
}
function hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) rect(x0, y + k, x1 - x0, 1, c);
}
function vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) rect(x + k, y0, 1, y1 - y0, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) line(x0 + a, y0 + b, x1 + a, y1 + b, c);
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const dx = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}
// scanline fill for a convex polygon given as [x,y,...] pairs
function poly(pts: number[], c: RGB): void {
  const n = pts.length / 2;
  let minY = H, maxY = 0;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, pts[i * 2 + 1]);
    maxY = Math.max(maxY, pts[i * 2 + 1]);
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
      const x1 = pts[((i + 1) % n) * 2], y1 = pts[((i + 1) % n) * 2 + 1];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) rect(xs[k], y, xs[k + 1] - xs[k], 1, c);
  }
}

// ---- 5x7 bitmap font (glyphs as 7 rows of 5 bits) ----
const F5: Record<string, number[]> = {
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
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 17, 16, 17, 14], d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14], f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 15, 17, 17, 15, 1, 14], h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14], j: [2, 0, 6, 2, 2, 18, 12],
  k: [16, 16, 18, 20, 24, 20, 18], l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21], n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14], p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1], r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30], t: [8, 8, 28, 8, 8, 8, 6],
  u: [0, 0, 17, 17, 17, 19, 13], v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 15, 1, 14], z: [0, 0, 31, 2, 4, 8, 31],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], "-": [0, 0, 0, 14, 0, 0, 0],
  "—": [0, 0, 0, 31, 0, 0, 0], "%": [25, 26, 2, 4, 8, 11, 19],
  "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0], ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 6, 4, 0, 4],
  "/": [1, 2, 2, 4, 8, 8, 16], "+": [0, 4, 4, 31, 4, 4, 0],
  "&": [12, 18, 20, 8, 21, 18, 13], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], "•": [0, 0, 14, 14, 14, 0, 0],
};
// rowHeights: optional per-glyph-row heights (for the tall briefs band)
function glyph5(x: number, y: number, ch: string, s: number, c: RGB, rowH?: number[]): void {
  const g = F5[ch] || F5["?"];
  let yy = y;
  for (let r = 0; r < 7; r++) {
    const hh = rowH ? rowH[r] : s;
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (1 << (4 - col))) rect(x + col * s, yy, s, hh, c);
    }
    yy += hh;
  }
}
function text5(x: number, y: number, t: string, s: number, c: RGB, rowH?: number[], wordGap = 0): number {
  let xx = x;
  for (const ch of t) {
    glyph5(xx, y, ch, s, c, rowH);
    xx += 6 * s + (ch === " " ? wordGap : 0);
  }
  return xx - x;
}
function width5(t: string, s: number, wordGap = 0): number {
  let w = 0;
  for (const ch of t) w += 6 * s + (ch === " " ? wordGap : 0);
  return w - s;
}

// ---- 8x12 masthead font (only the letters of THE WORLD) ----
const F12: Record<string, number[]> = {
  T: [255, 255, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24],
  H: [195, 195, 195, 195, 195, 255, 255, 195, 195, 195, 195, 195],
  E: [255, 255, 192, 192, 192, 252, 252, 192, 192, 192, 255, 255],
  W: [195, 195, 195, 195, 195, 219, 219, 255, 255, 126, 60, 24],
  O: [60, 126, 195, 195, 195, 195, 195, 195, 195, 195, 126, 60],
  R: [252, 195, 195, 195, 252, 216, 204, 198, 195, 195, 195, 195],
  L: [192, 192, 192, 192, 192, 192, 192, 192, 192, 192, 255, 255],
  D: [248, 198, 195, 195, 195, 195, 195, 195, 195, 195, 198, 248],
  " ": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
function glyph12(x: number, y: number, ch: string, s: number, c: RGB): void {
  const g = F12[ch] || F12[" "];
  for (let r = 0; r < 12; r++) {
    for (let col = 0; col < 8; col++) {
      if (g[r] & (1 << (7 - col))) rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function text12(x: number, y: number, t: string, s: number, c: RGB, bold = false): number {
  let xx = x;
  for (const ch of t) {
    glyph12(xx, y, ch, s, c);
    if (bold) glyph12(xx + 1, y, ch, s, c);
    xx += 10 * s;
  }
  return xx - x;
}
function width12(t: string, s: number): number {
  return t.length * 10 * s - 2 * s;
}

// ---- crowd figures ----
const SHIRTS: RGB[] = [
  [192, 57, 43], [36, 113, 163], [34, 153, 84], [212, 172, 13],
  [248, 249, 249], [125, 60, 152], [20, 143, 119], [230, 126, 34],
];
const SKIN: RGB = [222, 184, 135];
const HAIR: RGB = [40, 30, 20];
// pose: 0 plain, 1 cheering (arms up), 2 phone (arm up with phone), 3 hat
function figure(x: number, yBase: number, hgt: number, shirt: RGB, pose: number): void {
  const headR = Math.max(2, Math.round(hgt / 9));
  const hy = yBase - hgt + headR;
  disc(x, hy, headR, SKIN);
  rect(x - headR + 1, hy - headR - 1, (headR - 1) * 2, 2, HAIR);
  const shoulder = hy + headR + 1;
  const waist = yBase - Math.round(hgt * 0.35);
  thickLine(x, shoulder, x, waist, shirt, 3);
  // legs
  line(x, waist, x - 4, yBase, INK);
  line(x, waist, x + 4, yBase, INK);
  // arms by pose
  if (pose === 1) {
    line(x, shoulder + 2, x - 7, shoulder - 6, shirt);
    line(x, shoulder + 2, x + 7, shoulder - 6, shirt);
  } else if (pose === 2) {
    line(x, shoulder + 2, x - 5, shoulder + 6, shirt);
    line(x, shoulder + 2, x + 6, shoulder - 7, shirt);
    rect(x + 5, shoulder - 11, 3, 5, INK); // phone
  } else if (pose === 3) {
    rect(x - headR - 1, hy - headR - 3, (headR + 1) * 2, 3, [176, 141, 46]); // hat
    line(x, shoulder + 2, x - 6, shoulder + 5, shirt);
    line(x, shoulder + 2, x + 6, shoulder + 5, shirt);
  } else {
    line(x, shoulder + 2, x - 6, shoulder + 6, shirt);
    line(x, shoulder + 2, x + 6, shoulder + 6, shirt);
  }
}

// ---- scene: lead illustration ----
function drawLeadScene(): void {
  const X0 = 24, X1 = 1000, Y0 = 230, Y1 = 556;
  // sky, four dawn layers
  rect(X0, Y0, X1 - X0, 50, SKY0);
  rect(X0, Y0 + 50, X1 - X0, 50, SKY1);
  rect(X0, Y0 + 100, X1 - X0, 50, SKY2);
  rect(X0, Y0 + 150, X1 - X0, 50, SKY3);
  // sun, top-left, rays reaching r 100, two parallel lines per ray
  const sx = 150, sy = 296;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4 + Math.PI / 8;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const x0 = sx + Math.round(dx * 36), y0 = sy + Math.round(dy * 36);
    const x1 = sx + Math.round(dx * 100), y1 = sy + Math.round(dy * 100);
    line(x0, y0, x1, y1, RAY);
    line(x0 + 2, y0 + 1, x1 + 2, y1 + 1, RAY);
  }
  disc(sx, sy, 30, SUN);
  disc(sx, sy, 22, [250, 214, 110]);
  // EXITO supermarket, left
  rect(60, 400, 460, 100, EXITO_FACADE);
  rect(60, 400, 460, 42, EXITO_SIGN);
  text5(60 + Math.floor((460 - width5("EXITO", 4)) / 2), 408, "EXITO", 4, WHITE);
  rect(60, 442, 460, 3, GOLD);
  for (let i = 0; i < 8; i++) rect(76 + i * 56, 458, 34, 26, [70, 66, 58]);
  rect(268, 470, 44, 30, [60, 52, 40]); // door
  // second building
  rect(540, 430, 160, 70, BLD2);
  for (let i = 0; i < 3; i++) rect(552 + i * 52, 446, 30, 22, [70, 66, 58]);
  rect(540, 430, 160, 4, INK);
  // Colombian flag on a pole in the open plaza
  vline(742, 372, 500, INK, 3);
  rect(745, 372, 66, 10, FLAG_Y);
  rect(745, 382, 66, 9, FLAG_B);
  rect(745, 391, 66, 9, FLAG_R);
  // helicopter, top-right, over the open plaza
  const hx = 852, hy = 298;
  line(hx - 78, hy - 14, hx + 78, hy - 14, INK); // rotor
  line(hx - 60, hy - 18, hx + 60, hy - 18, INK);
  vline(hx, hy - 14, hy - 4, INK, 3);
  ellipse(hx, hy + 6, 42, 15, HELI); // body
  poly([hx + 38, hy, hx + 96, hy - 10, hx + 96, hy + 4, hx + 38, hy + 10], HELI); // tail
  rect(hx + 88, hy - 20, 6, 16, HELI); // tail fin
  disc(hx - 18, hy + 2, 7, [180, 210, 230]); // window
  line(hx - 30, hy + 18, hx - 40, hy + 26, INK); // skid
  line(hx + 30, hy + 18, hx + 40, hy + 26, INK);
  hline(hx - 40, hx + 40, hy + 26, INK, 2);
  // spotlight cone down to the open plaza (does not cross the EXITO sign)
  poly([hx - 8, hy + 20, hx + 8, hy + 20, 928, 520, 792, 520], SPOT);
  // ground: plaza + street
  rect(X0, 500, X1 - X0, 56, PLAZA);
  rect(X0, 530, X1 - X0, 26, STREET);
  for (let i = 0; i < 12; i++) rect(40 + i * 82, 541, 40, 3, [240, 234, 220]);
  // armoured vehicle on the street
  rect(120, 502, 118, 26, [58, 64, 70]);
  rect(140, 490, 60, 14, [58, 64, 70]);
  rect(150, 494, 18, 8, [150, 180, 200]);
  disc(146, 530, 8, INK); disc(210, 530, 8, INK);
  disc(146, 530, 3, GREY); disc(210, 530, 3, GREY);

  // ---- crowd, three rows + two detailed foreground figures ----
  // row 3 (NEW): small background figures, varied heights, three waving flags
  const row3: [number, number][] = [
    [90, 16], [150, 14], [210, 18], [280, 15], [350, 17],
    [430, 14], [500, 18], [580, 15], [660, 17], [730, 14],
  ];
  for (let i = 0; i < row3.length; i++) {
    const [fx, fh] = row3[i];
    figure(fx, 490, fh, SHIRTS[(i * 3 + 1) % 8], i % 4 === 0 ? 1 : 0);
  }
  // small flags waved by three row-3 figures (Colombian colours)
  line(210, 472, 210, 452, INK); poly([210, 452, 228, 457, 210, 462], FLAG_Y);
  line(500, 472, 500, 452, INK); poly([500, 452, 518, 457, 500, 462], FLAG_B);
  line(730, 474, 730, 454, INK); poly([730, 454, 748, 459, 730, 464], FLAG_R);
  // row 2: sixteen figures, varied heights, three placards of varied shapes (NEW)
  const row2x = [70, 118, 166, 214, 262, 310, 358, 406, 454, 502, 550, 598, 646, 694, 742, 790];
  const row2h = [24, 21, 26, 22, 25, 21, 24, 26, 22, 25, 21, 24, 26, 22, 25, 21];
  for (let i = 0; i < 16; i++) {
    figure(row2x[i], 514, row2h[i], SHIRTS[(i * 5 + 2) % 8], i % 3);
  }
  // placard 1: gold square on a stick
  line(310, 492, 310, 470, INK);
  rect(296, 448, 28, 22, GOLD_LT); rect(296, 448, 28, 22, INK); // frame drawn below as 1px border
  rect(297, 449, 26, 20, GOLD_LT);
  // placard 2: red circle on a stick
  line(502, 494, 502, 468, INK);
  disc(502, 456, 12, FLAG_R);
  // placard 3: tall white banner with a star symbol (NEW), no text
  line(694, 492, 694, 462, INK);
  rect(682, 432, 24, 30, WHITE); rect(682, 432, 24, 30, INK);
  rect(683, 433, 22, 28, WHITE);
  disc(694, 447, 5, GOLD); // star centre (simple 5-point star drawn as disc + spikes)
  line(694, 440, 694, 454, GOLD); line(687, 447, 701, 447, GOLD);
  // front row: fourteen figures, eight shirt colours, varied poses
  const frontx = [100, 160, 220, 280, 340, 400, 460, 520, 580, 640, 700, 760, 820, 880];
  const frontPose = [1, 2, 3, 1, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2];
  for (let i = 0; i < 14; i++) {
    figure(frontx[i], 548, 32, SHIRTS[i % 8], frontPose[i]);
  }
  // two red umbrellas over the front row
  for (const ux of [280, 640]) {
    line(ux, 516, ux, 500, INK);
    for (let a = 0; a <= 10; a++) {
      const ang = Math.PI + (a / 10) * Math.PI;
      px(ux + Math.round(Math.cos(ang) * 22), 500 + Math.round(Math.sin(ang) * 10), FLAG_R);
    }
    rect(ux - 22, 498, 44, 3, FLAG_R);
  }
  // foreground journalist with tripod camera (left edge, detailed)
  const jx = 44;
  rect(jx + 8, 506, 14, 30, [52, 58, 64]); // jacket
  disc(jx + 15, 500, 7, SKIN);
  rect(jx + 7, 492, 16, 4, [40, 36, 30]); // hat
  line(jx + 15, 536, jx + 2, 552, INK); // tripod legs
  line(jx + 15, 536, jx + 28, 552, INK);
  line(jx + 15, 536, jx + 15, 552, INK);
  rect(jx + 8, 524, 14, 10, INK); // camera
  disc(jx + 22, 529, 4, [150, 180, 200]); // lens
  // foreground officer in navy with gold belt, arm raised (right edge, detailed)
  const ox = 946;
  rect(ox + 6, 504, 16, 32, NAVY); // uniform
  disc(ox + 14, 498, 7, SKIN);
  rect(ox + 5, 490, 18, 4, NAVY); // cap
  rect(ox + 6, 520, 16, 4, GOLD); // gold belt
  line(ox + 20, 508, ox + 30, 492, NAVY); // raised arm pointing
  line(ox + 6, 508, ox - 2, 520, NAVY);
  line(ox + 8, 536, ox + 4, 552, INK);
  line(ox + 20, 536, ox + 24, 552, INK);
}

// ---- secondary cards ----
function drawCard(x: number, y: number, kicker: string, t1: string, t2: string, f1: string, f2: string, art: (ax: number, ay: number) => void): void {
  const CW = 480, CH = 140;
  rect(x, y, CW, CH, CARD);
  rect(x, y, CW, 1, [216, 205, 178]);
  rect(x, y + CH - 1, CW, 1, [216, 205, 178]);
  rect(x, y, 1, CH, [216, 205, 178]);
  rect(x + CW - 1, y, 1, CH, [216, 205, 178]);
  // art box on the right side, 150 px wide, with a thin 1 px frame (NEW in v8)
  const ax = x + CW - 150, ay = y;
  rect(ax, ay, 150, CH, INK);
  rect(ax + 1, ay + 1, 148, CH - 2, PAPER);
  art(ax + 2, ay + 2);
  // text
  text5(x + 12, y + 10, kicker, 2, GOLD);
  text5(x + 12, y + 30, t1, 3, INK);
  text5(x + 12, y + 53, t2, 3, INK);
  rect(x + 12, y + 80, 40, 3, GOLD);
  text5(x + 12, y + 90, f1, 2, INK);
  text5(x + 12, y + 106, f2, 2, INK);
}

function artSpace(ax: number, ay: number): void {
  rect(ax, ay, 146, 136, [16, 26, 51]); // deep sky
  // stars (NEW: more of them, varied)
  const stars: [number, number, number][] = [
    [12, 12, 2], [40, 8, 1], [70, 20, 2], [100, 10, 1], [128, 26, 2],
    [24, 40, 1], [56, 34, 2], [88, 44, 1], [118, 52, 2], [8, 66, 1],
    [36, 70, 2], [66, 60, 1], [96, 74, 2], [132, 66, 1], [18, 92, 1],
  ];
  for (const [sx, sy, sr] of stars) {
    disc(ax + sx, ay + sy, sr, WHITE);
    if (sr === 2) { line(ax + sx - 3, ay + sy, ax + sx + 3, ay + sy, WHITE); line(ax + sx, ay + sy - 3, ax + sx, ay + sy + 3, WHITE); }
  }
  // rocket, diagonal, nose up-right
  poly([ax + 62, ay + 78, ax + 78, ay + 34, ax + 90, ay + 40, ax + 76, ay + 84], WHITE);
  poly([ax + 78, ay + 34, ax + 86, ay + 26, ax + 90, ay + 40], FLAG_R);
  disc(ax + 78, ay + 52, 4, [150, 180, 200]);
  poly([ax + 62, ay + 78, ax + 56, ay + 96, ax + 70, ay + 88], [230, 126, 34]); // flame
  poly([ax + 70, ay + 84, ax + 84, ay + 96, ax + 80, ay + 82], [240, 180, 60]);
  // Earth disc, fully inside the box
  disc(ax + 34, ay + 108, 24, [40, 110, 200]);
  ellipse(ax + 28, ay + 102, 10, 5, [60, 160, 80]);
  ellipse(ax + 42, ay + 116, 8, 4, [60, 160, 80]);
}

function artBangladesh(ax: number, ay: number): void {
  rect(ax, ay, 146, 136, [247, 232, 190]);
  // big "36" then a % drawn as two clean circles + diagonal (kept from v5)
  text5(ax + 10, ay + 10, "36", 4, INK);
  disc(ax + 66, ay + 16, 5, INK);
  disc(ax + 78, ay + 30, 5, INK);
  line(ax + 58, ay + 34, ax + 84, ay + 12, INK);
  // gold arrow up, right of the number
  poly([ax + 104, ay + 8, ax + 116, ay + 26, ax + 110, ay + 26, ax + 110, ay + 44, ax + 98, ay + 44, ax + 98, ay + 26, ax + 92, ay + 26], GOLD);
  // factory with smoking chimney (NEW: smoke puffs)
  rect(ax + 10, ay + 78, 126, 58, [120, 96, 70]);
  rect(ax + 10, ay + 78, 126, 6, INK);
  rect(ax + 104, ay + 44, 16, 36, [90, 72, 52]);
  disc(ax + 112, ay + 36, 6, SMOKE);
  disc(ax + 118, ay + 26, 5, SMOKE);
  disc(ax + 110, ay + 16, 4, SMOKE);
  for (let i = 0; i < 4; i++) rect(ax + 22 + i * 30, ay + 92, 16, 22, [70, 66, 58]);
  rect(ax + 10, ay + 118, 126, 18, [90, 72, 52]);
}

function artIndonesia(ax: number, ay: number): void {
  rect(ax, ay, 146, 136, [232, 240, 220]);
  // hills, two layers, plus more trees (NEW)
  poly([ax, ay + 70, ax + 50, ay + 40, ax + 100, ay + 70, ax + 146, ay + 52, ax + 146, ay + 136, ax, ay + 136], [110, 160, 90]);
  poly([ax, ay + 90, ax + 70, ay + 62, ax + 146, ay + 90, ax + 146, ay + 136, ax, ay + 136], [80, 130, 70]);
  const trees: [number, number][] = [[18, 66], [44, 74], [96, 58], [120, 70], [134, 62]];
  for (const [tx, ty] of trees) {
    rect(ax + tx - 1, ay + ty, 3, 10, [90, 60, 30]);
    poly([ax + tx - 7, ay + ty, ax + tx, ay + ty - 12, ax + tx + 7, ay + ty], [40, 110, 50]);
  }
  // mine shaft with wooden frame
  rect(ax + 52, ay + 84, 42, 52, [50, 42, 34]);
  rect(ax + 52, ay + 84, 42, 4, [140, 110, 70]);
  rect(ax + 52, ay + 84, 4, 52, [140, 110, 70]);
  rect(ax + 90, ay + 84, 4, 52, [140, 110, 70]);
  // flood water at the bottom with wave lines
  rect(ax, ay + 112, 146, 24, [60, 120, 180]);
  line(ax + 8, ay + 120, ax + 40, ay + 120, WHITE);
  line(ax + 60, ay + 126, ax + 96, ay + 126, WHITE);
  line(ax + 104, ay + 120, ax + 138, ay + 120, WHITE);
}

function artEurope(ax: number, ay: number): void {
  rect(ax, ay, 146, 136, [214, 228, 240]);
  // clouds (NEW)
  ellipse(ax + 30, ay + 16, 18, 6, WHITE);
  ellipse(ax + 44, ay + 12, 12, 5, WHITE);
  ellipse(ax + 104, ay + 26, 16, 5, WHITE);
  ellipse(ax + 118, ay + 22, 10, 4, WHITE);
  // hangar + runway
  rect(ax + 10, ay + 56, 100, 48, [150, 150, 148]);
  rect(ax + 34, ay + 70, 52, 34, [70, 70, 68]);
  rect(ax + 10, ay + 56, 100, 4, INK);
  rect(ax, ay + 108, 146, 12, [60, 60, 58]);
  for (let i = 0; i < 5; i++) rect(ax + 12 + i * 28, ay + 113, 14, 2, WHITE);
  // smoke near the hangar
  disc(ax + 96, ay + 50, 7, SMOKE);
  disc(ax + 106, ay + 40, 6, SMOKE);
  // two white jets with motion lines (kept from v7: white, readable)
  poly([ax + 24, ay + 30, ax + 44, ay + 22, ax + 44, ay + 38], WHITE);
  line(ax + 14, ay + 30, ax + 22, ay + 30, WHITE);
  poly([ax + 92, ay + 88, ax + 116, ay + 78, ax + 116, ay + 98], WHITE);
  line(ax + 82, ay + 88, ax + 90, ay + 88, WHITE);
}

// ---- briefs band ----
const BRIEF_ROWS = [
  "HODEIDAH - Saudi jets hit port; Jeddah threatened",
  "SOLOMON IS. - Australia pact; no foreign bases",
  "NVIDIA - Shares fall 8.3% as Huang rally fades",
  "CHEN JINING - Beijing probes Shanghai party chief",
  "MISSISSIPPI - 6 dead after Cessna crashes in Gulf",
  "HUAWEI - Guilty on 10 of 12 counts in US trial",
];
const TALL: number[] = [4, 3, 3, 4, 3, 3, 3]; // sums to 23 px
function drawBriefs(): void {
  rect(24, 864, 976, 150, BAND);
  rect(24, 864, 976, 2, GOLD);
  for (let i = 0; i < 6; i++) {
    const y = 866 + i * 25;
    text5(36, y, BRIEF_ROWS[i], 3, BAND_TXT, TALL, 2);
    if (i < 5) hline(36, 988, y + 24, SEPARATOR, 1);
  }
}

// ---- compose ----
function render(): void {
  img.fill(0);
  rect(0, 0, W, H, PAPER);
  // masthead
  const mw = width12("THE WORLD", 6);
  text12(Math.floor((W - mw) / 2), 20, "THE WORLD", 6, INK, true);
  hline(24, 1000, 100, GOLD, 2);
  // dateline
  const dl = "WEDNESDAY, 25 NOVEMBER 2026 — IN ONE IMAGE";
  text5(Math.floor((W - width5(dl, 2)) / 2), 108, dl, 2, INK);
  hline(24, 1000, 128, INK, 2);
  // headline band
  const h1 = "HOSTAGES FREED IN CARTAGENA";
  text5(Math.floor((W - width5(h1, 5)) / 2), 140, h1, 5, INK);
  const h2 = "TROOPS STORM EXITO SUPERMARKET AT DAWN";
  text5(Math.floor((W - width5(h2, 3)) / 2), 184, h2, 3, INK);
  hline(24, 1000, 222, INK, 2);
  // lead scene
  drawLeadScene();
  // secondary cards
  drawCard(24, 566, "SPACE", "FIRST PAKISTANI", "IN ORBIT", "Shenzhou-24 docks", "at Tiangong station", artSpace);
  drawCard(520, 566, "BANGLADESH", "GARMENT PAY", "UP 36 %", "17,000 taka a month", "from Dec 1", artBangladesh);
  drawCard(24, 716, "INDONESIA", "MINE FLOOD", "TRAPS 17", "9 dead in Pongkor", "17 trapped, 100 m", artIndonesia);
  drawCard(520, 716, "EUROPE", "UKRAINE HITS", "AIRBASE", "5 jets damaged", "3 MiG-31, 2 Su-34", artEurope);
  // briefs
  drawBriefs();
}

// ---- PNG encode ----
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main(): void {
  render();
  const png = encodePNG();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "entry.png"), png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  const dossier = {
    version: 8,
    title: "THE WORLD — Wednesday, 25 November 2026",
    width: W,
    height: H,
    bytes: png.length,
    entry_png_sha256: sha,
  };
  fs.writeFileSync(path.join(OUT, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
}

main();
