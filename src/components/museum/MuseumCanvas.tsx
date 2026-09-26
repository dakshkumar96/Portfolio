"use client";

import { memo, Suspense, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { Corridor } from "./Corridor";
import { Effects } from "./Effects";
import { ExhibitText } from "./ExhibitText";
import { FillLights } from "./Lighting";
import { EnvLight } from "./EnvLight";
import { ATMOSPHERE } from "./palette";

import { Vitrine, type VitrineShape } from "./Vitrine";
import { PortraitWall } from "./PortraitWall";
import { PerfHud } from "./PerfHud";
import {
  CAM_Z_START,
  CAM_Y,
  doors,
  doorX,
  DOOR_H,
  ROOM_DEPTH,
  ROOM_WIDTH,
  roomCenter,
  type RoomId,
} from "./corridorLayout";
import { exhibitsByRoom, type ExhibitDatum } from "./exhibitData";

const SHAPES: VitrineShape[] = ["icosahedron", "octahedron", "torus", "sphere", "box"];

/**
 * How many materials to hand the driver in one asynchronous batch.
 *
 * Small on purpose. `compileAsync` lets the driver link off-thread, but
 * before that Three still builds each program's shader source on the
 * main thread, and that part does not move. A batch of twelve was
 * measured producing twenty programs in a single frame; three keeps the
 * synchronous half of the work down to something a frame can absorb.
 */
const WARM_BATCH = 3;

/**
 * Compile every material up front, in batches, off the main thread.
 *
 * Measurement settled what this is for: every frame slow enough to be
 * felt reported `geometries +0, programs +15`. Never geometry — always
 * shaders. A program must be compiled and linked by the graphics
 * driver, and the synchronous `compile()` blocks until it finishes.
 *
 * Two things make it cheap.
 *
 * A program belongs to a material, not to a mesh, so the queue holds
 * one representative mesh per material it has not seen. Eight hundred
 * meshes share well under two hundred materials, and compiling the
 * other six hundred would be pure repetition.
 *
 * And `compileAsync` uses KHR_parallel_shader_compile, so the driver
 * links off-thread and the frame ends while it works. One batch is in
 * flight at a time; the next starts when it resolves, so the queue
 * drains as fast as the driver allows and never faster.
 */
function WarmShaders({ settled, done }: { settled: boolean; done: () => void }) {
  const seen = useRef<WeakSet<THREE.Material>>(new WeakSet());
  const queue = useRef<THREE.Mesh[]>([]);
  const busy = useRef(false);
  const quiet = useRef(0);
  const finished = useRef(false);
  /** Frames to wait before looking for newly-built rooms again. */
  const scan = useRef(0);

  useFrame(({ gl, scene, camera }) => {
    /*
      Once the queue has drained and the rooms have stopped arriving,
      this component is done and must do nothing at all.

      Without this guard the rescan below ran on every single frame for
      the rest of the session — a full walk of fourteen hundred objects,
      sixty times a second, to conclude every time that there was
      nothing new. It found nothing because there was nothing left to
      find, which is exactly why it must stop looking.
    */
    if (finished.current || busy.current) return;

    if (queue.current.length === 0 && scan.current <= 0) {
      /*
        Rescanned rather than collected once: the rooms arrive over
        several seconds, so anything built after the first pass would
        otherwise wait to be compiled by the frame that first drew it.
        Every twentieth frame is often enough for that — they arrive
        140ms apart.
      */
      scan.current = 20;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (seen.current.has(m)) continue;
          seen.current.add(m);
          queue.current.push(mesh);
          break;
        }
      });
    }

    scan.current -= 1;

    const batch = queue.current.splice(0, WARM_BATCH);
    if (batch.length === 0) {
      // only announce once the rooms have finished arriving too
      quiet.current += 1;
      if (settled && quiet.current > 45 && !finished.current) {
        finished.current = true;
        done();
      }
      return;
    }

    quiet.current = 0;
    busy.current = true;
    const release = () => {
      busy.current = false;
    };

    /*
      `compile` only ever calls `traverse` and `traverseVisible` on the
      object it is given, so a batch can be presented as one. The real
      scene goes in as the target, which is where it reads the lights
      the programs have to be built against.
    */
    const asObject = {
      traverse: (cb: (o: THREE.Object3D) => void) => batch.forEach(cb),
      traverseVisible: (cb: (o: THREE.Object3D) => void) => batch.forEach(cb),
    } as unknown as THREE.Object3D;

    gl.compileAsync(asObject, camera, scene).then(release, release);
  });

  return null;
}

/** Past this, a furnished room is too far away to be worth drawing. *//** Past this, a furnished room is too far away to be worth drawing. */
const CONTENTS_RANGE = 44;

/**
 * Draws a room's contents only while you are near it.
 *
 * Every room is built at load so that entering one is free, which
 * would otherwise mean all six rooms' cases, models and lettering being
 * drawn from anywhere in the hall. Toggling `visible` keeps the
 * geometry and the compiled shaders resident while costing nothing to
 * skip.
 */
function NearbyOnly({ at, children }: { at: [number, number]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const here = useMemo(() => new THREE.Vector3(at[0], CAM_Y, at[1]), [at]);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const near = camera.position.distanceToSquared(here) < CONTENTS_RANGE ** 2;
    if (g.visible !== near) g.visible = near;
  });
  return <group ref={group}>{children}</group>;
}

/** Cases for the room you have stepped into, set out in front of its door. */
function RoomContentsInner({
  roomId,
  activeId,
  onSelect,
}: {
  roomId: RoomId;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const door = doors.find((d) => d.id === roomId);
  if (!door) return null;

  const items = exhibitsByRoom[roomId] ?? [];

  // About is a picture gallery, not a vitrine hall: framed photographs on
  // a plain wall, each opening its own text.
  if (roomId === "about") {
    return (
      <PortraitWall door={door} items={items} activeId={activeId} onSelect={onSelect} />
    );
  }

  const sgn = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);
  /*
    Set well out from the back wall, for two reasons.

    A case pressed against the stone sits in its own shadow, and the
    wall wash that lights the room passes behind it instead of around
    it. And in a room this deep, anything on the back wall is sixteen
    units from where the visitor stands — cases at that distance read as
    models on a shelf. Standing them a third of the way into the room
    puts them at a viewing distance instead, and leaves the lit wall
    behind them as a backdrop.
  */
  const backX = cx + sgn * (ROOM_DEPTH / 2 - 5.5);

  return (
    <group>
      {items.map((exhibit, i) => {
        /*
          Fanned along the back wall at a fixed pitch rather than spread
          to fill it. Dividing the full width by however many exhibits a
          room happens to hold put three cases 8 units apart and six of
          them almost touching; a gallery sets everything out at one
          spacing and lets a short run finish early.
        */
        const PITCH = 4.2;
        const span = Math.min((items.length - 1) * PITCH, ROOM_WIDTH - 6);
        const spread =
          items.length === 1 ? 0 : (i / (items.length - 1) - 0.5) * span;
        const p: [number, number, number] = [backX, 0, cz + spread];
        const isActive = activeId === exhibit.id;
        return (
          <group key={exhibit.id}>
            <Vitrine
              position={p}
              shape={roomId === "projects" ? "screen" : SHAPES[i % SHAPES.length]}
              seed={i}
              active={isActive}
              onSelect={() => onSelect(exhibit)}
              screenTitle={roomId === "projects" ? exhibit.title : undefined}
              screenSubtitle={
                roomId === "projects"
                  ? exhibit.meta?.split(" · ").slice(0, 2).join(" · ")
                  : undefined
              }
            />
            {/* title faces back toward the doorway you came in through */}
            <group position={[p[0], 2.5, p[2]]} rotation={[0, -sgn * Math.PI * 0.5, 0]}>
              {/* sized for the longer sightline this room now has */}
              <ExhibitText
                text={exhibit.title}
                position={[0, 0, 0]}
                height={0.34}
                active={isActive}
                onSelect={() => onSelect(exhibit)}
              />
            </group>
            {/*
              No light per exhibit.

              Three recompiles every material in the scene whenever the
              light count changes, so a room that added one light per
              exhibit froze the whole view on entry — and the About room,
              with seven, froze it longest. The room's own fittings light
              the pieces instead, and the count no longer depends on how
              much is in the room.
            */}
          </group>
        );
      })}
    </group>
  );
}

/* Memoised for the same reason as the hall: a room change must not
   rebuild the five rooms it did not touch. */
const RoomContents = memo(RoomContentsInner);

export function MuseumCanvas({
  progressRef,
  roomId,
  onReady,
  onEnterRoom,
  activeId,
  onSelect,
}: {
  progressRef: RefObject<number>;
  roomId: RoomId | null;
  /** Called once the hall is built, compiled and has actually drawn. */
  onReady: () => void;
  onEnterRoom: (id: RoomId) => void;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  /*
    Rooms are separate again.

    Building all six at load is what made the loading screen hang: 770
    geometries and 70 procedural textures in one commit. Only the room
    you are actually in is built now, which is how this worked before
    and is by far the cheapest thing to open with.
  */
  const live = roomId ? [roomId] : [];

  /*
    The veil comes down when the museum is actually ready to be looked
    at, not when its files finish downloading.

    Those are no longer the same moment. The rooms are built over a few
    seconds and their shaders compiled a slice at a time, so lifting the
    veil on the loading manager alone handed the visitor a half-built
    hall — which is the blank screen. Ready means every room mounted and
    the compile queue drained.
  */
  const warmed = useRef(false);
  const announce = () => {
    if (warmed.current) return;
    warmed.current = true;
    onReady();
  };

  return (
    <Canvas
      /*
        Shadows are off.

        They were real: one PoolLight per display case cast into its own
        1024 map, six of them, re-rendered every frame. That is six
        extra passes over the casting geometry for contact shadows under
        six objects, on top of shadow-map sampling compiled into every
        material in the scene.

        The grounding under the cases is painted in with the contact
        shadow texture instead, which costs nothing per frame. Turning
        this back on is one word here plus the cast/receive flags on the
        meshes that should take part; the `castShadow` prop on PoolLight
        is still wired for exactly that.

        `near` and `far` are set rather than left at 0.1/2000: the hall
        is 130 units end to end, and a depth range six times longer than
        the scene throws away depth precision for free.
      */
      camera={{ position: [0, CAM_Y, CAM_Z_START], fov: 50, near: 0.5, far: 220 }}
      /*
        Capped at 1.5. Every effect in the stack is full-screen, so the
        cost of this scales with the square of the ratio: 1.75 is 36%
        more pixels than 1.5 for a difference you cannot see on a
        high-density display.
      */
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = ATMOSPHERE.exposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <color attach="background" args={[ATMOSPHERE.background]} />
      <fogExp2 attach="fog" args={[ATMOSPHERE.background, ATMOSPHERE.fogDensity]} />

      <EnvLight intensity={0.5} />
      <FillLights />

      <Suspense fallback={null}>
        <Corridor
          built={live}
          activeRoom={roomId}
          onEnter={onEnterRoom}
          activeId={activeId}
          onSelect={onSelect}
        />

        {/*
          The room name sits above the arch, not on the leaf.

          The leaf carries dense engraving now, and a label laid over it
          competed with the traces for every pixel. Above the apex it has
          clear stone behind it and reads at a glance from down the hall,
          which is what a wayfinding label is for.
        */}
        {doors.map((door) => {
          const sgn = door.side === "left" ? -1 : 1;
          const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
          return (
            <group
              key={door.id}
              position={[doorX(door.side) - sgn * 0.42, DOOR_H + 1.05, door.z]}
              rotation={[0, yaw, 0]}
            >
              <ExhibitText
                text={door.label}
                position={[0, 0, 0]}
                height={0.42}
                active={roomId === door.id}
                onSelect={() => onEnterRoom(door.id)}
              />
            </group>
          );
        })}

        {/*
          Every room is furnished from the start, and drawn only when
          you are near it.

          Mounting a room's contents on the click that entered it was
          the last thing making that click slow, and the reason was
          <Preload> below: it compiles what exists at the moment it
          runs, so contents that appeared later compiled on the click
          instead — a fresh shader program per material, with the whole
          view stalled until the driver finished. Built up front they
          are already compiled, already uploaded, and entering a room
          costs a camera move and a visibility flag.
        */}
        {live.map((id) => doors.find((d) => d.id === id)).map((d) =>
          !d ? null : (
          <NearbyOnly key={d.id} at={roomCenter(d)}>
            <RoomContents roomId={d.id} activeId={activeId} onSelect={onSelect} />
          </NearbyOnly>
          ),
        )}

        <WarmShaders settled done={announce} />

      </Suspense>

      {/*
        Frame timing on screen, in development only. The browser pane
        used to check this project does not paint unless its window is
        in front, so the numbers cannot be read from outside — this puts
        them where whoever is looking at it can see them.

        Outside the Suspense boundary on purpose: inside it, it would not
        exist until every asset had loaded, and loading is exactly the
        stretch worth watching.
      */}
      {process.env.NODE_ENV === "production" ? null : <PerfHud />}

      <CameraRig progressRef={progressRef} roomId={roomId} />
      <Effects />
    </Canvas>
  );
}
