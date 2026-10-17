"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { HALF_WIDTH as HW, LENGTH, WALL_H, Z_FAR, Z_NEAR } from "./corridorLayout";
import { SHELL } from "./palette";
import { block, ease, frame, merged, pilaster, placed, rosetteGeometry, shade, sweptProfile, worldUV } from "./architecture";
import { getStoneGrain, lattice, normalFrom, repeat, seeded } from "./stoneTextures";

/**
 * The hall's roof, built as a classical gallery is: in bays.
 *
 * A barrel vault stands because its weight is carried down to the ground
 * in a few places, and a good one shows you where. Here that is the
 * pilasters: one stands against each wall at every bay, rises to the
 * cornice, and the cornice breaks forward over it. From that break a rib
 * springs across the hall, so each rib lands on a pilaster and each
 * pilaster is the foot of a rib.
 *
 * Between the ribs the vault is coffered, as the great Roman vaults and
 * the galleries modelled on them are: a grid of stone beams, stepped
 * twice, with a sunk panel in each square and a bronze rosette at its
 * centre. Coffering is how a vault is made light - the panels are thin
 * and the beams carry the load - and it gives the curve a scale the eye
 * can measure. There are seven coffers across, so one runs down the
 * crown, and three to a bay, so the rhythm of the ceiling is the rhythm
 * of the walls.
 *
 * The curve is a single circle's arc, a segment struck from one centre
 * with a rise of about a quarter of the span: the shape a mason can lay
 * out with a cord and that needs no more of a wall than these have. It
 * meets the wall behind the cornice, which hides the angle where the two
 * meet, as a cornice always does. A keystone locks each rib at its crown.
 *
 * The colour is the hall's own: the coffers are the dark of the floor,
 * and the beams, ribs, cornice and pilasters are the walls' stone. Only a
 * faint warmth climbs the curve from the cornice, enough to show the
 * structure and no more.
 */

/** The curve springs at the top of the wall. */
export const SPRING_Y = WALL_H;
export const VAULT_RISE = 4.2;
/** The circle the curve is struck from. */
const R = (HW * HW + VAULT_RISE * VAULT_RISE) / (2 * VAULT_RISE);
const CY = SPRING_Y + VAULT_RISE - R;
const PHI = Math.asin(HW / R);

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
export const SECTION = (() => {
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

/* ------------------------------------------------------------------ */
/* The coffers                                                         */
/* ------------------------------------------------------------------ */

const ACROSS = 7;
/** One coffer's width, measured round the curve. */
const COFFER_S = SECTION.length / ACROSS;
/** Half a rib's breadth along the hall: the coffers stop at its faces. */
const RIB_HALF = 0.45;
const PER_BAY = 3;
const COFFER_Z = (BAY - 2 * RIB_HALF) / PER_BAY;
/** The beams between the coffers, in two steps: a broad shallow one, and a narrow one standing proud of it. */
const STEPS = [
  { w: 0.56, drop: 0.12 },
  { w: 0.3, drop: 0.23 },
];
const FRAME_HALF = STEPS[0].w / 2;

/** Where the beams cross the hall: at the two faces of each rib, and two between. */
const CROSS_ZS: number[] = (() => {
  const out: number[] = [];
  for (let z = PILASTER_ZS[0] + RIB_HALF; z < Z_NEAR; z += COFFER_Z) out.push(z);
  for (const zr of PILASTER_ZS) {
    for (let j = 0; j <= PER_BAY; j += 1) {
      const z = zr - RIB_HALF - j * COFFER_Z;
      if (z > Z_FAR) out.push(z);
    }
  }
  return out.sort((a, b) => b - a);
})();

/** The centre of every whole coffer along the hall. */
const COFFER_ZS: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i + 1 < CROSS_ZS.length; i += 1) {
    if (Math.abs(CROSS_ZS[i] - CROSS_ZS[i + 1] - COFFER_Z) < 0.01) out.push((CROSS_ZS[i] + CROSS_ZS[i + 1]) / 2);
  }
  return out;
})();

/**
 * The vault surface, seen from inside, swept the length of the hall. Its
 * texture coordinates are given by `uvAt`, from the distance round the
 * curve and the position along the hall.
 */
function useSurface(uvAt: (along: number, z: number) => [number, number]) {
  const geo = useMemo(() => {
    const { pts, normals, along } = SECTION;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      for (const z of [Z_NEAR, Z_FAR]) {
        pos.push(p.x, p.y, z);
        nor.push(normals[i].x, normals[i].y, 0);
        uv.push(...uvAt(along[i], z));
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
    g.setIndex(idx);
    return g;
    // the mapping is fixed for each caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/**
 * The sunk panel of one coffer, and the bay it repeats in: one coffer
 * across, one bay along. The panel is darker toward its edges, where the
 * beams shade it, with an incised line a hand's breadth in from them, and
 * the stone's grain over all of it - painted and given relief, so it is
 * lit and not printed.
 */
function useCofferTile() {
  const tex = useMemo(() => {
    const PPU = 64;
    const W = Math.round(COFFER_S * PPU);
    const H = BAY * PPU;
    const rand = seeded(4021);
    const cloud = lattice(rand, 40, W, H);
    const fine = lattice(rand, 5, W, H);
    const colour = document.createElement("canvas");
    colour.width = W;
    colour.height = H;
    const ctx = colour.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(W, H);
    const height = new Float32Array(W * H);
    const beams = [0, 1, 2, 3].map((j) => RIB_HALF + j * COFFER_Z);
    const smooth = (e0: number, e1: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < H; y += 1) {
      // canvas rows run down the image, the hall's z runs up it
      const zz = BAY * (1 - (y + 0.5) / H);
      const dz = Math.min(...beams.map((b) => Math.abs(zz - b))) - FRAME_HALF;
      for (let x = 0; x < W; x += 1) {
        const s = (COFFER_S * (x + 0.5)) / W;
        const ds = Math.min(s, COFFER_S - s) - FRAME_HALF;
        // distance in from the panel's edge
        const e = Math.min(ds, dz);
        const shade = 0.52 + 0.48 * smooth(0, 0.6, e);
        // the incised line round the panel
        const line = Math.exp(-(((e - 0.2) / 0.018) ** 2));
        const grain = (cloud(x, y) - 0.5) * 0.12 + (fine(x, y) - 0.5) * 0.1 + (rand() - 0.5) * 0.05;
        const v = Math.max(0, (0.9 + grain) * shade * (1 - 0.32 * line));
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, 255 * v);
        img.data[i + 1] = Math.min(255, 247 * v);
        img.data[i + 2] = Math.min(255, 234 * v);
        img.data[i + 3] = 255;
        height[y * W + x] = fine(x, y) * 0.5 + cloud(x, y) * 0.3 - line * 0.9;
      }
    }
    ctx.putImageData(img, 0, 0);
    const n = normalFrom(height, 2, W, H);
    if (!n) return null;
    const map = repeat(new THREE.CanvasTexture(colour));
    map.colorSpace = THREE.SRGBColorSpace;
    return { map, normalMap: repeat(new THREE.CanvasTexture(n)) };
  }, []);
  useEffect(
    () => () => {
      tex?.map.dispose();
      tex?.normalMap.dispose();
    },
    [tex],
  );
  return tex;
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
        // darkest at the far end, so the vault closes down round the statue and frames it
        const far = 0.3 + 0.7 * ((z - Z_FAR) / LENGTH);
        const b = (0.16 + 0.5 * Math.exp(-d / 0.26)) * bay * far;
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

/* ------------------------------------------------------------------ */
/* The stonework                                                       */
/* ------------------------------------------------------------------ */

/** A band of stone on the soffit, `drop` deep, from springing to springing; it ends square on the cornice. */
function bandShape(drop: number) {
  const ri = R - drop;
  // where the band's lower face meets the springing line
  const ti = Math.asin(Math.sqrt(ri * ri - (SPRING_Y - CY) ** 2) / ri);
  const inner: THREE.Vector2[] = [];
  const SEG = 48;
  for (let i = 0; i <= SEG; i += 1) inner.push(soffit(ti - (2 * ti * i) / SEG, ri));
  return new THREE.Shape([...SECTION.pts, ...inner.reverse()]);
}

/** A strip of stone on the soffit, between two distances round the curve, `drop` deep. */
function stripShape(s0: number, s1: number, drop: number) {
  const t0 = PHI - Math.max(0, s0) / R;
  const t1 = PHI - Math.min(SECTION.length, s1) / R;
  const pts: THREE.Vector2[] = [];
  const SEG = 3;
  for (let k = 0; k <= SEG; k += 1) pts.push(soffit(t0 + ((t1 - t0) * k) / SEG));
  for (let k = SEG; k >= 0; k -= 1) pts.push(soffit(t0 + ((t1 - t0) * k) / SEG, R - drop));
  return new THREE.Shape(pts);
}

/** A section swept along the hall from `z0`, `depth` long. */
function alongHall(shape: THREE.Shape, z0: number, depth: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, z0);
  return g;
}

export const CORNICE_BOTTOM = WALL_H - 0.82;

/**
 * The cornice's profile, out from the wall and up: a bed mould, a fascia
 * the dentils hang from, a deep corona and a cyma, stepping back to the
 * wall at the top. `push` brings the whole face forward, for the breaks
 * over the pilasters.
 */
export function corniceProfile(push = 0): [number, number][] {
  return (
    [
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
    ] as [number, number][]
  ).map(([o, u]) => [o + push, u]);
}

/** One wall's frame, at height `y` and `z` along the hall. */
const wallAt = (side: 1 | -1, y: number, z: number) =>
  frame(new THREE.Vector3(side * HW, y, z), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-side, 0, 0));

/**
 * All the hall's stonework in one mesh: ribs, coffer beams, keystones,
 * cornices with their dentils, the breaks over the pilasters, and the
 * pilasters themselves. One material and one draw for all of it.
 */
function useStonework() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const keep = (g: THREE.BufferGeometry) => {
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    // on the vault, darker toward the panels, where the beams and ribs meet them
    const onVault = (g: THREE.BufferGeometry) =>
      keep(shade(g, (q) => 0.45 + 0.55 * ease(0, 0.22, R - Math.hypot(q.x, q.y - CY))));
    // on the walls, darker toward the wall, under the projections
    const onWall = (from: number, to: number) => (q: THREE.Vector3) => 0.42 + 0.58 * ease(from, to, q.z);

    // the ribs: a broad band and a narrower, deeper one in front of it
    const broad = bandShape(0.28);
    const narrow = bandShape(0.46);
    for (const z of PILASTER_ZS) {
      onVault(alongHall(broad, z - 0.45, 0.9));
      onVault(alongHall(narrow, z - 0.25, 0.5));
    }

    // the coffer beams across the hall, and those running along it
    for (const { w, drop } of STEPS) {
      // the cross beams a hair deeper, so the two never fight where they meet
      const cross = bandShape(drop + 0.005);
      for (const z of CROSS_ZS) onVault(alongHall(cross, z - w / 2, w));
      for (let k = 0; k <= ACROSS; k += 1) {
        const s = k * COFFER_S;
        onVault(alongHall(stripShape(s - w / 2, s + w / 2, drop), Z_FAR, LENGTH));
      }
    }

    // a keystone at each rib's crown, its sides on lines from the centre, as the joints of an arch run
    const rTop = R - 0.3;
    const rBot = R - 0.7;
    const key = new THREE.Shape([
      soffit(-0.24 / rBot, rBot),
      soffit(0.24 / rBot, rBot),
      soffit(0.34 / rTop, rTop),
      soffit(-0.34 / rTop, rTop),
    ]);
    for (const z of PILASTER_ZS) keep(alongHall(key, z - 0.31, 0.62, 0.02));

    for (const side of [1, -1] as const) {
      // the cornice, the length of the hall
      keep(placed(shade(sweptProfile(corniceProfile(), LENGTH), onWall(0.2, 0.74)), wallAt(side, CORNICE_BOTTOM, Z_FAR)));

      // dentils under the corona: small blocks, a little more than their width apart
      const dentils: THREE.BufferGeometry[] = [];
      for (let x = 0.1; x < LENGTH - 0.1; x += 0.22) dentils.push(block(0.12, 0.15, 0.46, 0.1, x));
      const row = shade(merged(dentils), onWall(0.2, 0.74));
      keep(placed(row, wallAt(side, CORNICE_BOTTOM, Z_FAR)));
      row.dispose();

      const shaft = pilaster(0.9, 0.38, CORNICE_BOTTOM - 1.18);
      for (const z of PILASTER_ZS) {
        // the pilaster, standing on the wall's bronze plinth band
        keep(placed(shaft, wallAt(side, 1.18, z)));
        // and the cornice breaking forward over it, for the rib to stand on
        const brk = shade(sweptProfile(corniceProfile(0.34), 1.7), onWall(0.54, 1.08));
        keep(placed(brk, wallAt(side, CORNICE_BOTTOM, z - 0.85)));
        brk.dispose();
      }
      shaft.dispose();
    }

    const all = merged(parts);
    return worldUV(all, 2.6);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

function Rosettes() {
  const mesh = useMemo(() => {
    const spots: { t: number; r: number; z: number; scale: number }[] = [];
    for (const z of COFFER_ZS) {
      for (let k = 0; k < ACROSS; k += 1) spots.push({ t: PHI - ((k + 0.5) * COFFER_S) / R, r: R - 0.004, z, scale: 1.25 });
    }
    // under each keystone
    for (const z of PILASTER_ZS) spots.push({ t: 0, r: R - 0.72, z, scale: 0.8 });
    const m = new THREE.InstancedMesh(
      rosetteGeometry(),
      new THREE.MeshStandardMaterial({
        color: "#9a7b42",
        metalness: 0.85,
        roughness: 0.45,
        envMapIntensity: 0.7,
        /* a faint warm uplight in the coffers, so the rosettes catch it while the vault stays dark */
        emissive: "#6b4a1c",
        emissiveIntensity: 0.21,
      }),
      spots.length,
    );
    const o = new THREE.Object3D();
    spots.forEach(({ t, r, z, scale }, i) => {
      const p = soffit(t, r);
      o.position.set(p.x, p.y, z);
      // turned so it faces straight in from the curve
      o.rotation.set(0, 0, -t);
      o.scale.setScalar(scale);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    // the uplight falls off down the hall: the rosettes at the far end are the dimmest
    const tint = new THREE.Color();
    spots.forEach(({ z }, i) => m.setColorAt(i, tint.setScalar(0.3 + 0.7 * ((z - Z_FAR) / LENGTH))));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/** The baked shade darkens the stone's faint self-light as well as the light it reflects. */
function shadeSelfLight(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;",
  );
}
const shadeSelfLightKey = () => "shade-self-light";

/**
 * The hall's structural stone: the walls' sandstone, a shade lighter so
 * the structure still reads against the walls it stands on, grained, and
 * shaded by whatever its geometry has baked in.
 */
export function StoneMaterial({ tint = 1.3 }: { tint?: number }) {
  const grain = useMemo(() => getStoneGrain(), []);
  return (
    <meshStandardMaterial
      vertexColors
      onBeforeCompile={shadeSelfLight}
      customProgramCacheKey={shadeSelfLightKey}
      color={new THREE.Color(SHELL.wall).multiplyScalar(tint)}
      map={grain?.map ?? null}
      normalMap={grain?.normalMap ?? null}
      roughnessMap={grain?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.4, 0.4)}
      roughness={0.9}
      metalness={0.03}
      envMapIntensity={0.45}
      emissive={SHELL.wall}
      emissiveMap={grain?.map ?? null}
      emissiveIntensity={0.22}
    />
  );
}

export function Vault() {
  // one coffer across and one bay along per repeat of the panel texture
  const panels = useSurface((along, z) => [along / COFFER_S, (z - FIRST_PILASTER) / BAY]);
  // the cornice light is painted over the whole vault at once
  const glowSurface = useSurface((along, z) => [along / SECTION.length, z === Z_NEAR ? 0 : 1]);
  const tile = useCofferTile();
  const light = useVaultLight();
  const stonework = useStonework();
  return (
    <group>
      <mesh geometry={panels}>
        <meshStandardMaterial
          color={SHELL.ground}
          map={tile?.map ?? null}
          normalMap={tile?.normalMap ?? null}
          normalScale={new THREE.Vector2(0.8, 0.8)}
          roughness={0.82}
          metalness={0.04}
          envMapIntensity={0.45}
          /* the panels light themselves a little, so the coffers still read where no lamp reaches */
          emissive="#3b2c1b"
          emissiveMap={tile?.map ?? null}
          emissiveIntensity={0.5}
        />
      </mesh>
      {/* a faint warmth up the curve from the cornice, laid over the panels */}
      {light ? (
        <mesh geometry={glowSurface} renderOrder={1}>
          <meshBasicMaterial
            map={light}
            transparent
            opacity={0.13}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ) : null}
      <mesh geometry={stonework}>
        <StoneMaterial />
      </mesh>
      <Rosettes />
    </group>
  );
}
