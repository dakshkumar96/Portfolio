import * as THREE from "three";
import type { DrawnIconId } from "./roomIcons";

/**
 * The three logos for the Experience room, drawn rather than traced.
 *
 * Built as shapes with explicit holes in the same 512 box as the traced
 * ones, y running down, so they go through the same extrusion. Each is a
 * few plain solids that may overlap - they merge into one silhouette - and
 * a hole is only ever inside the one solid it belongs to.
 */

const TAU = Math.PI * 2;

/** Points round an ellipse, turned by `rot` radians about its centre. */
function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 112) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return new THREE.Vector2(cx + x * c - y * s, cy + x * s + y * c);
  });
}

/** Points along an arc of a circle, from angle `a0` to `a1` (y down, so a positive angle runs downward). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 48) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return new THREE.Vector2(cx + r * Math.cos(t), cy + r * Math.sin(t));
  });
}

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  new THREE.Vector2(x0, y0),
  new THREE.Vector2(x1, y0),
  new THREE.Vector2(x1, y1),
  new THREE.Vector2(x0, y1),
];

/** A solid with its holes. */
function solid(outline: THREE.Vector2[], ...holes: THREE.Vector2[][]) {
  const shape = new THREE.Shape(outline);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  return shape;
}

const poly = (...pts: [number, number][]) => solid(pts.map(([x, y]) => new THREE.Vector2(x, y)));

const BUILD: Record<DrawnIconId, () => THREE.Shape[]> = {
  // a mortarboard and its tassel: education
  cap: () => [
    poly([256, 92], [478, 194], [256, 296], [34, 194]),
    solid([
      new THREE.Vector2(118, 254),
      new THREE.Vector2(256, 316),
      new THREE.Vector2(394, 254),
      new THREE.Vector2(394, 352),
      ...arc(256, 352, 138, 0, Math.PI, 36).map((p) => new THREE.Vector2(p.x, 352 + (p.y - 352) * 0.46)),
    ]),
    solid(rect(444, 206, 462, 336)),
    solid(ellipse(453, 356, 24, 32)),
  ],

  // a cup on its stand: awards and certificates
  trophy: () => [
    solid([
      new THREE.Vector2(150, 56),
      new THREE.Vector2(362, 56),
      new THREE.Vector2(362, 150),
      ...arc(256, 150, 106, 0, Math.PI, 40).map((p) => new THREE.Vector2(p.x, 150 + (p.y - 150) * 1.22)),
      new THREE.Vector2(150, 150),
    ]),
    solid(ellipse(138, 138, 58, 68), ellipse(138, 138, 36, 46)),
    solid(ellipse(374, 138, 58, 68), ellipse(374, 138, 36, 46)),
    solid(rect(232, 300, 280, 352)),
    solid(rect(176, 352, 336, 394)),
    solid(rect(140, 394, 372, 432)),
  ],

  // a clapperboard: the film and the other work done alongside
  clapper: () => [
    poly([60, 138], [448, 68], [448, 104], [60, 172]),
    solid(rect(60, 184, 452, 220)),
    solid(rect(60, 234, 452, 442)),
  ],

  // a planet and its ring: research on exoplanets
  orbit: () => {
    const tilt = (-22 * Math.PI) / 180;
    const PLANET = 118;
    const GAP = 16;
    const N = 240;
    const outer = ellipse(256, 256, 238, 66, tilt, N);
    const inner = ellipse(256, 256, 204, 38, tilt, N);
    const clear = (p: THREE.Vector2) => Math.hypot(p.x - 256, p.y - 256) > PLANET + GAP;
    /*
      The ring is drawn as two wings, one each side of the planet, cut
      clear of it. A ring that overlapped the planet's disc put the ring's
      bevel on top of the disc's face, and the two fought; two separate
      pieces cannot.
    */
    const wings: THREE.Shape[] = [];
    let run: number[] = [];
    const flush = () => {
      if (run.length > 2) {
        const top = run.map((i) => outer[i]);
        const back = run.map((i) => inner[i]).reverse();
        wings.push(solid([...top, ...back]));
      }
      run = [];
    };
    // start where the ring crosses the planet, so no run can wrap past the start
    for (let k = 0; k < N; k += 1) {
      const i = (N / 4 + k) % N;
      if (clear(outer[i]) && clear(inner[i])) run.push(i);
      else flush();
    }
    flush();
    return [solid(ellipse(256, 256, PLANET, PLANET)), ...wings];
  },

  // a globe: the Society's students from everywhere
  globe: () => [
    solid(ellipse(256, 256, 216, 216), ellipse(256, 256, 186, 186)),
    solid(ellipse(256, 256, 104, 216), ellipse(256, 256, 78, 190)),
    solid(rect(244, 44, 268, 468)),
    solid(rect(44, 244, 468, 268)),
    // two parallels, north and south of the equator
    solid(rect(78, 142, 434, 160)),
    solid(rect(78, 352, 434, 370)),
  ],

  // a microphone on its stand: Palmy's podcast
  mic: () => {
    const capsule = [...arc(256, 112, 60, Math.PI, TAU), ...arc(256, 240, 60, 0, Math.PI)];
    const holder = [
      new THREE.Vector2(368, 196),
      ...arc(256, 240, 112, 0, Math.PI),
      new THREE.Vector2(144, 196),
      new THREE.Vector2(176, 196),
      ...arc(256, 240, 80, Math.PI, 0),
      new THREE.Vector2(336, 196),
    ];
    return [solid(capsule), solid(holder), solid(rect(236, 350, 276, 452)), solid(rect(168, 452, 344, 480))];
  },
};

export function drawnIcon(id: DrawnIconId) {
  return BUILD[id]();
}
