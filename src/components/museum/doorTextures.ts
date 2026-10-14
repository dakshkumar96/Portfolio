import * as THREE from "three";

/*
  The doors' three surfaces, drawn once and shared by all five doors:
  walnut for the leaves, a carved ajrak band for the arch, and the
  engraving on the brass boss. Each is drawn on a canvas, so the museum
  ships no image files for them.
*/

/** A height field turned into a tangent-space normal map. */
function normalFrom(height: Float32Array, w: number, h: number, strength: number) {
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

function repeatTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // mipmapped and anisotropic, so fine detail settles at a distance instead of shimmering
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small seeded random, so the textures come out the same every load. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

let walnut: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Dark walnut, grain running up the leaf.
 *
 * One texture is half a metre wide and two tall at the hall's scale, so
 * the figure repeats rarely enough not to be seen repeating. The grain is
 * fine, and only in the normal and roughness maps as well as the colour,
 * so it catches the light without becoming a pattern.
 */
export function getWalnut() {
  if (walnut) return walnut;
  const W = 256;
  const H = 1024;
  const rand = seeded(31);
  const height = new Float32Array(W * H);
  const colour = document.createElement("canvas");
  colour.width = W;
  colour.height = H;
  const rough = document.createElement("canvas");
  rough.width = W;
  rough.height = H;
  const cctx = colour.getContext("2d");
  const rctx = rough.getContext("2d");
  if (!cctx || !rctx) return null;
  const cimg = cctx.createImageData(W, H);
  const rimg = rctx.createImageData(W, H);

  /*
    The grain is a row of fibres, each its own shade, run up the board
    and drifting a little sideways as it goes. Irregular spacing is what
    makes it wood; even spacing made it look like ribbed vinyl.
  */
  const fibre = new Float32Array(W);
  for (let x = 0; x < W; x += 1) fibre[x] = rand();
  // soften the fibres into each other, a few passes of a three-tap blur, wrapping
  for (let pass = 0; pass < 2; pass += 1) {
    const prev = fibre.slice();
    for (let x = 0; x < W; x += 1) fibre[x] = (prev[(x + W - 1) % W] + prev[x] * 2 + prev[(x + 1) % W]) / 4;
  }
  const sample = (u: number) => {
    const x = ((u % W) + W) % W;
    const i = Math.floor(x);
    const f = x - i;
    return fibre[i] * (1 - f) + fibre[(i + 1) % W] * f;
  };
  // a few long dark streaks
  const streaks = Array.from({ length: 7 }, () => ({ x: rand() * W, w: 1 + rand() * 3, k: 0.3 + rand() * 0.4 }));
  // dark walnut is a cool chocolate brown, not red: the warm lamps add the warmth
  const dark = [30, 22, 16];
  const mid = [50, 37, 27];
  const light = [64, 48, 35];

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      // the grain wanders a little as it runs up the board
      const u =
        x +
        Math.sin((y / H) * Math.PI * 2 * 3 + x * 0.02) * 7 +
        Math.sin((y / H) * Math.PI * 2 * 7) * 2;
      // a soft figure, the fibres over it, and the board's own unevenness - none of them strong
      const figure = 0.5 + 0.5 * Math.sin((u / W) * Math.PI * 2 * 3 + Math.sin((y / H) * Math.PI * 4) * 1.2);
      const fine = sample(u);
      let v = 0.3 + 0.2 * figure + 0.35 * fine + 0.06 * rand();
      for (const s of streaks) {
        // distance to the streak, wrapping round the board's edges
        const d = Math.abs(((u - s.x + W * 1.5) % W) - W / 2);
        if (d < s.w) v -= s.k * 0.5 * (1 - d / s.w);
      }
      v = Math.min(1, Math.max(0, v));
      const lo = v < 0.5 ? dark : mid;
      const hi = v < 0.5 ? mid : light;
      const f = v < 0.5 ? v * 2 : (v - 0.5) * 2;
      const i = (y * W + x) * 4;
      cimg.data[i] = lo[0] + (hi[0] - lo[0]) * f;
      cimg.data[i + 1] = lo[1] + (hi[1] - lo[1]) * f;
      cimg.data[i + 2] = lo[2] + (hi[2] - lo[2]) * f;
      cimg.data[i + 3] = 255;
      // open pores sit low and catch less light
      const pore = rand() > 0.985 ? -0.6 : 0;
      height[y * W + x] = fine * 0.6 + figure * 0.4 + pore;
      const r = 150 + (1 - fine) * 30 - pore * 40;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r;
      rimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, W, H, 1.4);
  if (!n) return null;

  walnut = {
    map: repeatTexture(colour, true),
    normalMap: repeatTexture(n, false),
    roughnessMap: repeatTexture(rough, false),
  };
  // the leaf's UVs are in hall units: one board is 0.9 wide and 3.6 tall
  for (const t of [walnut.map, walnut.normalMap, walnut.roughnessMap]) t.repeat.set(1 / 0.9, 1 / 3.6);
  return walnut;
}

let ajrak: { map: THREE.Texture; normalMap: THREE.Texture } | null = null;

/**
 * The carved band round the arch: an ajrak lattice in low relief.
 *
 * Ajrak is block-printed in repeating squares, each holding a star or a
 * rosette with small lozenges between. Here it is cut into the stone
 * rather than printed, so only the relief carries it - the colour map
 * just darkens the cut, as dust and shadow do in a real carving. One
 * repeat spans the band's width, which keeps the pattern large enough
 * not to shimmer from across the hall.
 */
export function getAjrakRelief() {
  if (ajrak) return ajrak;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.filter = "blur(3px)";
  ctx.fillStyle = "#fff";
  // the star: two squares, one turned an eighth
  ctx.save();
  ctx.translate(S / 2, S / 2);
  for (const turn of [0, Math.PI / 4]) {
    ctx.save();
    ctx.rotate(turn);
    ctx.fillRect(-S * 0.24, -S * 0.24, S * 0.48, S * 0.48);
    ctx.restore();
  }
  // its centre, sunk back
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // lozenges at the corners, shared with the neighbouring tiles
  for (const [x, y] of [
    [0, 0],
    [S, 0],
    [0, S],
    [S, S],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-S * 0.07, -S * 0.07, S * 0.14, S * 0.14);
    ctx.restore();
  }
  ctx.filter = "none";

  const px = ctx.getImageData(0, 0, S, S).data;
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i += 1) height[i] = px[i * 4] / 255;
  const n = normalFrom(height, S, S, 3.2);
  if (!n) return null;

  // the colour: stone where it stands proud, a little darker in the cut
  const shade = document.createElement("canvas");
  shade.width = shade.height = S;
  const sctx = shade.getContext("2d");
  if (!sctx) return null;
  const img = sctx.createImageData(S, S);
  for (let i = 0; i < S * S; i += 1) {
    const v = 175 + height[i] * 80;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  // the band's own UVs count in tiles, one across its width
  ajrak = { map: repeatTexture(shade, true), normalMap: repeatTexture(n, false) };
  return ajrak;
}

let boss: THREE.Texture | null = null;

/** The face of the brass boss: a ring, an eight-pointed star cut in line, and a centre. */
export function getBossEngraving() {
  if (boss) return boss;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const r = S / 2;
  const g = ctx.createRadialGradient(r * 0.8, r * 0.7, 0, r, r, r);
  g.addColorStop(0, "#f1d595");
  g.addColorStop(0.6, "#c99a4b");
  g.addColorStop(1, "#8c6428");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = "#5c3f17";
  ctx.lineWidth = 3;
  ctx.translate(r, r);
  for (const k of [0.9, 0.78]) {
    ctx.beginPath();
    ctx.arc(0, 0, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  // the star, as two squares in line
  ctx.lineWidth = 2.5;
  for (const turn of [0, Math.PI / 4]) {
    ctx.save();
    ctx.rotate(turn);
    ctx.strokeRect(-r * 0.46, -r * 0.46, r * 0.92, r * 0.92);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#5c3f17";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  boss = new THREE.CanvasTexture(c);
  boss.colorSpace = THREE.SRGBColorSpace;
  boss.anisotropy = 8;
  return boss;
}
