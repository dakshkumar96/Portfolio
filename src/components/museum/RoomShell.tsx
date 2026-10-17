"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { plasterFor, PLASTER_TILE } from "./textures";
import { GOLD, SHELL } from "./palette";
import { CAM_Y, DOOR_H, DOOR_RECESS, DOOR_W, ROOM_H, roomCenter, roomSize, type DoorSpec } from "./corridorLayout";
import { backWallX, roomView, slotX, spotPlan } from "./roomLayout";
import { block, ease, merged, pilaster, shade as bake, sweptProfile, worldUV } from "./architecture";
import { StoneMaterial, corniceProfile } from "./Vault";
import { damaskFor, getLaylight, getMedallion, marbleFor } from "./roomTextures";
import { getStoneGrain } from "./stoneTextures";
import { gildedLettering } from "./inscriptions";

/**
 * One room, built once, for every room.
 *
 * A gallery room is built in the same order as the hall it opens off,
 * and dressed the way the great picture galleries are:
 *
 *  - the walls hung in silk damask, deep and quiet, its pattern showing
 *    only as a change of sheen where the light falls on it
 *  - below that a dado of stone panels under a rail, and a moulded
 *    skirting, so nothing stands straight against the cloth at the floor
 *  - fluted pilasters, the hall's own, carrying an entablature round the
 *    room: architrave, a frieze with the room's name cut in it over the
 *    work, and the cornice with its dentils
 *  - a coffered ceiling, the coffers over the middle of the room glazed as
 *    a laylight, so the light seems to come down from above
 *  - a floor of polished marble slabs inside a border, with a star of
 *    stone and brass set into it in front of the work
 *  - faint beams of haze under the exhibit spotlights
 *
 * Every room gets the same shell; only what stands in it differs.
 *
 * Nothing here adds a light. The spotlights are the permanent pool in
 * <RoomLights>, re-aimed per room; what glows here glows by its own
 * material.
 *
 * Local frame for anything built against a wall: the face lies in XY at
 * z = 0 looking down +Z, so +Z is into the room and anything proud of the
 * wall has a positive z.
 */

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/** Sandstone plaster, for the ceiling slab. */
function Plaster({ rx, ry, tint = SHELL.wall, glow = 0 }: { rx: number; ry: number; tint?: string; glow?: number }) {
  const pbr = useMemo(() => plasterFor(rx, ry), [rx, ry]);
  return (
    <meshStandardMaterial
      color={tint}
      map={pbr?.map ?? null}
      normalMap={pbr?.normalMap ?? null}
      roughnessMap={pbr?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.4, 0.4)}
      roughness={0.92}
      metalness={0}
      envMapIntensity={0.35}
      emissive={tint}
      emissiveIntensity={glow}
    />
  );
}

/** Silk damask, sized to the surface it hangs on. */
function Damask({ w, h, tint }: { w: number; h: number; tint: string }) {
  const pbr = useMemo(() => damaskFor(w, h), [w, h]);
  return (
    <meshStandardMaterial
      color={tint}
      map={pbr?.map ?? null}
      normalMap={pbr?.normalMap ?? null}
      roughnessMap={pbr?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.35, 0.35)}
      roughness={1}
      metalness={0}
      envMapIntensity={0.55}
      emissive={tint}
      emissiveIntensity={0.03}
    />
  );
}

/** The damask: a deep umber silk, a shade warmer than the hall's stone. */
const SILK = "#55392a";

/** Shift a hex colour's lightness by a fraction, for per-surface variation. */
function tone(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l * (1 + amount), 0, 1));
  return `#${c.getHexString()}`;
}

/** Warm light, never white: the spotlight track, the inlay's glint. */
const WARM = "#e0b070";

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

/** The skirting: a plain plinth face, a chamfer, a cove and a small bead, drawn (out, up). */
const SKIRTING: [number, number][] = [
  [0.16, 0],
  [0.16, 0.44],
  [0.14, 0.47],
  [0.14, 0.52],
  [0.11, 0.59],
  [0.075, 0.64],
  [0.06, 0.66],
  [0.06, 0.69],
  [0.035, 0.72],
];
const SKIRTING_H = 0.72;
/** The dado runs from the skirting to here, and the silk from here up. */
const DADO_TOP = 1.55;
/** The dado rail: a small rounded moulding capping the panels. */
const RAIL: [number, number][] = [
  [0.05, 0],
  [0.085, 0.025],
  [0.085, 0.06],
  [0.065, 0.085],
  [0.03, 0.1],
];
/** The architrave over the pilasters: two fascias and a small cap. */
const ARCHITRAVE: [number, number][] = [
  [0.06, 0],
  [0.06, 0.12],
  [0.085, 0.14],
  [0.085, 0.26],
  [0.12, 0.3],
];
const ARCHITRAVE_H = 0.3;
const FRIEZE_H = 0.8;
const CORNICE_H = 0.82;
/** Where the entablature starts, on the pilasters' capitals. */
const ENTABLATURE_Y = ROOM_H - CORNICE_H - FRIEZE_H - ARCHITRAVE_H;

type Run = { x: number; len: number };
const NONE: number[] = [];

/**
 * A wall's stonework, merged into one mesh: skirting, dado and rail along
 * each run of wall, the entablature the whole length, and the pilasters.
 * Each piece carries the shade of its own hollows.
 */
function useWallStone(length: number, runs: Run[], pilasterXs: number[]) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const onWall = (from: number, to: number) => (q: THREE.Vector3) => 0.45 + 0.55 * ease(from, to, q.z);
    const sweep = (pts: [number, number][], len: number, x0: number, y: number, from: number, to: number) => {
      const g = sweptProfile(pts, len);
      g.translate(x0, y, 0);
      parts.push(bake(g, onWall(from, to)));
    };
    for (const run of runs) {
      const x0 = run.x - run.len / 2;
      sweep(SKIRTING, run.len, x0, 0, 0, 0.16);
      // the dado: a board, and raised panels let into it, under its rail
      parts.push(bake(block(run.len, DADO_TOP - SKIRTING_H, 0.05, SKIRTING_H, run.x), () => 0.62));
      const n = Math.max(1, Math.floor(run.len / 1.7));
      const pitch = run.len / n;
      for (let k = 0; k < n; k += 1) {
        const cx = x0 + pitch * (k + 0.5);
        const pw = pitch - 0.34;
        const panel = new THREE.Shape([
          new THREE.Vector2(cx - pw / 2, SKIRTING_H + 0.14),
          new THREE.Vector2(cx + pw / 2, SKIRTING_H + 0.14),
          new THREE.Vector2(cx + pw / 2, DADO_TOP - 0.24),
          new THREE.Vector2(cx - pw / 2, DADO_TOP - 0.24),
        ]);
        const g = new THREE.ExtrudeGeometry(panel, {
          depth: 0.015,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.03,
          bevelSegments: 2,
          curveSegments: 1,
        });
        g.translate(0, 0, 0.07);
        parts.push(bake(g, onWall(0.05, 0.11)));
      }
      sweep(RAIL, run.len, x0, DADO_TOP - 0.1, 0.02, 0.085);
    }

    // the entablature, the length of the wall: architrave, frieze, cornice and its dentils
    sweep(ARCHITRAVE, length, -length / 2, ENTABLATURE_Y, 0, 0.12);
    parts.push(bake(block(length, FRIEZE_H, 0.08, ENTABLATURE_Y + ARCHITRAVE_H), () => 0.8));
    sweep(corniceProfile(), length, -length / 2, ROOM_H - CORNICE_H, 0.2, 0.74);
    const dentils: THREE.BufferGeometry[] = [];
    for (let x = -length / 2 + 0.1; x < length / 2 - 0.1; x += 0.22) dentils.push(block(0.12, 0.15, 0.46, ROOM_H - CORNICE_H + 0.1, x));
    parts.push(bake(merged(dentils), onWall(0.2, 0.74)));

    if (pilasterXs.length) {
      const shaft = pilaster(0.9, 0.38, ENTABLATURE_Y);
      for (const x of pilasterXs) {
        const g = shaft.clone();
        g.translate(x, 0, 0);
        parts.push(g);
      }
      shaft.dispose();
    }
    return worldUV(merged(parts), 2.6);
  }, [length, runs, pilasterXs]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/** The room's name, cut in the frieze over the work and gilded. */
function FriezeName({ label, length }: { label: string; length: number }) {
  const w = Math.min(length - 6, 14);
  const tex = useMemo(() => gildedLettering(label.toUpperCase(), { width: 2048, height: 136, cap: 84, tracking: 0.3 }), [label]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, ENTABLATURE_Y + ARCHITRAVE_H + FRIEZE_H / 2, 0.084]}>
      <planeGeometry args={[w, (w * 136) / 2048]} />
      <meshStandardMaterial
        map={tex}
        alphaTest={0.35}
        roughness={0.3}
        metalness={1}
        envMapIntensity={1.4}
        /* lit from within, as the door signs are: gilt alone only reflects the dark room and read as faint */
        emissive="#ffd9a0"
        emissiveMap={tex}
        emissiveIntensity={1.7}
      />
    </mesh>
  );
}

/**
 * A wall of the room. An opening, if there is one, is left as a hole in
 * the lower part, with the silk closing over its head; the entablature
 * runs straight through above it.
 */
function Wall({
  position,
  yaw,
  length,
  opening,
  tint,
  pilasterXs = NONE,
  label,
}: {
  position: [number, number, number];
  yaw: number;
  length: number;
  opening?: { width: number; height: number };
  tint: string;
  pilasterXs?: number[];
  /** the room's name, for the frieze of the wall the work hangs on */
  label?: string;
}) {
  const openW = opening?.width ?? 0;
  const runs = useMemo<Run[]>(() => {
    if (!openW) return [{ x: 0, len: length }];
    const seg = (length - openW) / 2;
    const off = openW / 2 + seg / 2;
    return [
      { x: -off, len: seg },
      { x: off, len: seg },
    ];
  }, [length, openW]);
  const stone = useWallStone(length, runs, pilasterXs);
  const silkH = ENTABLATURE_Y - DADO_TOP;

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {runs.map((run) => (
        <mesh key={run.x} position={[run.x, DADO_TOP + silkH / 2, 0]}>
          <planeGeometry args={[run.len, silkH]} />
          <Damask w={run.len} h={silkH} tint={tint} />
        </mesh>
      ))}
      {opening ? (
        <mesh position={[0, (ENTABLATURE_Y + opening.height) / 2, 0]}>
          <planeGeometry args={[opening.width, ENTABLATURE_Y - opening.height]} />
          <Damask w={opening.width} h={ENTABLATURE_Y - opening.height} tint={tint} />
        </mesh>
      ) : null}

      <mesh geometry={stone}>
        <StoneMaterial tint={1.18} />
      </mesh>
      {label ? <FriezeName label={label} length={length} /> : null}

      {/*
        Shadow where the wall meets the floor: the dark line a real room
        gathers in its corners, which a light-per-pixel renderer does not
        work out for itself.
      */}
      {runs.map((run) => (
        <mesh key={`ao${run.x}`} position={[run.x, 0.006, 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[run.len, 1.1]} />
          <meshBasicMaterial color="#000000" map={floorShadow()} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

let floorShadowTex: THREE.Texture | null = null;
/** A soft gradient, dark at the wall and gone a metre out. One texture for every wall. */
function floorShadow() {
  if (floorShadowTex) return floorShadowTex;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  /*
    The canvas's top row lands on the plane's top edge, and the plane is
    laid flat with that edge against the wall - so dark at the top.
  */
  g.addColorStop(0, "rgba(0,0,0,0.9)");
  g.addColorStop(0.45, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  floorShadowTex = new THREE.CanvasTexture(c);
  return floorShadowTex;
}

/* ------------------------------------------------------------------ */
/* Ceiling                                                             */
/* ------------------------------------------------------------------ */

/** How far the coffers go up into the slab. */
const COFFER_D = 0.6;
/** The beams between them, in two steps: a broad shallow one and a narrow one below it. */
const BEAM_STEPS = [
  { w: 0.9, d: 0.3 },
  { w: 0.5, d: COFFER_D },
];

/** How many coffers across a span, about four metres each. */
const cofferCount = (span: number) => Math.max(2, Math.round(span / 4.2));

/** The coffer grid's beams, merged: room-local, with the soffit at y = 0. */
function useBeams(depth: number, width: number) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const nx = cofferCount(depth);
    const nz = cofferCount(width);
    for (const { w, d } of BEAM_STEPS) {
      const section = (len: number) => {
        // a beam hanging from the slab, its lower arrises chamfered
        const c = Math.min(0.06, w / 6);
        const s = new THREE.Shape([
          new THREE.Vector2(-w / 2, COFFER_D),
          new THREE.Vector2(-w / 2, COFFER_D - d + c),
          new THREE.Vector2(-w / 2 + c, COFFER_D - d),
          new THREE.Vector2(w / 2 - c, COFFER_D - d),
          new THREE.Vector2(w / 2, COFFER_D - d + c),
          new THREE.Vector2(w / 2, COFFER_D),
        ]);
        const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
        g.translate(0, 0, -len / 2);
        return g;
      };
      for (let k = 0; k <= nz; k += 1) {
        // along the depth (x), at a point across the width
        const g = section(depth);
        g.rotateY(Math.PI / 2);
        g.translate(0, 0, -width / 2 + (width * k) / nz);
        parts.push(g.toNonIndexed());
        g.dispose();
      }
      for (let k = 0; k <= nx; k += 1) {
        const g = section(width);
        g.translate(-depth / 2 + (depth * k) / nx, 0, 0);
        parts.push(g.toNonIndexed());
        g.dispose();
      }
    }
    const all = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    // darker up toward the slab, where the coffers hold their shadow
    return worldUV(bake(all, (q) => 0.5 + 0.5 * ease(COFFER_D, 0, q.y)), 2.6);
  }, [depth, width]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

/**
 * A coffered ceiling, the middle coffers glazed as a laylight.
 *
 * The coffers give the ceiling a depth the room's light catches. Over the
 * middle of the room the slab gives way to glass, lit from above, the way
 * a picture gallery is lit by day: the light that seems to fill the room
 * comes down from there, and the spotlights for the work hang in a slot
 * along the back.
 */
function CofferedCeiling({ door, tint }: { door: DoorSpec; tint: string }) {
  const [cx, cz] = roomCenter(door);
  const { depth, width } = roomSize(door);
  const beams = useBeams(depth, width);
  const glass = useMemo(() => getLaylight(), []);
  const slot = slotX(door) - cx;
  const panes = useMemo(() => {
    const nx = cofferCount(depth);
    const nz = cofferCount(width);
    const out: { x: number; z: number; w: number; d: number }[] = [];
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const x = -depth / 2 + (depth * (i + 0.5)) / nx;
        const z = -width / 2 + (width * (j + 0.5)) / nz;
        // the middle of the room, clear of the spotlight slot along the back
        if (Math.abs(x) < depth * 0.3 && Math.abs(z) < width * 0.3) {
          out.push({ x, z, d: depth / nx - BEAM_STEPS[0].w, w: width / nz - BEAM_STEPS[0].w });
        }
      }
    }
    return out;
  }, [depth, width]);

  return (
    <group position={[cx, ROOM_H, cz]}>
      {/* the slab the coffers are cut into: a little self-light, standing in for bounce from below */}
      <mesh position={[0, COFFER_D, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depth, width]} />
        <Plaster rx={depth / PLASTER_TILE} ry={width / PLASTER_TILE} tint={tone(tint, -0.2)} glow={0.05} />
      </mesh>
      <mesh geometry={beams}>
        <StoneMaterial tint={1.1} />
      </mesh>

      {/* the laylight: obscured glass in a fine grid, lit from above */}
      {panes.map((p) => (
        <mesh key={`${p.x},${p.z}`} position={[p.x, COFFER_D - 0.02, p.z]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[p.d, p.w]} />
          <meshBasicMaterial color="#8c7756" map={glass} toneMapped={false} />
        </mesh>
      ))}

      {/* the spotlight track: a dark slot along the back of the ceiling with a warm line in it */}
      <group position={[slot, COFFER_D - 0.31, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.02, width - 2]} />
          <meshStandardMaterial color={SHELL.recess} roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.012, 0]}>
          <boxGeometry args={[0.12, 0.012, width - 2]} />
          <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={1.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Floor                                                               */
/* ------------------------------------------------------------------ */

/** The marble border's breadth inside the walls. */
const BORDER = 1.1;
/** The star in the floor: how far forward of the back wall, and how big. */
const MEDALLION_OUT = 6;
const MEDALLION_R = 2;

/**
 * Polished marble, laid in slabs inside a border of a paler stone with a
 * brass fillet between the two, and a star set into it in front of the
 * work. Polished, so the lights lie in it; dark, so it never competes with
 * what stands on it.
 */
function RoomFloor({ door }: { door: DoorSpec }) {
  const [cx, cz] = roomCenter(door);
  const { depth, width } = roomSize(door);
  const dir = door.side === "left" ? -1 : 1;
  const field = useMemo(() => marbleFor(depth - BORDER * 2, width - BORDER * 2), [depth, width]);
  const border = useMemo(() => marbleFor(depth, width), [depth, width]);
  const star = useMemo(() => getMedallion(), []);
  const medX = backWallX(door) - dir * MEDALLION_OUT - cx;
  const polished = (tint: string, pbr: ReturnType<typeof marbleFor>, rough: number) => (
    <meshStandardMaterial
      color={tint}
      map={pbr?.map ?? null}
      normalMap={pbr?.normalMap ?? null}
      roughnessMap={pbr?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.3, 0.3)}
      roughness={rough}
      metalness={0.05}
      envMapIntensity={0.7}
    />
  );
  const brass = <meshStandardMaterial color={GOLD.metal} roughness={0.3} metalness={1} envMapIntensity={1.3} />;
  return (
    <group position={[cx, 0, cz]}>
      {/* the border, one slab under the whole room, with the field laid over its middle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depth, width]} />
        {polished("#8a735c", border, 1)}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[depth - BORDER * 2, width - BORDER * 2]} />
        {polished("#4a3c31", field, 1)}
      </mesh>
      {/* the brass fillet between them */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (depth / 2 - BORDER), 0.004, 0]}>
            <boxGeometry args={[0.035, 0.008, width - BORDER * 2 + 0.035]} />
            {brass}
          </mesh>
          <mesh position={[0, 0.004, s * (width / 2 - BORDER)]}>
            <boxGeometry args={[depth - BORDER * 2 + 0.035, 0.008, 0.035]} />
            {brass}
          </mesh>
        </group>
      ))}
      {/* the star */}
      {star ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[medX, 0.005, 0]}>
          <circleGeometry args={[MEDALLION_R, 96]} />
          <meshStandardMaterial
            map={star.map}
            metalnessMap={star.metalnessMap}
            metalness={1}
            roughness={0.32}
            envMapIntensity={0.9}
          />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * One gold hairline let into the floor, from the doorway to the star: a
 * quiet guide line, the only line on the floor.
 */
function Inlay({ door }: { door: DoorSpec }) {
  const [cx, cz] = roomCenter(door);
  const dir = door.side === "left" ? -1 : 1;
  const start = cx - dir * (roomSize(door).depth / 2 - BORDER);
  const end = backWallX(door) - dir * (MEDALLION_OUT + MEDALLION_R + 0.05);
  const len = Math.abs(end - start);
  if (Math.sign(end - start) !== dir) return null;
  return (
    <mesh position={[(start + end) / 2, 0.006, cz]}>
      <boxGeometry args={[len, 0.006, 0.045]} />
      <meshStandardMaterial
        color={GOLD.metal}
        roughness={0.28}
        metalness={1}
        envMapIntensity={1.4}
        emissive={WARM}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

let spillTex: THREE.Texture | null = null;
/** Warm light along one edge, fading to nothing: the light the wall throws back onto the floor. */
function spillTexture() {
  if (spillTex) return spillTex;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  // the canvas's top row is the edge against the wall (see the floor shadow)
  g.addColorStop(0, "rgb(255,214,160)");
  g.addColorStop(0.35, "rgb(120,92,58)");
  g.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  spillTex = new THREE.CanvasTexture(c);
  spillTex.colorSpace = THREE.SRGBColorSpace;
  return spillTex;
}

/**
 * A gentle spill of warm light on the floor in front of a lit wall, so the
 * light does not stop dead at the skirting and the room reads as one
 * space. About a fifth of the wall's own brightness.
 */
function FloorSpill({ door }: { door: DoorSpec }) {
  const [, cz] = roomCenter(door);
  const dir = door.side === "left" ? -1 : 1;
  const tex = useMemo(() => spillTexture(), []);
  if (!tex) return null;
  return (
    <group position={[backWallX(door), 0.008, cz]} rotation={[0, -dir * Math.PI * 0.5, 0]}>
      <mesh position={[0, 0, 3]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[roomSize(door).width - 2, 6]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The doorway, from inside                                            */
/* ------------------------------------------------------------------ */

/**
 * The reveal around the doorway, seen from inside the room. The door leaf
 * is recessed into the corridor wall, so it stands slightly proud on this
 * side; the opening needs real thickness lining it or the leaf reads as a
 * slab floating in a hole. Same frame as a wall: +Z is into the room.
 */
function Portal({ width, height, depth }: { width: number; height: number; depth: number }) {
  const JAMB = 0.18;
  const grain = useMemo(() => getStoneGrain(), []);
  const reveal = (
    <meshStandardMaterial color={tone(SHELL.wall, -0.25)} map={grain?.map ?? null} roughness={0.8} metalness={0.05} />
  );
  const bronze = <meshStandardMaterial color={GOLD.metal} roughness={0.3} metalness={1} envMapIntensity={1.5} />;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + JAMB / 2), height / 2, depth / 2]}>
          <boxGeometry args={[JAMB, height + JAMB, depth]} />
          {reveal}
        </mesh>
      ))}
      <mesh position={[0, height + JAMB / 2, depth / 2]}>
        <boxGeometry args={[width + JAMB * 2, JAMB, depth]} />
        {reveal}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * (width / 2 + JAMB / 2), height / 2, depth]}>
          <boxGeometry args={[0.1, height + JAMB, 0.1]} />
          {bronze}
        </mesh>
      ))}
      <mesh position={[0, height + JAMB / 2, depth]}>
        <boxGeometry args={[width + JAMB * 2, 0.1, 0.1]} />
        {bronze}
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Haze                                                                */
/* ------------------------------------------------------------------ */

let beamTex: THREE.Texture | null = null;
/**
 * A beam of light through faint haze, drawn once: narrow at the fitting,
 * widening and fading toward the floor, soft at its edges. Black is
 * nothing, so it is drawn additively.
 */
function beamTexture() {
  if (beamTex) return beamTex;
  const W = 64;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    const s = y / (H - 1); // 0 at the fitting, 1 at the floor
    const half = 0.1 + 0.9 * s;
    const along = Math.pow(1 - s, 0.7) * Math.min(1, s * 18);
    for (let x = 0; x < W; x += 1) {
      const u = (x / (W - 1)) * 2 - 1;
      const across = Math.exp(-((u / half) ** 2) * 2.4);
      const v = along * across;
      const i = (y * W + x) * 4;
      img.data[i] = 224 * v;
      img.data[i + 1] = 176 * v;
      img.data[i + 2] = 112 * v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  beamTex = new THREE.CanvasTexture(c);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}

/**
 * Beams under the exhibit spotlights, so the light is seen travelling.
 *
 * Real volumetric light would mean a ray-march over the whole screen every
 * frame. The room camera stands still, so a single flat beam per light,
 * turned about its own axis to face where the camera stands, looks the
 * same from there and costs one quad each.
 */
function Haze({ door }: { door: DoorSpec }) {
  const tex = useMemo(() => beamTexture(), []);
  const beams = useMemo(() => {
    const eye = new THREE.Vector3(...roomView(door).position);
    return spotPlan(door).map((spot) => {
      const from = new THREE.Vector3(...spot.from);
      const to = new THREE.Vector3(...spot.to);
      const dirV = to.clone().sub(from).normalize();
      /*
        On to the floor - or to the wall, if it gets there first. A beam
        aimed at the wall used to run on through it to the floor behind,
        and the wall cut it off in a hard diagonal line.
      */
      const toFloor = -from.y / dirV.y;
      const wallX = backWallX(door) - (door.side === "left" ? -1 : 1) * 0.05;
      const toWall = Math.abs(dirV.x) > 1e-4 ? (wallX - from.x) / dirV.x : Infinity;
      const t = Math.min(toFloor, toWall > 0 ? toWall : Infinity);
      const end = from.clone().addScaledVector(dirV, t);
      const len = from.distanceTo(end);
      const mid = from.clone().add(end).multiplyScalar(0.5);
      const up = dirV.clone().negate();
      const toEye = eye.clone().sub(mid).normalize();
      const right = new THREE.Vector3().crossVectors(up, toEye).normalize();
      const normal = new THREE.Vector3().crossVectors(right, up).normalize();
      const basis = new THREE.Matrix4().makeBasis(right, up, normal);
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
      const width = 2 * len * Math.tan(spot.angle) * 0.9;
      return { mid: mid.toArray() as [number, number, number], quat, len, width };
    });
  }, [door]);

  if (!tex) return null;
  return (
    <>
      {beams.map((b, i) => (
        <mesh key={i} position={b.mid} quaternion={b.quat} renderOrder={2}>
          <planeGeometry args={[b.width, b.len]} />
          <meshBasicMaterial
            map={tex}
            transparent
            /* barely there where the beams fall across pictures, so they do not fog them */
            opacity={door.id === "art" || door.id === "about" ? 0.04 : 0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

/** Past this, a chamber is too far down the hall to be worth drawing. */
const ROOM_VISIBLE_RANGE = 44;

/** Pilasters along a wall `length` long: one near each end, and two more on a long side wall to make three bays. */
const pilastersFor = (length: number, bays: number) => {
  const end = length / 2 - 0.8;
  if (bays <= 1) return [-end, end];
  return Array.from({ length: bays + 1 }, (_, i) => -end + (2 * end * i) / bays);
};

function RoomShellInner({ door, entered }: { door: DoorSpec; entered: boolean }) {
  const dir = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);

  /*
    Built when entered, drawn only when you are near it. Toggling
    `visible` skips the subtree entirely while its geometry, materials and
    compiled shaders stay resident, and doing it on the object rather than
    in React state means walking past a door re-renders nothing.
  */
  const shell = useRef<THREE.Group>(null);
  const here = useMemo(() => new THREE.Vector3(cx, CAM_Y, cz), [cx, cz]);
  useFrame(({ camera }) => {
    const g = shell.current;
    if (!g) return;
    const show = entered || camera.position.distanceToSquared(here) < ROOM_VISIBLE_RANGE ** 2;
    if (g.visible !== show) g.visible = show;
  });

  const { depth, width } = roomSize(door);
  const backX = cx + dir * (depth / 2);
  // a hair into the room, so it never shares a plane with the corridor's wall
  const frontX = cx - dir * (depth / 2) + dir * 0.02;
  const halfW = width / 2;
  const OPEN_W = DOOR_W + 1.2;
  const OPEN_H = DOOR_H + 0.6;
  const sidePilasters = useMemo(() => pilastersFor(depth, 3), [depth]);
  /*
    The Art room's long walls are divided into seven-metre bays, the first
    centred seven metres from the back wall, with a pilaster between each
    pair, so every frame hangs in a bay of its own. A wall's own x runs
    along the room on one side and against it on the other.
  */
  const artPilasters = useMemo(() => {
    const ds = [0.8];
    // between the frames, which hang every seven metres from the back wall, the first at seven
    for (let d = 3.5; d < depth - 3; d += 7) ds.push(d);
    ds.push(depth - 0.8);
    const along = (s: number) => ds.map((d) => (s < 0 ? 1 : -1) * dir * (depth / 2 - d));
    return { minus: along(-1), plus: along(1) };
  }, [depth, dir]);
  const backPilasters = useMemo(() => pilastersFor(width, 1), [width]);

  // the same silk, never quite the same colour on two walls
  const walls = {
    back: tone(SILK, 0.04),
    left: tone(SILK, -0.03),
    right: tone(SILK, 0.01),
    front: tone(SILK, -0.05),
  };

  return (
    <group ref={shell}>
      <Wall
        position={[backX, 0, cz]}
        yaw={-dir * Math.PI * 0.5}
        length={width}
        tint={walls.back}
        pilasterXs={backPilasters}
        label={door.label}
      />
      {[-1, 1].map((s) => (
        <Wall
          key={s}
          position={[cx, 0, cz + s * halfW]}
          yaw={s > 0 ? Math.PI : 0}
          length={depth}
          tint={s > 0 ? walls.right : walls.left}
          pilasterXs={door.id === "art" ? (s > 0 ? artPilasters.plus : artPilasters.minus) : sidePilasters}
        />
      ))}
      <group position={[frontX, 0, cz]} rotation={[0, dir * Math.PI * 0.5, 0]}>
        <Portal width={OPEN_W} height={OPEN_H} depth={DOOR_RECESS + 0.35} />
      </group>
      <Wall
        position={[frontX, 0, cz]}
        yaw={dir * Math.PI * 0.5}
        length={width}
        opening={{ width: OPEN_W, height: OPEN_H }}
        tint={walls.front}
      />

      <RoomFloor door={door} />
      <Inlay door={door} />
      {door.id === "art" ? <FloorSpill door={door} /> : null}
      <CofferedCeiling door={door} tint={SHELL.wall} />
      {entered ? <Haze door={door} /> : null}
    </group>
  );
}

/* A room change must not rebuild the rooms it did not touch. */
export const RoomShell = memo(RoomShellInner);
