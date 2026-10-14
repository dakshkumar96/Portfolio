"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HALF_WIDTH as HW, LENGTH, WALL_H, Z_FAR, Z_NEAR } from "./corridorLayout";
import { SHELL } from "./palette";
import { blackBrickFor } from "./textures";

/**
 * The hall's roof, built as a classical gallery is: in bays.
 *
 * A barrel vault stands because its weight is carried down to the ground
 * in a few places, and a good one shows you where. Here that is the
 * pilasters: one stands against each wall at every bay, rises to the
 * cornice, and the cornice steps forward over it. From that step a rib
 * springs across the hall, so each rib lands on a pilaster and each
 * pilaster is the foot of a rib. Between the ribs the vault is plain
 * plaster - the load is in the structure, not in the infill - and it is
 * lit from the cornice, brightest where the light starts and falling
 * away to the crown, the way light from a cornice falls on a ceiling.
 *
 * The curve is a single circle's arc, a segment struck from one centre
 * with a rise of about a quarter of the span: the shape that a mason
 * can lay out with a cord and that needs no more of a wall than these
 * have. It meets the wall behind the cornice, which hides the angle
 * where the two meet, as a cornice always does.
 *
 * The colour is the hall's own: the vault is faced in the dark pavers the
 * flat ceiling was, and the pilasters, cornice and ribs are the walls'
 * stone. Only a faint warmth climbs the curve from the cornice, enough to
 * show the structure and no more.
 */

/** The curve springs at the top of the wall. */
export const SPRING_Y = WALL_H;
export const VAULT_RISE = 4.2;
/** The circle the curve is struck from. */
const R = (HW * HW + VAULT_RISE * VAULT_RISE) / (2 * VAULT_RISE);
const CY = SPRING_Y + VAULT_RISE - R;
const PHI = Math.asin(HW / R);

/** The plaster of the end wall under the vault. */
export const PLASTER = "#6a5a43";

const BRICK_TILE = 3.2;

/** One bay: the distance from one pilaster to the next. Doors sit at the centres of bays. */
export const BAY = 9;
const FIRST_PILASTER = -11.5;

/** Where every pilaster, and so every rib, stands along the hall. */
export const PILASTER_ZS: number[] = (() => {
  const out: number[] = [];
  // from the near end, a few bays before the first door, to the far end
  for (let z = FIRST_PILASTER + BAY * 3; z > Z_FAR + 3; z -= BAY) out.push(z);
  return out;
})();

/** A point on the soffit at angle `t` from the vertical through the centre. */
const soffit = (t: number, radius = R) => new THREE.Vector2(radius * Math.sin(t), CY + radius * Math.cos(t));

/** The vault's underside: from the right springing over the crown to the left, with the inward normal at each point. */
const SECTION = (() => {
  const N = 72;
  const pts: THREE.Vector2[] = [];
  const normals: THREE.Vector2[] = [];
  const along: number[] = [];
  for (let i = 0; i <= N; i += 1) {
    const t = PHI - (2 * PHI * i) / N;
    pts.push(soffit(t));
    normals.push(new THREE.Vector2(-Math.sin(t), -Math.cos(t)));
    along.push(R * (PHI - t));
  }
  return { pts, normals, along, length: along[N] };
})();

/** The vault surface, seen from inside, swept the length of the hall. */
function useSurface() {
  const geo = useMemo(() => {
    const { pts, normals, along, length } = SECTION;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      for (const z of [Z_NEAR, Z_FAR]) {
        pos.push(p.x, p.y, z);
        nor.push(normals[i].x, normals[i].y, 0);
        uv.push(along[i] / length, z === Z_NEAR ? 0 : 1);
      }
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    // the ambient-occlusion map reads the second channel, which hand-built geometry does not carry
    g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv.slice(), 2));
    g.setIndex(idx);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/**
 * The light on the vault, painted in its own coordinates - across the
 * curve and along the hall. A cornice light throws up the vault and fades,
 * so it is brightest at the springing and falls toward the crown, and
 * brightest along the hall at each pilaster, where the fittings are.
 */
function useVaultLight() {
  const tex = useMemo(() => {
    const W = 96;
    const H = 2048;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y += 1) {
      // the canvas's top row is the far end of the hall
      const z = Z_FAR + (y / H) * LENGTH;
      const bay = 0.84 + 0.16 * Math.cos(((z - FIRST_PILASTER) / BAY) * Math.PI * 2);
      for (let x = 0; x < W; x += 1) {
        const u = x / (W - 1);
        const d = Math.min(u, 1 - u);
        const b = (0.1 + 0.62 * Math.exp(-d / 0.2)) * bay;
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, 255 * b);
        img.data[i + 1] = Math.min(255, 214 * b);
        img.data[i + 2] = Math.min(255, 150 * b);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** The ribs: two stepped bands of stone on the soffit, one over each pilaster, merged into one mesh. */
function useRibs() {
  const geo = useMemo(() => {
    const band = (drop: number) => {
      const ri = R - drop;
      // where this band's lower face meets the springing line, so it ends square on the cornice
      const ti = Math.asin(Math.sqrt(ri * ri - (SPRING_Y - CY) ** 2) / ri);
      const outer = SECTION.pts;
      const inner: THREE.Vector2[] = [];
      const SEG = 48;
      for (let i = 0; i <= SEG; i += 1) inner.push(soffit(ti - (2 * ti * i) / SEG, ri));
      return new THREE.Shape([...outer, ...inner.slice().reverse()]);
    };
    // a broad band, and a narrower, deeper one in front of it
    const broad = { shape: band(0.28), depth: 0.9 };
    const narrow = { shape: band(0.46), depth: 0.5 };
    const parts: THREE.BufferGeometry[] = [];
    for (const z of PILASTER_ZS) {
      for (const { shape, depth } of [broad, narrow]) {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, z - depth / 2);
        parts.push(g.toNonIndexed());
        g.dispose();
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }, []);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

const CORNICE_BOTTOM = WALL_H - 0.82;

/**
 * The cornice: a bed mould, a deep corona and a cyma, projecting into the
 * hall and stepping back to the wall. Drawn (into the hall, up) and
 * swept the length of the hall; `side` mirrors it for the right-hand wall.
 */
function useCornice(side: 1 | -1) {
  const geo = useMemo(() => {
    const pts: [number, number][] = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.06],
      [0.34, 0.1],
      [0.34, 0.22],
      [0.5, 0.28],
      [0.5, 0.36],
      [0.74, 0.4],
      [0.74, 0.6],
      [0.52, 0.64],
      [0.52, 0.7],
      [0.24, 0.76],
      [0.24, 0.8],
      [0, 0.82],
    ];
    // mirrored for the other wall: reversing the points keeps the outline counter-clockwise
    const ordered = side === 1 ? pts : pts.slice().reverse();
    const shape = new THREE.Shape(ordered.map(([x, y]) => new THREE.Vector2(side * x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: LENGTH, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, CORNICE_BOTTOM, Z_FAR);
    return g;
  }, [side]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/**
 * The pilasters and the cornice's step forward over each: a base, a
 * plain shaft, a capital, and above it the block the rib stands on, all
 * merged into one mesh.
 */
function usePilasters() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(d, h, w);
      g.translate(x, y, z);
      parts.push(g.toNonIndexed());
      g.dispose();
    };
    const BASE_Y = 1.18;
    const SHAFT_BOTTOM = BASE_Y + 0.42;
    const CAP_H = 0.32;
    const SHAFT_TOP = CORNICE_BOTTOM - CAP_H;
    for (const z of PILASTER_ZS) {
      for (const side of [-1, 1]) {
        // each box is pushed out from the wall by half its projection
        const out = (proj: number) => side * (HW - proj / 2);
        box(1.2, 0.42, 0.52, out(0.52), BASE_Y + 0.21, z);
        box(0.9, SHAFT_TOP - SHAFT_BOTTOM, 0.38, out(0.38), (SHAFT_TOP + SHAFT_BOTTOM) / 2, z);
        box(1.26, CAP_H, 0.56, out(0.56), SHAFT_TOP + CAP_H / 2, z);
        // the cornice steps forward over the pilaster, and the rib stands on this
        box(1.7, 0.82, 1.0, out(1.0), CORNICE_BOTTOM + 0.41, z);
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }, []);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

/** The plain wall that closes the vault at the end of the hall: the section on a rectangle, one piece with the wall below it. */
export function VaultEnd() {
  const geo = useMemo(() => {
    const pts = [new THREE.Vector2(HW, 0), ...SECTION.pts.map((p) => new THREE.Vector2(p.x, p.y - WALL_H)), new THREE.Vector2(-HW, 0)];
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, WALL_H, Z_FAR + 0.02]}>
      <meshStandardMaterial
        color={PLASTER}
        roughness={0.9}
        metalness={0}
        envMapIntensity={0.4}
        emissive={PLASTER}
        emissiveIntensity={0.1}
      />
    </mesh>
  );
}

export function Vault() {
  const surface = useSurface();
  const light = useVaultLight();
  const ribs = useRibs();
  const corniceL = useCornice(1);
  const corniceR = useCornice(-1);
  const pilasters = usePilasters();
  // laid with the courses running along the hall, tiled at the size the flat ceiling's were
  const pbr = useMemo(() => blackBrickFor(SECTION.length / BRICK_TILE, LENGTH / BRICK_TILE), []);
  /* the walls' own stone, a shade lighter so the structure still reads against the walls it stands on */
  const stone = (
    <meshStandardMaterial
      color={new THREE.Color(SHELL.wall).multiplyScalar(1.14)}
      roughness={0.86}
      metalness={0.03}
      envMapIntensity={0.45}
      emissive={SHELL.wall}
      emissiveIntensity={0.1}
    />
  );
  return (
    <group>
      <mesh geometry={surface}>
        <meshStandardMaterial
          color={SHELL.ground}
          map={pbr?.map ?? null}
          normalMap={pbr?.normalMap ?? null}
          roughnessMap={pbr?.roughnessMap ?? null}
          aoMap={pbr?.aoMap ?? null}
          aoMapIntensity={1.1}
          normalScale={new THREE.Vector2(0.7, 0.7)}
          roughness={0.55}
          metalness={0.18}
          envMapIntensity={0.5}
          /* the brick lights itself a little, so its courses still read where no lamp reaches */
          emissive="#a07e4c"
          emissiveMap={pbr?.map ?? null}
          emissiveIntensity={0.42}
        />
      </mesh>
      {/* a faint warmth up the curve from the cornice, laid over the brick */}
      {light ? (
        <mesh geometry={surface} renderOrder={1}>
          <meshBasicMaterial
            map={light}
            transparent
            opacity={0.32}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ) : null}
      {ribs ? <mesh geometry={ribs}>{stone}</mesh> : null}
      <mesh geometry={corniceL} position={[-HW, 0, 0]}>
        {stone}
      </mesh>
      <mesh geometry={corniceR} position={[HW, 0, 0]}>
        {stone}
      </mesh>
      {pilasters ? <mesh geometry={pilasters}>{stone}</mesh> : null}
      <VaultEnd />
    </group>
  );
}
