"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LightPool, VirtualSpot } from "./lightPool";
import {
  getGlassSmudge,
  claddingFor,
  blackBrickFor,
  brushedMetalFor,
  getContactShadow,
} from "./textures";
import { getAjrakRelief, getBossEngraving, getBronze, getStarLattice } from "./doorTextures";
import { DoorCrown } from "./DoorCrown";
import { ease, merged, shade, worldUV } from "./architecture";
import { WallInscriptions } from "./WallContent";
import { HungPicture, PHOTO_FILES } from "./PortraitWall";
import { usePulse } from "./breath";
import type { PhotoCrop } from "./photoGrade";
import { Vault, StoneMaterial } from "./Vault";
import { EndWall } from "./EndWall";
import { Atmosphere } from "./Atmosphere";
import { Statue, PLINTH_H as STATUE_PLINTH_H } from "./Statue";
import { RoomShell } from "./RoomShell";
import { SPOT_COUNT, spotPlan } from "./roomLayout";
import { CaseContents } from "./CaseModels";
import { ExhibitText } from "./ExhibitText";
import { aboutExhibits, caseExhibits, childhoodExhibit, hackathonExhibit, hallExhibits, societyExhibit, type ExhibitDatum } from "./exhibitData";
import { consumedDrag } from "./lookControls";
import { SHELL, MID, GOLD, LEVEL, EMIT } from "./palette";
import {
  HALF_WIDTH as HW,
  LENGTH,
  Z_NEAR,
  Z_FAR,
  WALL_H,
  CASE_POSITIONS,
  ROOM_H,
  roomCenter,
  roomSize,
  DOOR_W,
  DOOR_H,
  DOOR_RECESS,
  doors,
  doorX,
  type DoorSpec,
  type RoomId,
} from "./corridorLayout";

const MID_Z = (Z_NEAR + Z_FAR) / 2;

/**
 * aoMap samples the second UV channel (`uv1`). Plane and box geometries
 * only ship `uv`, so without copying it across the AO map silently does
 * nothing — the usual reason "I added AO and saw no change".
 */
function useUv1(geo: THREE.BufferGeometry | null) {
  useEffect(() => {
    if (!geo) return;
    const uv = geo.getAttribute("uv");
    if (uv && !geo.getAttribute("uv1")) geo.setAttribute("uv1", uv);
  }, [geo]);
}

/**
 * Wall cladding: large smooth panels with hairline recessed seams.
 *
 * Semi-matte rather than rough. Heavy granular noise at close tiling is
 * what made these read as a basement; a quiet surface with a little
 * sheen and crisp joint lines reads as a built interior instead.
 */
function CladdingMaterial({
  rx,
  ry,
  color = SHELL.wall,
}: {
  rx: number;
  ry: number;
  color?: string;
}) {
  // shared across surfaces with the same tiling; never disposed here
  const pbr = useMemo(() => claddingFor(rx, ry), [rx, ry]);
  return (
    <meshStandardMaterial
      color={color}
      map={pbr?.map ?? null}
      normalMap={pbr?.normalMap ?? null}
      roughnessMap={pbr?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.25, 0.25)}
      /*
        Raised from 0.52. A semi-gloss wall mirrors any nearby lamp as a
        bright oval; at this roughness the same light spreads into a wash
        instead, which is what a painted or plastered panel actually does.
      */
      roughness={0.86}
      metalness={0.05}
      envMapIntensity={0.5}
    />
  );
}

/** One cladding tile is 2 panels tall by 3 wide; 6.4 units reads right. */
const CLAD_TILE = 6.4;

/**
 * The horizontal banding every wall in the museum is built from.
 *
 * Hoisted out of `Walls` so the corridor and the rooms cannot drift
 * apart. A room detailed to its own numbers stops being the same
 * building the moment either set is tuned, and the whole point of the
 * chambers is that they read as cut out of this hall.
 */
const PLINTH_H = 1.1;
const TRIM_Y = PLINTH_H + 0.06;
/** The recessed channel sits a fixed drop below whatever the head is. */
const channelY = (height: number) => height - 2.2;

/**
 * The side walls, with real openings cut for the doorways.
 *
 * They used to be one continuous plane per side, which meant a recessed
 * door was simply behind solid geometry — every detail on the leaves was
 * being drawn and then occluded. That is why several rounds of work on
 * the doors appeared to change nothing at all.
 *
 * Cutting the opening properly means building each wall as a run of
 * panels with gaps where the doors are, plus a lintel over each gap. It
 * is more geometry than one plane, but it is the only way a recessed
 * door can be seen — and it is also what makes the reveal around each
 * doorway read as genuine wall thickness rather than a painted frame.
 */
function WallsInner() {
  const CHANNEL_Y = channelY(WALL_H);
  /** A little clearance so the wall never clips the archivolt rings. */
  /*
    The opening is deliberately SMALLER than the door's outermost ring.

    A rectangular hole behind an arched door always leaves corners
    showing, and filling them with a panel just hid the door instead. The
    answer is to make the hole small enough that the outer archivolt
    covers it completely: the ring overlaps the wall on every side, so
    there is no rectangle to see — only the arch, with the wall running
    into it.

    0.2 keeps the opening at 3.8 wide against a 5.08 ring, which clears
    the 3.24-wide leaves and stays inside the ring's silhouette.
  */
  const MARGIN = 0.2;

  /** Solid spans along z for one side, given the openings in it. */
  const spansFor = (side: "left" | "right") => {
    const cuts = doors
      .filter((d) => d.side === side)
      .map((d) => [d.z - DOOR_W / 2 - MARGIN, d.z + DOOR_W / 2 + MARGIN] as const)
      .sort((a, b) => a[0] - b[0]);

    const out: [number, number][] = [];
    let cursor = Z_FAR;
    for (const [lo, hi] of cuts) {
      if (lo > cursor) out.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    }
    if (cursor < Z_NEAR) out.push([cursor, Z_NEAR]);
    return out;
  };

  return (
    <>
      {([-1, 1] as const).map((sgn) => {
        const side = sgn < 0 ? "left" : "right";
        const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
        const spans = spansFor(side);
        const openings = doors.filter((d) => d.side === side);
        /*
          The head sits at 5.7. The outer ring is 5.76 tall where the
          opening's corners are, so the ring still covers them — any
          higher and the corners would poke out past the arch.
        */
        const HEAD = 5.7;

        return (
          <group key={sgn}>
            {/* full-height panels between the openings */}
            {spans.map(([lo, hi]) => {
              const len = hi - lo;
              if (len <= 0.01) return null;
              return (
                <group key={`span${lo}`}>
                  <mesh
                    position={[sgn * HW, (WALL_H + PLINTH_H) / 2, (lo + hi) / 2]}
                    rotation={[0, yaw, 0]}
                  >
                    <planeGeometry args={[len, WALL_H - PLINTH_H]} />
                    <CladdingMaterial
                      rx={len / CLAD_TILE}
                      ry={(WALL_H - PLINTH_H) / CLAD_TILE}
                    />
                  </mesh>

                  {/* the plinth course, broken by the same openings */}
                  <mesh
                    position={[sgn * (HW - 0.09), PLINTH_H / 2, (lo + hi) / 2]}
                    rotation={[0, yaw, 0]}
                  >
                    <planeGeometry args={[len, PLINTH_H]} />
                    <meshStandardMaterial
                      color={SHELL.recess}
                      roughness={0.62}
                      metalness={0.3}
                      envMapIntensity={0.7}
                    />
                  </mesh>

                  {/* and the bronze band that caps it */}
                  <mesh position={[sgn * (HW - 0.1), TRIM_Y, (lo + hi) / 2]}>
                    <boxGeometry args={[0.22, 0.09, len]} />
                    <meshStandardMaterial
                      color={GOLD.metal}
                      roughness={0.3}
                      metalness={1}
                      envMapIntensity={1.5}
                    />
                  </mesh>
                </group>
              );
            })}

            {/* the lintel over each opening */}
            {openings.map((d) => (
              <mesh
                key={`head${d.z}`}
                position={[sgn * HW, (HEAD + WALL_H) / 2, d.z]}
                rotation={[0, yaw, 0]}
              >
                <planeGeometry args={[DOOR_W + MARGIN * 2, WALL_H - HEAD]} />
                <CladdingMaterial
                  rx={(DOOR_W + MARGIN * 2) / CLAD_TILE}
                  ry={(WALL_H - HEAD) / CLAD_TILE}
                />
              </mesh>
            ))}

            {/*
              The jamb returns are gone.

              They lined the thickness of the opening, which mattered when
              the hole was wider than the arch. Now that the outer ring
              covers the opening completely they are never seen as wall
              thickness — only as a dark plane standing at the edge of
              each doorway, which is what read as a stick beside the arch.
            */}

            {/* recessed channel near the head of the wall, run unbroken */}
            <mesh position={[sgn * (HW - 0.14), CHANNEL_Y, MID_Z]}>
              <boxGeometry args={[0.28, 0.34, LENGTH]} />
              <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
            </mesh>
            <mesh position={[sgn * (HW - 0.24), CHANNEL_Y - 0.1, MID_Z]}>
              <boxGeometry args={[0.05, 0.05, LENGTH * 0.99]} />
              <meshStandardMaterial
                color={GOLD.metalLit}
                emissive="#e0b070"
                emissiveIntensity={EMIT.hairline * 0.17}
                roughness={0.3}
                metalness={0.9}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/**
 * The brick texture covers 2 m, but tiling it 1:1 put 65 repeats down
 * the corridor, which aliased into a shimmer. One tile over 3.2 units
 * cuts that to ~40 and the pavers still read at a believable size.
 */
const BRICK_TILE = 3.2;

function BrickMaterial({ rx, ry }: { rx: number; ry: number }) {
  // shared per tiling ratio; never disposed here
  const pbr = useMemo(() => blackBrickFor(rx, ry), [rx, ry]);
  return (
    <meshStandardMaterial
      color={SHELL.ground}
      map={pbr?.map ?? null}
      normalMap={pbr?.normalMap ?? null}
      roughnessMap={pbr?.roughnessMap ?? null}
      aoMap={pbr?.aoMap ?? null}
      aoMapIntensity={1.1}
      /*
        Matte, and only a little relief. Glossy, with the joints in the
        normal map, every brick edge caught the lamps as a pin of light, and
        thousands of them sparkling and swimming as you walked read as a
        fault in the lighting rather than as a floor.
      */
      normalScale={new THREE.Vector2(0.22, 0.22)}
      /* about 0.55, so it takes faint reflections of the lamps; the relief stays low so the joints do not sparkle */
      roughness={0.56}
      metalness={0.1}
      envMapIntensity={0.45}
    />
  );
}

let inlay: THREE.Texture | null = null;
/** The hairline's own fade, along its length: v = 0 at the camera's end, 1 at the statue's. */
function inlayFade() {
  if (inlay) return inlay;
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    // the canvas's top row is v = 1, the statue's end
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgb(0,0,0)");
    g.addColorStop(0.06, "rgb(255,255,255)");
    g.addColorStop(0.75, "rgb(255,255,255)");
    g.addColorStop(1, "rgb(0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
  }
  inlay = new THREE.CanvasTexture(c);
  return inlay;
}

function FloorInner() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, MID_Z]}>
        <planeGeometry ref={setGeo} args={[HW * 2, LENGTH]} />
        <BrickMaterial rx={(HW * 2) / BRICK_TILE} ry={LENGTH / BRICK_TILE} />
      </mesh>
      {/* a thin gold hairline let into the floor, down the middle toward the statue: 1.5cm wide, at about 35%, rising from the statue and gone over the quarter of it nearest the camera, so it never crosses the hint */}
      <mesh position={[0, 0.005, (Z_NEAR + STATUE_Z + 2) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[0.015, Z_NEAR - STATUE_Z - 2]} />
        <meshBasicMaterial color="#e0b070" alphaMap={inlayFade()} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}


/**
 * Pool definition now comes from a tight cone plus low penumbra rather
 * than a cookie texture.
 *
 * Three.js gives every spotlight carrying a `map` its own sampler slot
 * (`spotLightMap[N]`), sized by how many lights have one — sharing a
 * single texture between them does not help. At 22 lights that alone
 * blew past MAX_TEXTURE_IMAGE_UNITS(16) and no shader would link.
 */
function PoolLight({
  position,
  target,
  intensity = 90,
  color = GOLD.light,
  angle = 0.5,
  distance = 40,
  penumbra = 0.9,
  pin = false,
}: {
  position: [number, number, number];
  target: [number, number, number];
  intensity?: number;
  color?: string;
  angle?: number;
  /** hard cutoff, so a fitting cannot light things it could not reach */
  distance?: number;
  /** shadows are off (see the Canvas); kept so callers can still say which light would cast one */
  castShadow?: boolean;
  penumbra?: number;
  /** always lit, whatever else the pool is lighting (lightPool.tsx) */
  pin?: boolean;
}) {
  // a light in the pool: real only while it matters from where the visitor stands (lightPool.tsx)
  return (
    <VirtualSpot
      position={position}
      target={target}
      intensity={intensity}
      color={color}
      angle={angle}
      penumbra={penumbra}
      distance={distance}
      decay={2}
      pin={pin}
    />
  );
}

/**
 * The end of the corridor: the end wall with its niche, and a statue on a
 * plinth in front of it, lit from above and a little ahead so it is the
 * one bright thing at the far end of the hall - the destination the walk
 * is facing.
 */
const STATUE_Z = Z_FAR + 4.2;

function FarFocusInner() {
  const halo = useMemo(() => getContactShadow(), []);
  return (
    <group>
      <EndWall />
      {/* a pool of warm light on the floor round the plinth */}
      <mesh position={[0, 0.02, STATUE_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 7]} />
        <meshBasicMaterial
          color={GOLD.light}
          map={halo ?? undefined}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Statue position={[0, 0, STATUE_Z]} />
    </group>
  );
}

/**
 * The light over the statue, mounted with the other lights on the first
 * frame so the scene's light count is settled before anything is drawn.
 */
function StatueLight() {
  return (
    <>
      <PoolLight
        position={[0, WALL_H - 0.6, STATUE_Z + 8.5]}
        target={[0, STATUE_PLINTH_H + 1.9, STATUE_Z]}
        intensity={764}
        angle={0.3}
        penumbra={0.9}
        distance={26}
        color="#ffd9a0"
        pin
      />
      {/* a faint gold rim from behind, so his outline lifts off the niche */}
      <PoolLight
        position={[0, STATUE_PLINTH_H + 4.2, Z_FAR + 0.9]}
        target={[0, STATUE_PLINTH_H + 1.7, STATUE_Z + 1.5]}
        intensity={110}
        angle={0.55}
        penumbra={0.9}
        distance={10}
        color="#c8944a"
      />
    </>
  );
}

/**
 * A square vitrine: stone plinth, glass box, hairline-lit edges, with the
 * exhibit projected inside as a hologram.
 *
 * Two things learned the hard way are preserved here:
 *  - the glass uses no transmission. Three renders transmissive surfaces
 *    by sampling a downscaled copy of the scene behind them, and that is
 *    what was blurring everything seen through these panes.
 *  - nothing inside is a full-brightness emissive plane. A glowing deck
 *    became a blown-out disc under bloom; the light belongs on the edges,
 *    which is where a real edge-lit case puts it anyway.
 */
function DisplayCase({
  position,
  kind = 0,
  exhibit,
  active,
  onSelect,
}: {
  position: [number, number, number];
  kind?: number;
  exhibit?: ExhibitDatum;
  active?: boolean;
  onSelect?: (exhibit: ExhibitDatum) => void;
}) {
  /*
    One design for every case, at one size.

    They used to scale with depth and switch proportion past the midpoint,
    so the near ones were short and wide and the far ones tall — the same
    object apparently built two different ways. A museum uses a single case
    system throughout; the variety comes from what is inside them.
  */
  const PW = 2.25;
  const PH = 0.7;
  const GW = 2.15;
  const GH = 5.0;
  const smudge = useMemo(() => getGlassSmudge(), []);
  const brushed = useMemo(() => brushedMetalFor(2, 1), []);
  const contact = useMemo(() => getContactShadow(), []);
  const glassY = PH + GH / 2;
  const [hovered, setHovered] = useState(false);
  const lit = hovered || Boolean(active);
  /* the case's own edge light swells and settles, slowly: it opens a card */
  const breathe = usePulse(EMIT.hairline * 0.1, 0.75);
  const breatheBoard = usePulse(lit ? 0.5 : 0.2, 0.5);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  // the placard faces the walkway, so it is readable as you pass
  const facing = position[0] < 0 ? 1 : -1;

  return (
    <group position={position}>
      {/* plinth, in brushed metal rather than a flat fill */}
      <mesh position={[0, PH / 2, 0]}>
        <boxGeometry args={[PW, PH, PW]} />
        <meshStandardMaterial
          color={MID.plinth}
          map={brushed?.map ?? null}
          normalMap={brushed?.normalMap ?? null}
          roughnessMap={brushed?.roughnessMap ?? null}
          normalScale={new THREE.Vector2(0.45, 0.45)}
          roughness={0.5}
          metalness={0.72}
          envMapIntensity={1.2}
        />
      </mesh>
      {/*
        A painted contact shadow under the plinth.

        A shadow map cannot resolve the very tight, very dark line right
        where an object meets the floor — it is below the resolution of
        the map. Compositing an ambient-occlusion decal there is what
        stops furniture looking like it is hovering a centimetre up.
      */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PW * 1.7, PW * 1.7]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.42}
          depthWrite={false}
          map={contact ?? undefined}
        />
      </mesh>

      {/* shadow reveal at the plinth base */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[PW - 0.16, 0.08, PW - 0.16]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
      </mesh>

      {/* the deck: a brushed plate with a projector ring set into it */}
      <mesh position={[0, PH + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GW * 0.86, GW * 0.86]} />
        <meshStandardMaterial
          color={MID.stone}
          map={brushed?.map ?? null}
          roughnessMap={brushed?.roughnessMap ?? null}
          roughness={0.45}
          metalness={0.68}
          envMapIntensity={1.1}
        />
      </mesh>
      {/*
        The emitter ring. A projection needs somewhere to come from, and a
        lit ring in the deck is the smallest thing that answers it without
        putting a cone of haze in the case.
      */}
      <mesh position={[0, PH + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[GW * 0.3, GW * 0.34, 48]} />
        <meshStandardMaterial
          color={GOLD.core}
          emissive={GOLD.halo}
          emissiveIntensity={1.4}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* the exhibit, projected */}
      <group position={[0, PH + GH * 0.44, 0]}>
        <CaseContents index={kind} />
      </group>

      {/*
        Lit the way a real vitrine is: small fixtures in the head of the
        case, angled down onto the object, with a key brighter than its
        two fills so the piece has a light direction and a shaded side.
        Nothing in here emits its own light any more.
      */}
      {[
        /*
          One lamp per case, not three.

          The two fills ran at 45% and 30% of the key and were there to
          soften its shadow - but shadows are off, so they were lighting
          an object the key already lights, from nearly the same place.
          They were also eighteen spotlights out of the forty-five in the
          hall, and every lit pixel in the scene computes every light in
          it, every frame. The case edges and deck glow carry the rest.
        */
        { x: 0.42, z: 0.42, i: 1.25, key: true },
      ].map((lamp, n) => (
        <group key={n}>
          {/* the visible fitting in the case head */}
          <group position={[lamp.x, PH + GH - 0.1, lamp.z]}>
            {/* housing */}
            <mesh>
              <cylinderGeometry args={[0.038, 0.05, 0.07, 14]} />
              <meshStandardMaterial color={MID.bronze} roughness={0.3} metalness={0.9} />
            </mesh>
            {/* the bulb in it */}
            <mesh position={[0, -0.045, 0]}>
              <sphereGeometry args={[0.032, 12, 12]} />
              <meshStandardMaterial
                color={GOLD.core}
                emissive={GOLD.core}
                emissiveIntensity={1.1 * lamp.i}
              />
            </mesh>
          </group>
          {/*
            Reach is capped just past the plinth. These lights sit in the
            case head with a wide cone and a 40-unit reach, so their spill
            was landing on the corridor floor and walls well outside the
            vitrine — the bright ovals either side of each case. A display
            light should not escape its own box.
          */}
          {/*
            Only the key casts a shadow.

            Every mesh in the hall was already flagged castShadow, but no
            LIGHT was — so nothing rendered a single shadow and every
            object sat on its plinth without touching it. One shadow per
            case is enough: a second and third caster would soften the
            first into mush and cost two more shadow maps for it.
          */}
          <PoolLight
            position={[lamp.x, PH + GH - 0.14, lamp.z]}
            target={[0, PH + GH * 0.38, 0]}
            intensity={LEVEL.exhibit * 2.2 * lamp.i}
            angle={0.5}
            distance={GH + PH + 0.6}
            color="#fff0d8"
            castShadow={lamp.key}
          />
        </group>
      ))}

      {/*
        The case interior glows, not the object in it.

        A faint volume of light sitting inside the glass — tinted, almost
        transparent, and never touching the piece itself. It is what makes
        a vitrine read as a device rather than a box with a lamp in it,
        and because it is additive it also tints the reflections in the
        glass around it.
      */}
      <mesh position={[0, PH + GH * 0.45, 0]}>
        <boxGeometry args={[GW * 0.9, GH * 0.86, GW * 0.9]} />
        <meshBasicMaterial
          color={GOLD.halo}
          transparent
          opacity={0.035}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
      {/* a brighter core of that haze, low in the case near the emitter */}
      <mesh position={[0, PH + GH * 0.22, 0]}>
        <boxGeometry args={[GW * 0.7, GH * 0.4, GW * 0.7]} />
        <meshBasicMaterial
          color={GOLD.halo}
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>

      {/* glass box, crisp */}
      <mesh position={[0, glassY, 0]}>
        <boxGeometry args={[GW, GH, GW]} />
        {/*
          Glass is never perfectly clean or perfectly even. A smudge map
          on the roughness channel gives the surface something to catch
          light on, which is the difference between a pane and a flat
          tinted quad — the reflections break up instead of sliding across
          as one sheet.
        */}
        <meshPhysicalMaterial
          transmission={0}
          transparent
          opacity={0.15}
          roughnessMap={smudge ?? undefined}
          roughness={0.16}
          metalness={0}
          ior={1.46}
          specularIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0.04}
          color="#eef4fb"
          /*
            A faint glow in the glass itself. Edge-lit cases really do
            carry light through the pane, and it means each vitrine reads
            as a source in the hall rather than a dark box that happens to
            have something bright inside it.
          */
          emissive={GOLD.halo}
          emissiveIntensity={0.14}
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* hairline light down each vertical corner */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (GW / 2), glassY, sz * (GW / 2)]}>
            <boxGeometry args={[0.022, GH, 0.022]} />
            <meshStandardMaterial
              ref={breathe}
              color={MID.bronze}
              emissive="#c8944a"
              emissiveIntensity={EMIT.hairline * 0.1}
              roughness={0.3}
              metalness={0.9}
            />
          </mesh>
        )),
      )}

      {/* light line where the glass meets the plinth */}
      {[-1, 1].map((sx) => (
        <mesh key={`b${sx}`} position={[sx * (GW / 2), PH + 0.03, 0]}>
          <boxGeometry args={[0.02, 0.02, GW]} />
          <meshStandardMaterial
            color={MID.bronze}
            emissive="#c8944a"
            emissiveIntensity={EMIT.hairline * 0.1}
            roughness={0.3}
            metalness={0.9}
          />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh key={`c${sz}`} position={[0, PH + 0.03, sz * (GW / 2)]}>
          <boxGeometry args={[GW, 0.02, 0.02]} />
          <meshStandardMaterial
            color={MID.bronze}
            emissive="#c8944a"
            emissiveIntensity={EMIT.hairline * 0.1}
            roughness={0.3}
            metalness={0.9}
          />
        </mesh>
      ))}

      {/* base rail the glass seats into */}
      <mesh position={[0, PH + 0.055, 0]}>
        <boxGeometry args={[GW + 0.09, 0.11, GW + 0.09]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.32}
          metalness={0.95}
          envMapIntensity={1.4}
        />
      </mesh>

      {/* cap rail */}
      <mesh position={[0, glassY + GH / 2, 0]}>
        <boxGeometry args={[GW + 0.05, 0.07, GW + 0.05]} />
        <meshStandardMaterial
          color={GOLD.metal}
          roughness={0.24}
          metalness={1}
          envMapIntensity={1.4}
        />
      </mesh>

      {/*
        The reading board. Angled off the plinth the way a museum label
        is, so it catches light and is legible from standing height, and
        it is the click target rather than the case itself — the case is
        the object, the board is the invitation to read about it.
      */}
      {exhibit ? (
        <group
          position={[facing * (PW / 2 + 0.16), PH * 0.82, 0]}
          rotation={[0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <group rotation={[-0.62, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.92, 0.6, 0.04]} />
              <meshStandardMaterial
                color={MID.bronze}
                roughness={0.35}
                metalness={0.85}
                envMapIntensity={1.2}
              />
            </mesh>
            {/* lit border, brighter on hover */}
            <mesh position={[0, 0, 0.026]}>
              <boxGeometry args={[0.86, 0.54, 0.006]} />
              <meshStandardMaterial
                ref={breatheBoard}
                color={SHELL.recess}
                emissive={GOLD.halo}
                emissiveIntensity={lit ? 0.5 : 0.2}
                roughness={0.5}
              />
            </mesh>
            <group position={[0, 0.1, 0.035]}>
              <ExhibitText text={exhibit.title} position={[0, 0, 0]} height={0.1} maxWidth={0.78} active={lit} />
            </group>

            <mesh
              position={[0, 0, 0.06]}
              visible={false}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(true);
              }}
              onPointerOut={() => setHovered(false)}
              onClick={(e) => {
                e.stopPropagation();
                // a drag that ended over the board is a look, not a click
                if (consumedDrag()) return;
                onSelect?.(exhibit);
              }}
            >
              <planeGeometry args={[1, 0.68]} />
            </mesh>
          </group>
          {/* the stalk it sits on */}
          <mesh position={[0, -0.34, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.5, 12]} />
            <meshStandardMaterial color={MID.bronze} roughness={0.35} metalness={0.9} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function CasesInner({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  return (
    <>
      {CASE_POSITIONS.map(([x, z], i) => {
        const exhibit = caseExhibits[i % caseExhibits.length];
        return (
          <DisplayCase
            key={`${x}-${z}`}
            position={[x, 0, z]}
            kind={i}
            exhibit={exhibit}
            active={activeId === exhibit.id}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

/**
 * The photographs along the hall, each in the bay across from a door,
 * under that bay's lamp: printed whole and graded into the museum's
 * palette like the About wall, in old, darkened gilt.
 */
const WHOLE_PRINT: PhotoCrop = { focus: [0.5, 0.5], zoom: 1, whole: true };
const HALL_PICTURES: { z: number; side: 1 | -1; src: string; exhibit: ExhibitDatum }[] = [
  { z: -16, side: 1, src: "/museum/corridor-flight.jpg", exhibit: hallExhibits[0] },
  { z: -34, side: -1, src: "/museum/childhood.jpg", exhibit: childhoodExhibit },
  { z: -52, side: 1, src: PHOTO_FILES[1].src, exhibit: aboutExhibits[1] },
  { z: -70, side: -1, src: PHOTO_FILES[2].src, exhibit: aboutExhibits[2] },
  { z: -88, side: 1, src: "/museum/hackathon.jpg", exhibit: hackathonExhibit },
  { z: -106, side: -1, src: "/museum/society.jpg", exhibit: societyExhibit },
];

/** Brass, for the hardware and the inlay only. */
const BRASS = "#c2a05a";
/** The sandstone repeat across the arch, matched to the walls' own tiling. */
const STONE_TILE = 1 / 6.4;
/** Where each leaf hangs from: just inside its jamb of the arched opening. */
const HANG = (DOOR_W + 0.14) / 2 - 0.03;

/** The leaves' bronze and the star lattice of their panels, tiled once and shared by every door. */
let leafTextures:
  | {
      bronze: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };
      relief: THREE.Texture;
      reliefNormal: THREE.Texture;
      jali: THREE.Texture;
    }
  | null
  | undefined;
function getLeafTextures() {
  if (leafTextures !== undefined) return leafTextures;
  const bronze = getBronze();
  const lattice = getStarLattice();
  if (!bronze || !lattice) return (leafTextures = null);
  // texture coordinates on the leaves are metres; one repeat per `size` of them
  const tile = (t: THREE.Texture, size: number) => {
    const c = t.clone();
    c.repeat.set(1 / size, 1 / size);
    c.needsUpdate = true;
    return c;
  };
  leafTextures = {
    bronze: { map: tile(bronze.map, 0.8), normalMap: tile(bronze.normalMap, 0.8), roughnessMap: tile(bronze.roughnessMap, 0.8) },
    relief: tile(lattice.relief, 0.42),
    reliefNormal: tile(lattice.normalMap, 0.42),
    jali: tile(lattice.jali, 0.42),
  };
  return leafTextures;
}

/**
 * A pair of arched doors in a stepped stone surround, with the room's
 * name over them.
 *
 * The surround is the hall's own stone, so the opening reads as cut
 * through the wall, stepping back in three orders - each a little deeper
 * than the one outside it, which is what gives a real portal its depth -
 * with a carved ajrak band round the inner one.
 *
 * The leaves are old bronze, as the great doors of a museum are: a frame
 * studded down its stiles and along its rails, three panels cast with the
 * star lattice of a Mughal screen, and in the arched head the same
 * lattice pierced right through, a jali, with the room's light coming
 * through it. A fine thread of light runs round each panel, and one down
 * each pull - the modern hand in an old door.
 *
 * WINDING, because it broke an earlier version: a THREE.Shape whose
 * outer contour runs clockwise is treated as a hole and extrudes to
 * nothing. Both leaves are built bottom-edge-first in +x and closed
 * along the top in -x, counter-clockwise whichever side they are on.
 */
function DoorInner({
  door,
  active,
  onEnter,
  onPrewarm,
}: {
  door: DoorSpec;
  active: boolean;
  onEnter: (id: RoomId) => void;
  onPrewarm: (id: RoomId) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  const sgn = door.side === "left" ? -1 : 1;
  /* the doors read in order down the hall: the nearest brightest, each after it a little less, so the eye is led along */
  const fall = 1 - 0.09 * doors.findIndex((d) => d.id === door.id);

  /*
    The leaves swing, and they wait for you.

    Each leaf hangs off its own jamb, so the pivot is the outer edge and
    they part in the middle the way a real pair does. They open inward,
    into the room. Once opened they stay open until the camera is back in
    the hall, so you walk out through an open door, not a closing one.
  */
  const pivots = useRef<(THREE.Group | null)[]>([null, null]);
  const parting = useRef<THREE.MeshBasicMaterial>(null);
  const swing = useRef(0);
  const latched = useRef(false);

  useFrame(({ camera }, rawDelta) => {
    // a dropped frame pauses the swing rather than skipping it
    const delta = Math.min(rawDelta, 1 / 15);

    if (active) latched.current = true;
    else if (latched.current && Math.abs(camera.position.x) < HW - 0.6) latched.current = false;
    /*
      Slow enough to be watched opening as you turn to it, and open well
      before the walk in CameraRig reaches the threshold, about a second
      and a half after the click. It closes a little slower behind you.
    */
    const rate = latched.current ? 1 / 0.95 : -1 / 1.2;
    swing.current = THREE.MathUtils.clamp(swing.current + rate * delta, 0, 1);
    const t = swing.current;
    const e = t * t * (3 - 2 * t);
    const a = e * DOOR_SWING;
    if (pivots.current[0]) pivots.current[0].rotation.y = a;
    if (pivots.current[1]) pivots.current[1].rotation.y = -a;

    /*
      The light in the parting belongs to a shut door. It comes up only
      as the leaves meet and is gone the moment they part, so a door
      half open - swinging to behind you - never shows a lit line down
      each edge of the gap.
    */
    const shut = Math.pow(1 - e, 6);
    if (parting.current) {
      parting.current.opacity = (lit ? 0.95 : 0.7) * shut * fall;
      parting.current.visible = shut > 0.01;
    }
  });
  const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;

  const W = DOOR_W;
  const H = DOOR_H;
  /* where the arch leaves the jamb: the arch takes the top quarter */
  const SPRING = H * 0.76;
  const RECESS = Math.max(DOOR_RECESS, 0.7);
  const LEAF_Z = -RECESS + 0.16;
  const GAP = 0.07;
  /* the leaf slab's front face, in the leaf's own space */
  const FACE = 0.24 + 0.035;

  const stone = useMemo(() => claddingFor(STONE_TILE, STONE_TILE), []);
  const tex = useMemo(() => getLeafTextures(), []);
  const relief = useMemo(() => getAjrakRelief(), []);
  const engraving = useMemo(() => getBossEngraving(), []);
  const pool = useMemo(() => getContactShadow(), []);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  /** Height of the arched opening the leaves fill, at a given x. */
  const openingY = useMemo(() => {
    const hw = (W + 0.14) / 2;
    const h = H + 0.08;
    const ctrlY = SPRING + (h - SPRING) * 0.78;
    return (x: number) => {
      const ax = Math.abs(x);
      if (ax >= hw) return SPRING;
      const t = Math.sqrt(Math.max(0, 1 - ax / hw));
      return (1 - t) * (1 - t) * SPRING + 2 * (1 - t) * t * ctrlY + t * t * h;
    };
  }, [W, H, SPRING]);

  /** An arched outline, as a contour on a shape or path. */
  const contour = useMemo(
    () => (path: THREE.Shape | THREE.Path, w: number, h: number) => {
      const hw = w / 2;
      path.moveTo(-hw, 0);
      path.lineTo(hw, 0);
      path.lineTo(hw, SPRING);
      path.quadraticCurveTo(hw, SPRING + (h - SPRING) * 0.78, 0, h);
      path.quadraticCurveTo(-hw, SPRING + (h - SPRING) * 0.78, -hw, SPRING);
      path.closePath();
    },
    [SPRING],
  );

  /*
    The three orders of the surround: outer at the wall's face, each one
    in stepping back. Each ring's opening is exactly the outline of the
    ring inside it, so every face shows in full. The outer one still
    covers the rectangular hole cut in the wall behind it.
  */
  const orders = useMemo(() => {
    const BACK = -0.56;
    const B = 0.02;
    const sizes = [
      { w: W + 1.68, h: H + 0.99, front: 0.16 },
      { w: W + 1.12, h: H + 0.66, front: 0.06 },
      { w: W + 0.62, h: H + 0.36, front: -0.04 },
      // the leaves' opening
      { w: W + 0.14, h: H + 0.08, front: 0 },
    ];
    return sizes.slice(0, 3).map((o, i) => {
      const shape = new THREE.Shape();
      contour(shape, o.w, o.h);
      const hole = new THREE.Path();
      contour(hole, sizes[i + 1].w, sizes[i + 1].h);
      shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: o.front - BACK - B * 2,
        bevelEnabled: true,
        bevelThickness: B,
        bevelSize: B,
        bevelSegments: 2,
        curveSegments: 24,
      });
      g.translate(0, 0, BACK + B);
      // each order darker the deeper it stands into the wall
      return worldUV(shade(g, (q) => 0.5 + 0.5 * ease(BACK, 0.18, q.z)), 2.6);
    });
  }, [W, H, contour]);
  useEffect(() => () => orders.forEach((g) => g.dispose()), [orders]);

  /*
    The carved band, laid along the inner order's face as a strip whose
    texture runs round the arch with it - the lattice follows the curve
    the way a carver would cut it, instead of being stamped across it.
  */
  const band = useMemo(() => {
    const hw = (W + 0.35) / 2;
    const h = H + 0.185;
    const half = 0.065;
    const ctrlY = SPRING + (h - SPRING) * 0.78;
    const q = (t: number, p0: number, p1: number, p2: number) =>
      (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    const pts: THREE.Vector3[] = [new THREE.Vector3(-hw, 0.02, 0), new THREE.Vector3(-hw, SPRING, 0)];
    for (let i = 1; i <= 24; i += 1) pts.push(new THREE.Vector3(q(i / 24, -hw, -hw, 0), q(i / 24, SPRING, ctrlY, h), 0));
    for (let i = 1; i <= 24; i += 1) pts.push(new THREE.Vector3(q(i / 24, 0, hw, hw), q(i / 24, h, ctrlY, SPRING), 0));
    pts.push(new THREE.Vector3(hw, 0.02, 0));
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i += 1) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    const N = 240;
    const length = path.getLength();
    const pos: number[] = [];
    const uv: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i += 1) {
      const s = i / N;
      const p = path.getPointAt(s);
      const tan = path.getTangentAt(s);
      const nx = -tan.y;
      const ny = tan.x;
      // outward is away from the opening's centre line
      const flip = nx * p.x + ny * (p.y - SPRING * 0.5) < 0 ? -1 : 1;
      for (const side of [-1, 1]) {
        pos.push(p.x + side * flip * nx * half, p.y + side * flip * ny * half, 0);
        uv.push((s * length) / 0.13, side < 0 ? 0 : 1);
        nor.push(0, 0, 1);
      }
      if (i < N) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [W, H, SPRING]);

  /*
    One leaf: a walnut frame - stiles and rails - with four panels let
    into it. The bottom three are rectangles; the top one follows the
    arch. The panels sit back from the frame's face with a chamfer round
    their field, and a soft shadow line in the groove.
  */
  const leaves = useMemo(() => {
    const hw = HANG;
    const STILE = 0.18;
    // just inside the arched opening, so no light shows round the leaves' heads
    const top = (x: number) => openingY(x) - 0.03;
    const build = (x0: number, x1: number) => {
      const lo = Math.min(x0, x1);
      const hi = Math.max(x0, x1);
      const outline = new THREE.Shape();
      const SEG = 26;
      outline.moveTo(lo, 0);
      outline.lineTo(hi, 0);
      for (let i = 0; i <= SEG; i += 1) {
        const x = hi - (hi - lo) * (i / SEG);
        outline.lineTo(x, top(x));
      }
      outline.closePath();

      const px0 = lo + STILE;
      const px1 = hi - STILE;
      const rows: [number, number][] = [
        [0.32, 1.22],
        [1.42, 2.62],
        [2.82, 3.82],
      ];
      // a panel outline, drawn on any path, grown or shrunk by `inset`
      const panel = (p: THREE.Path, k: number, inset: number) => {
        const a = px0 + inset;
        const b = px1 - inset;
        if (k < 3) {
          const [y0, y1] = rows[k];
          p.moveTo(a, y0 + inset);
          p.lineTo(b, y0 + inset);
          p.lineTo(b, y1 - inset);
          p.lineTo(a, y1 - inset);
          p.closePath();
          return;
        }
        // the head panel, following the arch a rail's width below it
        const y0 = 4.02 + inset;
        p.moveTo(a, y0);
        p.lineTo(b, y0);
        for (let i = 0; i <= 16; i += 1) {
          const x = b - (b - a) * (i / 16);
          p.lineTo(x, top(x) - 0.2 - inset);
        }
        p.closePath();
      };
      for (let k = 0; k < 4; k += 1) {
        const hole = new THREE.Path();
        panel(hole, k, 0);
        outline.holes.push(hole);
      }
      const fields = [0, 1, 2, 3].map((k) => {
        const s = new THREE.Shape();
        panel(s, k, 0.03);
        return s;
      });
      // the shadow in each groove: the panel's edge less a thin margin
      const grooves = [0, 1, 2, 3].map((k) => {
        const s = new THREE.Shape();
        panel(s, k, 0);
        const inner = new THREE.Path();
        panel(inner, k, 0.045);
        s.holes.push(inner);
        return s;
      });
      // the thread of light round each cast panel
      const lines = [0, 1, 2].map((k) => {
        const s = new THREE.Shape();
        panel(s, k, 0.05);
        const inner = new THREE.Path();
        panel(inner, k, 0.064);
        s.holes.push(inner);
        return s;
      });
      // the opening behind the jali, where the light comes through
      const head = new THREE.Shape();
      panel(head, 3, 0);
      // bronze studs down both stiles and along the rails, clear of the boss on the parting
      const face = 0.24 + 0.035;
      const dome = new THREE.SphereGeometry(0.026, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.rotateX(Math.PI / 2);
      const studs: THREE.BufferGeometry[] = [];
      const stud = (x: number, y: number) => {
        const g = dome.clone();
        g.translate(x, y, face);
        studs.push(g.toNonIndexed());
        g.dispose();
      };
      for (const sx of [lo + STILE / 2, hi - STILE / 2]) for (let y = 0.2; y < top(sx) - 0.22; y += 0.3) stud(sx, y);
      for (const ry of [0.16, 1.32, 2.72, 3.92]) {
        for (let x = px0 + 0.14; x < px1 - 0.1; x += 0.24) if (ry < 3.9 || Math.abs(x) > 0.3) stud(x, ry);
      }
      dome.dispose();
      return { outline, fields, grooves, lines, head, studs: merged(studs) };
    };
    return { left: build(-hw, -GAP), right: build(GAP, hw) };
  }, [openingY]);
  useEffect(
    () => () => {
      leaves.left.studs.dispose();
      leaves.right.studs.dispose();
    },
    [leaves],
  );

  const bronze = (
    <meshStandardMaterial
      color="#a27b4c"
      map={tex?.bronze.map ?? null}
      normalMap={tex?.bronze.normalMap ?? null}
      roughnessMap={tex?.bronze.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.45, 0.45)}
      roughness={0.55}
      metalness={0.82}
      envMapIntensity={1.05}
    />
  );
  const cast = (pierced: boolean) => (
    <meshStandardMaterial
      color="#a27b4c"
      map={tex?.relief ?? null}
      normalMap={tex?.reliefNormal ?? null}
      alphaMap={pierced ? (tex?.jali ?? null) : null}
      alphaTest={pierced ? 0.5 : 0}
      side={pierced ? THREE.DoubleSide : THREE.FrontSide}
      roughness={0.48}
      metalness={0.82}
      envMapIntensity={1.05}
    />
  );
  const sandstone = (
    <meshStandardMaterial
      color={SHELL.wall}
      map={stone?.map ?? null}
      normalMap={stone?.normalMap ?? null}
      roughnessMap={stone?.roughnessMap ?? null}
      normalScale={new THREE.Vector2(0.8, 0.8)}
      roughness={0.9}
      metalness={0.03}
      envMapIntensity={0.5}
    />
  );
  const brass = <meshStandardMaterial color={BRASS} roughness={0.35} metalness={1} envMapIntensity={1.2} />;

  return (
    <group position={[doorX(door.side), 0, door.z]} rotation={[0, yaw, 0]}>
      {/*
        The reveal: wall thickness seen from inside the opening. Open at
        both ends - a closed box would cap the passage with a dark plane
        the moment the door opened.
      */}
      <mesh position={[0, (H + 0.14) / 2, -RECESS / 2]}>
        <boxGeometry args={[W + 0.14, H + 0.14, RECESS]} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const end = i >= 4; // +z and -z, the two ends
          return (
            <meshStandardMaterial
              key={i}
              attach={`material-${i}`}
              color="#16110c"
              roughness={0.95}
              metalness={0.05}
              side={THREE.BackSide}
              transparent={end}
              opacity={end ? 0 : 1}
              depthWrite={!end}
            />
          );
        })}
      </mesh>

      {/* ---- the two leaves ---- */}
      {([-1, 1] as const).map((side) => {
        const leaf = side < 0 ? leaves.left : leaves.right;
        const pullX = side * 0.27;
        return (
          <group
            key={side}
            ref={(g) => {
              pivots.current[side < 0 ? 0 : 1] = g;
            }}
            position={[side * HANG, 0, LEAF_Z]}
          >
            {/* offset back to the door's centreline, so the leaf turns about its own jamb */}
            <group position={[-side * HANG, 0, 0]}>
              {/* stiles and rails, and their studs */}
              <mesh>
                <extrudeGeometry
                  args={[
                    leaf.outline,
                    { depth: 0.24, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.012, bevelSegments: 2 },
                  ]}
                />
                {bronze}
              </mesh>
              <mesh geometry={leaf.studs}>
                <meshStandardMaterial color={BRASS} roughness={0.32} metalness={1} envMapIntensity={1.2} />
              </mesh>

              {/* the panels, set back from the face: three cast with the lattice, the head one pierced */}
              {leaf.fields.map((field, k) => (
                <mesh key={`f${k}`} position={[0, 0, FACE - 0.04 - 0.11]}>
                  <extrudeGeometry
                    args={[
                      field,
                      { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.018, bevelSegments: 1 },
                    ]}
                  />
                  {cast(k === 3)}
                </mesh>
              ))}
              {/* the room's light, seen through the jali */}
              <mesh position={[0, 0, FACE - 0.2]}>
                <shapeGeometry args={[leaf.head]} />
                <meshBasicMaterial color="#e9a45e" transparent opacity={lit ? 0.9 : 0.62} toneMapped={false} />
              </mesh>
              {leaf.lines.map((line, k) => (
                <mesh key={`l${k}`} position={[0, 0, FACE - 0.034]}>
                  <shapeGeometry args={[line]} />
                  <meshBasicMaterial color={GOLD.light} transparent opacity={lit ? 0.8 : 0.34} toneMapped={false} />
                </mesh>
              ))}
              {leaf.grooves.map((groove, k) => (
                <mesh key={`g${k}`} position={[0, 0, FACE - 0.039]} renderOrder={1}>
                  <shapeGeometry args={[groove]} />
                  <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
                </mesh>
              ))}

              {/*
                The pull: one slim brass bar beside the parting, on two
                short posts, with a thread of cyan light down its inner
                edge - the one modern note on the door.
              */}
              <group position={[pullX, 2.05, FACE]}>
                <mesh position={[0, 0, 0.075]}>
                  <capsuleGeometry args={[0.032, 0.64, 4, 12]} />
                  {brass}
                </mesh>
                {[-0.26, 0.26].map((y) => (
                  <mesh key={y} position={[0, y, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.07, 8]} />
                    {brass}
                  </mesh>
                ))}
                <mesh position={[-side * 0.033, 0, 0.075]}>
                  <boxGeometry args={[0.006, 0.58, 0.012]} />
                  <meshBasicMaterial color="#5ad1d6" transparent opacity={0.7} toneMapped={false} />
                </mesh>
              </group>

              {/* half of the brass boss: the two halves meet on the parting */}
              <mesh position={[0, 3.92, FACE + 0.022]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry
                  args={[0.16, 0.165, 0.044, 32, 1, false, side < 0 ? Math.PI : 0, Math.PI]}
                />
                <meshStandardMaterial
                  color="#ffffff"
                  map={engraving ?? null}
                  roughness={0.35}
                  metalness={1}
                  envMapIntensity={1.2}
                />
              </mesh>
              {/* and its cut face, which shows as the leaves part */}
              <mesh position={[0, 3.92, FACE + 0.022]} rotation={[0, -side * Math.PI * 0.5, 0]}>
                <planeGeometry args={[0.044, 0.32]} />
                {brass}
              </mesh>
            </group>
          </group>
        );
      })}

      {/*
        The parting: a thin warm line where the leaves meet, held well
        under the bloom threshold so it reads as lamplight through a crack
        and not as a white tube. Only one line, and only while shut.
      */}
      <mesh position={[0, (H + 0.05) / 2, LEAF_Z + 0.12]}>
        <planeGeometry args={[GAP * 1.4, H + 0.05]} />
        <meshBasicMaterial ref={parting} color="#d99a48" transparent opacity={(lit ? 0.95 : 0.7) * fall} depthWrite={false} />
      </mesh>

      {/* ---- the surround: three orders of sandstone, each stepped back ---- */}
      {orders.map((g, i) => (
        <mesh key={i} geometry={g}>
          <StoneMaterial tint={1.22} />
        </mesh>
      ))}

      {/* the carved ajrak band round the inner order */}
      <mesh geometry={band} position={[0, 0, -0.04 + 0.002]}>
        <meshStandardMaterial
          color={SHELL.wall}
          map={relief?.map ?? null}
          normalMap={relief?.normalMap ?? null}
          normalScale={new THREE.Vector2(1.1, 1.1)}
          roughness={0.9}
          metalness={0.03}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* the room's name over the door */}
      <DoorCrown label={door.label} lit={lit} />


      {/* ---- worn steps up to the threshold ---- */}
      {[
        { w: W + 1.5, d: 0.5, y: 0.06, z: 0.35 },
        { w: W + 2.2, d: 0.5, y: 0.02, z: 0.8 },
      ].map((st, i) => (
        <mesh key={i} position={[0, st.y, st.z]}>
          <boxGeometry args={[st.w, 0.12, st.d]} />
          {sandstone}
        </mesh>
      ))}

      {/*
        The pool of light on the floor, with a real falloff: masked with a
        radial gradient so it reads as light, not as a sheet on the floor.
      */}
      <mesh position={[0, 0.15, 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 4.0]} />
        <meshBasicMaterial
          color={GOLD.halo}
          map={pool ?? undefined}
          transparent
          opacity={(lit ? 0.4 : 0.26) * fall}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* the narrow bright core of it, directly under the parting */}
      <mesh position={[0, 0.16, 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.55, 1.9]} />
        <meshBasicMaterial
          color={GOLD.core}
          map={pool ?? undefined}
          transparent
          opacity={(lit ? 0.85 : 0.5) * fall}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh
        position={[0, H / 2, 0.6]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onPrewarm(door.id);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (consumedDrag()) return;
          onEnter(door.id);
        }}
      >
        <planeGeometry args={[W + 1.6, H + 1.4]} />
      </mesh>
    </group>
  );
}

/**
 * Holds a subtree that never moves, and stops it being recalculated.
 *
 * `matrixAutoUpdate` is on by default, so every object rebuilds its
 * local matrix and has its world matrix propagated on every single
 * frame. For the hall that is a thousand-odd meshes of walls, floor,
 * ceiling and lettering doing that work sixty times a second to arrive
 * at the answer they had last frame.
 *
 * The matrices are computed once here, then frozen. Only put things in
 * here that genuinely never move — the doors and the turntables must
 * stay outside it.
 */
function Static({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const frozen = useRef(false);

  useFrame(() => {
    if (frozen.current) return;
    const g = group.current;
    if (!g) return;
    frozen.current = true;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Brings the hall into being a piece at a time.
 *
 * Measured, the corridor mounted in one React commit that created 770
 * geometries and 70 procedural textures — a single frame of nearly
 * seven seconds, which is the loading screen appearing to hang. Every
 * one of those textures is filled by per-pixel JavaScript, and they all
 * ran back to back with no chance for the browser to paint between
 * them.
 *
 * Nothing here is made cheaper; it is spread. Each door and each
 * chamber arrives on its own tick, so no single frame carries more than
 * one of them and the loading bar keeps moving. It is all still behind
 * the veil, so the staging is never seen.
 */
function useStaged(total: number, everyMs: number) {
  const [built, setBuilt] = useState(1);

  useEffect(() => {
    if (built >= total) return;
    const t = window.setTimeout(() => setBuilt((n) => n + 1), everyMs);
    return () => window.clearTimeout(t);
  }, [built, total, everyMs]);

  return built;
}

/** How far the leaves swing: wide enough to walk through and still be seen. */
const DOOR_SWING = 1.28;

/**
 * The doors' grazing washes, all six, mounted on the very first frame.
 *
 * Each door used to carry its own wash light. Three bakes the scene's
 * light count into every material's shader, so a light arriving changes
 * the count and every material in the museum recompiles. The doors are
 * built one per tick to spread their cost - which meant the light count
 * changed six separate times, and the whole scene was recompiled six
 * times over. Measured, each door's arrival compiled about twenty-three
 * programs.
 *
 * Mounted together here, outside the staging, the count is settled once
 * before anything else is drawn. The doors can then arrive at whatever
 * pace they like: geometry and materials only, which compile once each
 * and are shared.
 *
 * The geometry is unchanged: each light sits in a group carrying its
 * door's own position and turn, so the local coordinates it was
 * authored in still mean the same thing.
 */
function DoorLights({ activeRoom }: { activeRoom: RoomId | null }) {
  return (
    <>
      {doors.map((door) => {
        const sgn = door.side === "left" ? -1 : 1;
        const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
        const H = DOOR_H;
        return (
          <group key={door.id} position={[doorX(door.side), 0, door.z]} rotation={[0, yaw, 0]}>
            <PoolLight
              position={[0, H * 1.25, 5.2]}
              target={[0, H * 0.4, 0]}
              intensity={activeRoom === door.id ? 150 : 88}
              angle={0.5}
              distance={9}
              /* near-neutral, warm of white, so walnut reads as walnut and sandstone as stone */
              color="#fff0dc"
            />
          </group>
        );
      })}
    </>
  );
}

/**
 * The room lights, mounted permanently.
 *
 * Three bakes the scene's light count into every material's shader, so
 * adding even one light forces EVERY material to recompile - which is
 * what used to freeze the view on clicking a door. These exist from the
 * first frame and are only moved, re-aimed and faded when a room is
 * entered, so the count never changes and nothing is ever recompiled.
 *
 * A fixed pool: one narrow spotlight per exhibit (the room's plan, from
 * roomLayout, says where each hangs in the ceiling slot and what it is
 * aimed at), and a soft wash grazing the back wall. A room with fewer
 * exhibits than spotlights parks the spares below the floor at zero.
 * Narrow cones with a soft penumbra are what put pools of light on the
 * floor and the wall rather than flooding the room evenly.
 */
function RoomLights({ door }: { door: DoorSpec | undefined }) {
  const plan = useMemo(() => (door ? spotPlan(door) : []), [door]);
  const on = Boolean(door);
  const [cx, cz] = door ? roomCenter(door) : [0, 0];
  const dir = door?.side === "left" ? -1 : 1;
  const parked: [number, number, number] = [0, -40, 0];

  /*
    Virtual lights (lightPool.tsx): they cost nothing while the room is dark,
    and while it is lit the pool gives them real lights, because they are
    the nearest and brightest from inside it.
  */
  return (
    <>
      {Array.from({ length: SPOT_COUNT }, (_, i) => {
        const spot = plan[i];
        return (
          <VirtualSpot
            key={i}
            position={spot ? spot.from : parked}
            target={spot ? spot.to : [0, -44, 0]}
            angle={spot?.angle ?? 0.3}
            penumbra={0.78}
            intensity={spot ? spot.intensity : 0}
            color={GOLD.light}
            distance={26}
            decay={2}
          />
        );
      })}
      {/* grazes the back wall the exhibits stand against, softly, so the pools still read */}
      <VirtualSpot
        position={[cx + dir * ((door ? roomSize(door).depth : 0) / 2 - 1.4), on ? ROOM_H - 1 : -40, cz]}
        target={[cx, on ? 1.4 : -44, cz]}
        angle={0.9}
        penumbra={0.95}
        /* in the Art room the track wash lights the wall, so this only softens it */
        intensity={on ? (door?.id === "art" ? 50 : 110) : 0}
        color={GOLD.light}
        distance={16}
        decay={2}
      />
      {/*
        A faint cool fill in the Art room, so the shadows keep a little
        blue against the warm light. Ambient light is not counted in the
        shader cache, so this never recompiles anything.
      */}
      <ambientLight color="#334455" intensity={door?.id === "art" ? 0.05 : 0} />
    </>
  );
}

/*
  The hall is memoised, every piece of it.

  Entering a room changes one value at the top of this tree, and without
  this React reconciles the whole corridor to discover that none of it
  moved — every wall span, every lintel, every slab — before the camera
  is allowed to start. None of these take props, so skipping them is
  always safe, and it takes the click's React work down to the doors and
  the rooms, which are the only things that actually differ.
*/
/*
  And the same for the pieces that do take props: five of the six doors
  and five of the six rooms are identical either side of a click, so
  only the one you opened is rebuilt.
*/
const Door = memo(DoorInner);
const Cases = memo(CasesInner);

const Walls = memo(WallsInner);
const Floor = memo(FloorInner);
const FarFocus = memo(FarFocusInner);

export function Corridor({
  built,
  activeRoom,
  lightsRoom,
  onPrewarm,
  onEnter,
  activeId,
  onSelect,
}: {
  built: RoomId[];
  activeRoom: RoomId | null;
  /** The room whose lights are up: the one entered, until you are back in the hall. */
  lightsRoom: RoomId | null;
  /** Your pointer is on a door: raise the room behind it. */
  onPrewarm: (id: RoomId) => void;
  onEnter: (id: RoomId) => void;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const lit = doors.find((d) => d.id === lightsRoom);
  // the doors themselves are part of the hall, so they all arrive — one per tick
  const step = useStaged(doors.length, 90);
  return (
    <>
      <Static>
        <Walls />
        <Floor />
        <Vault />
        <FarFocus />
        <WallInscriptions />
      </Static>
      <Cases activeId={activeId} onSelect={onSelect} />
      {/*
        The one picture hung in the hall: on the right-hand wall before the
        first door, where the walk starts. The placeholder paintings that
        used to hang along the hall are gone.
      */}
      {HALL_PICTURES.map((pic) => (
        <HungPicture
          key={pic.z}
          position={[pic.side * (HW - 0.3), 3.9, pic.z]}
          rotation={[0, -pic.side * Math.PI * 0.5, 0]}
          exhibit={pic.exhibit}
          active={activeId === pic.exhibit.id}
          onSelect={() => onSelect(pic.exhibit)}
          src={pic.src}
          crop={WHOLE_PRINT}
          /* a bright photograph graded down reads as murk; held higher than a print in a lit room */
          tone="#d4d4d4"
          fallback={null}
          size={[2.1, 2.7]}
          aged
          glow
        />
      ))}
      <LightPool />
      <RoomLights door={lit} />
      <DoorLights activeRoom={activeRoom} />
      <StatueLight />
      <Atmosphere lamp={[0, WALL_H - 0.6, STATUE_Z + 8.5]} target={[0, STATUE_PLINTH_H + 1.9, STATUE_Z]} />
      {/*
        Every chamber is built, always.

        Mounting a room on the click that enters it meant the click had
        to pay for four walls, a floor, a ceiling and their materials
        before anything could move — and with the camera now walking in
        through the doorway rather than cutting through the wall, the
        room has to be standing there before it arrives, or you watch it
        pop into existence through the opening.

        They are built once while the loading veil is still up, and the
        frustum culls the ones behind you. What this buys is that the
        hall and the six chambers are a single continuous building from
        the first frame: the camera only ever moves through it.
      */}
      {/*
        Only the chambers you are near.

        These used to be built all at once at load, to make the hall and
        the rooms one continuous building. They still are continuous —
        but a room is raised when the camera comes within range of its
        door, not when the page opens. Walking the corridor takes
        seconds, so by the time a door is close enough to click, the
        room behind it has long since been built and its shaders
        compiled. The click stays free and the load stops carrying six
        rooms it cannot yet show.
      */}
      {doors
        .filter((door) => built.includes(door.id))
        .map((door) => (
          <RoomShell key={door.id} door={door} entered={lightsRoom === door.id} />
        ))}
      {doors.slice(0, step).map((door) => (
        <Door
          key={door.id}
          door={door}
          active={activeRoom === door.id}
          onEnter={onEnter}
          onPrewarm={onPrewarm}
        />
      ))}
    </>
  );
}
