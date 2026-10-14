"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PortraitWall, ArtWall } from "./PortraitWall";
import { ROOM_ICON_FOR } from "./roomIcons";
import { PerfHud } from "./PerfHud";
import { hasDebugFlag } from "./debug";
import { consumedDrag } from "./lookControls";
import { compileProgress } from "./loadProgress";
import {
  CAM_FOV,
  CAM_Z_START,
  CAM_Y,
  doors,
  roomCenter,
  type RoomId,
} from "./corridorLayout";
import { exhibitsByRoom, type ExhibitDatum } from "./exhibitData";
import { CASE_SCALE, caseSlots } from "./roomLayout";

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
function WarmShaders({
  settled,
  done,
  rescan,
}: {
  settled: boolean;
  done: () => void;
  /** Changes whenever rooms are built or pulled down: look for new materials again. */
  rescan: string;
}) {
  const seen = useRef<WeakSet<THREE.Material>>(new WeakSet());
  const queue = useRef<THREE.Mesh[]>([]);
  const busy = useRef(false);
  const quiet = useRef(0);
  const finished = useRef(false);
  /** Frames to wait before looking for newly-built rooms again. */
  const scan = useRef(0);

  /*
    A room built after the hall has its programs compiled the same way,
    off the main thread, in the moments before you walk into it - rather
    than by the frame that first draws it, mid-step through the door.
  */
  useEffect(() => {
    finished.current = false;
    quiet.current = 0;
    scan.current = 0;
  }, [rescan]);

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
          compileProgress.queued(1);
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
      compileProgress.compiled(batch.length);
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

  /*
    Art hangs, it does not go in a case.

    A single vitrine with an abstract solid in it said nothing about
    visual work, and a glass box is the wrong object for something flat
    anyway. These are the same frames as the About wall with no
    photographs behind them yet, so the mounts read as work waiting to
    be hung rather than as a mistake. No bench: this room is a wall to
    walk along, not one to sit in front of.
  */
  if (roomId === "art") {
    return <ArtWall door={door} items={items} activeId={activeId} onSelect={onSelect} />;
  }

  const sgn = door.side === "left" ? -1 : 1;
  /*
    Set against the back wall, not stranded in the middle of the room,
    fanned along it at one pitch. The positions come from roomLayout, so
    the spotlights over the cases and the camera framing them agree with
    where they actually stand.
  */
  const slots = caseSlots(door, items.length);

  return (
    <group>
      {items.map((exhibit, i) => {
        const p = slots[i];
        const isActive = activeId === exhibit.id;
        return (
          /* the case and its label, scaled together about the foot of the plinth */
          <group key={exhibit.id} position={p} scale={CASE_SCALE}>
            <Vitrine
              position={[0, 0, 0]}
              shape={
                roomId === "projects"
                  ? "screen"
                  : ROOM_ICON_FOR[exhibit.id]
                    ? "icon"
                    : SHAPES[i % SHAPES.length]
              }
              icon={ROOM_ICON_FOR[exhibit.id]}
              faceYaw={-sgn * Math.PI * 0.5}
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
            {/*
              The label goes on the front of the plinth, where a museum
              puts it.

              It used to sit at case height, which is inside the glass -
              so the title was read through a tinted pane against the
              dark interior and came out grey and illegible, whatever
              colour it actually was. On the face of the plinth it is
              lit by the room, unobstructed, and at the height you drop
              your eyes to after looking at the piece.
            */}
            <group position={[-sgn * 1.085, 0.86, 0]} rotation={[0, -sgn * Math.PI * 0.5, 0]}>
              <ExhibitText
                text={exhibit.title}
                position={[0, 0, 0]}
                height={0.26}
                active={isActive}
                onSelect={() => onSelect(exhibit)}
              />
            </group>
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
  onMissed,
}: {
  progressRef: RefObject<number>;
  roomId: RoomId | null;
  /** Called once the hall is built, compiled and has actually drawn. */
  onReady: () => void;
  onEnterRoom: (id: RoomId) => void;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
  /** A click on the scene that hit nothing you can click. */
  onMissed?: () => void;
}) {
  /*
    Which rooms are standing.

    Building all six at load is what made the loading screen hang: 770
    geometries and 70 procedural textures in one commit. So a room is
    raised when you show interest in it - your pointer comes onto its
    door - and is standing, built and compiled, by the time you click.
    It stays up after you leave, so the walk back out goes through a
    room rather than a void, and the next visit is free. The three most
    recent are kept; older ones are pulled down.
  */
  const [built, setBuilt] = useState<RoomId[]>([]);
  const keep = useCallback((id: RoomId) => {
    setBuilt((list) => (list[0] === id ? list : [id, ...list.filter((r) => r !== id)].slice(0, 3)));
  }, []);

  /*
    The room whose lights are on, and the room the camera has finished
    walking into. Both trail the click: the lights stay up while you walk
    back out and only go down once you are in the hall, and the room's
    lens settles only once you have stopped.
  */
  const [lightsFor, setLightsFor] = useState<RoomId | null>(null);
  const [arrived, setArrived] = useState<RoomId | null>(null);
  const [seenRoom, setSeenRoom] = useState<RoomId | null>(null);
  if (roomId !== seenRoom) {
    setSeenRoom(roomId);
    setArrived(null);
    if (roomId) {
      setLightsFor(roomId);
      setBuilt((list) => (list[0] === roomId ? list : [roomId, ...list.filter((r) => r !== roomId)].slice(0, 3)));
    }
  }
  const handleArrive = useCallback((room: RoomId | null) => {
    setArrived(room);
    if (!room) setLightsFor(null);
  }, []);

  /* this component only ever renders in the browser (it is loaded with ssr: false), so the address is there to read */
  const debug = useMemo(() => hasDebugFlag(), []);

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
      camera={{ position: [0, CAM_Y, CAM_Z_START], fov: CAM_FOV, near: 0.5, far: 220 }}
      /*
        Capped at 1.5. Every effect in the stack is full-screen, so the
        cost of this scales with the square of the ratio: 1.75 is 36%
        more pixels than 1.5 for a difference you cannot see on a
        high-density display.
      */
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      /* a click on bare wall or floor puts the open card away; the end of a drag to look round does not */
      onPointerMissed={(e) => {
        if (e.type === "click" && !consumedDrag()) onMissed?.();
      }}
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
          built={built}
          activeRoom={roomId}
          lightsRoom={lightsFor}
          onPrewarm={keep}
          onEnter={onEnterRoom}
          activeId={activeId}
          onSelect={onSelect}
        />

        {/* each room's name is on its door's keystone plaque (see Door in Corridor) */}

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
        {built.map((id) => doors.find((d) => d.id === id)).map((d) =>
          !d ? null : (
          <NearbyOnly key={d.id} at={roomCenter(d)}>
            <RoomContents roomId={d.id} activeId={activeId} onSelect={onSelect} />
          </NearbyOnly>
          ),
        )}

        <WarmShaders settled done={announce} rescan={built.join(",")} />

      </Suspense>

      {/*
        Frame timing on screen, only with ?debug on the address. The browser pane
        used to check this project does not paint unless its window is
        in front, so the numbers cannot be read from outside — this puts
        them where whoever is looking at it can see them.

        Outside the Suspense boundary on purpose: inside it, it would not
        exist until every asset had loaded, and loading is exactly the
        stretch worth watching.
      */}
      {debug ? <PerfHud /> : null}

      <CameraRig progressRef={progressRef} roomId={roomId} onArrive={handleArrive} />
      <Effects roomId={arrived} />
    </Canvas>
  );
}
