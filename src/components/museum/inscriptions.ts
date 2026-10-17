import * as THREE from "three";

/*
  Lettering cut in stone and gilded, for the inscriptions over the doors
  and the numerals on their medallions.

  The letters are Roman capitals in the site's Garamond, widely spaced,
  the way names are cut over the doors of a gallery. Each one is drawn as
  a V-cut would look under light from above: the upper face of the cut in
  shadow, the lower face catching the light, and the gold laid in the
  groove. On a stone tablet, in a metal material, that reads as gilt in a
  cut rather than as print on a surface.

  The face comes from the page's own CSS (next/font names it at build
  time), so the canvas waits for it to load and draws again once it has;
  the texture object stays the same throughout, so nothing that uses it
  has to change.
*/

/** The family next/font registered for a CSS variable, with a fallback. */
function cssFace(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

type Lettering = {
  /** Canvas size in pixels. */
  width: number;
  height: number;
  /** Cap height of the letters, in pixels. */
  cap: number;
  /** Extra space between letters, as a fraction of the cap height. */
  tracking?: number;
  weight?: number;
};

function draw(canvas: HTMLCanvasElement, text: string, opts: Lettering, family: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height, cap, tracking = 0.22, weight = 600 } = opts;
  ctx.clearRect(0, 0, width, height);
  // a Garamond's capitals stand about 0.66 of the body
  const size = cap / 0.66;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "alphabetic";
  const chars = [...text];
  const gap = cap * tracking;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  // shrink to fit, keeping a margin either side
  const fit = Math.min(1, (width * 0.9) / total);
  if (fit < 1) ctx.font = `${weight} ${size * fit}px ${family}`;
  const baseline = height / 2 + (cap * fit) / 2;
  let x = (width - total * fit) / 2;
  const gold = ctx.createLinearGradient(0, baseline - cap * fit, 0, baseline);
  gold.addColorStop(0, "#fae2a0");
  gold.addColorStop(0.55, "#d8aa48");
  gold.addColorStop(1, "#9a7026");
  chars.forEach((ch, i) => {
    const w = widths[i] * fit;
    // the upper face of the cut, in shadow
    ctx.fillStyle = "rgba(20,12,4,0.9)";
    ctx.fillText(ch, x - cap * 0.012, baseline - cap * 0.022);
    // the lower face, catching the light
    ctx.fillStyle = "rgba(255,236,190,0.55)";
    ctx.fillText(ch, x + cap * 0.008, baseline + cap * 0.016);
    // and the gold in the groove
    ctx.fillStyle = gold;
    ctx.fillText(ch, x, baseline);
    x += w + gap * fit;
  });
}

/**
 * Gilded capitals on a clear ground, as a texture: for a plane laid over
 * a tablet. Drawn at once in whatever face is ready, and again in the
 * site's Garamond as soon as it has loaded.
 */
export function gildedLettering(text: string, opts: Lettering) {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const family = cssFace("--font-cormorant", "'Cormorant Garamond', Georgia, serif");
  draw(canvas, text, opts, family);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (typeof document !== "undefined" && document.fonts) {
    document.fonts
      .load(`${opts.weight ?? 600} ${Math.round(opts.cap / 0.66)}px ${family}`, text)
      .then(() => {
        draw(canvas, text, opts, family);
        tex.needsUpdate = true;
      })
      .catch(() => {});
  }
  return tex;
}
