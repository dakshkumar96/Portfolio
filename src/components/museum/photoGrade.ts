/**
 * The About wall's photographs, brought into the museum's palette.
 *
 * Photographs from events arrive in whatever colours the venue had - a
 * violet and orange backdrop, a blue sky - and hung as they are they look
 * like screens in a room of bronze and lamplight. So each is cropped to its
 * frame and then printed the same way, the way a gallery prints a set for
 * one wall:
 *
 *  - colour taken down to under half, and a warm tone map (umber through
 *    gold to cream) laid over it at a little over half, so skin stays skin;
 *  - a trace of teal in the shadows, against all that warmth;
 *  - contrast eased a little, a fine grain and a soft vignette;
 *  - each one metered and brought to the same brightness, so no one
 *    picture outshines the others.
 *
 * The work is done once per photograph and kept, and done in slices a few
 * milliseconds long, so walking into the room never stalls on it.
 */

export type PhotoCrop = {
  /** The point to keep in view, as fractions of the image's width and height. */
  focus: [number, number];
  /** How far in from the widest 4:5 crop: 1 is the widest, 2 is half as wide. */
  zoom: number;
};

/* the print, 4:5 */
const OUT_W = 768;
const OUT_H = 960;

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
const GRAIN = 0.04;
const VIGNETTE = 0.22;
/** The brightness every print is brought to, centre-weighted. */
const TARGET = 0.4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
function gradePixel(r: number, g: number, b: number, out: Float32Array) {
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

/** Brightness the way a camera meters it: the middle of the frame counts most. */
function meter(d: Uint8ClampedArray, w: number, h: number, gamma: number, gain: number) {
  const px = new Float32Array(3);
  let sum = 0;
  let weight = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      gradePixel(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, px);
      const L =
        0.2126 * Math.pow(clamp(px[0], 0, 1), gamma) +
        0.7152 * Math.pow(clamp(px[1], 0, 1), gamma) +
        0.0722 * Math.pow(clamp(px[2], 0, 1), gamma);
      const u = (x + 0.5) / w - 0.5;
      const v = (y + 0.5) / h - 0.5;
      const wt = Math.exp(-(u * u + v * v) / (2 * 0.28 * 0.28));
      sum += L * gain * wt;
      weight += wt;
    }
  }
  return sum / weight;
}

const pause = () => new Promise<void>((done) => setTimeout(done, 0));
/** How long one slice of the work may hold the main thread, in ms. */
const SLICE_MS = 6;

async function print(src: string, { focus, zoom }: PhotoCrop) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // the widest 4:5 window, narrowed by the zoom, centred on the focus and kept inside the picture
  const z = Math.max(1, zoom);
  const cw = (w / h < 0.8 ? w : h * 0.8) / z;
  const ch = cw * 1.25;
  const sx = clamp(focus[0] * w - cw / 2, 0, w - cw);
  const sy = clamp(focus[1] * h - ch / 2, 0, h - ch);

  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);

  /*
    Metered on a thumbnail of the graded print. A curve does most of the
    matching, since it moves the middle tones and leaves black and white
    where they are; it is held within reason, and a small straight gain
    makes up the rest. Pushed all the way, a bright sky would turn the
    face in front of it to mud.
  */
  const thumb = document.createElement("canvas");
  thumb.width = 48;
  thumb.height = 60;
  const tctx = thumb.getContext("2d", { willReadFrequently: true });
  if (!tctx) throw new Error("no canvas");
  tctx.drawImage(canvas, 0, 0, 48, 60);
  const td = tctx.getImageData(0, 0, 48, 60).data;
  const m1 = meter(td, 48, 60, 1, 1);
  const gamma = clamp(Math.log(TARGET) / Math.log(clamp(m1, 0.001, 0.999)), 0.8, 1.3);
  const gain = clamp(TARGET / meter(td, 48, 60, gamma, 1), 0.85, 1.15);

  // the matching, as a table over the graded values
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i += 1) curve[i] = Math.min(1, Math.pow(i / 1023, gamma) * gain) * 255;

  // the vignette, from each pixel's distance to the middle
  const col = new Float32Array(OUT_W);
  for (let x = 0; x < OUT_W; x += 1) col[x] = ((x + 0.5) / OUT_W - 0.5) ** 2 * 4;

  const image = ctx.getImageData(0, 0, OUT_W, OUT_H);
  const d = image.data;
  const px = new Float32Array(3);
  // the grain is seeded, so a print comes out the same every time
  let seed = 0x9e3779b9;
  let slice = performance.now();
  for (let y = 0; y < OUT_H; y += 1) {
    if (performance.now() - slice > SLICE_MS) {
      await pause();
      slice = performance.now();
    }
    const dy = ((y + 0.5) / OUT_H - 0.5) ** 2 * 4;
    for (let x = 0; x < OUT_W; x += 1) {
      const i = (y * OUT_W + x) * 4;
      gradePixel(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, px);
      const r = Math.sqrt((col[x] + dy) / 2);
      const f = clamp((r - 0.45) / 0.55, 0, 1);
      const vig = 1 - VIGNETTE * f * f;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const grain = ((seed >>> 0) / 4294967296 - 0.5) * 2 * GRAIN * 255;
      d[i] = curve[Math.round(clamp(px[0], 0, 1) * 1023)] * vig + grain;
      d[i + 1] = curve[Math.round(clamp(px[1], 0, 1) * 1023)] * vig + grain;
      d[i + 2] = curve[Math.round(clamp(px[2], 0, 1) * 1023)] * vig + grain;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const prints = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * The photograph at `src`, cropped and graded for the About wall, as a
 * canvas ready to become a texture. Made once per photograph and crop.
 */
export function gradedPhoto(src: string, crop: PhotoCrop) {
  const key = `${src}|${crop.focus.join(",")}|${crop.zoom}`;
  let p = prints.get(key);
  if (!p) {
    p = print(src, crop);
    // a missing file is not remembered, so adding it later just works
    p.catch(() => prints.delete(key));
    prints.set(key, p);
  }
  return p;
}

/*
  The Art wall's posters are shown as they are: their own colours, on
  screen, with nothing added. Two things stand in the way. A poster lit
  by the room takes the room's colour and falls off with its pools, so
  it is drawn unlit. And every frame of the museum is graded on its way
  to the screen (Effects: colour eased 14%, contrast lifted a little), so
  each poster is printed with the opposite of that grade baked in, and
  the two cancel. The vignette at the screen's edge is the one thing left.
*/

/** The screen grade in Effects, which these prints are made to cancel. Keep the two in step. */
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

async function exact(src: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  // the saturation step works on linear values, pulling each channel toward their mean
  const keep = 1 + SCREEN.saturation;
  let slice = performance.now();
  for (let i = 0; i < d.length; i += 4) {
    if ((i & 0xffff) === 0 && performance.now() - slice > SLICE_MS) {
      await pause();
      slice = performance.now();
    }
    const r = beforeContrast[d[i]];
    const g = beforeContrast[d[i + 1]];
    const b = beforeContrast[d[i + 2]];
    const mean = (r + g + b) / 3;
    const lift = (1 - keep) * mean;
    d[i] = linearToByte[Math.round(clamp((r - lift) / keep, 0, 1) * 4095)];
    d[i + 1] = linearToByte[Math.round(clamp((g - lift) / keep, 0, 1) * 4095)];
    d[i + 2] = linearToByte[Math.round(clamp((b - lift) / keep, 0, 1) * 4095)];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const exacts = new Map<string, Promise<HTMLCanvasElement>>();

/** The poster at `src`, prepared to reach the screen in its own colours. Made once per poster. */
export function exactPrint(src: string) {
  let p = exacts.get(src);
  if (!p) {
    p = exact(src);
    p.catch(() => exacts.delete(src));
    exacts.set(src, p);
  }
  return p;
}
