"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { BRAND_LOGOS, type BrandId, type BrandLogoId } from "./brandLogos";
import { MID } from "./palette";

/**
 * A real logo, made as an object, cut to the logo's own shape.
 *
 * A mark printed white on a coloured square is made the way such a mark is
 * made as a sign: the letters themselves, solid, with their returns (the
 * sides) in the brand's colour and its face as printed. Nothing
 * square behind it: the shape is the mark's own. A logo that is a disc
 * (Palmy, the International Society) is a disc: a badge in a bronze bezel,
 * its colours laid one on another, or, where the badge is an illustration,
 * printed on its face under a clear coat.
 *
 * No glow or hologram is added: each is a solid enamelled object, lit by
 * its case like anything else in it, carrying only the faint light a
 * glossy enamel gives back in a dim case.
 *
 * The outlines are traced from the supplied logos (brandLogos.ts), in a 512
 * box; the whole is set to the height asked for.
 */

type Style =
  | { kind: "mark"; body: string; glow: string }
  | { kind: "disc"; glow: string }
  | { kind: "printed"; glow: string; src: string; ground: string };

const STYLE: Record<BrandId, Style> = {
  nextround: { kind: "mark", body: "#1a4fff", glow: "#3d74ff" },
  rhul: { kind: "mark", body: "#e8641f", glow: "#ff8a3d" },
  insanity: { kind: "mark", body: "#e8501a", glow: "#ff7a2a" },
  wetherspoon: { kind: "mark", body: "#0060c7", glow: "#3d95ff" },
  fiverr: { kind: "mark", body: "#13c674", glow: "#3dffa0" },
  palmy: { kind: "disc", glow: "#ffd9a0" },
  intsoc: { kind: "printed", glow: "#9fb8ff", src: "/museum/intsoc.webp", ground: "#f7f1ec" },
};

/* thicknesses in the logo's 512 units */
const BODY = 34;
const FACE = 6;
const BASE_DEPTH = 30;
const LAYER_DEPTH = 10;
const BEZEL = 16;

function shapesOf(d: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${d}" fill-rule="evenodd"/></svg>`;
  return new SVGLoader().parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p));
}

const BEVEL = { bevelEnabled: true, bevelThickness: 2, bevelSize: 1.6, bevelSegments: 2, curveSegments: 8 };

/** An outline extruded between two depths, turned right way up (the SVG's y runs down) and centred on (cx, cy). */
function slab(shapes: THREE.Shape[], cx: number, cy: number, back: number, depth: number, opts = BEVEL) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, ...opts });
  g.translate(-cx, -cy, 0);
  g.rotateX(Math.PI);
  g.translate(0, 0, back + depth);
  return g;
}

function boxOf(shapes: THREE.Shape[]) {
  const g = new THREE.ShapeGeometry(shapes);
  g.computeBoundingBox();
  const b = (g.boundingBox as THREE.Box3).clone();
  g.dispose();
  return { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, w: b.max.x - b.min.x, h: b.max.y - b.min.y };
}

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material };

function enamel(color: string, glow: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
    emissive: c,
    emissiveIntensity: glow,
    ...opts,
  });
}

const bronze = () => new THREE.MeshStandardMaterial({ color: MID.bronze, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.4 });

const prints = new Map<string, THREE.Texture>();
function printed(src: string) {
  let t = prints.get(src);
  if (!t) {
    t = new THREE.TextureLoader().load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    prints.set(src, t);
  }
  return t;
}

function build(id: BrandId, height: number): { parts: Part[]; depth: number } {
  const style = STYLE[id];
  const parts: Part[] = [];

  if (style.kind === "printed") {
    // a disc of the badge's own ground, a bronze bezel, and the badge printed on its face
    const R = 256;
    const k = height / (2 * R);
    const disc = new THREE.Shape();
    disc.absarc(0, 0, R, 0, Math.PI * 2, false);
    const ring = new THREE.Shape();
    ring.absarc(0, 0, R + BEZEL, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, R - 4, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    parts.push({ geometry: slab([disc], 0, 0, 0, BASE_DEPTH), material: enamel(style.ground, 0.08) });
    parts.push({ geometry: slab([ring], 0, 0, 0, BASE_DEPTH + 8, { ...BEVEL, bevelThickness: 4, bevelSize: 3 }), material: bronze() });
    const face = new THREE.CircleGeometry(R - 4, 96);
    face.translate(0, 0, BASE_DEPTH + 2.2);
    const tex = printed(style.src);
    parts.push({ geometry: face, material: enamel("#ffffff", 0.06, { map: tex, emissiveMap: tex, roughness: 0.4 }) });
    parts.forEach((p) => p.geometry.scale(k, k, k));
    return { parts, depth: (BASE_DEPTH + 8) * k };
  }

  const logo = BRAND_LOGOS[id as BrandLogoId];

  if (style.kind === "disc") {
    // the badge: its colours one on another, in a bronze bezel
    const base = shapesOf(logo.layers[0].d);
    const { cx, cy, w, h } = boxOf(base);
    const k = height / Math.max(w, h);
    const bezelShape = new THREE.Shape();
    bezelShape.absarc(0, 0, Math.max(w, h) / 2 + BEZEL, 0, Math.PI * 2, false);
    parts.push({ geometry: slab([bezelShape], 0, 0, -6, BASE_DEPTH * 0.8, { ...BEVEL, bevelThickness: 5, bevelSize: 4 }), material: bronze() });
    let back = 0;
    logo.layers.forEach((layer, i) => {
      const depth = i === 0 ? BASE_DEPTH : LAYER_DEPTH;
      parts.push({ geometry: slab(shapesOf(layer.d), cx, cy, back, depth), material: enamel(layer.color, 0.08, { roughness: 0.55, clearcoat: 0.4 }) });
      back += depth;
    });
    parts.forEach((p) => p.geometry.scale(k, k, k));
    return { parts, depth: back * k };
  }

  // a mark: the letters themselves, their returns in the brand's colour and their face as printed
  const layers = logo.layers.slice(1);
  const outline = shapesOf(layers[0].d);
  const { cx, cy, w, h } = boxOf(outline);
  const k = height / Math.max(w, h);
  parts.push({ geometry: slab(outline, cx, cy, 0, BODY), material: enamel(style.body, 0.12, { roughness: 0.3, metalness: 0.15 }) });
  let back = BODY;
  layers.forEach((layer) => {
    parts.push({ geometry: slab(shapesOf(layer.d), cx, cy, back, FACE, { ...BEVEL, bevelThickness: 1, bevelSize: 0.8 }), material: enamel(layer.color, 0.1) });
    back += FACE;
  });
  parts.forEach((p) => p.geometry.scale(k, k, k));
  return { parts, depth: back * k };
}

export function BrandLogo({ id, height = 1.15 }: { id: BrandId; height?: number }) {
  const built = useMemo(() => build(id, height), [id, height]);

  // the solid, as one object, so the hologram overlay can be laid over all of it; centred in depth so it turns about its middle
  const solid = useMemo(() => {
    const group = new THREE.Group();
    built.parts.forEach((p) => {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.position.z = -built.depth / 2;
      group.add(m);
    });
    return group;
  }, [built]);

  useEffect(
    () => () => {
      built.parts.forEach((p) => {
        p.geometry.dispose();
        p.material.dispose();
      });
    },
    [built],
  );

  return (
    <group>
      <primitive object={solid} />
    </group>
  );
}
