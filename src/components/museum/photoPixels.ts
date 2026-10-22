/**
 * The pixel arithmetic behind photoGrade, on its own so it can run in a
 * worker (photoGrade.worker.ts) as well as on the page. Nothing in here
 * touches the DOM: it takes the pixels of a print and changes them in
 * place. See photoGrade for what the grade is and why.
 */

const COLOUR_KEPT = 0.45;
const MAP_MIX = 0.55;
const MAP: [number, string][] = [
  [0, "#120c07"],
  [1 / 3, "#5a3f24"],
  [2 / 3, "#c8944a"],
  [1, "#efe3c8"],
];
const SHADOW_TINT = "#1f3a3a";
const SHADOW_MIX = 0.06;
const CONTRAST = 0.9;
const VIGNETTE = 0.22;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The tone map as a table, one entry per level of brightness. */
const mapTable = (() => {
  const stops = MAP.map(([at, hex]) => ({ at, c: rgb(hex) }));
  const t = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const L = i / 255;
    let k = 0;
    while (k < stops.length - 2 && L > stops[k + 1].at) k += 1;
    const a = stops[k];
    const b = stops[k + 1];
    const f = (L - a.at) / (b.at - a.at);
    for (let ch = 0; ch < 3; ch += 1) t[i * 3 + ch] = a.c[ch] + (b.c[ch] - a.c[ch]) * f;
  }
  return t;
})();
const tint = rgb(SHADOW_TINT);

/**
 * One pixel through the grade, before the brightness is matched. Values are
 * 0-1 in the image's own sRGB, which is where a darkroom or an editor works.
 */
export function gradePixel(r: number, g: number, b: number, out: Float32Array) {
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // colour down
  r = L + COLOUR_KEPT * (r - L);
  g = L + COLOUR_KEPT * (g - L);
  b = L + COLOUR_KEPT * (b - L);
  // the warm tone map over it
  const m = Math.round(clamp(L, 0, 1) * 255) * 3;
  r += MAP_MIX * (mapTable[m] - r);
  g += MAP_MIX * (mapTable[m + 1] - g);
  b += MAP_MIX * (mapTable[m + 2] - b);
  // teal, in the shadows only
  const d = Math.max(0, 1 - L / 0.55);
  const s = SHADOW_MIX * d * Math.sqrt(d);
  r += s * (tint[0] - r);
  g += s * (tint[1] - g);
  b += s * (tint[2] - b);
  // contrast eased
  out[0] = 0.5 + CONTRAST * (r - 0.5);
  out[1] = 0.5 + CONTRAST * (g - 0.5);
  out[2] = 0.5 + CONTRAST * (b - 0.5);
}

/**
 * A whole print through the grade: each pixel graded, matched to the
 * wall's brightness by `curve`, darkened toward the edges and given a
 * fine grain. The grain is seeded, so a print comes out the same every
 * time and wherever it is made.
 */
export function gradePrint(d: Uint8ClampedArray, w: number, h: number, curve: Float32Array, grainAmount: number) {
  // the vignette, from each pixel's distance to the middle
  const col = new Float32Array(w);
  for (let x = 0; x < w; x += 1) col[x] = ((x + 0.5) / w - 0.5) ** 2 * 4;
  const px = new Float32Array(3);
  let seed = 0x9e3779b9;
  for (let y = 0; y < h; y += 1) {
    const dy = ((y + 0.5) / h - 0.5) ** 2 * 4;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      gradePixel(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, px);
      const r = Math.sqrt((col[x] + dy) / 2);
      const f = clamp((r - 0.45) / 0.55, 0, 1);
      const vig = 1 - VIGNETTE * f * f;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const grain = ((seed >>> 0) / 4294967296 - 0.5) * 2 * grainAmount * 255;
      d[i] = curve[Math.round(clamp(px[0], 0, 1) * 1023)] * vig + grain;
      d[i + 1] = curve[Math.round(clamp(px[1], 0, 1) * 1023)] * vig + grain;
      d[i + 2] = curve[Math.round(clamp(px[2], 0, 1) * 1023)] * vig + grain;
    }
  }
}

/** The screen grade in Effects, which exact prints are made to cancel. Keep the two in step. */
const SCREEN = { saturation: -0.14, brightness: 0.01, contrast: 0.12 };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** For each 8-bit value the screen should show: the linear value to feed the grade so it comes out there. */
const beforeContrast = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    // the contrast and brightness step works on sRGB values: undo it there
    const s = (i / 255 - 0.5) * (1 - SCREEN.contrast) + 0.5 - SCREEN.brightness;
    t[i] = toLinear(clamp(s, 0, 1));
  }
  return t;
})();
/** Linear back to 8-bit sRGB, finely enough that no banding creeps in. */
const linearToByte = (() => {
  const t = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i += 1) t[i] = Math.round(toSrgb(i / 4095) * 255);
  return t;
})();

/** A poster's pixels with the opposite of the screen grade baked in, so the two cancel. */
export function exactPrintPixels(d: Uint8ClampedArray) {
  // the saturation step works on linear values, pulling each channel toward their mean
  const keep = 1 + SCREEN.saturation;
  for (let i = 0; i < d.length; i += 4) {
    const r = beforeContrast[d[i]];
    const g = beforeContrast[d[i + 1]];
    const b = beforeContrast[d[i + 2]];
    const mean = (r + g + b) / 3;
    const lift = (1 - keep) * mean;
    d[i] = linearToByte[Math.round(clamp((r - lift) / keep, 0, 1) * 4095)];
    d[i + 1] = linearToByte[Math.round(clamp((g - lift) / keep, 0, 1) * 4095)];
    d[i + 2] = linearToByte[Math.round(clamp((b - lift) / keep, 0, 1) * 4095)];
  }
}

/** A job for the worker, and what it sends back. */
export type PixelJob =
  | { id: number; kind: "print"; data: Uint8ClampedArray; w: number; h: number; curve: Float32Array; grain: number }
  | { id: number; kind: "exact"; data: Uint8ClampedArray };
export type PixelDone = { id: number; data: Uint8ClampedArray };

export function runJob(job: PixelJob) {
  if (job.kind === "print") gradePrint(job.data, job.w, job.h, job.curve, job.grain);
  else exactPrintPixels(job.data);
  return job.data;
}
