import * as THREE from "three";
import { seededRandom } from "./rand";

let marbleCache: THREE.Texture | null = null;

/**
 * Dark polished marble with pale veining, as in the reference halls.
 * Veins are drawn as tapering bezier runs rather than noise so they read
 * as stone rather than static.
 */
export function getMarble(): THREE.Texture | null {
  if (marbleCache) return marbleCache;

  const size = 512;
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

/**
 * Sobel-derive a tangent-space normal map from a height/bump canvas.
 * Cheaper than shipping an image and keeps the surface detail coherent
 * with the colour map it came from.
 */
/**
 * NOTE ON TEXTURE SIZE
 *
 * The generators in this file build their canvases at 512, not 1024.
 *
 * Fourteen of them were a megapixel each, and every one is filled by
 * per-pixel JavaScript — drawing loops, getImageData, a Sobel pass —
 * on the main thread, in the frame the scene mounts. Measured, that one
 * frame took 5.4 seconds.
 *
 * Halving the side quarters the work and quarters the VRAM. Nothing
 * here is read at its own scale: these are tiling surfaces on walls,
 * floors and ceilings seen at a distance with `repeat` applied, so the
 * texel density that actually reaches the screen is set by the tiling,
 * not by the canvas.
 */

/**
 * Derive a tangent-space normal map from a height map.
 *
 * Two things here are about cost, not looks, because this runs eleven
 * times on the main thread while the loading veil is up and the page
 * cannot paint until it finishes.
 *
 * It derives at 512 at most. A normal map carries far lower frequencies
 * than the albedo it accompanies, so halving a 1024 source is invisible
 * on a wall while cutting the work to a quarter.
 *
 * And the neighbour lookups are plain array reads. This used to call a
 * closure doing two modulos per sample, eight samples per pixel — about
 * seventeen million modulo operations per texture. The wrapped column
 * indices are computed once per row instead.
 */
function heightToNormal(src: HTMLCanvasElement, strength = 2.2): THREE.Texture | null {
  const MAX = 512;
  let source = src;
  if (src.width > MAX || src.height > MAX) {
    const small = document.createElement("canvas");
    small.width = Math.min(MAX, src.width);
    small.height = Math.min(MAX, src.height);
    const sc = small.getContext("2d", { willReadFrequently: true });
    if (sc) {
      sc.drawImage(src, 0, 0, small.width, small.height);
      source = small;
    }
  }

  const w = source.width;
  const h = source.height;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  const hd = sctx.getImageData(0, 0, w, h).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  const img = octx.createImageData(w, h);
  const od = img.data;

  // wrapped neighbours, resolved once rather than per sample
  const xm = new Int32Array(w);
  const xp = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    xm[x] = x === 0 ? w - 1 : x - 1;
    xp[x] = x === w - 1 ? 0 : x + 1;
  }

  for (let y = 0; y < h; y += 1) {
    const rowUp = (y === 0 ? h - 1 : y - 1) * w;
    const row = y * w;
    const rowDown = (y === h - 1 ? 0 : y + 1) * w;

    for (let x = 0; x < w; x += 1) {
      const a = xm[x];
      const b = xp[x];

      const tl = hd[(rowUp + a) * 4];
      const tc = hd[(rowUp + x) * 4];
      const tr = hd[(rowUp + b) * 4];
      const ml = hd[(row + a) * 4];
      const mr = hd[(row + b) * 4];
      const bl = hd[(rowDown + a) * 4];
      const bc = hd[(rowDown + x) * 4];
      const br = hd[(rowDown + b) * 4];

      const dx = (tl + 2 * ml + bl - (tr + 2 * mr + br)) / 255;
      const dy = (tl + 2 * tc + tr - (bl + 2 * bc + br)) / 255;

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;

      const i = (row + x) * 4;
      od[i] = (nx * 0.5 + 0.5) * 255;
      od[i + 1] = (ny * 0.5 + 0.5) * 255;
      od[i + 2] = (nz / len) * 0.5 * 255 + 127;
      od[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
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

  const S = 512;            // 1024px across ~2 metres
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

  const S = 512;
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


let poolCache: THREE.Texture | null = null;

/**
 * Lamplight spilled on a floor: brightest at its middle and fading the
 * whole way out, with no flat bright centre and no edge. The contact
 * shadow's mask holds full strength over its middle, which is right for
 * a shadow under a case but drew a hard bright ellipse when used for
 * light.
 */
export function getLightPool(): THREE.Texture | null {
  if (poolCache) return poolCache;
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // close to a gaussian: it falls away from the very middle and is gone well before the edge
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.78)");
  g.addColorStop(0.42, "rgba(255,255,255,0.42)");
  g.addColorStop(0.64, "rgba(255,255,255,0.16)");
  g.addColorStop(0.84, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  poolCache = tex;
  return tex;
}

let plasterCache: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/**
 * Sandstone plaster for the rooms: one continuous surface.
 *
 * The cladding it replaces is a grid of large panels with dark recessed
 * seams, and in a room that grid was the busiest thing in the frame -
 * louder than anything on show. This is laid in long shallow courses, with
 * joints so soft they only appear where light rakes across them, and the
 * stone itself carries the interest: a slow mottle, a finer grain, and a
 * little difference from one block to the next. The relief is low, so it
 * reads as dressed stone under a lamp rather than as tiles.
 *
 * One tile covers PLASTER_TILE world units: six courses of two blocks.
 */
export const PLASTER_TILE = 4.8;

export function getPlaster() {
  if (plasterCache) return plasterCache;

  const S = 512;
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

  const rand = seededRandom(48213);

  a.fillStyle = "#ffffff";
  a.fillRect(0, 0, S, S);
  h.fillStyle = "#c8c8c8";
  h.fillRect(0, 0, S, S);
  // matte: ~0.9 once the material's own roughness multiplies it
  r.fillStyle = "#f2f2f2";
  r.fillRect(0, 0, S, S);

  const COURSES = 6;
  const BLOCKS = 2;
  const courseH = S / COURSES;
  const blockW = S / BLOCKS;

  // a faint difference from block to block, so the coursing is felt more than seen
  for (let row = 0; row < COURSES; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockW / 2;
    for (let col = -1; col <= BLOCKS; col += 1) {
      const v = 0.012 + rand() * 0.022;
      a.fillStyle = rand() > 0.5 ? `rgba(255,246,228,${v})` : `rgba(74,60,42,${v})`;
      a.fillRect(col * blockW + offset, row * courseH, blockW, courseH);
    }
  }

  // the joints: thin, soft, barely darker, and only a whisper of depth
  const soft = (ctx: CanvasRenderingContext2D) => {
    ctx.filter = "blur(1.4px)";
  };
  for (const ctx of [a, h]) soft(ctx);
  const joint = (x: number, y: number, w: number, hh: number) => {
    a.fillStyle = "rgba(92,76,54,0.16)";
    a.fillRect(x, y, w, hh);
    h.fillStyle = "#a9a9a9";
    h.fillRect(x, y, w, hh);
  };
  for (let row = 0; row <= COURSES; row += 1) joint(0, row * courseH - 1.5, S, 3);
  for (let row = 0; row < COURSES; row += 1) {
    const offset = row % 2 === 0 ? 0 : blockW / 2;
    for (let col = 0; col <= BLOCKS; col += 1) {
      joint(col * blockW + offset - 1.5, row * courseH, 3, courseH);
    }
  }
  for (const ctx of [a, h]) ctx.filter = "none";

  /*
    The stone: a slow mottle, a medium cloud and a fine grain, all of it
    wrapped so the tile repeats without a seam. Written into the height and
    roughness as well, at lower strength, so the grain is lit rather than
    printed.
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
  const slow = lattice(128);
  const cloud = lattice(32);
  const fine = lattice(5);

  const ai = a.getImageData(0, 0, S, S);
  const hi = h.getImageData(0, 0, S, S);
  const ri = r.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      const tone = (slow(x, y) - 0.5) * 16 + (cloud(x, y) - 0.5) * 9;
      const grain = (fine(x, y) - 0.5) * 8 + (rand() - 0.5) * 6;
      const v = tone + grain;
      ai.data[i] = Math.max(0, Math.min(255, ai.data[i] + v));
      ai.data[i + 1] = Math.max(0, Math.min(255, ai.data[i + 1] + v * 0.95));
      ai.data[i + 2] = Math.max(0, Math.min(255, ai.data[i + 2] + v * 0.84));
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = Math.max(0, Math.min(255, hi.data[i] + grain * 0.9));
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.max(0, Math.min(255, ri.data[i] + grain * 1.2 - tone * 0.4));
    }
  }
  a.putImageData(ai, 0, 0);
  h.putImageData(hi, 0, 0);
  r.putImageData(ri, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  // low relief: soft joints and grain, not tile edges
  const normalMap = heightToNormal(heightC, 1.4);
  if (!normalMap) return null;
  const roughnessMap = new THREE.CanvasTexture(rough);

  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
  }
  plasterCache = { map, normalMap, roughnessMap };
  return plasterCache;
}

const plasterRepeatCache = new Map<string, NonNullable<ReturnType<typeof getPlaster>>>();

/** The plaster set tiled for a surface `rx` by `ry` tiles across. Shared per tiling; never disposed. */
export function plasterFor(rx: number, ry: number) {
  const base = getPlaster();
  if (!base) return null;
  const key = `${Math.round(rx * 4) / 4}x${Math.round(ry * 4) / 4}`;
  const hit = plasterRepeatCache.get(key);
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
  plasterRepeatCache.set(key, set);
  return set;
}
