import * as THREE from "three";

/*
  A carved and gilded picture frame, the kind every museum hangs its
  paintings in.

  The moulding is one profile - an outer bead, a deep cove, a flat
  frieze, and a beaded sight edge dropping to the picture - swept round
  the picture's rectangle. Each point of the profile is a rectangle
  inset by that much, so consecutive points join into four mitred
  faces: the corners come out on the diagonal, as a framer cuts them.
*/

type Pt = { u: number; z: number; v: number };

/**
 * The profile, outer edge to sight edge. `u` is the inset from the
 * outside and `z` the height above the back, both as fractions of the
 * frame's width; `v` is where the point sits on the ornament texture,
 * which is drawn in bands to match: side, bead, cove, frieze, sight
 * bead, drop.
 */
const PROFILE: Pt[] = (() => {
  const pts: Pt[] = [];
  const band = (v0: number, v1: number, list: [number, number][]) =>
    list.forEach(([u, z], i) => pts.push({ u, z, v: v0 + ((v1 - v0) * i) / Math.max(1, list.length - 1) }));
  const arc = (cu: number, cz: number, r: number, a0: number, a1: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i): [number, number] => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [cu + r * Math.cos(a), cz + r * Math.sin(a)];
    });
  const quad = (p0: [number, number], c: [number, number], p1: [number, number], n: number) =>
    Array.from({ length: n + 1 }, (_, i): [number, number] => {
      const t = i / n;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const d = t * t;
      return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
    });

  band(0, 0.08, [
    [0, 0],
    [0, 0.36],
  ]);
  // the outer bead, rolled over the top
  band(0.08, 0.3, arc(0.09, 0.36, 0.09, Math.PI, 0, 7));
  // the cove, scooped down and in
  band(0.3, 0.64, quad([0.18, 0.36], [0.2, 0.12], [0.56, 0.12], 8));
  // the flat frieze
  band(0.64, 0.76, [
    [0.56, 0.12],
    [0.74, 0.15],
  ]);
  // the sight bead
  band(0.76, 0.94, arc(0.83, 0.15, 0.09, Math.PI, 0, 6));
  // and the drop to the picture
  band(0.94, 1, [
    [0.92, 0.15],
    [1, 0.02],
  ]);
  // drop the joints the bands share, keeping the first of each pair
  return pts.filter((p, i) => i === 0 || Math.hypot(p.u - pts[i - 1].u, p.z - pts[i - 1].z) > 1e-6);
})();

/**
 * The moulding for a picture `w` by `h`, `width` wide. The picture's edge
 * sits just under the sight edge, so no gap shows between them. Built
 * lying in the xy plane, its back at z = 0, rising towards +z.
 */
export function giltMoulding(w: number, h: number, width: number, depth = 1) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // the rectangle at the outer edge
  const A = w / 2 + width - 0.01;
  const B = h / 2 + width - 0.01;
  /** Ornament repeat along a side, in hall units. */
  const REPEAT = 0.6;

  // four sides, each its own run of vertices so the mitres stay crisp
  const corners = (inset: number) => {
    const a = A - inset;
    const b = B - inset;
    return [
      [-a, -b],
      [a, -b],
      [a, b],
      [-a, b],
    ];
  };
  for (let side = 0; side < 4; side += 1) {
    const base = pos.length / 3;
    for (const p of PROFILE) {
      const c = corners(p.u * width);
      const p0 = c[side];
      const p1 = c[(side + 1) % 4];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const z = p.z * width * depth;
      pos.push(p0[0], p0[1], z, p1[0], p1[1], z);
      // u runs from the side's centre, so the ornament is symmetrical on every side
      uv.push(-len / 2 / REPEAT, p.v, len / 2 / REPEAT, p.v);
    }
    for (let i = 0; i < PROFILE.length - 1; i += 1) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Where the corner rosettes sit, as an inset and a height, in frame widths. */
export const ROSETTE = { inset: 0.38, z: 0.2, r: 0.17 };

let gilt: { map: THREE.Texture; normalMap: THREE.Texture } | null = null;

/**
 * The gilding and its carving, drawn to match the profile's bands.
 *
 * Gold leaf over a red-brown bole: the leaf is brightest on the high
 * points that get handled and polished, darker and dirtier in the
 * hollows, and here and there the bole shows through where it has worn.
 * The carving - a twisted ribbon on the outer bead, egg-and-dart in the
 * cove, pearls on the sight edge - is in the normal map, so it catches
 * the light rather than being painted on.
 */
export function getGilt() {
  if (gilt) return gilt;
  const W = 512;
  const H = 256;
  const height = new Float32Array(W * H);
  const colour = document.createElement("canvas");
  colour.width = W;
  colour.height = H;
  const ctx = colour.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // pale leaf gold: the room's warm light adds the rest
  const leaf = [230, 198, 132];
  const shadowed = [134, 104, 58];
  const bole = [120, 52, 30];

  for (let y = 0; y < H; y += 1) {
    const v = y / (H - 1);
    for (let x = 0; x < W; x += 1) {
      const u = x / W;
      let hgt = 0;
      let dirt = 0;
      if (v >= 0.08 && v < 0.3) {
        // twisted ribbon: diagonal ridges
        const t = (v - 0.08) / 0.22;
        const s = Math.sin((u * 24 + t * 1.2) * Math.PI * 2);
        hgt = 0.5 + 0.5 * s;
        dirt = s < -0.6 ? 0.5 : 0;
      } else if (v >= 0.33 && v < 0.62) {
        // egg-and-dart: a row of eggs with darts between
        const t = (v - 0.33) / 0.29;
        const cell = (u * 12) % 1;
        const ex = (cell - 0.5) / 0.32;
        const ey = (t - 0.5) / 0.42;
        const egg = 1 - (ex * ex + ey * ey);
        // the dart sits on the line between two eggs
        const dart = Math.max(0, 1 - Math.min(cell, 1 - cell) * 14) * Math.max(0, 1 - Math.abs(t - 0.45) * 2.2);
        hgt = Math.max(0, egg) * 0.9 + dart * 0.6;
        dirt = egg < 0 && dart <= 0 ? 0.6 : 0;
      } else if (v >= 0.78 && v < 0.94) {
        // pearls
        const t = (v - 0.78) / 0.16;
        const cell = (u * 40) % 1;
        const r = Math.hypot((cell - 0.5) / 0.42, (t - 0.5) / 0.5);
        hgt = Math.max(0, 1 - r * r);
        dirt = r > 1 ? 0.5 : 0;
      } else if (v >= 0.64 && v < 0.76) {
        // the sanded frieze: matt, a little grain, no carving
        hgt = rand() * 0.15;
        dirt = 0.25;
      }
      height[y * W + x] = hgt;

      // wear: the bole showing through on a few raised points
      const worn = hgt > 0.85 && rand() > 0.985 ? 1 : 0;
      const k = Math.min(1, dirt * 0.8 + (1 - hgt) * 0.25 + rand() * 0.06);
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const gold = leaf[ch] + (shadowed[ch] - leaf[ch]) * k;
        img.data[i + ch] = worn ? bole[ch] : gold;
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const nc = document.createElement("canvas");
  nc.width = W;
  nc.height = H;
  const nctx = nc.getContext("2d");
  if (!nctx) return null;
  const nimg = nctx.createImageData(W, H);
  const at = (x: number, y: number) => height[Math.min(H - 1, Math.max(0, y)) * W + ((x + W) % W)];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      nimg.data[i] = (-dx / len) * 127.5 + 127.5;
      // canvas rows run down the image, texture v runs up it
      nimg.data[i + 1] = (dy / len) * 127.5 + 127.5;
      nimg.data[i + 2] = (1 / len) * 127.5 + 127.5;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
  }
  gilt = { map, normalMap };
  return gilt;
}
