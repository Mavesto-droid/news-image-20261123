// news-image-20261123 — a one-day world news front page for Monday 23 November 2026.
// Node 22, standard library only. Draws the whole front page in code (PNG encoder +
// 5x7 bitmap font + layout) and writes it to /output/entry.png (or MAKEFUN_OUTPUT_DIR).
// Deterministic: both grader runs produce identical bytes.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// PNG encoding (RGB, 8-bit, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgb: Buffer, width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [16, 16, 16];
const RED: RGB = [139, 26, 26];
const GREY: RGB = [90, 86, 78];
const LIGHT: RGB = [228, 222, 206];

class Canvas {
  px: Buffer;
  constructor() {
    this.px = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      this.px[i * 3] = PAPER[0];
      this.px[i * 3 + 1] = PAPER[1];
      this.px[i * 3 + 2] = PAPER[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, t, h, c);
  }
  // filled circle (for the globe motif)
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r) this.set(cx + x, cy + y, c);
  }
  // circle outline, 1px
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a++) {
      const rad = (a * Math.PI) / 180;
      this.set(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
    }
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (hand-drawn). Each glyph: 7 rows of 5 cells, '#' = ink.
// ---------------------------------------------------------------------------

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
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
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
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
};

// ---------------------------------------------------------------------------
// Text drawing
// ---------------------------------------------------------------------------

const CHAR_W = 6; // 5 glyph columns + 1 spacing, in font units

function textWidth(s: string, scale: number): number {
  return s.length * CHAR_W * scale - scale; // no trailing spacing on last char
}

function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB, bold: boolean): void {
  const g = GLYPHS[ch];
  if (!g) return;
  const passes = bold ? [0, 1] : [0];
  for (const dx of passes) {
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === "1") {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              cv.set(x + dx + col * scale + sx, y + r * scale + sy, c);
        }
      }
    }
  }
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, bold = false): number {
  const up = s.toUpperCase();
  let cx = x;
  for (const ch of up) {
    drawGlyph(cv, ch, cx, y, scale, c, bold);
    cx += CHAR_W * scale;
  }
  return cx - x - scale;
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB, bold = false): void {
  const w = textWidth(s, scale);
  drawText(cv, s, cx - Math.floor(w / 2), y, scale, c, bold);
}

// Greedy word wrap; returns the lines.
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(cv: Canvas, s: string, x: number, y: number, scale: number, maxW: number, c: RGB, bold = false, leading?: number): number {
  const lines = wrapText(s, scale, maxW);
  const lh = 7 * scale + (leading ?? Math.max(2, Math.floor(scale * 1.2)));
  for (let i = 0; i < lines.length; i++) drawText(cv, lines[i], x, y + i * lh, scale, c, bold);
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------
// Front page: THE WORLD — Monday, 23 November 2026
// Lead: COP31 collapse. Also: Ukraine, the widening US-Iran war, and briefs.
// ---------------------------------------------------------------------------

const MX = 40; // side margin
const CW = 944; // content width (40..984)

function drawArt(cv: Canvas, x: number, y: number, w: number, h: number): void {
  // Framed editorial illustration: a globe on the left, smoking chimneys and
  // a red sun on the right — the climate summit that ended with no deal.
  cv.hline(x, y, w, INK, 2);
  cv.hline(x, y + h - 2, w, INK, 2);
  cv.vline(x, y, h, INK, 2);
  cv.vline(x + w - 2, y, h, INK, 2);
  const cy = y + Math.floor(h / 2);
  // Globe (wireframe) at left.
  const gx = x + 190;
  const gr = 56;
  const sea: RGB = [196, 212, 224];
  cv.disc(gx, cy, gr, sea);
  for (const dx of [-30, 0, 30]) {
    const ch = Math.floor(Math.sqrt(gr * gr - dx * dx));
    cv.vline(gx + dx, cy - ch, 2 * ch, INK, 1);
  }
  for (const dy of [-30, 0, 30]) {
    const ch = Math.floor(Math.sqrt(gr * gr - dy * dy));
    cv.hline(gx - ch, cy + dy, 2 * ch, INK, 1);
  }
  cv.ring(gx, cy, gr, INK);
  cv.ring(gx, cy, gr - 1, INK);
  // Red sun at right.
  const sx = x + w - 130;
  const sy = y + 42;
  cv.disc(sx, sy, 20, RED);
  // Chimneys with smoke.
  const base = y + h - 4;
  const stacks: Array<[number, number]> = [
    [x + 560, 78],
    [x + 612, 100],
    [x + 664, 62],
  ];
  for (const [sx2, sh] of stacks) {
    cv.rect(sx2, base - sh, 30, sh, INK);
    cv.rect(sx2 - 4, base - sh - 6, 38, 6, INK);
  }
  const smoke: Array<[number, number, number]> = [
    [x + 575, base - 118, 9],
    [x + 588, base - 140, 6],
    [x + 627, base - 140, 9],
    [x + 640, base - 162, 6],
    [x + 679, base - 102, 8],
    [x + 690, base - 122, 5],
  ];
  for (const [px, py, pr] of smoke) cv.disc(px, py, pr, GREY);
  // Ground line.
  cv.hline(x + 430, base - 2, w - 430 - 4, INK, 2);
}

function drawFrontPage(cv: Canvas): void {
  // Top rule + masthead + dateline.
  cv.hline(MX, 24, CW, INK, 2);
  drawTextCentered(cv, "THE WORLD", 512, 34, 9, INK, true);
  drawTextCentered(cv, "MONDAY, 23 NOVEMBER 2026", 512, 106, 2, GREY);
  cv.hline(MX, 126, CW, RED, 3);
  cv.hline(MX, 132, CW, INK, 1);

  // Lead headline + deck.
  let y = drawPara(cv, "CLIMATE TALKS COLLAPSE AS FOSSIL-FUEL DEAL FAILS", MX, 146, 5, CW, INK, true, 6);
  y = drawPara(
    cv,
    "COP31 ends in Turkiye with no agreement as the EU and others refuse any deal without a fossil-fuel phase-out. Australia calls the failure a sign of difficult geopolitical times.",
    MX,
    y + 10,
    2,
    CW,
    INK,
    false,
    3
  );

  // Illustration + caption.
  drawArt(cv, MX, 302, CW, 150);
  drawTextCentered(cv, "THE TURKIYE SUMMIT ENDS WITH NO DEAL ON FOSSIL FUELS", 512, 460, 2, GREY);
  cv.hline(MX, 486, CW, INK, 2);

  // Two columns: Ukraine (left) and the Gulf (right).
  const colW = 460;
  const rx = MX + 484;
  let ly = 500;
  drawText(cv, "UKRAINE", MX, ly, 3, RED, true);
  ly = drawPara(cv, "RUSSIAN DRONE HITS KYIV REGION BLOCK; 14 MISSING, ZELENSKIY SAYS", MX, ly + 28, 3, colW, INK, true, 4);
  ly = drawPara(
    cv,
    "A Russian drone struck a residential building in the Kyiv region, leaving at least 14 people missing. A Russian cargo ship was still burning off Finland.",
    MX,
    ly + 8,
    2,
    colW,
    INK,
    false,
    3
  );
  drawPara(cv, "UKRAINIAN SEA DRONES HIT A RUSSIAN WARSHIP AT BENGHAZI NAVAL BASE", MX, ly + 10, 2, colW, INK, true, 3);

  let ry = 500;
  drawText(cv, "THE GULF", rx, ry, 3, RED, true);
  ry = drawPara(cv, "HOUTHIS CLAIM SAUDI REFINERY STRIKES AS IRAN HITS BAHRAIN", rx, ry + 28, 3, colW, INK, true, 4);
  ry = drawPara(
    cv,
    "The US-Iran war widened as Houthi forces claimed strikes on a Saudi oil refinery and an Iranian strike wounded two in Bahrain.",
    rx,
    ry + 8,
    2,
    colW,
    INK,
    false,
    3
  );
  drawPara(cv, "SAUDI-LED COALITION SAYS IT INTERCEPTED A HOUTHI MISSILE", rx, ry + 10, 2, colW, INK, true, 3);

  // The world in brief.
  cv.hline(MX, 744, CW, INK, 2);
  drawText(cv, "THE WORLD IN BRIEF", MX, 758, 3, INK, true);
  const briefsL = [
    "MEXICO CAPTURES CARTEL BOSS EL CHAPO ISIDRO; 11 DEAD",
    "SOUTH KOREA MINISTER QUITS OVER AI CHEATING SCANDAL",
    "INDONESIA FACTORY FIRE: 7 DEAD, 50 MISSING",
  ];
  const briefsR = [
    "THOUSANDS MARCH IN LISBON OVER LIVING COSTS",
    "UN TO KEEP TALKING ON LETHAL AI WEAPONS",
    "BOLSONARO STABLE IN INTENSIVE CARE",
  ];
  let by = 786;
  for (let i = 0; i < 3; i++) {
    const endL = drawPara(cv, "- " + briefsL[i], MX, by, 2, colW, INK, false, 3);
    const endR = drawPara(cv, "- " + briefsR[i], rx, by, 2, colW, INK, false, 3);
    by = Math.max(endL, endR) + 4;
  }

  // Sport strip + footer.
  cv.hline(MX, 900, CW, INK, 1);
  const sportHead = "SPORT: ";
  drawText(cv, sportHead, MX, 910, 2, RED, true);
  drawPara(
    cv,
    "LIVERPOOL ROUT 10-MAN MAN UTD IN POCHETTINO'S FIRST MATCH; INDIA POST RECORD 720/9D IN WELLINGTON TEST",
    MX + textWidth(sportHead, 2),
    910,
    2,
    CW - textWidth(sportHead, 2),
    INK,
    false,
    3
  );
  cv.hline(MX, 956, CW, INK, 2);
  drawTextCentered(cv, "THE WORLD - MONDAY, 23 NOVEMBER 2026", 512, 966, 2, GREY);
}

function main(): void {
  const cv = new Canvas();
  drawFrontPage(cv);
  const png = encodePNG(cv.px, W, H);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), png);
}

main();


