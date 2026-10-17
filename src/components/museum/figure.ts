import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
  The figure for the statue at the end of the hall, built in metres at
  life size (feet at y = 0, facing +z, his right hand at -x) and scaled up
  on the plinth.

  A standing man in what he wears in his photographs - an overshirt worn
  open over a t-shirt, jeans, trainers - carved as one block of marble.

  He stands the way a body at rest actually stands, which is what makes a
  statue look alive rather than posed: contrapposto. The weight is on his
  right leg, which is straight; so the right hip rides higher, and the
  left leg, carrying nothing, bends at the knee with its foot set a little
  forward and out. The shoulders tilt the other way to keep the head over
  the weight-bearing foot, the chest shifts toward that side, and the head
  turns a little toward the free side. One hand hangs, the other is in his
  pocket, which pulls that elbow out and back.

  Proportions are a man of about 1.78 m: the head a little under an eighth
  of the height, shoulders about two heads across, the hip joint at half
  height, the knee at a quarter, the fingertips at mid-thigh.

  Everything is generated: tapered tubes along smooth curves for the limbs
  and sleeves, lofted cross-sections for the torso and the shirt, a sculpted
  sphere for the head. It is all one material, so it is merged into one
  geometry with only positions and normals.
*/

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Keep only what a single smooth marble needs, so pieces of any origin
 * merge: positions, and normals worked out while the piece is still one
 * connected surface, so it stays smooth across its own faces.
 */
function strip(g: THREE.BufferGeometry) {
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== "position" && name !== "normal") out.deleteAttribute(name);
  return out;
}

/**
 * A tube along a smooth curve through `path`, its radius eased between the
 * `radii` given at each point, closed at both ends. `ripple` adds shallow
 * folds round it (cloth gathering), strongest where `gather` says.
 */
export function tube(
  path: THREE.Vector3[],
  radii: number[],
  {
    sides = 22,
    steps = 40,
    flat = 1,
    ripple = 0,
    gather = () => 1,
  }: { sides?: number; steps?: number; flat?: number; ripple?: number; gather?: (u: number) => number } = {},
) {
  const curve = new THREE.CatmullRomCurve3(path, false, "centripetal");
  const frames = curve.computeFrenetFrames(steps, false);
  const radiusAt = (u: number) => {
    const f = u * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(f));
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    return radii[i] * (1 - s) + radii[i + 1] * s;
  };
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const r = radiusAt(u);
    for (let j = 0; j < sides; j += 1) {
      const a = (j / sides) * Math.PI * 2;
      const fold = 1 + ripple * gather(u) * (Math.sin(a * 5 + u * 19) * 0.6 + Math.sin(a * 3 - u * 31) * 0.4);
      const rr = r * fold;
      pos.push(
        p.x + rr * (Math.cos(a) * n.x + Math.sin(a) * b.x * flat),
        p.y + rr * (Math.cos(a) * n.y + Math.sin(a) * b.y * flat),
        p.z + rr * (Math.cos(a) * n.z + Math.sin(a) * b.z * flat),
      );
    }
  }
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      idx.push(a, b, c, b, d, c);
    }
  }
  // caps: a fan to the centre of each end
  for (const [ring, centre, flip] of [
    [0, curve.getPointAt(0), true],
    [steps, curve.getPointAt(1), false],
  ] as [number, THREE.Vector3, boolean][]) {
    const k = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z);
    for (let j = 0; j < sides; j += 1) {
      const a = ring * sides + j;
      const b = ring * sides + ((j + 1) % sides);
      if (flip) idx.push(k, b, a);
      else idx.push(k, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** One cross-section of a loft: an oval at height `y`, deeper in front than behind or the reverse. */
type Section = {
  y: number;
  /** half-width */
  rx: number;
  /** depth to the front and to the back */
  front: number;
  back: number;
  /** where its centre stands */
  cx?: number;
  cz?: number;
  /** the section tipped side to side (hip and shoulder lines) and turned */
  roll?: number;
  yaw?: number;
  /** squareness: 2 is an ellipse, more is boxier */
  n?: number;
};

/**
 * A body lofted through cross-sections, bottom to top. `open` leaves a gap
 * at the front (an open jacket), as a fraction of the half-turn either
 * side of straight ahead; the result is then a shell, not a solid.
 */
export function loft(sections: Section[], { sides = 48, open }: { sides?: number; open?: (y: number) => number } = {}) {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (s: Section) => {
    const pts: THREE.Vector3[] = [];
    const n = s.n ?? 2.4;
    const gap = open ? open(s.y) : 0;
    const count = open ? sides : sides;
    for (let j = 0; j < count; j += 1) {
      let a: number;
      if (open) {
        // from just right of the front, round the back, to just left of it
        const start = Math.PI / 2 + gap;
        const span = Math.PI * 2 - gap * 2;
        a = start + (span * j) / (count - 1);
      } else {
        a = (j / count) * Math.PI * 2;
      }
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ex = Math.sign(c) * Math.abs(c) ** (2 / n);
      const ez = Math.sign(sn) * Math.abs(sn) ** (2 / n);
      let x = s.rx * ex;
      let z = (ez > 0 ? s.front : s.back) * ez;
      let y = s.y;
      const yaw = s.yaw ?? 0;
      const xr = x * Math.cos(yaw) + z * Math.sin(yaw);
      const zr = -x * Math.sin(yaw) + z * Math.cos(yaw);
      x = xr;
      z = zr;
      y += x * Math.tan(s.roll ?? 0);
      pts.push(V(x + (s.cx ?? 0), y, z + (s.cz ?? 0)));
    }
    return pts;
  };
  const rings = sections.map(ring);
  const per = rings[0].length;
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  const wrap = !open;
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < (wrap ? per : per - 1); j += 1) {
      const a = i * per + j;
      const b = i * per + ((j + 1) % per);
      const c = a + per;
      const d = b + per;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (wrap) {
    // close the ends
    for (const [i, up] of [
      [0, false],
      [rings.length - 1, true],
    ] as [number, boolean][]) {
      const centre = rings[i].reduce((acc, p) => acc.add(p), V(0, 0, 0)).multiplyScalar(1 / per);
      const k = pos.length / 3;
      pos.push(centre.x, centre.y, centre.z);
      for (let j = 0; j < per; j += 1) {
        const a = i * per + j;
        const b = i * per + ((j + 1) % per);
        if (up) idx.push(k, b, a);
        else idx.push(k, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return { geometry: g, rings };
}

/** Hermite-ish ease, 0 at `a` and 1 at `b`. */
const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (d2: number, w2: number) => Math.exp(-d2 / w2);

/**
 * The head, carved from a sphere: the skull longer than it is wide, the
 * jaw narrowing to the chin, a brow over two shallow eye sockets, the nose,
 * cheekbones, lips, and ears; short hair over it, cut at a hairline.
 * Built about its own centre, facing +z.
 */
function head() {
  const R = 0.112;
  const g = new THREE.SphereGeometry(R, 64, 48);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 1) {
    v.fromBufferAttribute(p, i);
    let { x, y, z } = v;
    // the skull: narrower than deep, the back fuller
    x *= 0.8;
    z *= z < 0 ? 1.0 : 0.9;
    y *= 1.06;
    // the jaw and chin: narrowing below the cheekbones, the chin carried forward
    const low = ease(-0.01, -0.1, y);
    x *= 1 - 0.3 * low;
    if (z > 0) z *= 1 - 0.12 * low + 0.08 * ease(-0.07, -0.11, y);
    // the face is flatter than the skull
    if (z > 0.04) z = 0.04 + (z - 0.04) * 0.8;
    // the brow ridge, the eye sockets under it, the cheekbones
    if (z > 0) {
      z += 0.008 * bump((y - 0.035) ** 2, 0.00012) * bump(x * x, 0.004);
      for (const s of [-1, 1]) {
        z -= 0.014 * bump((x - s * 0.034) ** 2 + (y - 0.016) ** 2, 0.00028);
        x += s * 0.006 * bump((x - s * 0.055) ** 2 + (y + 0.004) ** 2, 0.0006) * (s * x > 0 ? 1 : 0);
      }
      // the nose: a ridge down from the brow, the tip and the wings
      const ridge = bump(x * x, 0.00014) * ease(0.02, -0.035, y) * ease(-0.06, -0.035, y);
      z += 0.021 * ridge;
      z += 0.01 * bump(x * x * 0.7 + (y + 0.036) ** 2, 0.00035);
      // the lips, and the hollow under them
      z += 0.006 * bump(x * x * 0.4 + (y + 0.062) ** 2, 0.00008);
      z -= 0.004 * bump(x * x * 0.3 + (y + 0.078) ** 2, 0.00006);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();

  // the hair: the skull's shell lifted off it, kept above the hairline, roughened into short hair
  const hair = g.clone();
  const hp = hair.getAttribute("position");
  const hn = hair.getAttribute("normal");
  const keep: number[] = [];
  // the hairline: across the forehead, down at the temples, over the ears, low at the nape
  const above = (x: number, y: number, z: number) => {
    const line = z > 0 ? 0.05 - 0.035 * Math.min(1, Math.abs(x) / 0.075) : 0.015 - 0.08 * Math.min(1, -z / 0.1);
    return y > line;
  };
  for (let i = 0; i < hp.count; i += 1) {
    const x = hp.getX(i);
    const y = hp.getY(i);
    const z = hp.getZ(i);
    // fuller on top, close at the sides, and a fine irregular texture rather than any pattern
    const lift = 0.005 + 0.011 * ease(0.0, 0.1, y) + 0.0022 * Math.sin(x * 430 + y * 130) * Math.sin(z * 390 - y * 170);
    hp.setXYZ(i, x + hn.getX(i) * lift, y + hn.getY(i) * lift + 0.004, z + hn.getZ(i) * lift);
  }
  const index = hair.getIndex();
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t);
      const b = index.getX(t + 1);
      const c = index.getX(t + 2);
      const ok = [a, b, c].every((k) => above(g.getAttribute("position").getX(k), g.getAttribute("position").getY(k), g.getAttribute("position").getZ(k)));
      if (ok) keep.push(a, b, c);
    }
    hair.setIndex(keep);
  }
  hair.computeVertexNormals();

  // the ears, flat against the head behind the jaw
  const ears = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(1, 16, 12);
    e.scale(0.016, 0.034, 0.024);
    e.rotateY(s * 0.35);
    e.translate(s * 0.088, -0.006, -0.008);
    return e;
  });
  const parts = [g, hair, ...ears].map(strip);
  const out = mergeGeometries(parts, false);
  for (const q of parts) q.dispose();
  return out;
}

/** A hand hanging at the side, fingers together and a little curled, the thumb forward. */
function hand() {
  const palm = new THREE.SphereGeometry(1, 20, 14);
  palm.scale(0.042, 0.055, 0.017);
  palm.translate(0, -0.045, 0);
  const fingers = tube([V(0, -0.08, 0), V(0, -0.135, 0.008), V(0, -0.17, 0.028)], [0.03, 0.026, 0.015], { sides: 14, steps: 10, flat: 0.45 });
  const thumb = tube([V(-0.01, -0.03, 0.02), V(-0.018, -0.07, 0.04), V(-0.014, -0.1, 0.045)], [0.013, 0.011, 0.008], { sides: 10, steps: 8 });
  const parts = [palm, fingers, thumb].map(strip);
  const out = mergeGeometries(parts, false);
  for (const q of parts) q.dispose();
  return out;
}

/** A trainer: a flat sole with a toe spring, and the upper over it. Built along +z from the heel. */
function shoe() {
  const outline = new THREE.Shape();
  const L = 0.285;
  const W = 0.105;
  outline.moveTo(0, -W * 0.38);
  outline.bezierCurveTo(L * 0.4, -W * 0.5, L * 0.75, -W * 0.55, L * 0.92, -W * 0.38);
  outline.bezierCurveTo(L * 1.02, -W * 0.15, L * 1.02, W * 0.2, L * 0.9, W * 0.4);
  outline.bezierCurveTo(L * 0.7, W * 0.52, L * 0.35, W * 0.5, 0.02, W * 0.4);
  outline.bezierCurveTo(-0.025, W * 0.2, -0.025, -W * 0.2, 0, -W * 0.38);
  const sole = new THREE.ExtrudeGeometry(outline, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // the outline is drawn in (along the foot, across it); stand it on the ground
  sole.rotateX(-Math.PI / 2);
  sole.rotateY(-Math.PI / 2);
  sole.translate(0, 0.006, 0);
  const upper = loft(
    [
      { y: 0.03, rx: 0.05, front: 0.215, back: 0.04, cz: 0.03, n: 2.2 },
      { y: 0.06, rx: 0.048, front: 0.2, back: 0.04, cz: 0.03, n: 2.2 },
      { y: 0.085, rx: 0.044, front: 0.15, back: 0.042, cz: 0.02, n: 2.2 },
      { y: 0.105, rx: 0.04, front: 0.06, back: 0.042, cz: 0.0, n: 2.2 },
      { y: 0.115, rx: 0.036, front: 0.04, back: 0.04, cz: -0.005, n: 2.2 },
    ],
    { sides: 32 },
  ).geometry;
  const parts = [sole, upper].map(strip);
  const out = mergeGeometries(parts, false);
  for (const q of parts) q.dispose();
  return out;
}

/** Place a piece built facing +z at a point, turned about the vertical and tipped. */
function put(g: THREE.BufferGeometry, at: THREE.Vector3, yaw = 0, pitch = 0, roll = 0) {
  const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ")), V(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** The whole figure, merged, at life size. About 1.78 m tall. */
export function buildFigure() {
  const parts: THREE.BufferGeometry[] = [];

  /* ---- the stance ---- */
  const hipR = V(-0.095, 0.935, 0);
  const hipL = V(0.095, 0.905, 0.012);
  const kneeR = V(-0.088, 0.5, 0.012);
  const kneeL = V(0.125, 0.49, 0.075);
  const ankleR = V(-0.084, 0.088, -0.005);
  const ankleL = V(0.165, 0.1, 0.035);
  const hipRoll = -0.16;
  const shoulderRoll = 0.08;

  /* ---- the legs, in jeans: loose at the thigh, a fold or two at the knee, stacked at the hem ---- */
  const leg = (hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3) => {
    const mid = hip.clone().lerp(knee, 0.5).add(V(0, 0, 0.012));
    const calf = knee.clone().lerp(ankle, 0.4).add(V(0, 0, -0.012));
    parts.push(
      tube([hip.clone().add(V(0, 0.06, 0)), mid, knee, calf, ankle.clone().add(V(0, 0.03, 0))], [0.1, 0.092, 0.07, 0.068, 0.062], {
        sides: 28,
        steps: 60,
        ripple: 0.06,
        // folds behind the knee and gathered over the shoe
        gather: (u) => bump((u - 0.5) ** 2, 0.006) + 0.8 * ease(0.82, 1, u),
      }),
    );
    // the stacked hem
    parts.push(tube([ankle.clone().add(V(0, 0.045, 0)), ankle.clone().add(V(0, 0.005, 0.01))], [0.067, 0.066], { sides: 28, steps: 6, ripple: 0.08 }));
  };
  leg(hipR, kneeR, ankleR);
  leg(hipL, kneeL, ankleL);

  /* ---- the trainers: the weight foot flat, the free foot turned out and its heel just lifted ---- */
  parts.push(put(shoe(), V(ankleR.x, 0, ankleR.z - 0.07), -0.12));
  parts.push(put(shoe(), V(ankleL.x, 0.01, ankleL.z - 0.06), 0.38, 0.06));

  /* ---- the hips and the body, in the t-shirt; the hip line tips one way, the shoulders the other ---- */
  const roll = (y: number) => hipRoll + (shoulderRoll - hipRoll) * ease(0.95, 1.42, y);
  const shift = (y: number) => -0.018 * ease(0.95, 1.4, y);
  const body: Section[] = [
    { y: 0.8, rx: 0.15, front: 0.09, back: 0.1 },
    { y: 0.86, rx: 0.178, front: 0.1, back: 0.125 },
    { y: 0.95, rx: 0.182, front: 0.1, back: 0.125 },
    { y: 1.02, rx: 0.168, front: 0.098, back: 0.105 },
    { y: 1.1, rx: 0.16, front: 0.102, back: 0.095 },
    { y: 1.2, rx: 0.17, front: 0.115, back: 0.1 },
    { y: 1.3, rx: 0.183, front: 0.125, back: 0.105 },
    { y: 1.38, rx: 0.192, front: 0.118, back: 0.105 },
    { y: 1.425, rx: 0.19, front: 0.1, back: 0.1 },
    { y: 1.46, rx: 0.13, front: 0.075, back: 0.08 },
    { y: 1.49, rx: 0.07, front: 0.058, back: 0.062 },
  ].map((s) => ({ ...s, roll: roll(s.y), cx: shift(s.y), yaw: 0.06 * ease(1, 1.45, s.y), n: 2.5 }));
  parts.push(loft(body).geometry);
  // the waistband and belt over the jeans, following the hip line
  parts.push(
    loft(
      [0.995, 1.04].map((y) => ({ y, rx: 0.174, front: 0.106, back: 0.112, roll: roll(y), cx: shift(y), n: 2.6 })),
      { sides: 48 },
    ).geometry,
  );
  // the t-shirt's crew neck
  {
    const neckRing = new THREE.TorusGeometry(0.062, 0.009, 10, 40);
    neckRing.rotateX(Math.PI / 2 - 0.25);
    neckRing.translate(shift(1.48), 1.485 + 0.01, 0.006);
    parts.push(neckRing);
  }

  /* ---- the overshirt, worn open: a shell over the body with the front parted, a rolled edge to it, and a collar ---- */
  const coat: Section[] = [
    { y: 0.83, rx: 0.205, front: 0.135, back: 0.14 },
    { y: 0.95, rx: 0.2, front: 0.128, back: 0.138 },
    { y: 1.08, rx: 0.19, front: 0.125, back: 0.12 },
    { y: 1.2, rx: 0.197, front: 0.136, back: 0.118 },
    { y: 1.3, rx: 0.207, front: 0.142, back: 0.118 },
    { y: 1.385, rx: 0.214, front: 0.132, back: 0.118 },
    { y: 1.44, rx: 0.2, front: 0.11, back: 0.112 },
    { y: 1.47, rx: 0.14, front: 0.085, back: 0.092 },
  ].map((s) => ({ ...s, roll: roll(s.y), cx: shift(s.y), yaw: 0.06 * ease(1, 1.45, s.y), n: 2.5 }));
  const parting = (y: number) => 0.2 + 0.32 * ease(1.1, 1.47, y);
  const coatShell = loft(coat, { sides: 56, open: parting });
  parts.push(coatShell.geometry);
  // the rolled edges down each side of the opening and round the hem, so the cloth has a thickness
  const edgeL = coatShell.rings.map((r) => r[0]);
  const edgeR = coatShell.rings.map((r) => r[r.length - 1]);
  parts.push(tube(edgeL, edgeL.map(() => 0.011), { sides: 10, steps: 40 }));
  parts.push(tube(edgeR, edgeR.map(() => 0.011), { sides: 10, steps: 40 }));
  const hem = coatShell.rings[0];
  parts.push(tube(hem.filter((_, i) => i % 2 === 0), hem.filter((_, i) => i % 2 === 0).map(() => 0.01), { sides: 8, steps: 60 }));
  // a breast pocket on each side, and the buttons down one edge
  for (const s of [-1, 1]) {
    const pocket = new THREE.BoxGeometry(0.1, 0.11, 0.012);
    pocket.rotateY(s * 0.42);
    pocket.translate(s * 0.105 + shift(1.3), 1.3 + s * 0.012, 0.128);
    parts.push(pocket);
  }
  for (let k = 0; k < 5; k += 1) {
    const y = 0.9 + k * 0.12;
    const at = edgeR[Math.round((y - 0.83) / (1.47 - 0.83) * (edgeR.length - 1))] ?? edgeR[0];
    const b = new THREE.SphereGeometry(0.009, 10, 8);
    b.scale(1, 1, 0.5);
    b.translate(at.x - 0.016, y, at.z + 0.006);
    parts.push(b);
  }
  // the collar: a band standing up round the back of the neck and falling open in front
  parts.push(
    loft(
      [1.455, 1.5, 1.53].map((y, i) => ({ y, rx: 0.1 - i * 0.012, front: 0.075 - i * 0.006, back: 0.088 - i * 0.008, roll: shoulderRoll * 0.6, cx: shift(1.45), n: 2.3 })),
      { sides: 32, open: () => 0.55 },
    ).geometry,
  );

  /* ---- the neck and head: turned a little toward the free side, the chin a touch down ---- */
  const neckBase = V(shift(1.48) + 0.004, 1.47, 0.0);
  const headAt = V(neckBase.x + 0.01, 1.665, 0.018);
  parts.push(tube([neckBase, V(neckBase.x + 0.006, 1.55, 0.008), V(headAt.x, 1.6, 0.012)], [0.06, 0.054, 0.056], { sides: 24, steps: 12 }));
  parts.push(put(head(), headAt, 0.3, 0.07, -0.04));

  /* ---- the arms, in the overshirt's sleeves ---- */
  const shR = V(-0.205 + shift(1.43), 1.43 - 0.205 * Math.tan(shoulderRoll), -0.004);
  const shL = V(0.205 + shift(1.43), 1.43 + 0.205 * Math.tan(shoulderRoll), -0.004);
  // the right arm hangs, a little behind the body line, the elbow soft
  const elR = V(-0.238, 1.125, -0.028);
  const wrR = V(-0.232, 0.86, 0.012);
  // the left hand is in the jeans pocket: the elbow out and back, the forearm down and forward
  const elL = V(0.305, 1.155, -0.07);
  const wrL = V(0.168, 0.935, 0.07);
  const sleeve = (sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3, bent: boolean) => {
    parts.push(
      tube([sh.clone().add(V(0, 0.02, 0)), sh.clone().lerp(el, 0.5), el, el.clone().lerp(wr, 0.5), wr], [0.066, 0.06, 0.055, 0.05, 0.045], {
        sides: 22,
        steps: 50,
        ripple: 0.07,
        // creases in the crook of the elbow, more when it is bent
        gather: (u) => bump((u - 0.5) ** 2, bent ? 0.01 : 0.004) * (bent ? 1.4 : 0.8),
      }),
    );
    // the shoulder, rounded over the top of the sleeve
    const cap = new THREE.SphereGeometry(0.06, 20, 14);
    cap.scale(1, 0.85, 1);
    cap.translate(sh.x - Math.sign(sh.x) * 0.01, sh.y - 0.018, sh.z);
    parts.push(cap);
    // the cuff
    const dir = wr.clone().sub(el).normalize();
    parts.push(tube([wr.clone().addScaledVector(dir, -0.035), wr.clone().addScaledVector(dir, 0.005)], [0.05, 0.049], { sides: 22, steps: 4 }));
  };
  sleeve(shR, elR, wrR, false);
  sleeve(shL, elL, wrL, true);
  // the wrist and the hanging hand
  parts.push(tube([wrR.clone().add(V(0, 0.01, 0)), wrR.clone().add(V(0.002, -0.03, 0.002))], [0.032, 0.03], { sides: 14, steps: 4 }));
  parts.push(put(hand(), wrR.clone().add(V(0.002, -0.02, 0.004)), 1.45, 0, 0.05));
  // the pocketed hand shows only as a swell in the jeans under the wrist
  {
    const swell = new THREE.SphereGeometry(1, 16, 12);
    swell.scale(0.042, 0.05, 0.02);
    swell.translate(wrL.x - 0.012, wrL.y - 0.04, wrL.z + 0.012);
    parts.push(swell);
    parts.push(tube([wrL.clone().add(V(0.004, 0.02, -0.004)), wrL.clone().add(V(-0.008, -0.02, 0.008))], [0.031, 0.03], { sides: 14, steps: 4 }));
  }

  const ready = parts.map(strip);
  const out = mergeGeometries(ready, false);
  for (const q of ready) q.dispose();
  return out;
}
