import * as THREE from "three";

/*
  Stone, as texture: the grain of dressed limestone and sandstone, for the
  structure of the hall and its rooms - ribs, cornices, pilasters, door
  surrounds, the end wall.

  Two things make a stone surface read as stone rather than as painted
  plastic. The colour is never flat: it drifts slowly across a block and
  is peppered with fine grains a shade lighter and darker. And the surface
  is never smooth: the same grain catches the light as relief. So this is
  a colour map that varies gently about white - it is multiplied into each
  material's own colour, so one texture serves every tone of stone - and a
  normal map made from the same height, so the grain is lit, not printed.

  Everything is wrapped, so it tiles without a seam. Geometry using it
  should carry world-scale UVs (see worldUV in architecture.ts), so the
  grain is the same size on a long cornice as on a small capital and is
  never stretched.
*/

export const S = 256;

export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Smooth noise on a lattice about `period` pixels apart, wrapped on a `w` by `h` tile. */
export function lattice(rand: () => number, period: number, w = S, h = S) {
  const nx = Math.max(2, Math.round(w / period));
  const ny = Math.max(2, Math.round(h / period));
  const g = new Float32Array(nx * ny);
  for (let i = 0; i < g.length; i += 1) g[i] = rand();
  return (x: number, y: number) => {
    const fx = (((x / w) * nx) % nx + nx) % nx;
    const fy = (((y / h) * ny) % ny + ny) % ny;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = (x0 + 1) % nx;
    const y1 = (y0 + 1) % ny;
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * nx + x0] * (1 - sx) + g[y0 * nx + x1] * sx;
    const b = g[y1 * nx + x0] * (1 - sx) + g[y1 * nx + x1] * sx;
    return a * (1 - sy) + b * sy;
  };
}

/** A tangent-space normal map from a height field wrapped on a `w` by `h` tile. */
export function normalFrom(height: Float32Array, strength: number, w = S, h = S) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / len) * 127.5 + 127.5;
      // canvas rows run down the image, texture v runs up it
      img.data[i + 1] = (dy / len) * 127.5 + 127.5;
      img.data[i + 2] = (1 / len) * 127.5 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function repeat(t: THREE.Texture) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let grain: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/** Dressed stone: a slow drift of colour, fine grains, and the relief they make. */
export function getStoneGrain() {
  if (grain) return grain;
  const rand = seeded(9173);
  const slow = lattice(rand, 96);
  const cloud = lattice(rand, 24);
  const fine = lattice(rand, 4);
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
      const drift = (slow(x, y) - 0.5) * 0.14 + (cloud(x, y) - 0.5) * 0.1;
      const speck = rand();
      const grainV = (fine(x, y) - 0.5) * 0.12 + (speck > 0.97 ? 0.08 : speck < 0.03 ? -0.09 : 0);
      const v = 0.86 + drift + grainV;
      const i = (y * S + x) * 4;
      // a faint warm cast in the lighter grains, as in a sandstone
      cimg.data[i] = Math.min(255, 255 * (v + 0.01));
      cimg.data[i + 1] = Math.min(255, 255 * v);
      cimg.data[i + 2] = Math.min(255, 255 * (v - 0.015));
      cimg.data[i + 3] = 255;
      height[y * S + x] = fine(x, y) * 0.7 + cloud(x, y) * 0.3 + (speck > 0.985 ? 0.4 : 0);
      const r = 220 - grainV * 300;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, r));
      rimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, 2.2);
  if (!n) return null;
  const map = repeat(new THREE.CanvasTexture(colour));
  map.colorSpace = THREE.SRGBColorSpace;
  grain = { map, normalMap: repeat(new THREE.CanvasTexture(n)), roughnessMap: repeat(new THREE.CanvasTexture(rough)) };
  return grain;
}

/** How many metres one repeat of the ashlar covers, each way. */
export const ASHLAR_TILE = 4.8;

let ashlar: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Ashlar: squared stone blocks laid in courses, for a wall that is built
 * rather than clad. Courses 0.6 m high, three or four blocks to a 4.8 m
 * run with the joints broken from course to course, each block its own
 * shade, the joints fine and sunk, and every arris taken off with a small
 * chamfer that catches the light - which is most of what makes dressed
 * stone look dressed.
 */
export function getAshlar() {
  if (ashlar) return ashlar;
  const N = 512;
  const PPM = N / ASHLAR_TILE;
  const COURSE = 0.6;
  const COURSES = Math.round(ASHLAR_TILE / COURSE);
  const JOINT = 0.007;
  const CHAMFER = 0.018;
  const rand = seeded(7331);
  const cloud = lattice(rand, 46, N, N);
  const fine = lattice(rand, 5, N, N);
  // each course: where its joints fall along the run, and the shade of each block
  const courses = Array.from({ length: COURSES }, () => {
    const k = rand() < 0.5 ? 3 : 4;
    const raw = Array.from({ length: k }, () => 0.8 + rand() * 0.4);
    const sum = raw.reduce((a, b) => a + b, 0);
    const edges: number[] = [0];
    for (const r of raw) edges.push(edges[edges.length - 1] + (r / sum) * ASHLAR_TILE);
    return { offset: rand() * ASHLAR_TILE, edges, tones: raw.map(() => (rand() - 0.5) * 0.14) };
  });
  const colour = document.createElement("canvas");
  colour.width = colour.height = N;
  const rough = document.createElement("canvas");
  rough.width = rough.height = N;
  const cctx = colour.getContext("2d");
  const rctx = rough.getContext("2d");
  if (!cctx || !rctx) return null;
  const cimg = cctx.createImageData(N, N);
  const rimg = rctx.createImageData(N, N);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    const ym = y / PPM;
    const c = courses[Math.min(COURSES - 1, Math.floor(ym / COURSE))];
    const dv = Math.min(ym % COURSE, COURSE - (ym % COURSE));
    for (let x = 0; x < N; x += 1) {
      const xm = (((x / PPM - c.offset) % ASHLAR_TILE) + ASHLAR_TILE) % ASHLAR_TILE;
      let b = 0;
      while (b < c.edges.length - 2 && xm >= c.edges[b + 1]) b += 1;
      const du = Math.min(xm - c.edges[b], c.edges[b + 1] - xm);
      const e = Math.min(du, dv);
      const f = fine(x, y);
      const cl = cloud(x, y);
      let h: number;
      let v: number;
      let r: number;
      if (e < JOINT) {
        h = 0;
        v = 0.42 + f * 0.08;
        r = 250;
      } else {
        const t = Math.min(1, (e - JOINT) / CHAMFER);
        h = 0.55 + 0.45 * t + (t >= 1 ? f * 0.12 + cl * 0.08 : 0);
        v = 0.84 + c.tones[b] + (cl - 0.5) * 0.12 + (f - 0.5) * 0.08 + (rand() - 0.5) * 0.03;
        // the chamfer is worked smoother and catches the light
        if (t < 1) v += 0.05 * (1 - t);
        r = 214 - (f - 0.5) * 50;
      }
      const i = (y * N + x) * 4;
      cimg.data[i] = Math.min(255, 255 * (v + 0.012));
      cimg.data[i + 1] = Math.min(255, 255 * v);
      cimg.data[i + 2] = Math.min(255, 255 * (v - 0.02));
      cimg.data[i + 3] = 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(0, Math.min(255, r));
      rimg.data[i + 3] = 255;
      height[y * N + x] = h;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, 3, N, N);
  if (!n) return null;
  const map = repeat(new THREE.CanvasTexture(colour));
  map.colorSpace = THREE.SRGBColorSpace;
  ashlar = { map, normalMap: repeat(new THREE.CanvasTexture(n)), roughnessMap: repeat(new THREE.CanvasTexture(rough)) };
  return ashlar;
}
