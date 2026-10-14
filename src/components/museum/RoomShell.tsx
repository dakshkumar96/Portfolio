"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { blackBrickFor, plasterFor, PLASTER_TILE } from "./textures";
import { GOLD, MID, SHELL } from "./palette";
import {
  CAM_Y,
  DOOR_H,
  DOOR_RECESS,
  DOOR_W,
  ROOM_H,
  roomCenter,
  roomSize,
  type DoorSpec,
} from "./corridorLayout";
import { CASE_INSET, backWallX, roomView, slotX, spotPlan } from "./roomLayout";

/**
 * One room, built once, for every room.
 *
 * Each chamber used to be the corridor's wall system stood up four times -
 * large cladding panels with dark seams, a recessed channel with a lit
 * hairline, a bright strip at the floor and a cove at the head - under a
 * ceiling of floor pavers. In a room that read as a plain box with objects
 * in it, and the tile grid was the loudest thing in every frame.
 *
 * This is an interior instead, built the way a gallery room is:
 *
 *  - walls of continuous sandstone plaster, quiet enough to sit behind the
 *    exhibits, with a moulded skirting at the foot and a cornice at the head
 *  - a coffered ceiling, with warm light slots let into it, so the light has
 *    somewhere to come from
 *  - the hall's dark pavers underfoot, a little softer, and one gold inlay
 *    running from the doorway toward the exhibits
 *  - a pilaster in each corner, so the walls meet with some depth
 *  - faint beams of haze under the exhibit spotlights
 *
 * Every room gets the same shell; only what stands in it differs.
 *
 * Nothing here adds a light or a new kind of material. The spotlights are
 * the permanent pool in <RoomLights>, re-aimed per room, and every surface
 * uses a material the hall already compiles - so walking into a room never
 * recompiles a shader.
 *
 * Local frame for anything built against a wall: the face lies in XY at
 * z = 0 looking down +Z, so +Z is into the room and anything proud of the
 * wall has a positive z.
 */

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/** Sandstone plaster. Matte (about 0.9), low relief, and a touch of colour drift between surfaces. */
function Plaster({
  rx,
  ry,
  tint = SHELL.wall,
  glow = 0,
}: {
  rx: number;
  ry: number;
  tint?: string;
  /** a faint self-light, standing in for light bounced up from the floor */
  glow?: number;
}) {
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

/** The same colour drift as the walls, without a texture, for mouldings whose extrusions have no useful UVs. */
const STONE_DARK = "#2a1d13";

/** Shift a hex colour's lightness by a fraction, for per-surface variation. */
function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l * (1 + amount), 0, 1));
  return `#${c.getHexString()}`;
}

/** Warm light, never white: the slots, the skirting strip, the inlay's glint. */
const WARM = "#e0b070";

/* ------------------------------------------------------------------ */
/* Mouldings                                                           */
/* ------------------------------------------------------------------ */

type Profile = (s: THREE.Shape) => void;

/**
 * The skirting: a plain plinth face, a chamfer, a cove and a small bead.
 * Drawn as (out from the wall, up), 0.72 tall and 0.16 deep.
 */
const BASE_PROFILE: Profile = (s) => {
  s.moveTo(0, 0);
  s.lineTo(0.16, 0);
  s.lineTo(0.16, 0.44);
  s.lineTo(0.14, 0.47);
  s.lineTo(0.14, 0.52);
  s.quadraticCurveTo(0.14, 0.62, 0.075, 0.64);
  s.lineTo(0.06, 0.66);
  s.lineTo(0.06, 0.69);
  s.quadraticCurveTo(0.06, 0.72, 0.03, 0.72);
  s.lineTo(0, 0.72);
  s.closePath();
};
const BASE_LIFT = 0.07;

/**
 * The cornice: a deep cove under a projecting fillet, stepped back to the
 * wall in two small bevels. Drawn downward from the ceiling, 0.62 deep.
 */
const CORNICE_PROFILE: Profile = (s) => {
  s.moveTo(0, 0);
  s.lineTo(0.62, 0);
  s.lineTo(0.62, -0.1);
  s.lineTo(0.56, -0.14);
  s.lineTo(0.56, -0.18);
  s.quadraticCurveTo(0.56, -0.5, 0.18, -0.56);
  s.lineTo(0.14, -0.6);
  s.lineTo(0.14, -0.66);
  s.lineTo(0.08, -0.7);
  s.lineTo(0.08, -0.78);
  s.lineTo(0, -0.82);
  s.closePath();
};

/**
 * A profile run along a wall. The extrusion is centred on x and lies in
 * the wall's local frame, so the same moulding stands on any wall. Runs on
 * neighbouring walls overlap at the corners, and two solid profiles
 * meeting like that make a clean inside corner without mitring.
 */
function useRun(profile: Profile, length: number) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    profile(shape);
    const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -length / 2);
    // shape x -> out of the wall (+z), extrusion -> along the wall (x)
    g.rotateY(-Math.PI / 2);
    return g;
  }, [profile, length]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

function Skirting({ x, length }: { x: number; length: number }) {
  const geo = useRun(BASE_PROFILE, length);
  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={geo} position={[0, BASE_LIFT, 0]}>
        <meshStandardMaterial color={STONE_DARK} roughness={0.58} metalness={0.12} envMapIntensity={0.6} />
      </mesh>
      {/* the shadow gap it stands over */}
      <mesh position={[0, BASE_LIFT / 2, 0.06]}>
        <boxGeometry args={[length, BASE_LIFT, 0.12]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.95} />
      </mesh>
      {/*
        The floor strip: warm, and well under what the old white one ran
        at - a glint along the foot of the wall, not a line of light.
      */}
      <mesh position={[0, 0.018, 0.17]}>
        <boxGeometry args={[length, 0.02, 0.018]} />
        <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={0.55} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Cornice({ length, height }: { length: number; height: number }) {
  const geo = useRun(CORNICE_PROFILE, length);
  return (
    <mesh geometry={geo} position={[0, height, 0]}>
      <meshStandardMaterial color={shade(SHELL.wall, 0.12)} roughness={0.86} metalness={0} envMapIntensity={0.35} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

type Run = { x: number; len: number };

/**
 * A wall of the room: plaster, skirting, cornice. An opening, if there is
 * one, is left as a hole in the lower part, with the plaster closing over
 * its head; the cornice runs straight through above it.
 */
function Wall({
  position,
  yaw,
  length,
  height,
  opening,
  tint,
}: {
  position: [number, number, number];
  yaw: number;
  length: number;
  height: number;
  opening?: { width: number; height: number };
  tint: string;
}) {
  const runs: Run[] = opening
    ? (() => {
        const seg = (length - opening.width) / 2;
        const off = opening.width / 2 + seg / 2;
        return [
          { x: -off, len: seg },
          { x: off, len: seg },
        ];
      })()
    : [{ x: 0, len: length }];

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {runs.map((run) => (
        <group key={run.x}>
          <mesh position={[run.x, height / 2, 0]}>
            <planeGeometry args={[run.len, height]} />
            <Plaster rx={run.len / PLASTER_TILE} ry={height / PLASTER_TILE} tint={tint} />
          </mesh>
          <Skirting x={run.x} length={run.len} />
        </group>
      ))}

      {opening ? (
        <mesh position={[0, (height + opening.height) / 2, 0]}>
          <planeGeometry args={[opening.width, height - opening.height]} />
          <Plaster rx={opening.width / PLASTER_TILE} ry={(height - opening.height) / PLASTER_TILE} tint={tint} />
        </mesh>
      ) : null}

      <Cornice length={length} height={height} />

      {/*
        Shadow where the wall meets the floor: the dark line a real room
        gathers in its corners, which a light-per-pixel renderer does not
        work out for itself.
      */}
      {runs.map((run) => (
        <mesh key={`ao${run.x}`} position={[run.x, 0.004, 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
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
/* Pilasters                                                           */
/* ------------------------------------------------------------------ */

/** A square section with its arrises chamfered, extruded upward. */
function useChamferedColumn(size: number, chamfer: number, height: number) {
  const geo = useMemo(() => {
    const h = size / 2;
    const c = chamfer;
    const s = new THREE.Shape();
    s.moveTo(-h + c, -h);
    s.lineTo(h - c, -h);
    s.lineTo(h, -h + c);
    s.lineTo(h, h - c);
    s.lineTo(h - c, h);
    s.lineTo(-h + c, h);
    s.lineTo(-h, h - c);
    s.lineTo(-h, -h + c);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, chamfer, height]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

const PIL = 0.8;

function Pilaster({ x, z, tint }: { x: number; z: number; tint: string }) {
  const shaftH = ROOM_H - 0.95 - 0.84;
  const shaft = useChamferedColumn(PIL, 0.07, shaftH);
  const block = useChamferedColumn(PIL + 0.22, 0.05, 0.84);
  const cap = useChamferedColumn(PIL + 0.22, 0.05, 0.22);
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={block}>
        <meshStandardMaterial color={STONE_DARK} roughness={0.58} metalness={0.12} envMapIntensity={0.6} />
      </mesh>
      <mesh geometry={shaft} position={[0, 0.84, 0]}>
        <meshStandardMaterial color={shade(tint, 0.08)} roughness={0.88} metalness={0} envMapIntensity={0.35} />
      </mesh>
      {/* the capital, a plain abacus under the cornice with a bronze fillet beneath it */}
      <mesh geometry={cap} position={[0, ROOM_H - 0.95, 0]}>
        <meshStandardMaterial color={shade(tint, 0.14)} roughness={0.86} metalness={0} envMapIntensity={0.35} />
      </mesh>
      <mesh position={[0, ROOM_H - 0.98, 0]}>
        <boxGeometry args={[PIL + 0.06, 0.05, PIL + 0.06]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.38} metalness={0.9} envMapIntensity={1.1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ceiling                                                             */
/* ------------------------------------------------------------------ */

/** How far the coffers go up into the slab. */
const COFFER_D = 0.5;
const BEAM_W = 0.7;

/** One beam's section: a plain soffit with its two lower arrises chamfered. */
function beamSection() {
  const h = BEAM_W / 2;
  const c = 0.09;
  const s = new THREE.Shape();
  s.moveTo(-h, COFFER_D);
  s.lineTo(-h, c);
  s.lineTo(-h + c, 0);
  s.lineTo(h - c, 0);
  s.lineTo(h, c);
  s.lineTo(h, COFFER_D);
  s.closePath();
  return s;
}

/**
 * The beams of the coffered ceiling, merged into a single mesh: one draw
 * call for the whole grid however many coffers it makes. Room-local, with
 * the soffit at y = 0.
 */
function useBeams(depth: number, width: number) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const section = beamSection();
    const along = (length: number, at: number, axis: "x" | "z") => {
      const g = new THREE.ExtrudeGeometry(section, { depth: length, bevelEnabled: false });
      g.translate(0, 0, -length / 2);
      if (axis === "x") {
        // runs along x, sitting at z = at
        g.rotateY(Math.PI / 2);
        g.translate(0, 0, at);
      } else {
        g.translate(at, 0, 0);
      }
      parts.push(g.toNonIndexed());
      g.dispose();
    };
    // five coffers across the width, four along the depth, and a frame round the edge
    // coffers of about four units, across the width and along the depth, and a frame round the edge
    const across = Math.max(2, Math.round(width / 4.8));
    const along_ = Math.max(2, Math.round(depth / 5));
    for (let k = 0; k <= across; k += 1) along(depth, -width / 2 + (width * k) / across, "x");
    for (let k = 0; k <= along_; k += 1) along(width, -depth / 2 + (depth * k) / along_, "z");
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }, [depth, width]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

/**
 * A coffered ceiling, with warm light slots let into it.
 *
 * The flat dark slab overhead read as a void: a black band across the top
 * of every frame with nothing in it. Coffers give it depth that the light
 * from the room catches, and the slots give the light somewhere to come
 * from - the exhibit spotlights hang in the one over the exhibits.
 */
function CofferedCeiling({ door, tint }: { door: DoorSpec; tint: string }) {
  const [cx, cz] = roomCenter(door);
  const { depth, width } = roomSize(door);
  const beams = useBeams(depth, width);
  const dir = door.side === "left" ? -1 : 1;
  const slot = slotX(door) - cx;
  const sideSlotZ = width / 2 - 3.6;

  return (
    <group position={[cx, ROOM_H, cz]}>
      {/* the slab the coffers are cut into: a little self-light, standing in for bounce from below */}
      <mesh position={[0, COFFER_D, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depth, width]} />
        <Plaster rx={depth / PLASTER_TILE} ry={width / PLASTER_TILE} tint={shade(tint, -0.1)} glow={0.06} />
      </mesh>
      {beams ? (
        <mesh geometry={beams}>
          <meshStandardMaterial
            color={shade(tint, 0.04)}
            roughness={0.88}
            metalness={0}
            envMapIntensity={0.35}
            emissive={tint}
            emissiveIntensity={0.04}
          />
        </mesh>
      ) : null}

      {/* the slots: a dark channel in the slab with a warm line of light inside it */}
      {[
        { x: slot, z: 0, len: width - 2, along: "z" as const },
        { x: -dir * 1.2, z: -sideSlotZ, len: depth - 6, along: "x" as const },
        { x: -dir * 1.2, z: sideSlotZ, len: depth - 6, along: "x" as const },
      ].map((s, i) => {
        const size = (w: number, h: number): [number, number, number] =>
          s.along === "z" ? [w, h, s.len] : [s.len, h, w];
        return (
          <group key={i} position={[s.x, COFFER_D - 0.01, s.z]}>
            <mesh>
              <boxGeometry args={size(0.5, 0.02)} />
              <meshStandardMaterial color={SHELL.recess} roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.012, 0]}>
              <boxGeometry args={size(0.12, 0.012)} />
              <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={1.5} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Floor                                                               */
/* ------------------------------------------------------------------ */

const BRICK_TILE = 3.2;

/** aoMap reads the second UV channel, which plane geometry does not ship with. */
function useUv1(geo: THREE.BufferGeometry | null) {
  useEffect(() => {
    if (!geo) return;
    const uv = geo.getAttribute("uv");
    if (uv && !geo.getAttribute("uv1")) geo.setAttribute("uv1", uv);
  }, [geo]);
}

/**
 * The hall's own dark pavers, so a room still reads as part of the
 * building, with the contrast taken down a step - shallower joints and
 * softer occlusion - so the floor stops competing with what stands on it
 * and the exhibit lights can pool on it.
 */
function RoomFloor({ door }: { door: DoorSpec }) {
  const [cx, cz] = roomCenter(door);
  const { depth, width } = roomSize(door);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  const pbr = useMemo(() => blackBrickFor(depth / BRICK_TILE, width / BRICK_TILE), [depth, width]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]}>
      <planeGeometry ref={setGeo} args={[depth, width]} />
      <meshStandardMaterial
        color={SHELL.ground}
        map={pbr?.map ?? null}
        normalMap={pbr?.normalMap ?? null}
        roughnessMap={pbr?.roughnessMap ?? null}
        aoMap={pbr?.aoMap ?? null}
        aoMapIntensity={0.65}
        normalScale={new THREE.Vector2(0.32, 0.32)}
        /* a little glossier in front of the Art wall, so it picks up the wall's glow */
        roughness={door.id === "art" ? 0.55 : 0.62}
        metalness={0.14}
        envMapIntensity={0.45}
      />
    </mesh>
  );
}

/**
 * One gold hairline let into the floor, from the doorway toward the
 * exhibits: a quiet guide line, the only line on the floor.
 */
function Inlay({ door }: { door: DoorSpec }) {
  const [cx, cz] = roomCenter(door);
  const dir = door.side === "left" ? -1 : 1;
  const start = cx - dir * (roomSize(door).depth / 2 - 0.6);
  const end = backWallX(door) - dir * (CASE_INSET + 2.2);
  const len = Math.abs(end - start);
  return (
    <mesh position={[(start + end) / 2, 0.003, cz]}>
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
    <group position={[backWallX(door), 0.006, cz]} rotation={[0, -dir * Math.PI * 0.5, 0]}>
      <mesh position={[0, 0, 3]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[roomSize(door).width - 2, 6]} />
        <meshBasicMaterial
          map={tex}
          transparent
          opacity={0.2}
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
  const reveal = <meshStandardMaterial color={SHELL.recess} roughness={0.72} metalness={0.25} />;
  const bronze = (
    <meshStandardMaterial color={GOLD.metal} roughness={0.3} metalness={1} envMapIntensity={1.5} />
  );
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
      // run the beam on to the floor
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
const ROOM_VISIBLE_RANGE = 40;

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

  // the same stone, never quite the same colour on two walls
  const tint = SHELL.wall;
  const walls = {
    back: shade(tint, 0.04),
    left: shade(tint, -0.03),
    right: shade(tint, 0.01),
    front: shade(tint, -0.05),
  };

  return (
    <group ref={shell}>
      <Wall position={[backX, 0, cz]} yaw={-dir * Math.PI * 0.5} length={width} height={ROOM_H} tint={walls.back} />
      {[-1, 1].map((s) => (
        <Wall
          key={s}
          position={[cx, 0, cz + s * halfW]}
          yaw={s > 0 ? Math.PI : 0}
          length={depth}
          height={ROOM_H}
          tint={s > 0 ? walls.right : walls.left}
        />
      ))}
      <group position={[frontX, 0, cz]} rotation={[0, dir * Math.PI * 0.5, 0]}>
        <Portal width={OPEN_W} height={OPEN_H} depth={DOOR_RECESS + 0.35} />
      </group>
      <Wall
        position={[frontX, 0, cz]}
        yaw={dir * Math.PI * 0.5}
        length={width}
        height={ROOM_H}
        opening={{ width: OPEN_W, height: OPEN_H }}
        tint={walls.front}
      />

      {/*
        A pilaster in each back corner. Not the front two: they would stand
        on the corridor's own wall line, so half of each stuck out into the
        hall as a dark post from floor to ceiling, in every room you had
        walked into. Nobody sees a room's front corners from inside it.
      */}
      {[-1, 1].map((sz) => (
        <Pilaster key={sz} x={cx + dir * (depth / 2)} z={cz + sz * halfW} tint={tint} />
      ))}

      <RoomFloor door={door} />
      <Inlay door={door} />
      {door.id === "art" ? <FloorSpill door={door} /> : null}
      <CofferedCeiling door={door} tint={tint} />
      {entered ? <Haze door={door} /> : null}
    </group>
  );
}

/* A room change must not rebuild the rooms it did not touch. */
export const RoomShell = memo(RoomShellInner);
