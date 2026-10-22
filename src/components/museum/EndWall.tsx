"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { HALF_WIDTH as HW, Z_FAR } from "./corridorLayout";
import { GOLD, SHELL } from "./palette";
import { block, ease, frame, merged, pilaster, placed, shade, sweptProfile, worldUV } from "./architecture";
import { ASHLAR_TILE, getAshlar, getStoneGrain } from "./stoneTextures";
import { CORNICE_BOTTOM, SECTION, StoneMaterial, corniceProfile } from "./Vault";
import { receiveStatueShadow } from "./statueShadow";

/**
 * The wall that closes the hall, behind the statue.
 *
 * It is built, not plastered: dark ashlar in courses, the darkest plane
 * in the hall, so the figure in front of it is the brightest thing at the
 * end of the walk. The order of the side walls carries across it - fluted
 * pilasters, the cornice with its dentils breaking forward over each - so
 * the end of the hall is a wall of the same building and not a backdrop.
 *
 * At its centre is a niche: a half-round recess with a half-dome over it,
 * as a statue gallery would have, framed in a stepped architrave with a
 * keystone. The hollow is lit from above, faintly: brightest at the height
 * of the statue's head and falling to near black at its floor, and kept
 * well over three stops darker than the figure, so the marble is the
 * brightest thing at the end of the walk and nothing glows up from
 * behind his feet. A single hairline of light runs round the arch - the
 * one modern hand in it.
 */

const NICHE_R = 2;
/** The niche's sill, on the wall's bronze band. */
const NICHE_SILL = 1.18;
/** Where the half-dome springs. */
const NICHE_SPRING = 7.4;
/** The architrave's breadth round the opening. */
const FRAME = 0.34;
/** Pilasters across the wall: two framing the niche, one in each corner. */
const PILASTER_XS = [-7.35, -3.5, 3.5, 7.35];

/** The outline of an arched opening `r` wide each side of centre, from the sill up, drawn clockwise from the left foot. */
function archOutline(r: number, seg = 40) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(-r, NICHE_SILL), new THREE.Vector2(-r, NICHE_SPRING)];
  for (let i = 1; i < seg; i += 1) {
    const a = Math.PI - (Math.PI * i) / seg;
    pts.push(new THREE.Vector2(r * Math.cos(a), NICHE_SPRING + r * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(r, NICHE_SPRING), new THREE.Vector2(r, NICHE_SILL));
  return pts;
}

/** A band round the arch between radii `r0` and `r1`, standing on the sill: an architrave, or a bead within it. */
function archBand(r0: number, r1: number) {
  const outer = archOutline(r1);
  const inner = archOutline(r0).reverse();
  return new THREE.Shape([...outer, ...inner]);
}

/** The wall itself: the hall's section on a rectangle, with the niche cut out of it. */
function useWall() {
  const geo = useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(-HW, 0), new THREE.Vector2(HW, 0), ...SECTION.pts]);
    shape.holes.push(new THREE.Path(archOutline(NICHE_R).reverse()));
    return new THREE.ShapeGeometry(shape, 24);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** The niche's hollow: a half-cylinder, the half-dome over it, and its sill. */
function useNiche() {
  const geo = useMemo(() => {
    const h = NICHE_SPRING - NICHE_SILL;
    const drum = new THREE.CylinderGeometry(NICHE_R, NICHE_R, h, 40, 1, true, Math.PI / 2, Math.PI);
    drum.translate(0, NICHE_SILL + h / 2, 0);
    const conch = new THREE.SphereGeometry(NICHE_R, 40, 14, Math.PI, Math.PI, 0, Math.PI / 2);
    conch.translate(0, NICHE_SPRING, 0);
    // one height coordinate for the whole hollow, so the glow runs from the sill up into the dome
    const remap = (g: THREE.BufferGeometry, from: number, to: number) => {
      const uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i += 1) uv.setY(i, from + (to - from) * uv.getY(i));
    };
    remap(drum, 0, 0.75);
    remap(conch, 0.75, 1);
    const g = merged([drum.toNonIndexed(), conch.toNonIndexed()]);
    drum.dispose();
    conch.dispose();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/**
 * The light in the niche, painted up its curve: a soft band brightest at
 * the statue's head (about two fifths of the way up the hollow), near black
 * at the sill, fading slowly into the half-dome - light falling from
 * above, not rising from the floor.
 */
function useNicheGlow() {
  const tex = useMemo(() => {
    const H = 256;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    for (let y = 0; y < H; y += 1) {
      // the canvas's top row is the top of the half-dome
      const v = 1 - y / (H - 1);
      const head = 0.42;
      const k = (v - head) / (v < head ? 0.22 : 0.36);
      const b = 0.02 + 0.98 * Math.exp(-k * k);
      ctx.fillStyle = `rgb(${Math.round(255 * b)},${Math.round(255 * b)},${Math.round(255 * b)})`;
      ctx.fillRect(0, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** The pilasters, the cornice across the wall with its dentils and breaks, the architrave and keystone round the niche. */
function useStonework() {
  const geo = useMemo(() => {
    const along = new THREE.Vector3(1, 0, 0);
    const out = new THREE.Vector3(0, 0, 1);
    const at = (x: number, y: number) => frame(new THREE.Vector3(x, y, Z_FAR), along, out);
    const onWall = (from: number, to: number) => (q: THREE.Vector3) => 0.42 + 0.58 * ease(from, to, q.z);
    const parts: THREE.BufferGeometry[] = [];

    const shaft = pilaster(0.9, 0.38, CORNICE_BOTTOM - 1.18);
    for (const x of PILASTER_XS) {
      parts.push(placed(shaft, at(x, 1.18)));
      const brk = shade(sweptProfile(corniceProfile(0.34), 1.7), onWall(0.54, 1.08));
      parts.push(placed(brk, at(x - 0.85, CORNICE_BOTTOM)));
      brk.dispose();
    }
    shaft.dispose();

    const cornice = shade(sweptProfile(corniceProfile(), HW * 2), onWall(0.2, 0.74));
    parts.push(placed(cornice, at(-HW, CORNICE_BOTTOM)));
    cornice.dispose();
    const dentils: THREE.BufferGeometry[] = [];
    for (let x = 0.1; x < HW * 2 - 0.1; x += 0.22) dentils.push(block(0.12, 0.15, 0.46, 0.1, x));
    const row = shade(merged(dentils), onWall(0.2, 0.74));
    parts.push(placed(row, at(-HW, CORNICE_BOTTOM)));
    row.dispose();

    // the architrave: a broad flat band, and a bead standing proud of it at the opening
    const bevel = (depth: number, b: number) => ({ depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
    const band = new THREE.ExtrudeGeometry(archBand(NICHE_R, NICHE_R + FRAME), bevel(0.07, 0.025));
    const bead = new THREE.ExtrudeGeometry(archBand(NICHE_R + 0.02, NICHE_R + 0.11), bevel(0.13, 0.03));
    for (const g of [band, bead]) {
      g.translate(0, 0, Z_FAR + 0.02);
      parts.push(shade(g, (q) => 0.62 + 0.38 * ease(Z_FAR, Z_FAR + 0.12, q.z)));
    }

    // the keystone, wider at its head, its sides on lines from the arch's centre
    const top = NICHE_SPRING + NICHE_R;
    const key = new THREE.Shape([
      new THREE.Vector2(-0.24, top - 0.06),
      new THREE.Vector2(0.24, top - 0.06),
      new THREE.Vector2(0.34, top + FRAME + 0.3),
      new THREE.Vector2(-0.34, top + FRAME + 0.3),
    ]);
    const keystone = new THREE.ExtrudeGeometry(key, bevel(0.2, 0.03));
    keystone.translate(0, 0, Z_FAR + 0.02);
    parts.push(keystone);

    return worldUV(merged(parts), 2.6);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** The hairline of light round the arch, set into the architrave between its band and its bead. */
function useHairline() {
  const geo = useMemo(() => {
    const g = new THREE.ShapeGeometry(archBand(NICHE_R + 0.165, NICHE_R + 0.185), 1);
    g.translate(0, 0, Z_FAR + 0.02 + 0.07 + 0.025 + 0.004);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

export function EndWall() {
  const wall = useWall();
  const niche = useNiche();
  const glow = useNicheGlow();
  const stonework = useStonework();
  const hairline = useHairline();
  const ashlar = useMemo(() => {
    const base = getAshlar();
    if (!base) return null;
    // the wall's coordinates are metres; one repeat of the stone covers ASHLAR_TILE of them
    const tile = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(1 / ASHLAR_TILE, 1 / ASHLAR_TILE);
      c.needsUpdate = true;
      return c;
    };
    return { map: tile(base.map), normalMap: tile(base.normalMap), roughnessMap: tile(base.roughnessMap) };
  }, []);
  const nicheGrain = useMemo(() => {
    const base = getStoneGrain();
    if (!base) return null;
    const c = base.map.clone();
    c.repeat.set(2.4, 2.2);
    c.needsUpdate = true;
    return c;
  }, []);
  useEffect(
    () => () => {
      ashlar?.map.dispose();
      ashlar?.normalMap.dispose();
      ashlar?.roughnessMap.dispose();
      nicheGrain?.dispose();
    },
    [ashlar, nicheGrain],
  );
  const DARK = "#43372a";

  return (
    <group>
      <mesh geometry={wall} position={[0, 0, Z_FAR + 0.02]}>
        <meshStandardMaterial
          color={DARK}
          map={ashlar?.map ?? null}
          normalMap={ashlar?.normalMap ?? null}
          roughnessMap={ashlar?.roughnessMap ?? null}
          normalScale={new THREE.Vector2(0.9, 0.9)}
          roughness={0.9}
          metalness={0.02}
          envMapIntensity={0.35}
          emissive={DARK}
          emissiveMap={ashlar?.map ?? null}
          emissiveIntensity={0.14}
          ref={(m: THREE.MeshStandardMaterial | null) => {
            if (m) receiveStatueShadow(m, 0.45);
          }}
        />
      </mesh>

      {/* the niche, darker stone, lit from a hidden source at its foot */}
      <mesh geometry={niche} position={[0, 0, Z_FAR + 0.02]}>
        <meshStandardMaterial
          side={THREE.BackSide}
          color="#2f271e"
          map={nicheGrain}
          roughness={0.88}
          metalness={0.02}
          envMapIntensity={0.3}
          emissive="#b98545"
          emissiveMap={glow}
          emissiveIntensity={0.15}
          ref={(m: THREE.MeshStandardMaterial | null) => {
            if (m) receiveStatueShadow(m, 0.45);
          }}
        />
      </mesh>
      <mesh position={[0, NICHE_SILL + 0.001, Z_FAR + 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[NICHE_R, 40, 0, Math.PI]} />
        <meshStandardMaterial
          color={SHELL.recess}
          roughness={0.7}
          metalness={0.2}
          ref={(m: THREE.MeshStandardMaterial | null) => {
            if (m) receiveStatueShadow(m, 0.4);
          }}
        />
      </mesh>

      <mesh geometry={stonework}>
        <StoneMaterial tint={1.18} />
      </mesh>

      <mesh geometry={hairline}>
        <meshBasicMaterial color={GOLD.light} toneMapped={false} />
      </mesh>

      {/* the plinth course and its bronze band, carried across from the side walls */}
      <mesh position={[0, 0.55, Z_FAR + 0.11]}>
        <boxGeometry args={[HW * 2, 1.1, 0.18]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.62} metalness={0.3} envMapIntensity={0.7} />
      </mesh>
      <mesh position={[0, 1.16, Z_FAR + 0.13]}>
        <boxGeometry args={[HW * 2, 0.09, 0.22]} />
        <meshStandardMaterial color={GOLD.metal} roughness={0.3} metalness={1} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

