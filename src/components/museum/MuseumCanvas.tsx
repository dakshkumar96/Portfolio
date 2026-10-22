"use client";

import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
// before any material is compiled: no pixel leaves a shader as NaN (see shaderGuard)
import "./shaderGuard";
import { CameraRig } from "./CameraRig";
import { Corridor } from "./Corridor";
import { Effects } from "./Effects";
import { ExhibitText } from "./ExhibitText";
import { FillLights } from "./Lighting";
import { EnvLight } from "./EnvLight";
import { ATMOSPHERE } from "./palette";

import { Vitrine, type VitrineShape } from "./Vitrine";
import { PortraitWall, ArtWall, TextStand } from "./PortraitWall";
import { SidePosters } from "./ExhibitionPosters";
import { ROOM_ICON_FOR } from "./roomIcons";
import { PerfHud } from "./PerfHud";
import { hasDebugFlag } from "./debug";
import { consumedDrag } from "./lookControls";
import { compileProgress } from "./loadProgress";
import { drawEverything, settled } from "./preload";
import {
  CAM_FOV,
  CAM_Z_START,
  CAM_Y,
  doors,
  roomCenter,
  type RoomId,
} from "./corridorLayout";
import { artBoards, exhibitsByRoom, type ExhibitDatum } from "./exhibitData";
import { CASE_SCALE, aboutCaseSlots, artBoardSlots, caseSlots, experienceSlots } from "./roomLayout";

const SHAPES: VitrineShape[] = ["icosahedron", "octahedron", "torus", "sphere", "box"];

/**
 * The most materials handed to the driver in one asynchronous batch.
 *
 * Generous on purpose. Most materials share a program with one already
 * compiled and cost nothing; the rest are linked by the driver on its
 * own threads, side by side, so the more it is given at once the sooner
 * it is done. Three builds each new program's source on the main
 * thread first, a few milliseconds each, which a hidden scene can spare.
 */
const WARM_BATCH = 48;

/** Main-thread time a loading frame may spend sending textures to the GPU while the shaders compile. */
const UPLOAD_MS = 10;

/**
 * The longest the hall is held back waiting for its shaders. Past this
 * it is shown anyway, compiled or not; MuseumWorld lifts the veil a
 * little later still, so the hall is always there when it does.
 */
const HOLD_CAP_MS = 24000;

const nextFrames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

type DrawItem = { groupOrder: number; renderOrder: number; material: THREE.Material & { id: number }; z: number; id: number };

/**
 * Solid surfaces drawn shader by shader.
 *
 * Three orders them by material, and the hall's eight hundred materials
 * share forty shaders between them, so walking the list switched shader
 * over three hundred times a frame - and each switch sends that shader
 * the camera and all fourteen lamps again, which every step of a walk
 * changes. Measured, that was most of the time it took to draw a frame
 * on the move. Grouped by shader, it switches about forty times. Solid
 * surfaces are depth-tested, so the order they are drawn in changes no
 * pixel; the see-through ones keep three's back-to-front order.
 */
function drawByProgram(gl: THREE.WebGLRenderer) {
  const programOf = (m: THREE.Material) =>
    (gl.properties.get(m) as { currentProgram?: { id: number } }).currentProgram?.id ?? 0;
  gl.setOpaqueSort(
    (a: DrawItem, b: DrawItem) =>
      a.groupOrder - b.groupOrder ||
      a.renderOrder - b.renderOrder ||
      programOf(a.material) - programOf(b.material) ||
      a.material.id - b.material.id ||
      a.z - b.z ||
      a.id - b.id,
  );
}

let warmTarget: THREE.WebGLRenderTarget | null = null;

/**
 * Compile the programs the museum will actually draw with.
 *
 * The scene is never drawn to the screen: it is drawn into the
 * post-processing chain's buffer, and three builds a different program
 * for each - one that writes linear colour for a buffer, one that
 * converts to sRGB for the screen. Compiled with nothing bound, every
 * material got the screen's version, which nothing ever used, and the
 * real one was compiled on the frame that first showed it: entering a
 * room stalled for over a second while its shaders were built. With a
 * buffer bound while compiling, the program made is the one drawn with.
 */
function compileAsDrawn(gl: THREE.WebGLRenderer, object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene) {
  warmTarget ??= new THREE.WebGLRenderTarget(1, 1);
  const previous = gl.getRenderTarget();
  // the scene is held hidden while loading, and compile only counts the lights it can see
  const wasVisible = scene.visible;
  scene.visible = true;
  gl.setRenderTarget(warmTarget);
  try {
    return gl.compileAsync(object, camera, scene);
  } finally {
    gl.setRenderTarget(previous);
    scene.visible = wasVisible;
  }
}

/**
 * The last of loading, behind the veil: wait for the photographs and
 * posters to be prepared (preload.ts), let them reach their materials,
 * compile any program that changed when a picture arrived, and upload
 * every texture to the GPU now - rooms that are out of sight included -
 * so that nothing anywhere in the museum is compiled or uploaded on the
 * frame that first shows it. Then the hall is shown, and drawn a few
 * times while the veil is still down, and timed: `fit` is told how long
 * a frame takes, so a resolution too high for this machine is lowered
 * now, unseen, rather than in front of the visitor.
 */
async function finishLoading(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  fit: (frameMs: number) => void,
) {
  await settled();
  await nextFrames(4);
  const meshes: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });
  const all = {
    traverse: (cb: (o: THREE.Object3D) => void) => meshes.forEach(cb),
    traverseVisible: (cb: (o: THREE.Object3D) => void) => meshes.forEach(cb),
  } as unknown as THREE.Object3D;
  try {
    await compileAsDrawn(gl, all, camera, scene);
  } catch {
    // a program that will not compile here will not compile later either; carry on
  }
  const uploaded = new Set<THREE.Texture>();
  for (const o of meshes) {
    const material = (o as THREE.Mesh).material;
    const mats = Array.isArray(material) ? material : [material];
    for (const m of mats) {
      for (const value of Object.values(m)) {
        const t = value as THREE.Texture | null;
        if (t && t.isTexture && !uploaded.has(t)) {
          uploaded.add(t);
          gl.initTexture(t);
        }
      }
    }
  }
  // everything drawn once, every room included, with nothing left out for being off screen
  const culled = meshes.filter((o) => o.frustumCulled);
  culled.forEach((o) => {
    o.frustumCulled = false;
  });
  drawEverything.on = true;
  scene.visible = true;
  await nextFrames(2);
  drawEverything.on = false;
  culled.forEach((o) => {
    o.frustumCulled = true;
  });
  await nextFrames(3);
  fit(await frameTime(24));
  await nextFrames(4);
}

/** The median time between the next `n` frames, in ms. */
const frameTime = (n: number) =>
  new Promise<number>((resolve) => {
    const gaps: number[] = [];
    let last = 0;
    const step = (t: number) => {
      if (last) gaps.push(t - last);
      last = t;
      if (gaps.length < n) requestAnimationFrame(step);
      else resolve(gaps.sort((a, b) => a - b)[Math.floor(n / 2)]);
    };
    requestAnimationFrame(step);
  });

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
 * links off-thread and the frame ends while it works. Each batch goes
 * as soon as its materials exist, without waiting for the one before,
 * so the driver is never left idle while the rooms are still going up.
 *
 * While the driver works, the main thread has little to do, so it uses
 * the time to send the textures to the GPU a few at a time: that used to
 * be three solid seconds at the very end of loading.
 */
function WarmShaders({
  settled,
  done,
  fit,
  rescan,
}: {
  settled: boolean;
  done: () => void;
  /** Told how long a frame of the finished hall takes, before the veil lifts. */
  fit: (frameMs: number) => void;
  /** Changes whenever rooms are built or pulled down: look for new materials again. */
  rescan: string;
}) {
  const seen = useRef<WeakSet<THREE.Material>>(new WeakSet());
  const queue = useRef<THREE.Mesh[]>([]);
  const textures = useRef<THREE.Texture[]>([]);
  const held = useRef(false);
  /** Batches handed to the driver and not yet back. */
  const inFlight = useRef(0);
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

  /*
    Nothing is drawn until its shaders are ready.

    Drawing the hall while its programs were still queued made the first
    frame compile every one of them itself, one after another, each
    waiting on the driver - measured, a single frame of twenty-three
    seconds on a laptop's integrated graphics, with the warm-up below
    still at its second program. So the scene is held hidden (the veil
    is over it anyway) while the programs are compiled side by side off
    the main thread, and shown once finishLoading has them all.
  */
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const t = window.setTimeout(() => {
      scene.visible = true;
    }, HOLD_CAP_MS);
    return () => window.clearTimeout(t);
  }, [scene]);

  useFrame(({ gl, scene, camera }) => {
    if (!held.current) {
      held.current = true;
      scene.visible = false;
    }
    /*
      Once the queue has drained and the rooms have stopped arriving,
      this component is done and must do nothing at all.

      Without this guard the rescan below ran on every single frame for
      the rest of the session — a full walk of fourteen hundred objects,
      sixty times a second, to conclude every time that there was
      nothing new. It found nothing because there was nothing left to
      find, which is exactly why it must stop looking.
    */
    if (finished.current) return;

    if (scan.current <= 0) {
      /*
        Rescanned rather than collected once: the rooms arrive over
        several seconds, so anything built after the first pass would
        otherwise wait to be compiled by the frame that first drew it.
        The scene is not being drawn while this runs, so frames are
        quick and every fourth is soon enough.
      */
      scan.current = 4;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        let fresh = false;
        for (const m of mats) {
          if (seen.current.has(m)) continue;
          seen.current.add(m);
          fresh = true;
          for (const value of Object.values(m)) {
            if ((value as THREE.Texture | null)?.isTexture) textures.current.push(value as THREE.Texture);
          }
        }
        if (fresh) {
          queue.current.push(mesh);
          compileProgress.queued(1);
        }
      });
    }

    scan.current -= 1;

    const start = performance.now();
    while (textures.current.length && performance.now() - start < UPLOAD_MS) {
      gl.initTexture(textures.current.pop()!);
    }

    const batch = queue.current.splice(0, WARM_BATCH);
    if (batch.length === 0) {
      // only announce once the rooms have finished arriving and the driver has handed everything back
      if (inFlight.current > 0) return;
      quiet.current += 1;
      if (settled && quiet.current > 45 && !finished.current) {
        finished.current = true;
        finishLoading(gl, scene, camera, fit).then(done, done);
      }
      return;
    }

    quiet.current = 0;
    inFlight.current += 1;
    const release = () => {
      inFlight.current -= 1;
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

    compileAsDrawn(gl, asObject, camera, scene).then(release, release);
  });

  return null;
}

/** Past this, a furnished room is too far away to be worth drawing. */
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
    const near = drawEverything.on || camera.position.distanceToSquared(here) < CONTENTS_RANGE ** 2;
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

  const sgn = door.side === "left" ? -1 : 1;

  // About is a picture gallery: framed photographs on the wall, each
  // opening its own text, and a case either side for the record behind
  // them - education on one hand, awards on the other.
  if (roomId === "about") {
    const cased = items.slice(5, 7);
    const sides = aboutCaseSlots(door);
    return (
      <group>
        <PortraitWall door={door} items={items} activeId={activeId} onSelect={onSelect} />
        <CaseRow
          items={cased}
          slots={sides.map((s) => s.position)}
          yaws={sides.map((s) => s.yaw)}
          sgn={sgn}
          roomId={roomId}
          activeId={activeId}
          onSelect={onSelect}
        />
      </group>
    );
  }

  /*
    The Experience room: a role in each case, with the company under its
    name - three across the back, two on each side wall - and a board of
    text between the cases at the back, as in the About room.
  */
  if (roomId === "experience") {
    const { cases, boards } = experienceSlots(door);
    const boardYaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
    return (
      <group>
        <CaseRow
          items={items.slice(0, 9)}
          slots={cases.map((c) => c.position)}
          yaws={cases.map((c) => c.yaw)}
          sgn={sgn}
          roomId={roomId}
          activeId={activeId}
          onSelect={onSelect}
        />
        {items.slice(9, 11).map((exhibit, i) => (
          <TextStand
            key={exhibit.id}
            number={`No. ${["I", "II"][i]}`}
            position={boards[i]}
            rotation={[0, boardYaw, 0]}
            exhibit={exhibit}
            active={activeId === exhibit.id}
            onSelect={() => onSelect(exhibit)}
          />
        ))}
      </group>
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
    const boardYaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
    return (
      <group>
        <ArtWall door={door} items={items} activeId={activeId} onSelect={onSelect} />
        <SidePosters door={door} activeId={activeId} onSelect={onSelect} />
        {/* the two boards either side of the wall, as in the About room */}
        {artBoards.map((exhibit, i) => (
          <TextStand
            key={exhibit.id}
            number={`No. ${["I", "II"][i]}`}
            position={artBoardSlots(door)[i]}
            rotation={[0, boardYaw, 0]}
            scale={1.2}
            exhibit={exhibit}
            active={activeId === exhibit.id}
            onSelect={() => onSelect(exhibit)}
          />
        ))}
      </group>
    );
  }

  /*
    Set against the back wall, not stranded in the middle of the room,
    fanned along it at one pitch. The positions come from roomLayout, so
    the spotlights over the cases and the camera framing them agree with
    where they actually stand.
  */
  return (
    <CaseRow items={items} slots={caseSlots(door, items.length)} sgn={sgn} roomId={roomId} activeId={activeId} onSelect={onSelect} />
  );
}

/**
 * A name broken into the fewest lines that keep each to about `chars`
 * letters, balanced so the longest is as short as it can be: "Marketing
 * Coordinator" becomes two lines, not "Marketing" and a stray word.
 */
function wrapLines(text: string, chars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1 || text.length <= chars) return [text];
  const n = words.length;
  const len = (a: number, b: number) => words.slice(a, b).join(" ").length;
  let best: string[] = [text];
  let bestScore = Infinity;
  // every way to cut the words into 2 or 3 lines
  const tryCuts = (cuts: number[]) => {
    const edges = [0, ...cuts, n];
    const parts = edges.slice(0, -1).map((e, i) => words.slice(e, edges[i + 1]).join(" "));
    const longest = Math.max(...parts.map((p) => p.length));
    // fewer lines are better unless the longest is too long to read at size
    const score = longest + (parts.length - 1) * Math.max(chars * 0.45, 4) + (longest > chars ? (longest - chars) * 3 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = parts;
    }
  };
  for (let i = 1; i < n; i += 1) {
    tryCuts([i]);
    for (let j = i + 1; j < n; j += 1) tryCuts([i, j]);
  }
  void len;
  return best;
}

/** About how wide a line of the label's capitals is, as a multiple of its height, from the letters in it. */
const labelAspect = (chars: number) => 0.49 * chars + 0.43;
/** The label's room: the inset panel on the plinth face, less its moulding. */
const LABEL_W = 1.6;
const LABEL_H = 1.04;

/**
 * The name on the plinth: the role in large capitals over the
 * organisation in smaller ones, set in as many lines as the words need
 * and centred in the panel. Every line of a name is the same size, the
 * largest at which its longest line still fits the panel.
 */
function PlinthLabel({
  title,
  company,
  active,
  onSelect,
}: {
  title: string;
  company?: string;
  active: boolean;
  onSelect: () => void;
}) {
  const titleLines = wrapLines(title, 10);
  const companyLines = company ? wrapLines(company, 14) : [];
  const fit = (lines: string[], top: number) => Math.min(top, LABEL_W / labelAspect(Math.max(...lines.map((l) => l.length))));
  let ht = fit(titleLines, 0.4);
  let hc = companyLines.length ? fit(companyLines, 0.26) : 0;
  // each line takes a little under its canvas height: the canvas carries its own padding
  const LEAD = 0.62;
  const GAP = companyLines.length ? 0.2 : 0;
  const total = (titleLines.length * ht + companyLines.length * hc) * LEAD + GAP;
  if (total > LABEL_H) {
    const k = LABEL_H / total;
    ht *= k;
    hc *= k;
  }
  const block = (titleLines.length * ht + companyLines.length * hc) * LEAD + GAP;
  let y = block / 2;
  const rows: { text: string; h: number; y: number }[] = [];
  titleLines.forEach((text) => {
    rows.push({ text, h: ht, y: y - (ht * LEAD) / 2 });
    y -= ht * LEAD;
  });
  y -= GAP;
  companyLines.forEach((text) => {
    rows.push({ text, h: hc, y: y - (hc * LEAD) / 2 });
    y -= hc * LEAD;
  });
  return (
    <group>
      {rows.map((r, i) => (
        <ExhibitText
          key={i}
          text={r.text}
          position={[0, r.y, 0]}
          height={r.h}
          maxWidth={LABEL_W}
          active={active}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/** A row of vitrines, each with its label on the front of the plinth. */
function CaseRow({
  items,
  slots,
  yaws,
  sgn,
  roomId,
  activeId,
  onSelect,
}: {
  items: ExhibitDatum[];
  slots: [number, number, number][];
  /** Which way each case faces; the default is out from the back wall. */
  yaws?: number[];
  sgn: number;
  roomId: RoomId;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  return (
    <group>
      {items.map((exhibit, i) => {
        const p = slots[i];
        const yaw = yaws?.[i] ?? -sgn * Math.PI * 0.5;
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
              faceYaw={yaw}
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
            <group position={[Math.sin(yaw) * 1.085, 0.86, Math.cos(yaw) * 1.085]} rotation={[0, yaw, 0]}>
              <PlinthLabel title={exhibit.title} company={exhibit.company} active={isActive} onSelect={() => onSelect(exhibit)} />
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
  /*
    Every room is raised while the loading veil is still up, one at a time
    so no single frame carries more than one, and none is ever pulled
    down again. A click on a door then costs a camera move and nothing
    else: the room, its pictures and its shaders are all already there.
  */
  const [built, setBuilt] = useState<RoomId[]>([]);
  const keep = useCallback((id: RoomId) => {
    setBuilt((list) => (list.includes(id) ? list : [...list, id]));
  }, []);
  useEffect(() => {
    if (built.length >= doors.length) return;
    const next = doors.find((d) => !built.includes(d.id));
    if (!next) return;
    const t = window.setTimeout(() => keep(next.id), 260);
    return () => window.clearTimeout(t);
  }, [built, keep]);

  /*
    The room whose lights are on. It trails the click: the lights stay up
    while you walk back out and only go down once you are in the hall.
  */
  const [lightsFor, setLightsFor] = useState<RoomId | null>(null);
  const [seenRoom, setSeenRoom] = useState<RoomId | null>(null);
  if (roomId !== seenRoom) {
    setSeenRoom(roomId);
    if (roomId) {
      setLightsFor(roomId);
      setBuilt((list) => (list.includes(roomId) ? list : [...list, roomId]));
    }
  }
  const handleArrive = useCallback((room: RoomId | null) => {
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
  const [running, setRunning] = useState(false);
  const announce = () => {
    if (warmed.current) return;
    warmed.current = true;
    setRunning(true);
    onReady();
  };

  /*
    Resolution: never more than 1.5 device pixels per CSS pixel - every
    effect in the stack is full-screen, so this cost goes with the square
    of it, and past 1.5 the difference cannot be seen. Once the museum is
    running, a laptop that cannot hold its frame rate steps down toward 1,
    and back up when it can; after a few changes either way it settles.
  */
  const maxDpr = useMemo(() => Math.min(1.5, window.devicePixelRatio || 1), []);
  const [dpr, setDpr] = useState(maxDpr);
  /*
    The first step down is taken behind the veil. Left to the monitor, it
    came a second after the doors opened, and changing resolution means
    rebuilding every full-screen buffer - a visible stall of a third of a
    second or more, as the first thing a visitor on a slow laptop saw. A
    frame slower than 25ms (under 40 a second, the monitor's own line)
    starts at one pixel per pixel instead.
  */
  const fit = useCallback((frameMs: number) => {
    if (frameMs > 25) setDpr(1);
  }, []);

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
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      /* a click on bare wall or floor puts the open card away; the end of a drag to look round does not */
      onPointerMissed={(e) => {
        if (e.type === "click" && !consumedDrag()) onMissed?.();
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = ATMOSPHERE.exposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        drawByProgram(gl);
      }}
    >
      {running ? (
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
          onFallback={() => setDpr(1)}
        />
      ) : null}
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

        <WarmShaders settled={built.length >= doors.length} done={announce} fit={fit} rescan={built.join(",")} />

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
      <Effects />
    </Canvas>
  );
}
