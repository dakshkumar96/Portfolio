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

let bronze: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Old bronze, for the leaves: a warm brown metal gone dark with handling
 * and air, mottled, with the faint green of patina settled where hands
 * do not reach, and a soft hammered unevenness in the surface. One tile
 * is about 0.8 m.
 */
export function getBronze() {
  if (bronze) return bronze;
  const S = 256;
  const rand = seeded(6151);
  const noise = (period: number) => {
    const n = Math.max(2, Math.round(S / period));
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i += 1) g[i] = rand();
    return (x: number, y: number) => {
      const fx = ((x / S) * n) % n;
      const fy = ((y / S) * n) % n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[(j % n) * n + (i % n)];
      const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
  };
  const mottle = noise(64);
  const patina = noise(32);
  const hammer = noise(9);
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
      const m = mottle(x, y);
      const p = Math.max(0, patina(x, y) - 0.62) * 2.2;
      const h = hammer(x, y);
      const v = 0.78 + (m - 0.5) * 0.3 + (h - 0.5) * 0.08 + (rand() - 0.5) * 0.04;
      const i = (y * S + x) * 4;
      // bronze brown, drifting toward a dull green where the patina has settled
      cimg.data[i] = Math.min(255, 255 * v * (1 - p * 0.45));
      cimg.data[i + 1] = Math.min(255, 255 * v * (0.86 + p * 0.1));
      cimg.data[i + 2] = Math.min(255, 255 * v * (0.66 + p * 0.12));
      cimg.data[i + 3] = 255;
      const r = 120 + (1 - m) * 60 + p * 60;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.min(255, r);
      rimg.data[i + 3] = 255;
      height[y * S + x] = h;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const n = normalFrom(height, S, S, 1.6);
  if (!n) return null;
  bronze = { map: repeatTexture(colour, true), normalMap: repeatTexture(n, false), roughnessMap: repeatTexture(rough, false) };
  return bronze;
}

let lattice: { relief: THREE.Texture; normalMap: THREE.Texture; jali: THREE.Texture } | null = null;

/**
 * The star lattice of a Mughal screen: eight-pointed stars on a square
 * grid, a second set at the centre of each square, their points meeting
 * so the straps run on unbroken from star to star.
 *
 * It is drawn as a height - the straps standing proud, the stars a little
 * lower, the ground sunk - and from that come a shade for the hollows, a
 * normal map, and a cut-out: the same lattice pierced through, for the
 * jali in the head of each leaf, where light comes through the holes.
 */
export function getStarLattice() {
  if (lattice) return lattice;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const star = (cx: number, cy: number, r: number) => {
    ctx.beginPath();
    for (let k = 0; k < 16; k += 1) {
      const a = (k * Math.PI) / 8;
      const rr = k % 2 === 0 ? r : r * 0.62;
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // stars at every corner and at the centre, drawn into the neighbouring tiles too so the pattern wraps
  const centres: [number, number][] = [];
  for (let i = -1; i <= 2; i += 1) for (let j = -1; j <= 2; j += 1) centres.push([i * S, j * S], [i * S + S / 2, j * S + S / 2]);
  const R = S * 0.3535;
  const draw = (fill: string, stroke: string, width: number, fillStars: boolean) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, S, S);
    for (const [x, y] of centres) {
      star(x, y, R);
      if (fillStars) {
        ctx.fillStyle = "rgb(110,110,110)";
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineJoin = "miter";
      ctx.stroke();
    }
  };
  // the height: ground low, stars raised a little, straps highest
  ctx.filter = "blur(1.6px)";
  draw("rgb(30,30,30)", "rgb(255,255,255)", S * 0.05, true);
  ctx.filter = "none";
  const hdata = ctx.getImageData(0, 0, S, S).data;
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i += 1) height[i] = hdata[i * 4] / 255;
  const normal = normalFrom(height, S, S, 5);
  // the shade: the sunk ground darkest, the straps catching the light
  const shade = document.createElement("canvas");
  shade.width = shade.height = S;
  const sctx = shade.getContext("2d");
  if (!normal || !sctx) return null;
  const simg = sctx.createImageData(S, S);
  for (let i = 0; i < S * S; i += 1) {
    const v = 0.42 + 0.58 * height[i];
    simg.data[i * 4] = simg.data[i * 4 + 1] = simg.data[i * 4 + 2] = Math.round(255 * v);
    simg.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(simg, 0, 0);
  // the cut-out: straps solid, everything between them open
  const jali = document.createElement("canvas");
  jali.width = jali.height = S;
  const jctx = jali.getContext("2d");
  if (!jctx) return null;
  jctx.drawImage(c, 0, 0);
  const jimg = jctx.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i += 1) {
    const solid = height[i] > 0.55 ? 255 : 0;
    jimg.data[i * 4] = jimg.data[i * 4 + 1] = jimg.data[i * 4 + 2] = solid;
    jimg.data[i * 4 + 3] = 255;
  }
  jctx.putImageData(jimg, 0, 0);
  lattice = { relief: repeatTexture(shade, true), normalMap: repeatTexture(normal, false), jali: repeatTexture(jali, false) };
  return lattice;
}
