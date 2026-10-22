import { track } from "./preload";
import { clamp, gradePixel, runJob, type PixelDone, type PixelJob } from "./photoPixels";
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
 * The work is done once per photograph and kept. The pixel work itself
 * (photoPixels) runs on worker threads, so the page goes on loading, and
 * animating its loading screen, while the prints are made.
 */

export type PhotoCrop = {
  /** The point to keep in view, as fractions of the image's width and height. */
  focus: [number, number];
  /** How far in from the widest 4:5 crop: 1 is the widest, 2 is half as wide. */
  zoom: number;
  /**
   * Print the whole photograph, uncut and at its own proportions, as large
   * as it came (up to WHOLE_MAX on its long side), rather than a 4:5 crop.
   */
  whole?: boolean;
};

/** A whole print's long side, at most: sharp at any distance the museum hangs it. */
const WHOLE_MAX = 1600;

/* a cropped print, 4:5 */
const OUT_W_CROP = 768;
const OUT_H_CROP = 960;

const GRAIN = 0.04;
/** The brightness every print is brought to, centre-weighted. */
const TARGET = 0.4;

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

/*
  The workers, made when the first print is asked for: two, so two
  prints are made at once. Each job is sent as a copy and the page keeps
  the original, so if a worker cannot be started, or fails, the page
  does that job itself: slower, but it comes out the same.
*/
let pool: Worker[] | null = null;
let nextJob = 1;
const waiting = new Map<number, { job: PixelJob; resolve: (data: Uint8ClampedArray) => void }>();

function workers() {
  if (pool) return pool;
  pool = [];
  const failed = () => {
    pool = [];
    waiting.forEach(({ job, resolve }) => resolve(runJob(job)));
    waiting.clear();
  };
  try {
    for (let i = 0; i < 2; i += 1) {
      const w = new Worker(new URL("./photoGrade.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<PixelDone>) => {
        waiting.get(e.data.id)?.resolve(e.data.data);
        waiting.delete(e.data.id);
      };
      w.onerror = failed;
      pool.push(w);
    }
  } catch {
    pool = [];
  }
  return pool;
}

/** Runs a print's pixels through the grade, on a worker when there is one. */
function pixels(job: PixelJob): Promise<Uint8ClampedArray> {
  const pool = workers();
  if (pool.length === 0) return Promise.resolve(runJob(job));
  return new Promise((resolve) => {
    waiting.set(job.id, { job, resolve });
    pool[job.id % pool.length].postMessage(job);
  });
}

async function print(src: string, { focus, zoom, whole }: PhotoCrop) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // the widest 4:5 window, narrowed by the zoom, centred on the focus and kept inside the picture - or all of it
  const z = Math.max(1, zoom);
  const cw = whole ? w : (w / h < 0.8 ? w : h * 0.8) / z;
  const ch = whole ? h : cw * 1.25;
  const sx = clamp(focus[0] * w - cw / 2, 0, w - cw);
  const sy = clamp(focus[1] * h - ch / 2, 0, h - ch);
  const scale = whole ? Math.min(1, WHOLE_MAX / Math.max(w, h)) : 1;
  const OUT_W = whole ? Math.round(w * scale) : OUT_W_CROP;
  const OUT_H = whole ? Math.round(h * scale) : OUT_H_CROP;
  // a whole print is shown large: a finer grain, so it stays crisp
  const grainAmount = whole ? GRAIN * 0.45 : GRAIN;

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

  const image = ctx.getImageData(0, 0, OUT_W, OUT_H);
  const graded = await pixels({ id: nextJob++, kind: "print", data: image.data, w: OUT_W, h: OUT_H, curve, grain: grainAmount });
  image.data.set(graded);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const prints = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * The photograph at `src`, cropped and graded for the About wall, as a
 * canvas ready to become a texture. Made once per photograph and crop.
 */
export function gradedPhoto(src: string, crop: PhotoCrop) {
  const key = `${src}|${crop.focus.join(",")}|${crop.zoom}|${crop.whole ? "whole" : ""}`;
  let p = prints.get(key);
  if (!p) {
    p = track(print(src, crop));
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
  const printed = await pixels({ id: nextJob++, kind: "exact", data: image.data });
  image.data.set(printed);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const exacts = new Map<string, Promise<HTMLCanvasElement>>();

/** The poster at `src`, prepared to reach the screen in its own colours. Made once per poster. */
export function exactPrint(src: string) {
  let p = exacts.get(src);
  if (!p) {
    p = track(exact(src));
    p.catch(() => exacts.delete(src));
    exacts.set(src, p);
  }
  return p;
}
