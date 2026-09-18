import * as THREE from "three";
import { seededRandom } from "./rand";

type ConcreteSet = { map: THREE.Texture; bumpMap: THREE.Texture };

let cached: ConcreteSet | null = null;

/**
 * Built once per page, then shared. Generating this per wall meant ~15
 * passes over a quarter-million pixels each, which froze the main thread
 * before the first frame.
 */
export function getConcrete(): ConcreteSet | null {
  if (!cached) cached = makeConcreteTextures(512);
  return cached;
}

/**
 * Clone sharing the same image but with its own repeat, so each surface
 * can tile differently without regenerating pixels.
 */
export function concreteFor(repeatX: number, repeatY: number): ConcreteSet | null {
  const base = getConcrete();
  if (!base) return null;
  const map = base.map.clone();
  const bumpMap = base.bumpMap.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  bumpMap.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  bumpMap.needsUpdate = true;
  return { map, bumpMap };
}

/**
 * Procedural concrete: mottled grain plus a faint horizontal pour-line,
 * generated at runtime so the scene needs no image assets. Returns both
 * a colour map and a matching bump map.
 */
export function makeConcreteTextures(size = 512) {
  const rand = seededRandom(9137);

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = size;
  const ctx = colorCanvas.getContext("2d", { willReadFrequently: true });

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext("2d", { willReadFrequently: true });

  if (!ctx || !bctx) return null;

  ctx.fillStyle = "#c9b491";
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, size, size);

  // grain
  const image = ctx.getImageData(0, 0, size, size);
  const bump = bctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand() - 0.5) * 17;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n * 0.7));

    const bn = 128 + n * 2.2;
    bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = Math.max(0, Math.min(255, bn));
  }
  ctx.putImageData(image, 0, 0);
  bctx.putImageData(bump, 0, 0);

  // blotches, so it doesn't read as uniform noise
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() > 0.5;
    g.addColorStop(0, dark ? "rgba(120,92,58,0.13)" : "rgba(255,241,214,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // pour lines
  for (let i = 0; i < 7; i += 1) {
    const y = rand() * size;
    ctx.fillStyle = "rgba(126,98,62,0.16)";
    ctx.fillRect(0, y, size, 1.5);
    bctx.fillStyle = "rgba(70,70,70,1)";
    bctx.fillRect(0, y, size, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  map.colorSpace = THREE.SRGBColorSpace;

  return { map, bumpMap };
}

let marbleCache: THREE.Texture | null = null;

/**
 * Dark polished marble with pale veining, as in the reference halls.
 * Veins are drawn as tapering bezier runs rather than noise so they read
 * as stone rather than static.
 */
export function getMarble(): THREE.Texture | null {
  if (marbleCache) return marbleCache;

  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const rand = seededRandom(20481);

  ctx.fillStyle = "#0b0b0e";
  ctx.fillRect(0, 0, size, size);

  // broad tonal drift so slabs aren't flat
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 120 + rand() * 280;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(60,58,64,${0.05 + rand() * 0.06})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // veins
  const drawVein = (width: number, alpha: number, tint: string) => {
    let x = rand() * size;
    let y = -20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < size + 20) {
      const cx = x + (rand() - 0.5) * 180;
      const cy = y + 60 + rand() * 90;
      const nx = x + (rand() - 0.5) * 200;
      const ny = cy + 40 + rand() * 70;
      ctx.quadraticCurveTo(cx, cy, nx, ny);
      x = nx;
      y = ny;
    }
    ctx.strokeStyle = tint;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  for (let i = 0; i < 9; i += 1) drawVein(0.8 + rand() * 1.4, 0.16 + rand() * 0.14, "#cfc7bb");
  for (let i = 0; i < 5; i += 1) drawVein(2.5 + rand() * 3, 0.06 + rand() * 0.05, "#9c8f7e");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  marbleCache = tex;
  return tex;
}

export function marbleFor(repeatX: number, repeatY: number): THREE.Texture | null {
  const base = getMarble();
  if (!base) return null;
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

let scriptCache: THREE.Texture | null = null;

/**
 * The luminous script wall from the references: columns of glowing
 * handwriting cascading down a dark surface. Abstract strokes rather
 * than real glyphs, so it reads as inscription without pretending to be
 * a language it isn't.
 */
export function getScriptWall(): THREE.Texture | null {
  if (scriptCache) return scriptCache;

  const w = 768;
  const h = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const rand = seededRandom(7723);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const columns = 9;
  const colW = w / columns;

  for (let c = 0; c < columns; c += 1) {
    const cx = colW * (c + 0.5);
    // columns fade out toward the bottom, like the reference cascade
    let y = 40 + rand() * 80;
    while (y < h - 60) {
      const fade = 1 - y / h;
      const alpha = (0.25 + rand() * 0.6) * (0.25 + fade * 0.95);
      const scale = 0.6 + rand() * 0.7;
      const strokes = 2 + Math.floor(rand() * 4);

      ctx.strokeStyle = "#ffd79a";
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6 + rand() * 2.2;

      for (let s = 0; s < strokes; s += 1) {
        const sx = cx + (rand() - 0.5) * colW * 0.55;
        const sy = y + s * 5 * scale;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const segs = 1 + Math.floor(rand() * 3);
        let px = sx;
        let py = sy;
        for (let g = 0; g < segs; g += 1) {
          const qx = px + (rand() - 0.5) * 26 * scale;
          const qy = py + (4 + rand() * 14) * scale;
          const ex = px + (rand() - 0.5) * 30 * scale;
          const ey = qy + (2 + rand() * 8) * scale;
          ctx.quadraticCurveTo(qx, qy, ex, ey);
          px = ex;
          py = ey;
        }
        ctx.stroke();
      }
      y += 34 * scale + rand() * 26;
    }
  }
  ctx.globalAlpha = 1;

  // scattered sparks, as in the particle drifts
  for (let i = 0; i < 500; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const r = rand() * 1.7;
    ctx.fillStyle = `rgba(255,214,150,${0.15 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  scriptCache = tex;
  return tex;
}

/**
 * Sobel-derive a tangent-space normal map from a height/bump canvas.
 * Cheaper than shipping an image and keeps the surface detail coherent
 * with the colour map it came from.
 */
function heightToNormal(src: HTMLCanvasElement, strength = 2.2): THREE.Texture | null {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  const hd = sctx.getImageData(0, 0, w, h).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  const img = octx.createImageData(w, h);

  const at = (x: number, y: number) => {
    const xi = (x + w) % w;
    const yi = (y + h) % h;
    return hd[(yi * w + xi) * 4] / 255;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;

      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

type PbrSet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
let pbrCache: PbrSet | null = null;

/** Concrete colour + normal + roughness, generated once and shared. */
export function getConcretePbr(): PbrSet | null {
  if (pbrCache) return pbrCache;
  const base = makeConcreteTextures(512);
  if (!base) return null;

  const bumpCanvas = base.bumpMap.image as HTMLCanvasElement;
  const normalMap = heightToNormal(bumpCanvas, 2.4);
  if (!normalMap) return null;

  // reuse the height field as roughness variation
  const roughnessMap = base.bumpMap;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  pbrCache = { map: base.map, normalMap, roughnessMap };
  return pbrCache;
}

export function concretePbrFor(rx: number, ry: number): PbrSet | null {
  const base = getConcretePbr();
  if (!base) return null;
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  return {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
  };
}

let carvedCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Carved sandstone: warm limestone blocks divided into recessed relief
 * panels with glyph-like marks, plus the height field that drives the
 * normal map. This is what stops the walls reading as flat painted boxes.
 */
export function getCarvedStone() {
  if (carvedCache) return carvedCache;

  const S = 1024;
  const color = document.createElement("canvas");
  const height = document.createElement("canvas");
  color.width = color.height = height.width = height.height = S;
  const c = color.getContext("2d", { willReadFrequently: true });
  const h = height.getContext("2d", { willReadFrequently: true });
  if (!c || !h) return null;

  const rand = seededRandom(31337);

  // warm limestone ground
  c.fillStyle = "#c2a476";
  c.fillRect(0, 0, S, S);
  h.fillStyle = "#8c8c8c";
  h.fillRect(0, 0, S, S);

  // coursed blocks
  const rows = 8;
  const rowH = S / rows;
  for (let r = 0; r < rows; r += 1) {
    const offset = (r % 2) * (S / 8);
    const cols = 4;
    for (let col = 0; col <= cols; col += 1) {
      const x = ((col * S) / cols + offset) % S;
      // mortar joints, cut into the height field
      c.fillStyle = "rgba(122,96,60,0.55)";
      c.fillRect(x - 1.5, r * rowH, 3, rowH);
      h.fillStyle = "#4a4a4a";
      h.fillRect(x - 2, r * rowH, 4, rowH);
    }
    c.fillStyle = "rgba(122,96,60,0.5)";
    c.fillRect(0, r * rowH - 1.5, S, 3);
    h.fillStyle = "#4a4a4a";
    h.fillRect(0, r * rowH - 2, S, 4);

    // slight tonal drift per course
    c.fillStyle = `rgba(${rand() > 0.5 ? "255,238,205" : "150,120,78"},${0.04 + rand() * 0.05})`;
    c.fillRect(0, r * rowH, S, rowH);
  }

  // recessed relief panels with glyph rows inside
  const panelPad = 34;
  for (let r = 0; r < rows; r += 2) {
    const py = r * rowH + panelPad;
    const ph = rowH * 2 - panelPad * 2;
    if (ph < 20) continue;
    const px = panelPad;
    const pw = S - panelPad * 2;

    // sunk panel: darker + lower
    c.fillStyle = "rgba(105,82,50,0.30)";
    c.fillRect(px, py, pw, ph);
    h.fillStyle = "#6e6e6e";
    h.fillRect(px, py, pw, ph);
    // bevel highlight along the top edge
    c.fillStyle = "rgba(255,240,210,0.16)";
    c.fillRect(px, py, pw, 3);

    // glyph-like marks, raised back out of the panel
    const glyphRows = 3;
    for (let g = 0; g < glyphRows; g += 1) {
      const gy = py + 14 + g * (ph / glyphRows);
      let gx = px + 18;
      while (gx < px + pw - 26) {
        const gw = 10 + rand() * 16;
        const gh = Math.min(ph / glyphRows - 12, 12 + rand() * 14);
        c.fillStyle = `rgba(150,120,76,${0.35 + rand() * 0.3})`;
        c.fillRect(gx, gy, gw, gh);
        c.fillStyle = "rgba(255,238,206,0.16)";
        c.fillRect(gx, gy, gw, 2);
        h.fillStyle = "#adadad";
        h.fillRect(gx, gy, gw, gh);
        gx += gw + 8 + rand() * 12;
      }
    }
  }

  // fine weathering grain
  const img = c.getImageData(0, 0, S, S);
  const hImg = h.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 16;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * 0.9));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.7));
    const hn = hImg.data[i] + n * 0.9;
    hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = Math.max(0, Math.min(255, hn));
  }
  c.putImageData(img, 0, 0);
  h.putImageData(hImg, 0, 0);

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(height, 3.2);
  const roughnessMap = new THREE.CanvasTexture(height);
  if (!normalMap) return null;

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  carvedCache = { map, normalMap, roughnessMap };
  return carvedCache;
}

export function carvedFor(rx: number, ry: number) {
  const base = getCarvedStone();
  if (!base) return null;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  return {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
  };
}

let sandCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; aoMap: THREE.Texture } | null = null;

/**
 * Plain sand: fine warm grain with gentle drifts, no blocks, panels or
 * glyphs. The carved version competed with the glow from the doors and
 * cases; this reads as surface without asking for attention.
 */
export function getSand() {
  if (sandCache) return sandCache;

  const S = 512;
  const color = document.createElement("canvas");
  const height = document.createElement("canvas");
  color.width = color.height = height.width = height.height = S;
  const c = color.getContext("2d", { willReadFrequently: true });
  const h = height.getContext("2d", { willReadFrequently: true });
  if (!c || !h) return null;

  const rand = seededRandom(60613);

  c.fillStyle = "#c8ab7e";
  c.fillRect(0, 0, S, S);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, S, S);

  /**
   * Pure multi-octave grain, no large blobs.
   *
   * The previous version drew broad radial drifts; tiled ~40x across a
   * wall those repeated into the diamond/lattice motif. Keeping every
   * feature near pixel scale means the repeat is invisible.
   */
  const img = c.getImageData(0, 0, S, S);
  const hImg = h.getImageData(0, 0, S, S);

  // cheap value noise at two small scales, wrapped so it tiles seamlessly
  const lattice = (period: number) => {
    const n = Math.max(2, Math.floor(S / period));
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i += 1) g[i] = rand();
    return (x: number, y: number) => {
      const fx = (x / period) % n;
      const fy = (y / period) % n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = (x0 + 1) % n;
      const y1 = (y0 + 1) % n;
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * n + x0] * (1 - sx) + g[y0 * n + x1] * sx;
      const b = g[y1 * n + x0] * (1 - sx) + g[y1 * n + x1] * sx;
      return a * (1 - sy) + b * sy;
    };
  };
  const n1 = lattice(8);
  const n2 = lattice(3);

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      const soft = (n1(x, y) - 0.5) * 16 + (n2(x, y) - 0.5) * 12;
      const grain = (rand() - 0.5) * 20;
      const v = soft + grain;
      img.data[i] = Math.max(0, Math.min(255, img.data[i] + v));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + v * 0.9));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + v * 0.72));
      const hv = 128 + soft * 2.2 + grain * 2.6;
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = Math.max(0, Math.min(255, hv));
      img.data[i + 3] = hImg.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  h.putImageData(hImg, 0, 0);

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(height, 2.4);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(height);
  // AO from the same height field: hollows between grains sit darker
  const aoMap = new THREE.CanvasTexture(height);

  for (const t of [map, normalMap, roughnessMap, aoMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  sandCache = { map, normalMap, roughnessMap, aoMap };
  return sandCache;
}

const sandRepeatCache = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; aoMap: THREE.Texture }>();

export function sandFor(rx: number, ry: number) {
  const base = getSand();
  if (!base) return null;
  const qx = Math.round(rx * 2) / 2;
  const qy = Math.round(ry * 2) / 2;
  const key = `${qx}x${qy}`;
  const hit = sandRepeatCache.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(qx, qy);
    x.needsUpdate = true;
    return x;
  };
  const set = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
    aoMap: clone(base.aoMap),
  };
  sandRepeatCache.set(key, set);
  return set;
}

type PbrFull = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
};
let panelCache: PbrFull | null = null;

/**
 * Full PBR set for panelled stone: albedo, normal, roughness and AO.
 *
 * The AO map is the piece that actually sells "carved" — it darkens the
 * recesses and the contact line at each panel edge, which no amount of
 * normal-map detail can fake on its own.
 */
export function getPanelPbr(): PbrFull | null {
  if (panelCache) return panelCache;

  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const rough = mk();
  const ao = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  const o = ao.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !r || !o) return null;

  const rand = seededRandom(90210);

  a.fillStyle = "#8e7a5c";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#b4b4b4";  // panel faces sit proud
  h.fillRect(0, 0, S, S);
  r.fillStyle = "#b0b0b0";
  r.fillRect(0, 0, S, S);
  o.fillStyle = "#ffffff";  // white = unoccluded
  o.fillRect(0, 0, S, S);

  // 2x2 panels per tile, with a deep reveal between them
  const gap = 26;
  const half = S / 2;
  for (let py = 0; py < 2; py += 1) {
    for (let px = 0; px < 2; px += 1) {
      const x = px * half + gap / 2;
      const y = py * half + gap / 2;
      const w = half - gap;
      const hh = half - gap;

      // panel face: slightly varied tone
      a.fillStyle = `rgba(${168 + rand() * 22},${146 + rand() * 20},${112 + rand() * 18},1)`;
      a.fillRect(x, y, w, hh);
      h.fillStyle = "#dcdcdc";
      h.fillRect(x, y, w, hh);
      r.fillStyle = "#9a9a9a";
      r.fillRect(x, y, w, hh);

      // AO: dark band hugging the inside of every panel edge
      const band = 20;
      const g1 = o.createLinearGradient(x, y, x, y + band);
      g1.addColorStop(0, "rgba(0,0,0,0.62)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g1;
      o.fillRect(x, y, w, band);

      const g2 = o.createLinearGradient(x, y + hh, x, y + hh - band);
      g2.addColorStop(0, "rgba(0,0,0,0.45)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g2;
      o.fillRect(x, y + hh - band, w, band);

      const g3 = o.createLinearGradient(x, 0, x + band, 0);
      g3.addColorStop(0, "rgba(0,0,0,0.55)");
      g3.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g3;
      o.fillRect(x, y, band, hh);

      const g4 = o.createLinearGradient(x + w, 0, x + w - band, 0);
      g4.addColorStop(0, "rgba(0,0,0,0.55)");
      g4.addColorStop(1, "rgba(0,0,0,0)");
      o.fillStyle = g4;
      o.fillRect(x + w - band, y, band, hh);

      // bevel highlight along the top of each panel
      a.fillStyle = "rgba(255,241,214,0.14)";
      a.fillRect(x, y, w, 3);
      a.fillStyle = "rgba(60,45,26,0.20)";
      a.fillRect(x, y + hh - 3, w, 3);
    }
  }

  // the reveal itself is dark, rough and fully occluded
  const drawReveal = (ctx: CanvasRenderingContext2D, style: string) => {
    ctx.fillStyle = style;
    ctx.fillRect(0, half - gap / 2, S, gap);
    ctx.fillRect(half - gap / 2, 0, gap, S);
    ctx.fillRect(0, 0, S, gap / 2);
    ctx.fillRect(0, S - gap / 2, S, gap / 2);
    ctx.fillRect(0, 0, gap / 2, S);
    ctx.fillRect(S - gap / 2, 0, gap / 2, S);
  };
  drawReveal(a, "rgba(46,36,22,0.92)");
  drawReveal(h, "#3a3a3a");
  drawReveal(r, "#d8d8d8");
  drawReveal(o, "rgba(0,0,0,0.78)");

  // grain across albedo, roughness and height
  const ai = a.getImageData(0, 0, S, S);
  const hi = h.getImageData(0, 0, S, S);
  const ri = r.getImageData(0, 0, S, S);
  for (let i = 0; i < ai.data.length; i += 4) {
    const n = (rand() - 0.5) * 20;
    ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + n));
    ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + n * 0.9));
    ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + n * 0.75));
    const hn = hi.data[i] + n * 1.5;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = Math.max(0, Math.min(255, hn));
    const rn = ri.data[i] + n * 1.2;
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.max(0, Math.min(255, rn));
  }
  a.putImageData(ai, 0, 0);
  h.putImageData(hi, 0, 0);
  r.putImageData(ri, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 5.5);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const aoMap = new THREE.CanvasTexture(ao);

  for (const t of [map, normalMap, roughnessMap, aoMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  panelCache = { map, normalMap, roughnessMap, aoMap };
  return panelCache;
}

/**
 * Cloned texture sets are cached by repeat.
 *
 * A clone shares its source image but is still its own GPU upload, so
 * cloning per mesh meant 84 wall panels x 4 maps = 336 uploads, about
 * 1.3GB of VRAM. Panels that tile identically now share one set, which
 * brings that down to a handful.
 */
const panelRepeatCache = new Map<string, PbrFull>();

export function panelPbrFor(rx: number, ry: number): PbrFull | null {
  const base = getPanelPbr();
  if (!base) return null;

  // quantise so near-identical repeats share a set rather than each
  // spawning its own
  const qx = Math.round(rx * 4) / 4;
  const qy = Math.round(ry * 4) / 4;
  const key = `${qx}x${qy}`;
  const hit = panelRepeatCache.get(key);
  if (hit) return hit;

  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(qx, qy);
    x.needsUpdate = true;
    return x;
  };
  const set: PbrFull = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
    aoMap: clone(base.aoMap),
  };
  panelRepeatCache.set(key, set);
  return set;
}

let inscriptionCache: { map: THREE.Texture; normalMap: THREE.Texture } | null = null;

/**
 * A dense wall of carved inscription.
 *
 * Text is drawn as engraving rather than glowing paint: each line gets a
 * dark sunk body with a light bevel along its top edge, which is how
 * chiselled lettering actually catches raking light. The height field
 * drives a normal map so the carving has real relief instead of looking
 * printed on.
 */
export function getInscription(lines: string[]) {
  if (inscriptionCache) return inscriptionCache;

  const W = 1024;
  const H = 1024;
  const color = document.createElement("canvas");
  const height = document.createElement("canvas");
  color.width = height.width = W;
  color.height = height.height = H;
  const c = color.getContext("2d", { willReadFrequently: true });
  const h = height.getContext("2d", { willReadFrequently: true });
  if (!c || !h) return null;

  const rand = seededRandom(4242);

  // transparent so the sand wall shows through the untouched stone
  c.clearRect(0, 0, W, H);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, W, H);

  const COLS = 3;
  const colW = W / COLS;
  const lineH = 34;

  for (let col = 0; col < COLS; col += 1) {
    const x0 = col * colW + 26;
    let y = 40 + rand() * 30;
    let li = col;

    while (y < H - lineH) {
      const text = lines[li % lines.length].toUpperCase();
      li += 1;

      const size = 19 + Math.floor(rand() * 5);
      c.font = `600 ${size}px Inter, system-ui, sans-serif`;
      h.font = c.font;

      // letter-spaced, like inscription
      let x = x0;
      for (const ch of text) {
        if (x > x0 + colW - 44) break;
        // sunk body
        c.fillStyle = "rgba(38,27,14,0.72)";
        c.fillText(ch, x, y);
        // bevel catching light on the upper edge
        c.fillStyle = "rgba(255,231,186,0.30)";
        c.fillText(ch, x, y - 1.2);
        // carved into the height field
        h.fillStyle = "#3f3f3f";
        h.fillText(ch, x, y);
        x += c.measureText(ch).width + 2.6;
      }
      y += lineH + rand() * 8;
    }

    // rule between columns, like a register divider
    if (col < COLS - 1) {
      c.fillStyle = "rgba(46,33,17,0.5)";
      c.fillRect((col + 1) * colW - 8, 24, 2.5, H - 48);
      h.fillStyle = "#5a5a5a";
      h.fillRect((col + 1) * colW - 8, 24, 3, H - 48);
    }
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(height, 3.4);
  if (!normalMap) return null;
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  inscriptionCache = { map, normalMap };
  return inscriptionCache;
}

type BrickSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
};
let brickCache: BrickSet | null = null;

/**
 * Black brick paving in running bond.
 *
 * One tile covers ~2m, with bricks at UK standard 215x65mm plus a 10mm
 * joint, so they read at human scale against the vitrines. Per-brick
 * tone and roughness vary, and the mortar sits lower, rougher and darker
 * in AO than the brick faces — which is what stops it looking like a
 * printed pattern under a raking spotlight.
 */
export function getBlackBrick(): BrickSet | null {
  if (brickCache) return brickCache;

  const S = 1024;            // 1024px across ~2 metres
  const PPM = S / 2;         // pixels per metre
  const BRICK_W = 0.215 * PPM;
  const BRICK_H = 0.065 * PPM;
  const JOINT = 0.01 * PPM;

  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const rough = mk();
  const ao = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  const o = ao.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !r || !o) return null;

  const rand = seededRandom(51423);

  // mortar ground: recessed, rough, occluded
  a.fillStyle = "#0a0a0b";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#4c4c4c";
  h.fillRect(0, 0, S, S);
  r.fillStyle = "#e0e0e0";     // mortar is matte
  r.fillRect(0, 0, S, S);
  o.fillStyle = "#7a7a7a";     // joints sit in shadow
  o.fillRect(0, 0, S, S);

  const courses = Math.ceil(S / (BRICK_H + JOINT));
  for (let row = 0; row < courses; row += 1) {
    const y = row * (BRICK_H + JOINT);
    // running bond: every other course offset by half a brick
    const offset = (row % 2) * ((BRICK_W + JOINT) / 2);
    for (let x = -BRICK_W; x < S + BRICK_W; x += BRICK_W + JOINT) {
      const bx = x + offset;
      const v = rand();

      // per-brick tone, kept inside the charcoal range
      const tone = 13 + Math.floor(v * 14);
      a.fillStyle = `rgb(${tone},${tone},${tone + 1})`;
      a.fillRect(bx, y, BRICK_W, BRICK_H);

      // brick faces stand proud of the mortar
      const hv = 196 + Math.floor(v * 26);
      h.fillStyle = `rgb(${hv},${hv},${hv})`;
      h.fillRect(bx, y, BRICK_W, BRICK_H);

      // face roughness varies brick to brick; all smoother than mortar
      const rv = 150 + Math.floor(v * 55);
      r.fillStyle = `rgb(${rv},${rv},${rv})`;
      r.fillRect(bx, y, BRICK_W, BRICK_H);

      // face is unoccluded except right at its edges
      o.fillStyle = "#ffffff";
      o.fillRect(bx + 1.5, y + 1.5, BRICK_W - 3, BRICK_H - 3);
      const g = o.createLinearGradient(bx, y, bx, y + BRICK_H);
      g.addColorStop(0, "rgba(0,0,0,0.34)");
      g.addColorStop(0.16, "rgba(0,0,0,0)");
      g.addColorStop(0.84, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.3)");
      o.fillStyle = g;
      o.fillRect(bx, y, BRICK_W, BRICK_H);

      // chipped top edge catches light
      a.fillStyle = "rgba(150,150,155,0.05)";
      a.fillRect(bx, y, BRICK_W, 1.2);
    }
  }

  // fine grain over everything so faces aren't plastic-flat
  const ai = a.getImageData(0, 0, S, S);
  const hi = h.getImageData(0, 0, S, S);
  const ri = r.getImageData(0, 0, S, S);
  for (let i = 0; i < ai.data.length; i += 4) {
    const n = (rand() - 0.5) * 11;
    ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + n));
    ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + n));
    ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + n));
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] =
      Math.max(0, Math.min(255, hi.data[i] + n * 1.6));
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] =
      Math.max(0, Math.min(255, ri.data[i] + n * 2));
  }
  a.putImageData(ai, 0, 0);
  h.putImageData(hi, 0, 0);
  r.putImageData(ri, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 4.2);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const aoMap = new THREE.CanvasTexture(ao);

  for (const t of [map, normalMap, roughnessMap, aoMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;   // shallow viewing angle down a long floor
  }
  brickCache = { map, normalMap, roughnessMap, aoMap };
  return brickCache;
}

const brickRepeatCache = new Map<string, BrickSet>();

export function blackBrickFor(rx: number, ry: number): BrickSet | null {
  const base = getBlackBrick();
  if (!base) return null;
  const key = `${Math.round(rx)}x${Math.round(ry)}`;
  const hit = brickRepeatCache.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set: BrickSet = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
    aoMap: clone(base.aoMap),
  };
  brickRepeatCache.set(key, set);
  return set;
}

let glowPanelCache: THREE.Texture | null = null;

/**
 * Futuristic wall text: thin luminous line-work rather than carved stone.
 *
 * Drawn as a transparent emissive overlay — bright glyph strokes, hairline
 * rules and small tick marks on a clear ground — so it reads as light
 * sitting on the surface rather than pigment printed into it. Characters
 * are deliberately abstract, and are drawn at two weights so the panel
 * has a foreground and a background layer.
 */
export function getGlowPanel(lines: string[]): THREE.Texture | null {
  if (glowPanelCache) return glowPanelCache;

  const W = 1024;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  const rand = seededRandom(8812);
  c.clearRect(0, 0, W, H);
  c.textBaseline = "alphabetic";

  const COLS = 3;
  const colW = W / COLS;

  for (let col = 0; col < COLS; col += 1) {
    const x0 = col * colW + 48;

    // a vertical hairline running the height of the column
    c.fillStyle = "rgba(255,182,63,0.28)";
    c.fillRect(x0 - 20, 40, 1.5, H - 80);
    // index ticks along it
    for (let ty = 60; ty < H - 50; ty += 46) {
      c.fillStyle = "rgba(255,200,110,0.48)";
      c.fillRect(x0 - 26, ty, 8, 1.5);
    }

    let y = 84;
    let li = col;
    while (y < H - 60) {
      const text = lines[li % lines.length].toUpperCase();
      li += 1;

      const lead = rand() > 0.68;
      const size = lead ? 22 : 16;
      c.font = `${lead ? 600 : 400} ${size}px "SF Mono", ui-monospace, Menlo, monospace`;

      // outer bloom, then the bright core: two passes make it read as glow
      // saturated amber halo around a near-white core: how a filament reads
      c.shadowColor = "rgba(255,150,30,0.95)";
      c.shadowBlur = lead ? 18 : 11;
      c.fillStyle = lead ? "rgba(255,243,212,0.96)" : "rgba(255,198,112,0.6)";

      let x = x0;
      for (const ch of text) {
        if (x > x0 + colW - 72) break;
        c.fillText(ch, x, y);
        x += c.measureText(ch).width + 3.2;
      }
      c.shadowBlur = 0;

      // an underscore rule beneath the lead lines
      if (lead) {
        c.fillStyle = "rgba(255,182,63,0.32)";
        c.fillRect(x0, y + 9, Math.min(x - x0, colW - 96), 1.2);
      }

      y += (lead ? 44 : 29) + rand() * 8;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  glowPanelCache = tex;
  return tex;
}

const collarCache = new Map<string, THREE.Texture>();

/**
 * The text band that wraps the collar of a display cylinder.
 *
 * Drawn wide and short so it maps cleanly around a cylinder's
 * circumference, with the phrase repeated and letter-spaced the way
 * retail display rings are set.
 */
export function getCollarBand(label: string): THREE.Texture | null {
  const hit = collarCache.get(label);
  if (hit) return hit;

  const W = 1024;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  c.clearRect(0, 0, W, H);
  c.textBaseline = "middle";
  c.font = '600 44px "SF Mono", ui-monospace, Menlo, monospace';

  const text = label.toUpperCase();
  const spaced = text.split("").join(" ");
  const gap = 90;
  const unit = c.measureText(spaced).width + gap;
  const copies = Math.max(2, Math.ceil(W / unit));

  c.shadowColor = "rgba(255,150,30,0.9)";
  c.shadowBlur = 14;
  c.fillStyle = "rgba(255,243,212,0.95)";
  for (let i = 0; i < copies; i += 1) {
    c.fillText(spaced, i * unit, H / 2);
  }
  c.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  collarCache.set(label, tex);
  return tex;
}

let vistaCache: THREE.Texture | null = null;

/**
 * The inscribed wall that closes the corridor.
 *
 * Opaque, and drawn on its own sand ground rather than on transparency:
 * as an additive overlay the script sat as a faint patch floating on the
 * wall, and only covered the part of the surface the panel spanned. Here
 * the whole canvas is the wall, so the text runs edge to edge.
 */
export function getVistaWall(lines: string[]): THREE.Texture | null {
  if (vistaCache) return vistaCache;

  const W = 1536;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  const rand = seededRandom(3141);

  // sand ground, with broad tonal drift so it is not a flat fill
  c.fillStyle = "#6d5c45";
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i += 1) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 90 + rand() * 260;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand() > 0.5;
    g.addColorStop(0, warm ? "rgba(160,138,104,0.22)" : "rgba(72,58,40,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // dense columns of script, edge to edge
  const COLS = 7;
  const colW = W / COLS;
  c.textBaseline = "alphabetic";

  for (let col = 0; col < COLS; col += 1) {
    const x0 = col * colW + 20;
    let y = 42 + rand() * 26;
    let li = col;

    while (y < H - 26) {
      const text = lines[li % lines.length].toUpperCase();
      li += 1;
      const lead = rand() > 0.72;
      const size = lead ? 21 : 15;
      c.font = `${lead ? 600 : 400} ${size}px "SF Mono", ui-monospace, Menlo, monospace`;

      let x = x0;
      for (const ch of text) {
        if (x > x0 + colW - 34) break;
        // cut into the stone: dark body with a light bevel above it
        c.fillStyle = "rgba(48,37,22,0.78)";
        c.fillText(ch, x, y);
        c.fillStyle = "rgba(246,226,186,0.4)";
        c.fillText(ch, x, y - 1.1);
        x += c.measureText(ch).width + 2.2;
      }

      if (lead) {
        c.fillStyle = "rgba(48,37,22,0.4)";
        c.fillRect(x0, y + 6, Math.min(x - x0, colW - 34), 1.2);
      }
      y += (lead ? 34 : 24) + rand() * 6;
    }

    if (col < COLS - 1) {
      c.fillStyle = "rgba(48,37,22,0.32)";
      c.fillRect((col + 1) * colW - 6, 16, 2, H - 32);
    }
  }

  // weathering
  const img = c.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n * 0.92));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.78));
  }
  c.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  vistaCache = tex;
  return tex;
}

let cladCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Smooth architectural cladding: large plain panels divided by hairline
 * recessed seams.
 *
 * The sand texture it replaces was heavy granular noise at close tiling,
 * which is exactly what reads as bare concrete. Here almost all the
 * surface is flat and quiet, and the only detail is the geometry of the
 * joint pattern — which is what modern cladding actually looks like, and
 * what lets a raking light draw a clean line instead of a gritty wash.
 */
export function getCladding() {
  if (cladCache) return cladCache;

  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const rough = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !r) return null;

  const rand = seededRandom(20260);

  // plain ground: one flat tone, deliberately featureless
  a.fillStyle = "#ffffff";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#c8c8c8";
  h.fillRect(0, 0, S, S);
  r.fillStyle = "#88888 8".replace(" ", "");
  r.fillRect(0, 0, S, S);

  // the panel grid: 2 rows of 3, so seams land at sensible intervals
  const ROWS = 2;
  const COLS = 3;
  const seam = 5;

  const drawSeam = (x: number, y: number, w: number, hh: number) => {
    // dark, recessed and slightly rougher than the panel face
    a.fillStyle = "rgba(96,82,60,0.55)";
    a.fillRect(x, y, w, hh);
    h.fillStyle = "#5a5a5a";
    h.fillRect(x, y, w, hh);
    r.fillStyle = "#c0c0c0";
    r.fillRect(x, y, w, hh);
    // a single bright pixel line on the lower lip, so the groove catches light
    a.fillStyle = "rgba(255,244,222,0.3)";
    a.fillRect(x, y + hh, w, 1.2);
  };

  for (let i = 0; i <= ROWS; i += 1) {
    drawSeam(0, (i * S) / ROWS - seam / 2, S, seam);
  }
  for (let i = 0; i <= COLS; i += 1) {
    drawSeam((i * S) / COLS - seam / 2, 0, seam, S);
  }

  // a faint per-panel tonal difference, so the grid is legible
  for (let ry = 0; ry < ROWS; ry += 1) {
    for (let cx = 0; cx < COLS; cx += 1) {
      const v = 0.028 + rand() * 0.03;
      a.fillStyle = rand() > 0.5
        ? `rgba(255,248,232,${v})`
        : `rgba(70,58,40,${v})`;
      a.fillRect((cx * S) / COLS, (ry * S) / ROWS, S / COLS, S / ROWS);
    }
  }

  /*
    Sandstone grain across the panel faces.

    The panels were left almost featureless to stop them reading as raw
    concrete, but with no grain at all they read as painted board instead.
    Two octaves of wrapped value noise plus per-pixel speckle put the
    stone back without returning to the heavy tiling noise that caused
    the original problem — and crucially the same field is written into
    the HEIGHT map, so the grain catches raking light rather than being a
    printed pattern.
  */
  const lattice = (period: number) => {
    const n = Math.max(2, Math.floor(S / period));
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i += 1) g[i] = rand();
    return (x: number, y: number) => {
      const fx = (x / period) % n;
      const fy = (y / period) % n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = (x0 + 1) % n;
      const y1 = (y0 + 1) % n;
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const p0 = g[y0 * n + x0] * (1 - sx) + g[y0 * n + x1] * sx;
      const p1 = g[y1 * n + x0] * (1 - sx) + g[y1 * n + x1] * sx;
      return p0 * (1 - sy) + p1 * sy;
    };
  };
  const coarse = lattice(26);
  const fine = lattice(6);

  const ai = a.getImageData(0, 0, S, S);
  const hi = h.getImageData(0, 0, S, S);
  const ri = r.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      const grain =
        (coarse(x, y) - 0.5) * 17 + (fine(x, y) - 0.5) * 13 + (rand() - 0.5) * 9;
      ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + grain));
      ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + grain * 0.94));
      ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + grain * 0.82));
      // relief, so the grain is lit rather than drawn
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = Math.max(
        0,
        Math.min(255, hi.data[i] + grain * 1.5),
      );
      // porous stone scatters unevenly
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.max(
        0,
        Math.min(255, ri.data[i] + grain * 1.8),
      );
    }
  }
  a.putImageData(ai, 0, 0);
  h.putImageData(hi, 0, 0);
  r.putImageData(ri, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 3.4);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  cladCache = { map, normalMap, roughnessMap };
  return cladCache;
}

const cladRepeatCache = new Map<string, NonNullable<ReturnType<typeof getCladding>>>();

export function claddingFor(rx: number, ry: number) {
  const base = getCladding();
  if (!base) return null;
  const key = `${Math.round(rx * 2) / 2}x${Math.round(ry * 2) / 2}`;
  const hit = cladRepeatCache.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
  };
  cladRepeatCache.set(key, set);
  return set;
}

let metalGlassCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; metalnessMap: THREE.Texture } | null = null;

/**
 * Metal-and-glass floor: dark polished panels set in a metal frame grid.
 *
 * The realism here comes from the maps disagreeing with each other, the
 * way a real composite surface does. The glass panels are smooth, dark
 * and fully non-metal; the frames between them are lighter, rougher and
 * fully metal. A single uniform material cannot do that, which is why a
 * one-material floor always reads as plastic.
 */
export function getMetalGlassFloor() {
  if (metalGlassCache) return metalGlassCache;

  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const rough = mk();
  const metal = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  const mt = metal.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !r || !mt) return null;

  const rand = seededRandom(77120);

  // ---- the metal frame is the ground layer ----
  // dark gunmetal rather than pale steel: the floor is meant to be the
  // darkest plane in the hall, so the sand walls stay the lighter one
  a.fillStyle = "#121215";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#d2d2d2";   // frame stands slightly proud
  h.fillRect(0, 0, S, S);
  r.fillStyle = "#a8a8a8";   // quite rough: a dull sheen, never a mirror
  r.fillRect(0, 0, S, S);
  mt.fillStyle = "#ffffff";  // fully metal
  mt.fillRect(0, 0, S, S);

  // brushed grain along the frame
  for (let i = 0; i < 2600; i += 1) {
    const y = rand() * S;
    a.fillStyle = `rgba(190,198,210,${0.008 + rand() * 0.014})`;
    a.fillRect(0, y, S, 0.6);
  }

  // ---- glass panels inset into it ----
  const GRID = 2;
  const cell = S / GRID;
  const frame = 16;

  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const x = gx * cell + frame;
      const y = gy * cell + frame;
      const w = cell - frame * 2;
      const hh = cell - frame * 2;

      // black glass, with only a hair of variation between panes
      const tint = 2 + Math.floor(rand() * 3);
      a.fillStyle = `rgb(${tint},${tint},${tint + 2})`;
      a.fillRect(x, y, w, hh);
      // recessed below the frame
      h.fillStyle = "#8e8e8e";
      h.fillRect(x, y, w, hh);
      // smooth: this is what makes it reflect
      r.fillStyle = "#1e1e1e";
      r.fillRect(x, y, w, hh);
      // glass is a dielectric, so not metal at all
      mt.fillStyle = "#000000";
      mt.fillRect(x, y, w, hh);

      // a soft sheen band across each pane, as glass picks up the room
      const g = a.createLinearGradient(x, y, x + w, y + hh);
      g.addColorStop(0, "rgba(180,196,214,0.05)");
      g.addColorStop(0.45, "rgba(180,196,214,0.015)");
      g.addColorStop(1, "rgba(180,196,214,0.045)");
      a.fillStyle = g;
      a.fillRect(x, y, w, hh);

      // bevel: bright top edge, dark bottom edge
      a.fillStyle = "rgba(226,236,248,0.1)";
      a.fillRect(x, y, w, 2);
      a.fillStyle = "rgba(0,0,0,0.4)";
      a.fillRect(x, y + hh - 2, w, 2);
      h.fillStyle = "#6a6a6a";
      h.fillRect(x - 2, y - 2, w + 4, 3);
      h.fillRect(x - 2, y + hh - 1, w + 4, 3);
    }
  }

  // fine wear on everything, so nothing is mathematically perfect
  const ai = a.getImageData(0, 0, S, S);
  const ri = r.getImageData(0, 0, S, S);
  for (let i = 0; i < ai.data.length; i += 4) {
    const n = (rand() - 0.5) * 7;
    ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + n));
    ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + n));
    ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + n));
    // roughness varies more than colour does: smudges, not stains
    const rn = ri.data[i] + (rand() - 0.5) * 16;
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.max(0, Math.min(255, rn));
  }
  a.putImageData(ai, 0, 0);
  r.putImageData(ri, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 3);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const metalnessMap = new THREE.CanvasTexture(metal);

  for (const t of [map, normalMap, roughnessMap, metalnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  metalGlassCache = { map, normalMap, roughnessMap, metalnessMap };
  return metalGlassCache;
}

const mgRepeatCache = new Map<string, NonNullable<ReturnType<typeof getMetalGlassFloor>>>();

export function metalGlassFor(rx: number, ry: number) {
  const base = getMetalGlassFloor();
  if (!base) return null;
  const key = `${Math.round(rx * 2) / 2}x${Math.round(ry * 2) / 2}`;
  const hit = mgRepeatCache.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
    metalnessMap: clone(base.metalnessMap),
  };
  mgRepeatCache.set(key, set);
  return set;
}

let slabCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Large honed stone slabs.
 *
 * Replaces the tile grid. The previous floor put a hard joint every 1.7m
 * and the eye went straight to it — a grid is a pattern, and a pattern
 * competes with whatever you are meant to be looking at. Here the joints
 * are rare, barely darker than the stone, and carry no bevel or
 * highlight, so the floor reads as surface rather than structure.
 */
export function getStoneSlab() {
  if (slabCache) return slabCache;

  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const rough = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !r) return null;

  const rand = seededRandom(51900);

  a.fillStyle = "#262322";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#b4b4b4";
  h.fillRect(0, 0, S, S);
  r.fillStyle = "#5a5a5a"; // honed: soft sheen, not gloss
  r.fillRect(0, 0, S, S);

  // cloudy tonal drift, the way a cut stone face varies across a slab
  for (let i = 0; i < 44; i += 1) {
    const x = rand() * S;
    const y = rand() * S;
    const rad = 100 + rand() * 340;
    const g = a.createRadialGradient(x, y, 0, x, y, rad);
    const lighter = rand() > 0.5;
    g.addColorStop(0, lighter ? "rgba(84,79,74,0.3)" : "rgba(12,11,11,0.32)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    a.fillStyle = g;
    a.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // faint veining, drawn soft so it never reads as a crack
  for (let i = 0; i < 7; i += 1) {
    let x = rand() * S;
    let y = -20;
    a.beginPath();
    a.moveTo(x, y);
    while (y < S + 20) {
      const cx = x + (rand() - 0.5) * 210;
      const cy = y + 80 + rand() * 120;
      const nx = x + (rand() - 0.5) * 240;
      const ny = cy + 50 + rand() * 90;
      a.quadraticCurveTo(cx, cy, nx, ny);
      x = nx;
      y = ny;
    }
    a.strokeStyle = `rgba(112,106,98,${0.05 + rand() * 0.05})`;
    a.lineWidth = 1 + rand() * 2.4;
    a.stroke();
  }

  // ONE joint per axis per tile: slabs are large, so seams are rare
  const joint = 2.2;
  a.fillStyle = "rgba(14,13,13,0.5)";
  a.fillRect(0, S / 2 - joint / 2, S, joint);
  a.fillRect(S / 2 - joint / 2, 0, joint, S);
  h.fillStyle = "#96969 6".replace(" ", "");
  h.fillRect(0, S / 2 - joint / 2, S, joint);
  h.fillRect(S / 2 - joint / 2, 0, joint, S);

  // polish wear: roughness varies far more than colour does
  const ri = r.getImageData(0, 0, S, S);
  for (let i = 0; i < ri.data.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    const v = Math.max(0, Math.min(255, ri.data[i] + n));
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = v;
  }
  r.putImageData(ri, 0, 0);

  const ai = a.getImageData(0, 0, S, S);
  for (let i = 0; i < ai.data.length; i += 4) {
    const n = (rand() - 0.5) * 6;
    ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + n));
    ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + n));
    ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + n));
  }
  a.putImageData(ai, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 1.1);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  slabCache = { map, normalMap, roughnessMap };
  return slabCache;
}

const slabRepeatCache = new Map<string, NonNullable<ReturnType<typeof getStoneSlab>>>();

export function stoneSlabFor(rx: number, ry: number) {
  const base = getStoneSlab();
  if (!base) return null;
  const key = `${Math.round(rx * 2) / 2}x${Math.round(ry * 2) / 2}`;
  const hit = slabRepeatCache.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
  };
  slabRepeatCache.set(key, set);
  return set;
}

let smudgeCache: THREE.Texture | null = null;

/**
 * A roughness map for glass: fingerprints, wipe marks and dust.
 *
 * Perfectly smooth glass reflects as one unbroken sheet, which is what
 * makes a rendered pane look like flat tinted plastic. Varying roughness
 * across the surface breaks those reflections up, and that variation is
 * what the eye actually reads as "glass".
 */
export function getGlassSmudge(): THREE.Texture | null {
  if (smudgeCache) return smudgeCache;

  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  const rand = seededRandom(60217);

  // mostly clean: dark here means smooth
  c.fillStyle = "#1a1a1a";
  c.fillRect(0, 0, S, S);

  // broad wipe arcs, as left by a cloth
  for (let i = 0; i < 9; i += 1) {
    const cx = rand() * S;
    const cy = rand() * S;
    const r = 70 + rand() * 170;
    const g = c.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
    g.addColorStop(0, `rgba(150,150,150,${0.05 + rand() * 0.07})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // fingerprints: small clusters of concentric arcs
  for (let i = 0; i < 5; i += 1) {
    const cx = rand() * S;
    const cy = rand() * S;
    c.save();
    c.translate(cx, cy);
    c.rotate(rand() * Math.PI);
    for (let k = 0; k < 7; k += 1) {
      c.beginPath();
      c.ellipse(0, 0, 5 + k * 2.4, 7 + k * 3.1, 0, 0.6, Math.PI * 1.5);
      c.strokeStyle = `rgba(190,190,190,${0.1 + rand() * 0.08})`;
      c.lineWidth = 1.1;
      c.stroke();
    }
    c.restore();
  }

  // settled dust
  for (let i = 0; i < 900; i += 1) {
    c.fillStyle = `rgba(210,210,210,${0.03 + rand() * 0.07})`;
    c.fillRect(rand() * S, rand() * S, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  smudgeCache = tex;
  return tex;
}

let brushedCache: { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture } | null = null;

/**
 * Brushed metal for plinths and rails.
 *
 * The grain runs in one direction only, which is the whole point: a
 * brushed surface stretches every reflection along the brush axis, and
 * that anisotropy is what the eye reads as machined metal. Isotropic
 * noise just looks dirty.
 */
export function getBrushedMetal() {
  if (brushedCache) return brushedCache;

  const S = 512;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const rough = mk();
  const heightC = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  if (!a || !r || !h) return null;

  const rand = seededRandom(31007);

  a.fillStyle = "#ffffff";
  a.fillRect(0, 0, S, S);
  r.fillStyle = "#6a6a6a";
  r.fillRect(0, 0, S, S);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, S, S);

  // long fine strokes along one axis
  for (let i = 0; i < 4200; i += 1) {
    const y = rand() * S;
    const len = 60 + rand() * 300;
    const x = rand() * S;
    const v = rand();
    a.fillStyle = `rgba(${v > 0.5 ? "255,252,244" : "120,112,98"},${0.02 + rand() * 0.05})`;
    a.fillRect(x, y, len, 0.7);
    const rv = Math.floor(70 + v * 90);
    r.fillStyle = `rgba(${rv},${rv},${rv},${0.12 + rand() * 0.2})`;
    r.fillRect(x, y, len, 0.8);
    const hv = Math.floor(118 + v * 26);
    h.fillStyle = `rgba(${hv},${hv},${hv},0.5)`;
    h.fillRect(x, y, len, 0.7);
  }

  // faint machining bands, so it is not uniform across the piece
  for (let i = 0; i < 16; i += 1) {
    const y = rand() * S;
    const g = a.createLinearGradient(0, y - 12, 0, y + 12);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, `rgba(255,248,232,${0.02 + rand() * 0.03})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    a.fillStyle = g;
    a.fillRect(0, y - 12, S, 24);
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const normalMap = heightToNormal(heightC, 1.1);
  if (!normalMap) return null;

  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.needsUpdate = true;
  }
  brushedCache = { map, roughnessMap, normalMap };
  return brushedCache;
}

const brushedRepeat = new Map<string, NonNullable<ReturnType<typeof getBrushedMetal>>>();

export function brushedMetalFor(rx: number, ry: number) {
  const base = getBrushedMetal();
  if (!base) return null;
  const key = `${Math.round(rx * 2) / 2}x${Math.round(ry * 2) / 2}`;
  const hit = brushedRepeat.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set = {
    map: clone(base.map),
    roughnessMap: clone(base.roughnessMap),
    normalMap: clone(base.normalMap),
  };
  brushedRepeat.set(key, set);
  return set;
}

let contactCache: THREE.Texture | null = null;

/**
 * A soft radial falloff, used as an ambient-occlusion decal under
 * furniture.
 *
 * Shadow maps cannot resolve the tight dark line where an object meets
 * the floor: it falls below the resolution of the map, so the object
 * ends up looking like it hovers. A painted contact shadow fills exactly
 * that gap, which is why real-time renderers ship one regardless of how
 * good their shadows are.
 */
export function getContactShadow(): THREE.Texture | null {
  if (contactCache) return contactCache;

  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  const g = c.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(0.78, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  // used as an alpha source on a black plane
  tex.colorSpace = THREE.NoColorSpace;
  contactCache = tex;
  return tex;
}


type RuneSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  emissiveMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};
let runeCache: RuneSet | null = null;

/**
 * Engraved circuitry for the portal doors: part rune, part trace.
 *
 * The reference works because the pattern is cut INTO dark stone and
 * only the channel glows — not the whole surface. Three maps carry that
 * separately, and keeping them separate is the whole trick:
 *
 *  - height  : the channel is sunk, so the normal map gives every trace a
 *              real lip that catches raking light even where it is unlit
 *  - albedo  : dark stone, barely varying; the pattern is legible from
 *              its geometry rather than its colour
 *  - emissive: the channels ONLY, so light appears down in the cut
 *              instead of washing across the face
 *
 * The geometry is drawn as axis-aligned runs with 45-degree elbows and a
 * node at every terminus, which is what separates circuitry from
 * ornament: it looks routed rather than composed.
 */
export function getRuneCircuit(): RuneSet | null {
  if (runeCache) return runeCache;

  const S = 1024;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    return c;
  };
  const albedo = mk();
  const heightC = mk();
  const emissive = mk();
  const rough = mk();
  const a = albedo.getContext("2d", { willReadFrequently: true });
  const h = heightC.getContext("2d", { willReadFrequently: true });
  const e = emissive.getContext("2d", { willReadFrequently: true });
  const r = rough.getContext("2d", { willReadFrequently: true });
  if (!a || !h || !e || !r) return null;

  const rand = seededRandom(44021);

  // the stone the pattern is cut into
  a.fillStyle = "#1b1712";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#c8c8c8"; // the face stands high; channels cut down
  h.fillRect(0, 0, S, S);
  e.fillStyle = "#000000"; // nothing glows until a channel is cut
  e.fillRect(0, 0, S, S);
  r.fillStyle = "#b4b4b4";
  r.fillRect(0, 0, S, S);

  const setStroke = (ctx: CanvasRenderingContext2D, style: string, w: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
  };

  /** Draws one routed run into all four maps at once. */
  const route = (x0: number, y0: number, steps: number, w: number) => {
    const pts: [number, number][] = [[x0, y0]];
    let x = x0;
    let y = y0;
    let dir = Math.floor(rand() * 4);

    for (let i = 0; i < steps; i += 1) {
      const len = 22 + rand() * 78;
      // mostly continue, sometimes turn a right angle
      if (rand() > 0.62) dir = (dir + (rand() > 0.5 ? 1 : 3)) % 4;
      if (dir === 0) x += len;
      else if (dir === 1) y += len;
      else if (dir === 2) x -= len;
      else y -= len;

      // a 45-degree elbow now and then, as a router does
      if (rand() > 0.82) {
        const d = 16 + rand() * 22;
        x += dir % 2 === 0 ? 0 : d * (rand() > 0.5 ? 1 : -1);
        y += dir % 2 === 0 ? d * (rand() > 0.5 ? 1 : -1) : 0;
      }
      pts.push([x, y]);
    }

    const passes: [CanvasRenderingContext2D, string, number][] = [
      // the cut: dark and sunk
      [h, "#5e5e5e", w + 2],
      [a, "#0d0b08", w + 1.5],
      // rougher inside the channel than on the polished face
      [r, "#e0e0e0", w + 1.5],
      // and the light that lives down in it
      [e, "#ffffff", Math.max(1.2, w - 1.4)],
    ];

    for (const [ctx, style, lw] of passes) {
      setStroke(ctx, style, lw);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    // a node at each end, and occasionally along the run
    for (const [px, py] of [pts[0], pts[pts.length - 1]]) {
      const rad = 4 + rand() * 5;
      h.fillStyle = "#4a4a4a";
      h.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      a.fillStyle = "#0a0806";
      a.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      e.fillStyle = "#ffffff";
      e.fillRect(px - rad + 1.5, py - rad + 1.5, rad * 2 - 3, rad * 2 - 3);
    }
  };

  // a dense field of routed traces
  for (let i = 0; i < 46; i += 1) {
    route(rand() * S, rand() * S, 3 + Math.floor(rand() * 5), 3 + rand() * 3);
  }
  // finer traces filling the gaps between them
  for (let i = 0; i < 70; i += 1) {
    route(rand() * S, rand() * S, 2 + Math.floor(rand() * 3), 1.6 + rand() * 1.4);
  }

  // concentric border frames, the way the reference bands its panels
  for (const inset of [26, 44, 62]) {
    const passes: [CanvasRenderingContext2D, string, number][] = [
      [h, "#5a5a5a", 7],
      [a, "#0d0b08", 6],
      [r, "#e0e0e0", 6],
      [e, "#ffffff", 2.4],
    ];
    for (const [ctx, style, lw] of passes) {
      setStroke(ctx, style, lw);
      ctx.strokeRect(inset, inset, S - inset * 2, S - inset * 2);
    }
  }

  // rune blocks: short glyph-like marks set along the borders
  for (let i = 0; i < 64; i += 1) {
    const onTop = rand() > 0.5;
    const x = 70 + rand() * (S - 140);
    const y = onTop ? 34 + rand() * 18 : S - 52 + rand() * 18;
    const w = 6 + rand() * 12;
    const hh = 10 + rand() * 12;
    h.fillStyle = "#565656";
    h.fillRect(x, y, w, hh);
    a.fillStyle = "#0d0b08";
    a.fillRect(x, y, w, hh);
    e.fillStyle = "#ffffff";
    e.fillRect(x + 1.2, y + 1.2, w - 2.4, hh - 2.4);
  }

  // weathering on the stone face only
  const ai = a.getImageData(0, 0, S, S);
  for (let i = 0; i < ai.data.length; i += 4) {
    const n = (rand() - 0.5) * 11;
    ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + n));
    ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + n * 0.94));
    ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + n * 0.86));
  }
  a.putImageData(ai, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = heightToNormal(heightC, 4.6);
  if (!normalMap) return null;
  const emissiveMap = new THREE.CanvasTexture(emissive);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);

  for (const t of [map, normalMap, emissiveMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.needsUpdate = true;
  }
  runeCache = { map, normalMap, emissiveMap, roughnessMap };
  return runeCache;
}

const runeRepeat = new Map<string, RuneSet>();

export function runeCircuitFor(rx: number, ry: number): RuneSet | null {
  const base = getRuneCircuit();
  if (!base) return null;
  const key = String(Math.round(rx * 4) / 4) + "x" + String(Math.round(ry * 4) / 4);
  const hit = runeRepeat.get(key);
  if (hit) return hit;
  const clone = (t: THREE.Texture) => {
    const x = t.clone();
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.repeat.set(rx, ry);
    x.needsUpdate = true;
    return x;
  };
  const set: RuneSet = {
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    emissiveMap: clone(base.emissiveMap),
    roughnessMap: clone(base.roughnessMap),
  };
  runeRepeat.set(key, set);
  return set;
}

let burstCache: THREE.Texture | null = null;

/**
 * The energy breaking out of the seam.
 *
 * This is the element that makes the reference read as a door with
 * something alive behind it. Even engraving across the whole leaf says
 * "decorated"; traces that ERUPT from one edge and die out across the
 * face say "the light is coming through, and the door is conducting it".
 *
 * Two things produce that:
 *
 *  - every run starts at the seam edge and walks outward, so the whole
 *    pattern has a direction
 *  - a distance mask multiplies everything down as it travels, so the
 *    traces are white-hot at the crack and gone by mid-panel
 *
 * Drawn for the RIGHT leaf (seam on the left edge); the left leaf uses
 * the same texture mirrored.
 */
export function getSeamBurst(): THREE.Texture | null {
  if (burstCache) return burstCache;

  const W = 512;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  const rand = seededRandom(90731);

  c.clearRect(0, 0, W, H);
  c.lineCap = "square";
  c.lineJoin = "miter";

  /** One angular run, walking away from the seam at x = 0. */
  const run = (y0: number, reach: number, width: number, bright: number) => {
    let x = 2;
    let y = y0;
    const pts: [number, number][] = [[x, y]];

    while (x < reach) {
      // mostly outward, sometimes a right-angle jog along the seam
      const mode = rand();
      const step = 16 + rand() * 46;
      if (mode < 0.58) x += step;
      else if (mode < 0.79) y += step * (rand() > 0.5 ? 1 : -1);
      else {
        // a 45-degree diagonal, which is what makes it read as routed
        const d = step * 0.7;
        x += d;
        y += d * (rand() > 0.5 ? 1 : -1);
      }
      pts.push([x, y]);
    }

    // glow pass then core pass: a hot centre inside a soft halo
    for (const [style, lw, blur] of [
      ["rgba(255,214,150," + bright * 0.5 + ")", width * 3.4, 14],
      ["rgba(255,236,200," + bright * 0.85 + ")", width * 1.7, 6],
      ["rgba(255,252,240," + bright + ")", width, 0],
    ] as const) {
      c.strokeStyle = style;
      c.lineWidth = lw;
      c.shadowBlur = blur;
      c.shadowColor = "rgba(255,190,90,0.9)";
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    }
    c.shadowBlur = 0;

    // a node where the run terminates
    const [ex, ey] = pts[pts.length - 1];
    const rad = 3 + rand() * 4;
    c.fillStyle = "rgba(255,248,225," + bright + ")";
    c.fillRect(ex - rad, ey - rad, rad * 2, rad * 2);
  };

  // long primary runs, spread up the height of the leaf
  for (let i = 0; i < 16; i += 1) {
    const y = 40 + (i / 15) * (H - 80) + (rand() - 0.5) * 30;
    run(y, W * (0.34 + rand() * 0.5), 2.4 + rand() * 1.8, 0.85 + rand() * 0.15);
  }
  // short secondary runs filling between them
  for (let i = 0; i < 26; i += 1) {
    run(rand() * H, W * (0.1 + rand() * 0.22), 1.2 + rand() * 1.2, 0.5 + rand() * 0.3);
  }

  /*
    The distance mask. Everything fades as it travels from the seam, so
    the eruption has a falloff instead of tiling evenly across the panel.
  */
  const img = c.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const t = x / W;
      // hot for the first tenth, then a steep decay
      const fall = t < 0.1 ? 1 : Math.max(0, Math.pow(1 - (t - 0.1) / 0.9, 2.1));
      img.data[i + 3] = Math.round(img.data[i + 3] * fall);
    }
  }
  c.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  burstCache = tex;
  return tex;
}
