import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
  Mouldings, and the classical members made from them, for the hall and
  its rooms.

  Each piece is drawn in a wall's own frame - x along the wall, y up from
  where the piece stands, z out from the wall face into the room - so the
  same pilaster can stand against any wall. frame() makes the move from
  that frame to a wall in the scene, and placed() carries a piece with it.

  Everything comes back non-indexed, with position, normal, uv and colour,
  so any of it can be merged with anything else into one mesh.

  The colour is a baked shade, not a hue. A moulding reads because its
  hollows are darker than its rounds - the light that reaches the bottom
  of a flute or the angle under a cornice is light that has already been
  half blocked - and a hall lit mostly by soft bounce has no raking lamp
  to show that on its own. So each piece carries the shade of its own
  hollows, and the stone material multiplies it in.
*/

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A wall's frame: `origin` on the wall face at the foot of the piece,
 * `along` the direction x runs, `out` the direction into the room.
 */
export function frame(origin: THREE.Vector3, along: THREE.Vector3, out: THREE.Vector3) {
  return new THREE.Matrix4().makeBasis(along, V(0, 1, 0), out).setPosition(origin);
}

/**
 * A piece moved into place. A move that mirrors a piece would turn every
 * face inside out, so its triangles are turned back round to face out.
 */
export function placed(g: THREE.BufferGeometry, m: THREE.Matrix4) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  out.applyMatrix4(m);
  if (m.determinant() < 0) {
    for (const name of Object.keys(out.attributes)) {
      const a = out.getAttribute(name) as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i += 3) {
        for (let k = 0; k < a.itemSize; k += 1) {
          const t = a.getComponent(i + 1, k);
          a.setComponent(i + 1, k, a.getComponent(i + 2, k));
          a.setComponent(i + 2, k, t);
        }
      }
    }
  }
  return out;
}

/**
 * Bake a shade into a piece: `fn` gives 0 (black) to 1 (unshaded) for a
 * point, in whatever frame the piece is in when it is called. Shades
 * baked one after another multiply, as the shadows they stand for would.
 */
export function shade(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => number) {
  const p = g.getAttribute("position");
  const had = g.getAttribute("color");
  const c = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    const k = Math.max(0, Math.min(1, fn(v.fromBufferAttribute(p, i)))) * (had ? had.getX(i) : 1);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}

/** Ease from 0 at `a` to 1 at `b`. */
export const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Merge pieces and free them. A piece with no shade of its own is unshaded. */
export function merged(parts: THREE.BufferGeometry[]) {
  for (const p of parts) if (!p.getAttribute("color")) shade(p, () => 1);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/** A plain block standing on y = 0, its back on the wall, centred along it. */
export function block(w: number, h: number, d: number, y = 0, x = 0) {
  const b = new THREE.BoxGeometry(w, h, d);
  b.translate(x, y + h / 2, d / 2);
  const g = b.toNonIndexed();
  b.dispose();
  return g;
}

/* a plan drawn in (x along the wall, y out from it) and extruded up */
const PLAN_UP = new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, 1, 0));

function stood(g: THREE.BufferGeometry, y: number) {
  const out = placed(g, new THREE.Matrix4().makeTranslation(0, y, 0).multiply(PLAN_UP));
  g.dispose();
  return out;
}

/**
 * A torus or an ovolo: a slab whose upper and lower front edges are
 * rounded to radius `r`. Two of them stacked with a fillet between are
 * the base of a column; one under a block is its capital.
 */
export function roundedBlock(w: number, h: number, d: number, r: number, y = 0) {
  const shape = new THREE.Shape();
  const hw = w / 2 - r;
  // the back runs a little into the wall, so no seam shows where they meet
  shape.moveTo(-hw, -0.06);
  shape.lineTo(hw, -0.06);
  shape.lineTo(hw, d - r);
  shape.lineTo(-hw, d - r);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * r, 0.002),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    curveSegments: 1,
  });
  g.translate(0, 0, r);
  return toCreasedNormals(stood(g, y), 0.7);
}

/**
 * A pilaster's shaft, its face cut with `flutes` shallow channels. The
 * channels are segments of a circle with flat fillets between them, as a
 * mason cuts them, and they are shaded smooth while their edges stay
 * crisp.
 */
export function flutedShaft(w: number, h: number, d: number, flutes: number, y = 0) {
  const fillet = w * 0.045;
  const fw = (w - fillet * (flutes + 1)) / flutes;
  const sag = fw * 0.36;
  const radius = (fw * fw) / 4 / (2 * sag) + sag / 2;
  const half = Math.asin(Math.min(1, fw / 2 / radius));
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -0.06);
  shape.lineTo(w / 2, -0.06);
  shape.lineTo(w / 2, d);
  // across the face from right to left, so the outline stays one way round
  let x = w / 2 - fillet;
  shape.lineTo(x, d);
  for (let i = 0; i < flutes; i += 1) {
    const cx = x - fw / 2;
    const cy = d + radius - sag;
    const SEG = 7;
    for (let k = 1; k <= SEG; k += 1) {
      const a = half - (2 * half * k) / SEG;
      shape.lineTo(cx + radius * Math.sin(a), cy - radius * Math.cos(a));
    }
    x -= fw;
    if (i < flutes - 1) {
      x -= fillet;
      shape.lineTo(x, d);
    }
  }
  shape.lineTo(-w / 2, d);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  // darker toward the bottom of each flute
  return shade(toCreasedNormals(stood(g, y), 0.7), (q) => 1 - 0.55 * ease(0, sag, d - q.z));
}

/**
 * A classical pilaster in its wall frame, `h` tall from the foot of its
 * base to the top of its capital, with a shaft `w` wide standing `d` off
 * the wall.
 *
 * Attic base - a plinth, a torus, a fillet, a smaller torus - a fluted
 * shaft, and a Tuscan capital: an astragal, a plain neck, an ovolo, and
 * the abacus the entablature sits on. Each member steps out a little
 * past the one above it, which is what makes the base read as carrying
 * the load and the capital as receiving it.
 */
export function pilaster(w: number, d: number, h: number, flutes = 5) {
  const BASE = 0.47;
  const CAP = 0.42;
  const top = h - CAP;
  const g = merged([
    block(w * 1.36, 0.2, d + 0.16),
    roundedBlock(w * 1.26, 0.13, d + 0.12, 0.065, 0.2),
    block(w * 1.12, 0.05, d + 0.06, 0.33),
    roundedBlock(w * 1.16, 0.09, d + 0.08, 0.045, 0.38),
    flutedShaft(w, top - BASE, d, flutes, BASE),
    roundedBlock(w * 1.1, 0.07, d + 0.05, 0.035, top),
    block(w, 0.11, d, top + 0.07),
    roundedBlock(w * 1.26, 0.11, d + 0.13, 0.055, top + 0.18),
    block(w * 1.4, 0.13, d + 0.18, top + 0.29),
  ]);
  // a little darker where it meets the wall
  return shade(g, (q) => 0.72 + 0.28 * ease(0, 0.22, q.z));
}

/**
 * A moulding's profile, swept along a wall: `pts` are (out from the wall,
 * up) pairs from the foot of the moulding to its head, and the sweep runs
 * `length` along x from x = 0.
 */
export function sweptProfile(pts: [number, number][], length: number) {
  // drawn as (out, up) and swept along x; a closed outline back along the wall
  const outline = [[0, pts[0][1]] as [number, number], ...pts, [0, pts[pts.length - 1][1]] as [number, number]];
  const shape = new THREE.Shape(outline.map(([o, u]) => new THREE.Vector2(o, u)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 1 });
  // shape x is out from the wall, shape y is up, extrusion is along the wall
  const m = new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(1, 0, 0));
  const out = placed(g, m);
  g.dispose();
  return out;
}

/**
 * World-scale texture coordinates: each triangle is projected onto the
 * axis plane it faces most nearly, so a texture lands at one size on a
 * long cornice and a small capital alike and is never stretched along a
 * sweep. One repeat per `size` units. Expects non-indexed geometry.
 */
export function worldUV(geometry: THREE.BufferGeometry, size = 3) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.getAttribute("position");
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k += 1) {
      const q = k === 0 ? a : k === 1 ? b : c;
      let u: number;
      let v: number;
      if (ax >= ay && ax >= az) {
        u = q.z;
        v = q.y;
      } else if (ay >= az) {
        u = q.x;
        v = q.z;
      } else {
        u = q.x;
        v = q.y;
      }
      uv[(i + k) * 2] = u / size;
      uv[(i + k) * 2 + 1] = v / size;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A rosette: eight petals round a domed boss, facing down (-y), its back
 * at y = 0, about 0.66 across. The vault has one in every coffer and
 * under every keystone; the picture frames carry them at their corners.
 */
export function rosetteGeometry() {
  const shape = new THREE.Shape();
  const N = 48;
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.19 + 0.12 * Math.abs(Math.cos(4 * a)) ** 0.8;
    const p = [r * Math.cos(a), r * Math.sin(a)] as const;
    if (i === 0) shape.moveTo(...p);
    else shape.lineTo(...p);
  }
  shape.closePath();
  const petals = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 1,
    curveSegments: 1,
  });
  // turned to face down, its back on the ceiling
  petals.rotateX(Math.PI / 2);
  petals.translate(0, -0.018, 0);
  const boss = new THREE.LatheGeometry(
    [
      [0.13, 0],
      [0.125, 0.03],
      [0.105, 0.062],
      [0.075, 0.09],
      [0.038, 0.106],
      [0, 0.11],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
  boss.rotateX(Math.PI);
  boss.translate(0, -0.055, 0);
  const g = merged([petals.toNonIndexed(), boss.toNonIndexed()]);
  petals.dispose();
  boss.dispose();
  return g;
}
