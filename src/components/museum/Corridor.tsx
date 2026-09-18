"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  getVistaWall,
  getGlassSmudge,
  claddingFor,
  blackBrickFor,
  brushedMetalFor,
  getContactShadow,
  runeCircuitFor,
} from "./textures";
import { WallInscriptions, WallArt, WallLamp, LAMP_DROP, LAMP_REACH } from "./WallContent";
import { Atrium } from "./Atrium";
import { CaseContents } from "./CaseModels";
import { ExhibitText } from "./ExhibitText";
import { caseExhibits, type ExhibitDatum } from "./exhibitData";
import { consumedDrag } from "./lookControls";
import { inscriptionLines } from "./WallContent";
import { SHELL, MID, GOLD, LEVEL, EMIT } from "./palette";
import {
  HALF_WIDTH as HW,
  LENGTH,
  Z_NEAR,
  Z_FAR,
  WALL_H,
  CASE_POSITIONS,
  ROOM_DEPTH,
  ROOM_WIDTH,
  ROOM_H,
  roomCenter,
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
      normalScale={new THREE.Vector2(1.15, 1.15)}
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
function Walls() {
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
                    receiveShadow
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
                    receiveShadow
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
                receiveShadow
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
                emissive={GOLD.core}
                emissiveIntensity={EMIT.hairline * 0.5}
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
      normalScale={new THREE.Vector2(0.5, 0.5)}
      roughness={0.55}
      metalness={0.18}
      envMapIntensity={0.5}
    />
  );
}

function Floor() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, MID_Z]} receiveShadow>
      <planeGeometry ref={setGeo} args={[HW * 2, LENGTH]} />
      <BrickMaterial rx={(HW * 2) / BRICK_TILE} ry={LENGTH / BRICK_TILE} />
    </mesh>
  );
}

/** Room floors use the same pavers, so a chamber reads as part of the hall. */
function RoomFloor({ cx, cz }: { cx: number; cz: number }) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
      <planeGeometry ref={setGeo} args={[ROOM_DEPTH, ROOM_WIDTH]} />
      <BrickMaterial rx={ROOM_DEPTH / BRICK_TILE} ry={ROOM_WIDTH / BRICK_TILE} />
    </mesh>
  );
}

/**
 * And the same slab overhead, at the corridor's own height.
 *
 * This was a plain flat colour while the rooms were alcoves. Once the
 * ceiling runs level out of the hall the join is in shot, and a change
 * of material across it is the one thing that gives away that the room
 * was built separately.
 */
function RoomCeiling({ cx, cz }: { cx: number; cz: number }) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, ROOM_H, cz]} receiveShadow>
      <planeGeometry ref={setGeo} args={[ROOM_DEPTH, ROOM_WIDTH]} />
      <BrickMaterial rx={ROOM_DEPTH / BRICK_TILE} ry={ROOM_WIDTH / BRICK_TILE} />
    </mesh>
  );
}

/**
 * One continuous slab. It was previously three strips meeting edge to
 * edge at the same height, and those shared edges were the two diagonal
 * lines running down the centre of the ceiling.
 */
/**
 * Flat slab, and nothing else.
 *
 * The recessed downlights are gone. They lit the hall, but the fittings
 * were hanging below the slab with their light lower still, so every one
 * of them put a bright patch on the ceiling above itself — the opposite
 * of what a recessed fitting does. The wall lamps carry the corridor.
 */
function Ceiling() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useUv1(geo);
  return (
    <mesh position={[0, WALL_H, MID_Z]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry ref={setGeo} args={[HW * 2, LENGTH]} />
      <BrickMaterial rx={(HW * 2) / BRICK_TILE} ry={LENGTH / BRICK_TILE} />
    </mesh>
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
  castShadow = false,
}: {
  position: [number, number, number];
  target: [number, number, number];
  intensity?: number;
  color?: string;
  angle?: number;
  /** hard cutoff, so a fitting cannot light things it could not reach */
  distance?: number;
  castShadow?: boolean;
}) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    const l = lightRef.current;
    const t = targetRef.current;
    if (!l || !t) return;
    l.target = t;
    t.updateMatrixWorld();
  }, []);

  return (
    <>
      <spotLight
        ref={lightRef}
        position={position}
        angle={angle}
        penumbra={0.9}
        intensity={intensity}
        color={color}
        distance={distance}
        decay={2}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
        /*
          The near plane matters more than the resolution here. A default
          0.5 spread over a 40-unit range wastes almost all of the depth
          buffer on empty space, which is what produces blocky, detached
          shadows; pulling it in to the fitting's own working range is
          what makes contact shadows read as contact.
        */
        shadow-camera-near={0.4}
        shadow-camera-far={distance}
        shadow-bias={-0.0012}
        shadow-normalBias={0.028}
        shadow-radius={4}
      />
      <object3D ref={targetRef} position={target} />
    </>
  );
}

/**
 * The end of the corridor needs somewhere for the eye to land, or the
 * hall just stops into black. A lit doorway silhouette sits in front of
 * the inscription so there is a destination visible from the entrance.
 */
function FarFocus() {
  const tex = useMemo(() => getVistaWall(inscriptionLines()), []);
  const OPEN_W = 3.4;
  const OPEN_H = 6.2;

  return (
    <group position={[0, 0, Z_FAR + 0.3]}>
      {/*
        The inscription is the wall itself: opaque, covering the full
        surface edge to edge. It was previously an additive overlay on a
        panel, which read as a faint patch of script floating in the
        middle of a dark rectangle.
      */}
      <mesh position={[0, WALL_H / 2, -0.28]} receiveShadow>
        <planeGeometry args={[HW * 2, WALL_H]} />
        <meshStandardMaterial
          map={tex ?? undefined}
          color="#ffffff"
          roughness={0.88}
          metalness={0.04}
          envMapIntensity={0.5}
          /* the carving itself glows, faintly, as if lit from within */
          emissiveMap={tex ?? undefined}
          emissive={GOLD.halo}
          emissiveIntensity={0.55}
        />
      </mesh>
      {/* a second, additive pass so the script blooms rather than just
          being bright — one layer cannot both be stone and be light */}
      <mesh position={[0, WALL_H / 2, -0.26]}>
        <planeGeometry args={[HW * 2, WALL_H]} />
        <meshBasicMaterial
          map={tex ?? undefined}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/*
        The endpoint, finally decided: a commissioned figure on a plinth,
        the museum's founding piece.

        It read as ambiguous for a long time because it was an unlit
        silhouette in a bright opening — you could not tell whether it was
        a person, a doorway or a placeholder. It is resolved here by doing
        the opposite: the alcove behind goes dark, the figure is pale
        stone lit hard from the front, and a lit nameplate sits at its
        foot. Nothing about a plinth, a nameplate and a raking key light
        reads as anything other than a sculpture.
      */}
      <mesh position={[0, OPEN_H / 2, -0.02]}>
        <planeGeometry args={[OPEN_W, OPEN_H]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.95} />
      </mesh>

      <group position={[0, 0, 0.6]}>
        {/* stepped plinth */}
        <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.7, 0.24, 1.7]} />
          <meshStandardMaterial color={MID.plinth} roughness={0.7} metalness={0.15} />
        </mesh>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.6, 0.68, 0.52, 32]} />
          <meshStandardMaterial color={MID.stone} roughness={0.62} metalness={0.2} />
        </mesh>

        {/* the figure */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <capsuleGeometry args={[0.3, 1.2, 8, 20]} />
          <meshStandardMaterial color="#b8ac93" roughness={0.88} metalness={0.03} />
        </mesh>
        <mesh position={[0, 2.55, 0]} castShadow>
          <sphereGeometry args={[0.25, 24, 24]} />
          <meshStandardMaterial color="#c2b69c" roughness={0.88} metalness={0.03} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh
            key={sx}
            position={[sx * 0.36, 1.6, 0.05]}
            rotation={[0, 0, sx * 0.22]}
            castShadow
          >
            <capsuleGeometry args={[0.1, 0.82, 6, 14]} />
            <meshStandardMaterial color="#b0a48c" roughness={0.88} metalness={0.03} />
          </mesh>
        ))}

        {/* the nameplate that settles what it is */}
        <group position={[0, 0.62, 0.72]} rotation={[-0.5, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.0, 0.3, 0.035]} />
            <meshStandardMaterial
              color={GOLD.metal}
              roughness={0.3}
              metalness={1}
              envMapIntensity={1.4}
            />
          </mesh>
          <group position={[0, 0.02, 0.03]}>
            <ExhibitText text="The Visitor" position={[0, 0, 0]} height={0.11} />
          </group>
        </group>
      </group>

      {/* hard frontal key: the only thing lit at this end of the hall */}
      <PoolLight
        position={[0, 6.6, 7.5]}
        target={[0, 1.8, 0.6]}
        intensity={780}
        angle={0.26}
        distance={16}
        color="#fff2dc"
        castShadow
      />
      {/* a weak fill so the shaded side is not solid black */}
      <PoolLight
        position={[-3.2, 3.4, 6]}
        target={[0, 1.6, 0.6]}
        intensity={90}
        angle={0.4}
        distance={12}
      />

      {/* jamb, so it reads as an opening cut in stone */}
      {[
        { p: [-(OPEN_W / 2 + 0.11), OPEN_H / 2, 0.06], s: [0.22, OPEN_H + 0.44, 0.3] },
        { p: [OPEN_W / 2 + 0.11, OPEN_H / 2, 0.06], s: [0.22, OPEN_H + 0.44, 0.3] },
        { p: [0, OPEN_H + 0.11, 0.06], s: [OPEN_W + 0.44, 0.22, 0.3] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial color="#7a6a4e" roughness={0.7} metalness={0.2} />
        </mesh>
      ))}

      {/* spill from the aperture back down the hall */}
      <pointLight position={[0, 3, 5]} color={GOLD.light} intensity={210} distance={40} decay={1.9} />
    </group>
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
      <mesh position={[0, PH / 2, 0]} castShadow receiveShadow>
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
      <mesh position={[0, PH + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
        { x: 0.42, z: 0.42, i: 1, key: true },
        { x: -0.46, z: 0.3, i: 0.45, key: false },
        { x: 0.1, z: -0.48, i: 0.3, key: false },
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
                emissiveIntensity={3.6 * lamp.i}
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
              color={GOLD.metalLit}
              emissive={GOLD.core}
              emissiveIntensity={EMIT.hairline * 0.28}
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
            color={GOLD.metalLit}
            emissive={GOLD.core}
            emissiveIntensity={EMIT.hairline * 0.22}
            roughness={0.3}
            metalness={0.9}
          />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh key={`c${sz}`} position={[0, PH + 0.03, sz * (GW / 2)]}>
          <boxGeometry args={[GW, 0.02, 0.02]} />
          <meshStandardMaterial
            color={GOLD.metalLit}
            emissive={GOLD.core}
            emissiveIntensity={EMIT.hairline * 0.22}
            roughness={0.3}
            metalness={0.9}
          />
        </mesh>
      ))}

      {/* base rail the glass seats into */}
      <mesh position={[0, PH + 0.055, 0]} castShadow>
        <boxGeometry args={[GW + 0.09, 0.11, GW + 0.09]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.32}
          metalness={0.95}
          envMapIntensity={1.4}
        />
      </mesh>

      {/* cap rail */}
      <mesh position={[0, glassY + GH / 2, 0]} castShadow>
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
            <mesh castShadow>
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
                color={SHELL.recess}
                emissive={GOLD.halo}
                emissiveIntensity={lit ? 0.5 : 0.2}
                roughness={0.5}
              />
            </mesh>
            <group position={[0, 0.1, 0.035]}>
              <ExhibitText text={exhibit.title} position={[0, 0, 0]} height={0.1} active={lit} />
            </group>
            <group position={[0, -0.13, 0.035]}>
              <ExhibitText text="Read" position={[0, 0, 0]} height={0.075} active={lit} />
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
          <mesh position={[0, -0.34, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 0.5, 12]} />
            <meshStandardMaterial color={MID.bronze} roughness={0.35} metalness={0.9} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function Cases({
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
 * The inlay at the heart of the door.
 *
 * Drawn, not generated. The previous attempt scattered procedural traces
 * across the leaf and it read as noise, because randomness cannot make
 * something look considered — an ancient object is covered in marks that
 * a person DECIDED on, and the eye can tell the difference immediately.
 *
 * So this is an explicit list of segments, all on a coarse grid, all
 * right angles, one line weight, mirrored exactly across the seam. The
 * discipline is the point: strict symmetry and a single stroke width are
 * what make a pattern read as inscribed rather than sprayed on.
 *
 * Coordinates are fractions of the door, so the motif scales with it.
 */
const INLAY: { x1: number; y1: number; x2: number; y2: number }[] = [
  // the spine, running beside the seam
  { x1: 0.035, y1: 0.3, x2: 0.035, y2: 0.63 },

  // upper bracket: out, up a step, out again
  { x1: 0.035, y1: 0.585, x2: 0.15, y2: 0.585 },
  { x1: 0.15, y1: 0.585, x2: 0.15, y2: 0.625 },
  { x1: 0.15, y1: 0.625, x2: 0.245, y2: 0.625 },

  // the long middle arm, the widest reach of the motif
  { x1: 0.035, y1: 0.485, x2: 0.215, y2: 0.485 },
  { x1: 0.215, y1: 0.485, x2: 0.215, y2: 0.44 },
  { x1: 0.215, y1: 0.44, x2: 0.305, y2: 0.44 },

  // lower bracket, mirroring the upper one downward
  { x1: 0.035, y1: 0.375, x2: 0.13, y2: 0.375 },
  { x1: 0.13, y1: 0.375, x2: 0.13, y2: 0.335 },
  { x1: 0.13, y1: 0.335, x2: 0.2, y2: 0.335 },

  // a short return above the spine, closing the composition
  { x1: 0.035, y1: 0.63, x2: 0.105, y2: 0.63 },
];

/** Where the runs terminate, as square nodes. */
const INLAY_NODES: { x: number; y: number; s: number }[] = [
  { x: 0.245, y: 0.625, s: 1 },
  { x: 0.305, y: 0.44, s: 1.3 },
  { x: 0.2, y: 0.335, s: 1 },
  { x: 0.105, y: 0.63, s: 0.8 },
];

/**
 * The Ancient-Futuristic Portal.
 *
 * Built to the brief: an elongated arch, stepped archivolts, oxidised
 * metal leaves etched with circuitry, a sigil where they meet, and light
 * escaping the seam onto worn steps.
 *
 * WINDING, first, because it is what broke the previous attempt. A
 * THREE.Shape whose outer contour runs clockwise is treated as a hole,
 * so it extrudes to nothing. The left leaf was wound clockwise and
 * collapsed to a sliver while the right one rendered correctly — the
 * same code, mirrored, behaving completely differently. Both leaves are
 * now built bottom-edge-first in the +x direction and closed along the
 * top in -x, which is counter-clockwise whichever side they are on.
 *
 * The ancient-to-technological gradient the brief asks for is carried by
 * the archivolts: the outermost ring is eroded stone with no glow at all,
 * the middle ring picks up faint vein light in its recesses, and the
 * innermost ring is fully etched circuitry. Walking inward, the stone
 * "wakes up".
 */
function Door({
  door,
  active,
  onEnter,
}: {
  door: DoorSpec;
  active: boolean;
  onEnter: (id: RoomId) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  const sgn = door.side === "left" ? -1 : 1;
  const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;

  const W = DOOR_W;
  const H = DOOR_H;
  /*
    Where the arch leaves the jamb. At 0.46 the sides of the leaf were
    only 63% of full height, so each one tapered away into a fin rather
    than reading as a door with an arched head. At 0.76 the arch occupies
    the top quarter, which is what a real arched door does.
  */
  const SPRING = H * 0.76;
  const RECESS = Math.max(DOOR_RECESS, 0.7);
  const LEAF_Z = -RECESS + 0.16;
  const GAP = 0.07;

  const rune = useMemo(() => runeCircuitFor(1.6, 2.4), []);
  const runeBand = useMemo(() => runeCircuitFor(0.35, 3.4), []);
  const stone = useMemo(() => claddingFor(0.9, 1.4), []);
  const pool = useMemo(() => getContactShadow(), []);

  const trace = lit ? 1.1 : 0.5;

  /*
    Blued gunmetal, not sand and not a darker brown.

    The previous patina greens were still close enough in value and
    warmth to the walls that at corridor distance the door read as part
    of them. These are cold and near-black: a different substance, which
    is the only thing that separates a portal from the wall it is cut
    into. It also gives the amber channel light something to sit against
    instead of blending into.
  */
  /*
    These are far lighter than they look like they should be, and that is
    deliberate.

    At #12161d the leaf rendered at roughly 9/255 under this hall's
    ambient — indistinguishable from black, which is why three attempts
    at changing the door's colour appeared to change nothing. A surface
    with no lamp on it can only show the colour its own albedo carries,
    so the albedo has to be bright enough to survive being dimly lit.
  */
  const LEAF = "#3c4b60";
  const PATINA = "#4a5d74";
  const IRON = "#5a7089";
  const IRON_LIT = "#94aec8";

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  /** Height of the arch at a given x. */
  const archY = useMemo(() => {
    const hw = W / 2;
    const ctrlY = SPRING + (H - SPRING) * 0.78;
    return (x: number) => {
      const ax = Math.abs(x);
      if (ax >= hw) return SPRING;
      const t = Math.sqrt(Math.max(0, 1 - ax / hw));
      return (1 - t) * (1 - t) * SPRING + 2 * (1 - t) * t * ctrlY + t * t * H;
    };
  }, [W, H, SPRING]);

  /** The arch as an open curve, for the light strips that trace it. */
  const archEdge = useMemo(() => {
    const q = (t: number, p0: number, p1: number, p2: number) =>
      (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
    return (w: number, h: number) => {
      const hw = w / 2;
      const ctrlY = SPRING + (h - SPRING) * 0.78;
      const pts: THREE.Vector3[] = [new THREE.Vector3(-hw, 0.06, 0)];
      pts.push(new THREE.Vector3(-hw, SPRING, 0));
      for (let i = 1; i <= 20; i += 1) {
        const t = i / 20;
        pts.push(new THREE.Vector3(q(t, -hw, -hw, 0), q(t, SPRING, ctrlY, h), 0));
      }
      for (let i = 1; i <= 20; i += 1) {
        const t = i / 20;
        pts.push(new THREE.Vector3(q(t, 0, hw, hw), q(t, h, ctrlY, SPRING), 0));
      }
      pts.push(new THREE.Vector3(hw, 0.06, 0));
      return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0);
    };
  }, [SPRING]);

  /**
   * An archivolt ring: an arched outline with an arched hole punched
   * through it.
   *
   * This is the fix for the door that would not appear. The previous
   * version extruded a FILLED arch and relied on BackSide rendering to
   * make it look hollow — which meant every ring was a solid slab across
   * the whole doorway, and the only thing visible through them was a
   * sliver of leaf. A ring has to be a shape with a hole in it, which is
   * what THREE.Shape.holes is for.
   */
  const archRing = useMemo(() => {
    const contour = (path: THREE.Shape | THREE.Path, w: number, h: number) => {
      const hw = w / 2;
      path.moveTo(-hw, 0);
      path.lineTo(hw, 0);
      path.lineTo(hw, SPRING);
      path.quadraticCurveTo(hw, SPRING + (h - SPRING) * 0.78, 0, h);
      path.quadraticCurveTo(-hw, SPRING + (h - SPRING) * 0.78, -hw, SPRING);
      path.closePath();
    };
    return (ow: number, oh: number, iw: number, ih: number) => {
      const shape = new THREE.Shape();
      contour(shape, ow, oh);
      const hole = new THREE.Path();
      contour(hole, iw, ih);
      shape.holes.push(hole);
      return shape;
    };
  }, [SPRING]);

  /**
   * One leaf. Bottom edge always drawn left-to-right and the top closed
   * right-to-left, so the contour is counter-clockwise on both sides.
   */
  const leaves = useMemo(() => {
    const hw = W / 2 - 0.08;
    const build = (x0: number, x1: number) => {
      const s = new THREE.Shape();
      const lo = Math.min(x0, x1);
      const hi = Math.max(x0, x1);
      const SEG = 26;
      s.moveTo(lo, 0);
      s.lineTo(hi, 0);
      for (let i = 0; i <= SEG; i += 1) {
        const x = hi - (hi - lo) * (i / SEG);
        s.lineTo(x, archY(x) - 0.08);
      }
      s.closePath();
      return s;
    };
    return { left: build(-hw, -GAP), right: build(GAP, hw) };
  }, [W, GAP, archY]);

  /** Rivets following the jamb and the curve of each leaf. */
  const rivets = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    const hw = W / 2 - 0.3;
    for (const side of [-1, 1] as const) {
      for (let y = 0.4; y < SPRING - 0.2; y += 0.58) out.push({ x: side * hw, y });
      for (let i = 0; i <= 8; i += 1) {
        const x = side * (hw - (hw - GAP - 0.25) * (i / 8));
        out.push({ x, y: archY(x) - 0.33 });
      }
    }
    return out;
  }, [W, SPRING, GAP, archY]);

  /*
    Three rings, ancient on the outside and technological on the inside.
    Only the innermost is etched; the middle carries faint vein light in
    its recesses; the outer is plain eroded stone.
  */
  /*
    The outermost order is the WALL, not the door.

    It used to be dark blue-grey like the rest of the portal, so it read
    as a shadow halo standing off the arch — the dark corners above the
    springing. Giving it the wall's own stone and colour makes the
    opening look like the wall thickening into an arch, which is what a
    real portal does: the door is metal, the surround is masonry, and
    only the inner orders belong to the door.
  */
  const RINGS = [
    { grow: 0.0, z: 0.02, depth: 0.38, colour: PATINA, etch: 1, masonry: false },
    { grow: 0.52, z: -0.2, depth: 0.34, colour: "#4a5468", etch: 0.22, masonry: false },
    { grow: 1.08, z: -0.42, depth: 0.3, colour: SHELL.wall, etch: 0, masonry: true },
  ];

  return (
    <group position={[doorX(door.side), 0, door.z]} rotation={[0, yaw, 0]}>
      {/* the reveal: wall thickness seen from inside the opening */}
      <mesh position={[0, H / 2, -RECESS / 2]}>
        <boxGeometry args={[W, H, RECESS]} />
        <meshStandardMaterial
          color="#0c1015"
          roughness={0.95}
          metalness={0.2}
          side={THREE.BackSide}
        />
      </mesh>

      {/* the lit chamber behind, which the parting lets through */}
      <mesh position={[0, H * 0.45, LEAF_Z - 0.55]}>
        <planeGeometry args={[W * 0.9, H]} />
        <meshStandardMaterial
          color={GOLD.core}
          emissive={GOLD.core}
          emissiveIntensity={lit ? 3.4 : 2}
        />
      </mesh>

      {/* ---- the two arched leaves ---- */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[0, 0, LEAF_Z]}>
          <mesh castShadow receiveShadow>
            <extrudeGeometry
              args={[
                side < 0 ? leaves.left : leaves.right,
                {
                  depth: 0.24,
                  bevelEnabled: true,
                  bevelThickness: 0.035,
                  bevelSize: 0.035,
                  bevelSegments: 2,
                },
              ]}
            />
            <meshStandardMaterial
              color={LEAF}
              map={rune?.map ?? null}
              normalMap={rune?.normalMap ?? null}
              roughnessMap={rune?.roughnessMap ?? null}
              emissiveMap={rune?.emissiveMap ?? null}
              emissive={GOLD.halo}
              /* held well under the inlay, so the drawn motif leads and
                 the engraving stays a texture rather than a second pattern */
              emissiveIntensity={trace * 0.34}
              normalScale={new THREE.Vector2(1.7, 1.7)}
              roughness={0.5}
              metalness={0.72}
              envMapIntensity={1.25}
            />
          </mesh>

          {/*
            The inlay, mirrored onto this leaf. One stroke width, right
            angles only, and an exact mirror of the other side — the
            symmetry is what makes it read as deliberate.
          */}
          {INLAY.map((seg, i) => {
            const x1 = side * seg.x1 * W;
            const x2 = side * seg.x2 * W;
            const y1 = seg.y1 * H;
            const y2 = seg.y2 * H;
            const len = Math.hypot(x2 - x1, y2 - y1);
            const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
            return (
              <mesh
                key={i}
                position={[(x1 + x2) / 2, (y1 + y2) / 2, 0.252]}
              >
                <boxGeometry
                  args={horizontal ? [len, 0.032, 0.014] : [0.032, len, 0.014]}
                />
                <meshStandardMaterial
                  color={GOLD.core}
                  emissive={GOLD.core}
                  emissiveIntensity={trace * 1.1}
                  roughness={0.42}
                  metalness={0.5}
                />
              </mesh>
            );
          })}
          {INLAY_NODES.map((n, i) => (
            <mesh
              key={`n${i}`}
              position={[side * n.x * W, n.y * H, 0.254]}
            >
              <boxGeometry args={[0.075 * n.s, 0.075 * n.s, 0.016]} />
              <meshStandardMaterial
                color={GOLD.core}
                emissive={GOLD.core}
                emissiveIntensity={trace * 1.5}
                roughness={0.4}
                metalness={0.5}
              />
            </mesh>
          ))}

          {/* raised panel band, with an etched field recessed inside it */}
          <mesh position={[side * (W * 0.23), H * 0.2, 0.26]} castShadow>
            <boxGeometry args={[W * 0.34, H * 0.3, 0.05]} />
            <meshStandardMaterial
              color={IRON}
              roughness={0.4}
              metalness={0.88}
              envMapIntensity={1.35}
            />
          </mesh>
          <mesh position={[side * (W * 0.23), H * 0.2, 0.29]}>
            <boxGeometry args={[W * 0.27, H * 0.24, 0.025]} />
            <meshStandardMaterial
              color={LEAF}
              map={rune?.map ?? null}
              emissiveMap={rune?.emissiveMap ?? null}
              emissive={GOLD.halo}
              emissiveIntensity={trace * 0.5}
              roughness={0.48}
              metalness={0.68}
            />
          </mesh>

          {/* strap hinges reaching in from the jamb */}
          {[H * 0.14, H * 0.38, H * 0.62].map((y) => (
            <group key={y}>
              <mesh position={[side * (W * 0.29), y, 0.265]} castShadow>
                <boxGeometry args={[W * 0.38, 0.13, 0.055]} />
                <meshStandardMaterial
                  color={IRON_LIT}
                  roughness={0.36}
                  metalness={0.94}
                  envMapIntensity={1.45}
                />
              </mesh>
              {/* the tapered tip, so a strap is not just a bar */}
              <mesh position={[side * (W * 0.1), y, 0.265]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <coneGeometry args={[0.085, 0.24, 4]} />
                <meshStandardMaterial color={IRON_LIT} roughness={0.36} metalness={0.94} />
              </mesh>
              <mesh
                position={[side * (W * 0.46), y, 0.265]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.08, 0.08, 0.22, 12]} />
                <meshStandardMaterial color={IRON_LIT} roughness={0.34} metalness={0.95} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* rivets over the ironwork */}
      {rivets.map((rv, i) => (
        <mesh key={i} position={[rv.x, rv.y, LEAF_Z + 0.27]} castShadow>
          <sphereGeometry args={[0.052, 10, 8]} />
          <meshStandardMaterial
            color={IRON_LIT}
            roughness={0.3}
            metalness={0.96}
            envMapIntensity={1.45}
          />
        </mesh>
      ))}

      {/* ---- the hexagonal sigil, split across the parting ---- */}
      <group position={[0, H * 0.42, LEAF_Z + 0.28]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.52, 0.56, 0.09, 6]} />
          <meshStandardMaterial
            color={IRON}
            roughness={0.38}
            metalness={0.92}
            envMapIntensity={1.35}
          />
        </mesh>
        {/* nested hexagons, brightening inward */}
        {[
          { r: 0.42, w: 0.028, i: 0.7 },
          { r: 0.3, w: 0.024, i: 1.1 },
          { r: 0.18, w: 0.02, i: 1.7 },
        ].map((ring) => (
          <mesh key={ring.r} position={[0, 0, 0.06]} rotation={[0, 0, Math.PI / 6]}>
            <torusGeometry args={[ring.r, ring.w, 6, 6]} />
            <meshStandardMaterial
              color={GOLD.core}
              emissive={GOLD.core}
              emissiveIntensity={trace * ring.i}
              roughness={0.35}
              metalness={0.7}
            />
          </mesh>
        ))}
        {/* the core of the sigil */}
        <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.02, 6]} />
          <meshStandardMaterial
            color={GOLD.core}
            emissive={GOLD.core}
            emissiveIntensity={trace * 2.2}
          />
        </mesh>
      </group>

      {/* ---- the parting, and the light through it ---- */}
      <mesh position={[0, H * 0.45, LEAF_Z + 0.22]}>
        <planeGeometry args={[GAP * 1.4, H * 0.9]} />
        <meshStandardMaterial
          color={GOLD.core}
          emissive={GOLD.core}
          emissiveIntensity={lit ? 3.4 : 2.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, H * 0.4, LEAF_Z + 0.26]}>
        <planeGeometry args={[0.66, H * 0.92]} />
        <meshBasicMaterial
          color={GOLD.halo}
          transparent
          opacity={lit ? 0.26 : 0.15}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* ---- the archivolts: ancient outside, technological inside ---- */}
      {RINGS.map((ring, i) => (
        <mesh key={i} position={[0, 0, ring.z]} castShadow receiveShadow>
          <extrudeGeometry
            args={[
              archRing(
                W + 0.6 + ring.grow,
                H + 0.34 + ring.grow * 0.6,
                // the hole is the previous ring's outer edge, so they nest
                W + 0.14 + ring.grow * 0.55,
                H + 0.08 + ring.grow * 0.32,
              ),
              {
                depth: ring.depth,
                bevelEnabled: true,
                bevelThickness: 0.05,
                bevelSize: 0.05,
                bevelSegments: 3,
              },
            ]}
          />
          <meshStandardMaterial
            color={ring.colour}
            map={ring.etch > 0.5 ? runeBand?.map ?? null : stone?.map ?? null}
            normalMap={ring.etch > 0.5 ? runeBand?.normalMap ?? null : stone?.normalMap ?? null}
            roughnessMap={ring.etch > 0.5 ? null : stone?.roughnessMap ?? null}
            emissiveMap={ring.etch > 0 ? runeBand?.emissiveMap ?? null : null}
            emissive={GOLD.halo}
            emissiveIntensity={trace * ring.etch * 0.7}
            normalScale={new THREE.Vector2(1.5, 1.5)}
            /* masonry matches the wall's own finish, so it reads as wall */
            roughness={ring.masonry ? 0.86 : 0.66 + i * 0.1}
            metalness={ring.masonry ? 0.05 : 0.45 - i * 0.15}
            envMapIntensity={ring.masonry ? 0.5 : 1.05}
          />
        </mesh>
      ))}

      {/*
        A grazing wash across the door face.

        Placed well back in the corridor and aimed across rather than at
        the door, with the penumbra almost fully open. That is what
        avoids the hard oval a close point light produced: at this
        distance the falloff across the face is gentle, so the material
        is revealed without a hotspot appearing anywhere on it.
      */}
      <PoolLight
        position={[0, H * 1.25, 5.2]}
        target={[0, H * 0.4, 0]}
        intensity={lit ? 150 : 88}
        angle={0.5}
        distance={9}
        color="#cfe2ff"
      />

      {/*
        Light strips following the door's own edges.

        Traced off the same arch curve the rings are built from, so they
        sit exactly on the corner where each archivolt steps back rather
        than floating near it. Three runs at decreasing brightness give
        the opening depth: the innermost edge is brightest and the outer
        ones fall away, which is how an edge-lit recess actually reads.
      */}
      {[
        { grow: 0.1, z: 0.4, r: 0.03, i: 1.5 },
        { grow: 0.62, z: 0.16, r: 0.026, i: 0.85 },
        { grow: 1.18, z: -0.08, r: 0.022, i: 0.45 },
      ].map((strip, i) => (
        <mesh key={i} position={[0, 0, strip.z]}>
          <tubeGeometry
            args={[archEdge(W + 0.36 + strip.grow, H + 0.2 + strip.grow * 0.6), 96, strip.r, 8, false]}
          />
          <meshStandardMaterial
            color={GOLD.core}
            emissive={GOLD.core}
            emissiveIntensity={trace * strip.i}
            roughness={0.35}
            metalness={0.6}
          />
        </mesh>
      ))}

      {/*
        The glowing corner cubes are gone.

        Four lit boxes floating at the corners of every doorway read as
        placeholder geometry, not lighting — nothing about a cube says
        "fitting". The edge strips already describe the opening, and they
        follow its actual curve, which is what makes them believable.
      */}

      {/*
        The crystal shards are gone.

        Detached octahedra floating around the arch head read as debris,
        not architecture — nothing connected them to the stone, so they
        hung in the air like placeholder markers. If the arch wants a
        crown it should be cut from the arch itself, not scattered near it.
      */}

      {/* ---- worn steps up to the threshold ---- */}
      {[
        { w: W + 1.5, d: 0.5, y: 0.06, z: 0.35 },
        { w: W + 2.2, d: 0.5, y: 0.02, z: 0.8 },
      ].map((st, i) => (
        <mesh key={i} position={[0, st.y, st.z]} castShadow receiveShadow>
          <boxGeometry args={[st.w, 0.12, st.d]} />
          <meshStandardMaterial
            color="#404f61"
            map={stone?.map ?? null}
            normalMap={stone?.normalMap ?? null}
            roughnessMap={stone?.roughnessMap ?? null}
            normalScale={new THREE.Vector2(1.2, 1.2)}
            roughness={0.9}
            metalness={0.08}
          />
        </mesh>
      ))}

      {/*
        The pool of light on the floor, with a real falloff.

        It was a plain quad before, so it drew as a hard-edged rectangle
        sitting on the floor like a sheet of paper — light does not have
        corners. Masking it with a radial gradient is what turns it back
        into a pool: bright under the seam, gone by its edges, with
        nothing to give away that it is a rectangle underneath.
      */}
      <mesh position={[0, 0.15, 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 4.0]} />
        <meshBasicMaterial
          color={GOLD.halo}
          map={pool ?? undefined}
          transparent
          opacity={lit ? 0.4 : 0.24}
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
          opacity={lit ? 0.85 : 0.5}
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

/** A run of banding along a wall: where it is centred, and how long. */
type WallRun = { x: number; len: number };

/**
 * The museum's wall, as a component rather than as one plane of stone.
 *
 * Same build as `Walls` — plinth course, bronze band capping it, the
 * cladding field above, a recessed channel with a hairline in it near
 * the head, a cove at the ceiling and a shadow gap at the floor — but
 * authored in the wall's own frame so it can be stood up at any
 * orientation. The corridor only ever needed two walls facing each
 * other; a room needs four, and building them by hand for each is how
 * the two ends of the building stop matching.
 *
 * Local frame: the face lies in XY at z = 0 looking down +Z, so +Z is
 * into the room and everything proud of the wall has a positive z.
 */
function LayeredWall({
  position,
  yaw,
  length,
  height,
  opening,
}: {
  position: [number, number, number];
  yaw: number;
  length: number;
  height: number;
  /** a doorway centred on the wall, left as a hole in the lower courses */
  opening?: { width: number; height: number };
}) {
  const CHANNEL_Y = channelY(height);

  /*
    The courses below the door head break either side of the opening.
    The channel and the cove sit well above it — the head is 6.2 and the
    channel starts at height - 2.2 — so those carry straight through,
    which is what keeps the line of light unbroken around the room.
  */
  const low: WallRun[] = opening
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
      {low.map((run) => (
        <group key={`run${run.x}`}>
          {/* the cladding field above the plinth */}
          <mesh position={[run.x, (height + PLINTH_H) / 2, 0]} receiveShadow>
            <planeGeometry args={[run.len, height - PLINTH_H]} />
            <CladdingMaterial
              rx={run.len / CLAD_TILE}
              ry={(height - PLINTH_H) / CLAD_TILE}
            />
          </mesh>

          {/* darker plinth course, set slightly proud */}
          <mesh position={[run.x, PLINTH_H / 2, 0.09]} receiveShadow>
            <planeGeometry args={[run.len, PLINTH_H]} />
            <meshStandardMaterial
              color={SHELL.recess}
              roughness={0.62}
              metalness={0.3}
              envMapIntensity={0.7}
            />
          </mesh>

          {/* bronze band capping the plinth */}
          <mesh position={[run.x, TRIM_Y, 0.1]}>
            <boxGeometry args={[run.len, 0.09, 0.22]} />
            <meshStandardMaterial
              color={GOLD.metal}
              roughness={0.3}
              metalness={1}
              envMapIntensity={1.5}
            />
          </mesh>

          {/* floor corner: a shadow gap with a dim strip inside it */}
          <mesh position={[run.x, 0.2, 0.14]}>
            <planeGeometry args={[run.len, 0.4]} />
            <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
          </mesh>
          <mesh position={[run.x, 0.1, 0.22]}>
            <boxGeometry args={[run.len, 0.09, 0.09]} />
            <meshStandardMaterial color={MID.bronze} roughness={0.45} metalness={0.85} />
          </mesh>
          <mesh position={[run.x, 0.1, 0.28]}>
            <boxGeometry args={[run.len, 0.06, 0.03]} />
            <meshStandardMaterial
              color="#fff4e0"
              emissive={GOLD.core}
              emissiveIntensity={1.3}
              roughness={0.6}
              transparent
              opacity={0.94}
            />
          </mesh>
        </group>
      ))}

      {/* the lintel panel over a doorway, so the wall closes above it */}
      {opening ? (
        <mesh position={[0, (height + opening.height) / 2, 0]} receiveShadow>
          <planeGeometry args={[opening.width, height - opening.height]} />
          <CladdingMaterial
            rx={opening.width / CLAD_TILE}
            ry={(height - opening.height) / CLAD_TILE}
          />
        </mesh>
      ) : null}

      {/* recessed channel near the head of the wall, and its hairline */}
      <mesh position={[0, CHANNEL_Y, 0.14]}>
        <boxGeometry args={[length, 0.34, 0.28]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
      </mesh>
      <mesh position={[0, CHANNEL_Y - 0.1, 0.24]}>
        <boxGeometry args={[length * 0.99, 0.05, 0.05]} />
        <meshStandardMaterial
          color={GOLD.metalLit}
          emissive={GOLD.core}
          emissiveIntensity={EMIT.hairline * 0.5}
          roughness={0.3}
          metalness={0.9}
        />
      </mesh>

      {/* the cove at the ceiling: lip, housing, diffuser behind it */}
      <mesh position={[0, height - 0.5, 0.22]} castShadow>
        <boxGeometry args={[length, 0.1, 0.44]} />
        <meshStandardMaterial
          color={GOLD.metal}
          roughness={0.32}
          metalness={1}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh position={[0, height - 0.38, 0.13]}>
        <boxGeometry args={[length, 0.1, 0.1]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.42} metalness={0.9} />
      </mesh>
      <mesh position={[0, height - 0.38, 0.2]}>
        <boxGeometry args={[length, 0.07, 0.035]} />
        <meshStandardMaterial
          color="#fff4e0"
          emissive={GOLD.core}
          emissiveIntensity={1.9}
          roughness={0.6}
          transparent
          opacity={0.94}
        />
      </mesh>
    </group>
  );
}

/**
 * The reveal around the doorway, seen from inside the room.
 *
 * The door leaf is recessed into the corridor wall, which means it
 * stands slightly proud on this side — so the opening needs real
 * thickness lining it or the leaf reads as a slab floating in a hole.
 * Same frame as `LayeredWall`: +Z is into the room.
 */
function RoomPortal({
  width,
  height,
  depth,
}: {
  width: number;
  height: number;
  depth: number;
}) {
  const JAMB = 0.18;
  const reveal = (
    <meshStandardMaterial color={SHELL.recess} roughness={0.72} metalness={0.25} />
  );

  return (
    <group>
      {/* the two jambs */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (width / 2 + JAMB / 2), height / 2, depth / 2]}
          receiveShadow
        >
          <boxGeometry args={[JAMB, height + JAMB, depth]} />
          {reveal}
        </mesh>
      ))}
      {/* and the head over them */}
      <mesh position={[0, height + JAMB / 2, depth / 2]} receiveShadow>
        <boxGeometry args={[width + JAMB * 2, JAMB, depth]} />
        {reveal}
      </mesh>

      {/* a bronze bead on the room-side arris, the way the plinth is capped */}
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * (width / 2 + JAMB / 2), height / 2, depth]}>
          <boxGeometry args={[0.1, height + JAMB, 0.1]} />
          <meshStandardMaterial
            color={GOLD.metal}
            roughness={0.3}
            metalness={1}
            envMapIntensity={1.5}
          />
        </mesh>
      ))}
      <mesh position={[0, height + JAMB / 2, depth]}>
        <boxGeometry args={[width + JAMB * 2, 0.1, 0.1]} />
        <meshStandardMaterial
          color={GOLD.metal}
          roughness={0.3}
          metalness={1}
          envMapIntensity={1.5}
        />
      </mesh>
    </group>
  );
}

/**
 * A room off the corridor, built the way the corridor is built.
 *
 * It was three bare cladding panels, a floor, a flat ceiling colour and
 * one overhead spot — which is why it read as an alcove behind a very
 * good door. This is the same volume finished to the hall's own
 * specification: four layered walls, the pavers overhead as well as
 * underfoot, a continuous cove around all four sides, wall lamps on
 * brackets, a lined reveal back to the doorway, and the back wall
 * grazed rather than flooded so whatever stands against it keeps the
 * contrast the palette asks for.
 */
function RoomShell({ door }: { door: DoorSpec }) {
  const dir = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);
  const backX = cx + dir * (ROOM_DEPTH / 2);
  /*
    Nudged a hair into the room. The corridor's own wall plane sits at
    exactly this x, and although the two face opposite ways and never
    both draw, there is no reason to ask the depth buffer to arbitrate.
  */
  const frontX = cx - dir * (ROOM_DEPTH / 2) + dir * 0.02;
  const halfW = ROOM_WIDTH / 2;

  const OPEN_W = DOOR_W + 1.2;
  const OPEN_H = DOOR_H + 0.6;

  /*
    Lamps on the side walls only. The back wall is the exhibit wall and
    gets grazing light instead — a fitting hanging over an exhibit is
    the thing you end up looking at. Two per side is what the 20-unit
    run takes at the corridor's own spacing.
  */
  const lampX = [-1, 1].map((s) => cx + s * (ROOM_DEPTH / 4));

  return (
    <group>
      {/* back wall: the one the exhibits stand against */}
      <LayeredWall
        position={[backX, 0, cz]}
        yaw={-dir * Math.PI * 0.5}
        length={ROOM_WIDTH}
        height={ROOM_H}
      />

      {/* the two side walls */}
      {[-1, 1].map((s) => (
        <LayeredWall
          key={s}
          position={[cx, 0, cz + s * halfW]}
          yaw={s > 0 ? Math.PI : 0}
          length={ROOM_DEPTH}
          height={ROOM_H}
        />
      ))}

      {/* the wall you came through, with the doorway left open in it */}
      <group position={[frontX, 0, cz]} rotation={[0, dir * Math.PI * 0.5, 0]}>
        <RoomPortal width={OPEN_W} height={OPEN_H} depth={DOOR_RECESS + 0.35} />
      </group>
      <LayeredWall
        position={[frontX, 0, cz]}
        yaw={dir * Math.PI * 0.5}
        length={ROOM_WIDTH}
        height={ROOM_H}
        opening={{ width: OPEN_W, height: OPEN_H }}
      />

      <RoomFloor cx={cx} cz={cz} />
      <RoomCeiling cx={cx} cz={cz} />

      {/* fittings on the side walls, facing each other across the room */}
      {[-1, 1].map((s) =>
        lampX.map((x) => (
          <WallLamp
            key={`${s}-${x}`}
            position={[x, ROOM_H - LAMP_DROP, cz + s * (halfW - LAMP_REACH)]}
            yaw={s > 0 ? Math.PI / 2 : -Math.PI / 2}
          />
        )),
      )}

      {/*
        Two washes down the back wall rather than one spot in the middle
        of the ceiling. A single overhead light puts the room's brightest
        patch on the floor you are standing on; grazing the wall the
        exhibits are against is what holds the 8:1 the palette is built
        around.
      */}
      {[-1, 1].map((s) => (
        <PoolLight
          key={`wash${s}`}
          position={[backX - dir * 2.6, ROOM_H - 1.4, cz + s * (ROOM_WIDTH / 5)]}
          target={[backX, 1.4, cz + s * (ROOM_WIDTH / 5)]}
          intensity={LEVEL.vista * 0.7}
          angle={0.62}
          distance={26}
        />
      ))}

      {/* enough ambient in the volume itself that the floor is not a void */}
      <PoolLight
        position={[cx, ROOM_H - 0.8, cz]}
        target={[cx, 0, cz]}
        intensity={LEVEL.vista * 0.45}
        angle={0.9}
        distance={30}
      />
    </group>
  );
}

export function Corridor({
  activeRoom,
  onEnter,
  activeId,
  onSelect,
}: {
  activeRoom: RoomId | null;
  onEnter: (id: RoomId) => void;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const entered = doors.find((d) => d.id === activeRoom);
  return (
    <>
      <Walls />
      <Atrium />
      <Floor />
      <Ceiling />
      <FarFocus />
      <WallInscriptions />
      <WallArt />
      <Cases activeId={activeId} onSelect={onSelect} />
      {entered ? <RoomShell door={entered} /> : null}
      {doors.map((door) => (
        <Door key={door.id} door={door} active={activeRoom === door.id} onEnter={onEnter} />
      ))}
    </>
  );
}
