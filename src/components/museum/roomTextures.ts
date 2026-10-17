import * as THREE from "three";
import { lattice, normalFrom, repeat, seeded } from "./stoneTextures";

/*
  The rooms' finishes, drawn once and shared by every room.

  A gallery is dressed, not just built: its walls hung in silk, its floor
  laid in polished stone with a border and something set into the middle
  of it. These are those three things - a damask for the walls, marble
  slabs for the floor, and a star inlaid at its centre - each drawn on a
  canvas so the museum ships no image files for them.
*/

let damask: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/** How many metres one repeat of the damask covers, across and up. */
export const DAMASK_TILE = 1.2;

/**
 * Silk damask: one colour, the pattern woven into the cloth so it shows
 * only as a change of sheen - the figure is satin and catches the light,
 * the ground is a duller weave. Under a spotlight the pattern comes and
 * goes as you move, which is what damask does and print never does.
 *
 * The figure is an ogee lattice - the pointed, swelling diamond of Mughal
 * and Ottoman silks - with a lotus in each cell.
 */
export function getDamask() {
  if (damask) return damask;
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  // the ogee lattice: each cell a pointed diamond with swelling sides, drawn into its neighbours so it wraps
  const ogee = (cx: number, cy: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.bezierCurveTo(cx + w * 0.15, cy - h * 0.55, cx + w * 1.05, cy - h * 0.45, cx + w, cy);
    ctx.bezierCurveTo(cx + w * 1.05, cy + h * 0.45, cx + w * 0.15, cy + h * 0.55, cx, cy + h);
    ctx.bezierCurveTo(cx - w * 0.15, cy + h * 0.55, cx - w * 1.05, cy + h * 0.45, cx - w, cy);
    ctx.bezierCurveTo(cx - w * 1.05, cy - h * 0.45, cx - w * 0.15, cy - h * 0.55, cx, cy - h);
    ctx.lineWidth = S * 0.018;
    ctx.stroke();
  };
  // a lotus: a pointed bud between two curling leaves, on a short stem
  const lotus = (cx: number, cy: number, k: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.bezierCurveTo(22, -34, 24, -6, 0, 10);
    ctx.bezierCurveTo(-24, -6, -22, -34, 0, -60);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.bezierCurveTo(s * 18, 0, s * 46, -8, s * 50, -36);
      ctx.bezierCurveTo(s * 40, -16, s * 22, -4, 0, 18);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(0, 46);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 52, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const W = S / 2;
  const H = S / 2;
  for (let i = -1; i <= 2; i += 1) {
    for (let j = -1; j <= 2; j += 1) {
      ogee(i * W, j * H, W / 2, H / 2);
      ogee(i * W + W / 2, j * H + H / 2, W / 2, H / 2);
      lotus(i * W, j * H, 0.62);
      lotus(i * W + W / 2, j * H + H / 2, 0.62);
    }
  }
  const mask = ctx.getImageData(0, 0, S, S).data;
  const rand = seeded(2207);
  const slub = lattice(rand, 3, S, S);
  const colour = document.createElement("canvas");
  colour.width = colour.height = S;
  const rough = document.createElement("canvas");
  rough.width = rough.height = S;
  const cctx = colour.getContext("2d");
  const rctx = rough.getContext("2d");
  if (!cctx || !rctx) return null;
  const cimg = cctx.createImageData(S, S);
  const rimg = rctx.createImageData(S, S);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = y * S + x;
      const m = mask[i * 4] / 255;
      // the weave: fine horizontal ribs in the ground, smooth satin in the figure
      const rib = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 128);
      const t = slub(x, y);
      const v = 0.86 + m * 0.07 + (1 - m) * (rib - 0.5) * 0.05 + (t - 0.5) * 0.05;
      cimg.data[i * 4] = Math.min(255, 255 * v);
      cimg.data[i * 4 + 1] = Math.min(255, 255 * v * 0.98);
      cimg.data[i * 4 + 2] = Math.min(255, 255 * v * 0.95);
      cimg.data[i * 4 + 3] = 255;
      const r = 0.86 - m * 0.42;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.round(255 * r);
      rimg.data[i * 4 + 3] = 255;
      height[i] = m * 0.6 + (1 - m) * rib * 0.25;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, 1.2, S, S);
  if (!n) return null;
  const map = repeat(new THREE.CanvasTexture(colour));
  map.colorSpace = THREE.SRGBColorSpace;
  damask = { map, normalMap: repeat(new THREE.CanvasTexture(n)), roughnessMap: repeat(new THREE.CanvasTexture(rough)) };
  return damask;
}

let marble: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/** How many metres one repeat of the floor covers: four slabs each way. */
export const FLOOR_TILE = 4.8;

/**
 * Polished marble slabs, 1.2 m square, laid with fine joints: a near-black
 * warm stone with pale veins running through it, each slab cut from a
 * different part of the block so no two veins line up, and polished, so
 * the room's lights lie in it.
 */
export function getMarbleFloor() {
  if (marble) return marble;
  const S = 512;
  const SLAB = S / 4;
  const rand = seeded(8803);
  const cloud = lattice(rand, 40, S, S);
  const fine = lattice(rand, 6, S, S);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  // veins, slab by slab, clipped to their slab and each at its own angle
  for (let sy = 0; sy < 4; sy += 1) {
    for (let sx = 0; sx < 4; sx += 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx * SLAB, sy * SLAB, SLAB, SLAB);
      ctx.clip();
      const a = rand() * Math.PI;
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k += 1) {
        let x = sx * SLAB + rand() * SLAB;
        let y = sy * SLAB + rand() * SLAB;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        ctx.beginPath();
        x -= dx * SLAB;
        y -= dy * SLAB;
        ctx.moveTo(x, y);
        for (let s = 0; s < 8; s += 1) {
          const nx = x + dx * SLAB * 0.3 + (rand() - 0.5) * 18;
          const ny = y + dy * SLAB * 0.3 + (rand() - 0.5) * 18;
          ctx.quadraticCurveTo((x + nx) / 2 + (rand() - 0.5) * 14, (y + ny) / 2 + (rand() - 0.5) * 14, nx, ny);
          x = nx;
          y = ny;
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.5})`;
        ctx.lineWidth = 0.6 + rand() * 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  const veins = ctx.getImageData(0, 0, S, S).data;
  const tone = Array.from({ length: 16 }, () => (rand() - 0.5) * 0.12);
  const colour = document.createElement("canvas");
  colour.width = colour.height = S;
  const rough = document.createElement("canvas");
  rough.width = rough.height = S;
  const cctx = colour.getContext("2d");
  const rctx = rough.getContext("2d");
  if (!cctx || !rctx) return null;
  const cimg = cctx.createImageData(S, S);
  const rimg = rctx.createImageData(S, S);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = y * S + x;
      const joint = x % SLAB < 1.5 || y % SLAB < 1.5;
      const slab = Math.floor(y / SLAB) * 4 + Math.floor(x / SLAB);
      const vn = veins[i * 4] / 255;
      let v = 0.62 + tone[slab] + (cloud(x, y) - 0.5) * 0.22 + (fine(x, y) - 0.5) * 0.05 + vn * 0.55;
      if (joint) v *= 0.45;
      cimg.data[i * 4] = Math.min(255, 255 * v);
      cimg.data[i * 4 + 1] = Math.min(255, 255 * v * 0.93);
      cimg.data[i * 4 + 2] = Math.min(255, 255 * v * 0.84);
      cimg.data[i * 4 + 3] = 255;
      // polished, a little duller along the veins and in the joints
      const r = joint ? 0.7 : 0.18 + vn * 0.12 + (fine(x, y) - 0.5) * 0.08;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, r)));
      rimg.data[i * 4 + 3] = 255;
      height[i] = joint ? 0 : 1;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, 0.8, S, S);
  if (!n) return null;
  const map = repeat(new THREE.CanvasTexture(colour));
  map.colorSpace = THREE.SRGBColorSpace;
  marble = { map, normalMap: repeat(new THREE.CanvasTexture(n)), roughnessMap: repeat(new THREE.CanvasTexture(rough)) };
  return marble;
}

let medallion: { map: THREE.Texture; metalnessMap: THREE.Texture } | null = null;

/**
 * The star set into the middle of each room's floor: an eight-pointed
 * star of pale stone on dark, a compass rose of brass at its heart, and a
 * band of alternating stones round it inside a brass ring - the kind of
 * inlay laid in the floor of a palace hall, in the stones the room is
 * already built from.
 */
export function getMedallion() {
  if (medallion) return medallion;
  const S = 1024;
  const C = S / 2;
  const R = S / 2 - 6;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const m = document.createElement("canvas");
  m.width = m.height = S;
  const mctx = m.getContext("2d");
  if (!ctx || !mctx) return null;
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, S, S);
  const BRASS = "#c9a24e";
  const DARK = "#1c1510";
  const PALE = "#a08b70";
  const WARM = "#5e4834";
  const disc = (r: number, fill: string, metal = false) => {
    ctx.beginPath();
    ctx.arc(C, C, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (metal) {
      mctx.beginPath();
      mctx.arc(C, C, r, 0, Math.PI * 2);
      mctx.fillStyle = "#fff";
      mctx.fill();
    }
  };
  const ring = (r0: number, r1: number) => {
    for (const g of [ctx, mctx]) {
      g.beginPath();
      g.arc(C, C, r1, 0, Math.PI * 2);
      g.arc(C, C, r0, 0, Math.PI * 2, true);
      g.fillStyle = g === ctx ? BRASS : "#fff";
      g.fill();
    }
  };
  ctx.clearRect(0, 0, S, S);
  disc(R, DARK);
  // the band of alternating stones
  const N = 32;
  for (let k = 0; k < N; k += 1) {
    const a0 = (k / N) * Math.PI * 2;
    const a1 = ((k + 1) / N) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(C, C, R * 0.97, a0, a1);
    ctx.arc(C, C, R * 0.84, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = k % 2 ? PALE : WARM;
    ctx.fill();
  }
  ring(R * 0.97, R);
  ring(R * 0.82, R * 0.84);
  // the eight-pointed star: two squares, pale over warm
  const star = (r: number, inner: number, fill: string, rot = 0) => {
    ctx.beginPath();
    for (let k = 0; k < 16; k += 1) {
      const a = rot + (k * Math.PI) / 8;
      const rr = k % 2 === 0 ? r : r * inner;
      const x = C + rr * Math.cos(a);
      const y = C + rr * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  star(R * 0.78, 0.72, WARM, Math.PI / 8);
  star(R * 0.74, 0.58, PALE);
  star(R * 0.5, 0.58, DARK, Math.PI / 8);
  ring(R * 0.3, R * 0.32);
  disc(R * 0.3, DARK);
  // the compass rose at the heart, in brass
  for (let k = 0; k < 16; k += 1) {
    const a = (k * Math.PI) / 8;
    const long = k % 2 === 0;
    const r = R * (long ? 0.29 : 0.18);
    const w = R * (long ? 0.045 : 0.03);
    for (const g of [ctx, mctx]) {
      g.beginPath();
      g.moveTo(C + r * Math.cos(a), C + r * Math.sin(a));
      g.lineTo(C + w * Math.cos(a + Math.PI / 2), C + w * Math.sin(a + Math.PI / 2));
      g.lineTo(C + w * Math.cos(a - Math.PI / 2), C + w * Math.sin(a - Math.PI / 2));
      g.closePath();
      g.fillStyle = g === ctx ? BRASS : "#fff";
      g.fill();
    }
  }
  disc(R * 0.035, BRASS, true);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  medallion = { map, metalnessMap: new THREE.CanvasTexture(m) };
  return medallion;
}

type Set3 = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
const repeats = new Map<string, Set3>();

/** A texture set tiled `rx` by `ry` times, cached so rooms of one size share it. */
function tiled(name: string, base: Set3 | null, rx: number, ry: number) {
  if (!base) return null;
  const key = `${name}:${rx.toFixed(2)}x${ry.toFixed(2)}`;
  const hit = repeats.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  const set = { map: clone(base.map), normalMap: clone(base.normalMap), roughnessMap: clone(base.roughnessMap) };
  repeats.set(key, set);
  return set;
}

export const damaskFor = (w: number, h: number) => tiled("damask", getDamask(), w / DAMASK_TILE, h / DAMASK_TILE);
export const marbleFor = (w: number, h: number) => tiled("marble", getMarbleFloor(), w / FLOOR_TILE, h / FLOOR_TILE);

let laylight: THREE.Texture | null = null;

/**
 * The glass of a laylight seen from below: panes of obscured glass in a
 * fine metal grid, lit from above, a little brighter at the centre of
 * each pane than at its bars.
 */
export function getLaylight() {
  if (laylight) return laylight;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const N = 4;
  const P = S / N;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const g = ctx.createRadialGradient(i * P + P / 2, j * P + P / 2, 2, i * P + P / 2, j * P + P / 2, P * 0.75);
      g.addColorStop(0, "rgb(255,246,226)");
      g.addColorStop(1, "rgb(200,182,150)");
      ctx.fillStyle = g;
      ctx.fillRect(i * P, j * P, P, P);
    }
  }
  ctx.fillStyle = "rgb(40,32,24)";
  for (let k = 0; k <= N; k += 1) {
    ctx.fillRect(k * P - 2, 0, 4, S);
    ctx.fillRect(0, k * P - 2, S, 4);
  }
  // the frame round the whole light, heavier than its bars
  ctx.strokeStyle = "rgb(28,22,16)";
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, S, S);
  laylight = new THREE.CanvasTexture(c);
  laylight.colorSpace = THREE.SRGBColorSpace;
  laylight.anisotropy = 4;
  return laylight;
}
