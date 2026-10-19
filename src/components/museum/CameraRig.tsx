"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CAM_Z_START,
  CAM_Z_END,
  CAM_Y,
  HALF_WIDTH,
  doors,
  roomSize,
  type DoorSpec,
  type RoomId,
} from "./corridorLayout";
import { roomView, viewDistance } from "./roomLayout";
import { setLookRoom, useLookControls } from "./lookControls";
import { markArrived } from "./clickTrace";

/** Where the camera stands in the hall for a given scroll position. */
function corridorZ(t: number) {
  return THREE.MathUtils.lerp(CAM_Z_START, CAM_Z_END, THREE.MathUtils.clamp(t, 0, 1));
}

/** Smootherstep: zero velocity at both ends, so a move starts and stops cleanly. */
function ease(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/*
  Heading is kept as yaw and pitch rather than as a point to look at.

  A turn of more than a right angle - turning round in a room to walk
  back out - swings a look-at point from in front of the camera to behind
  it, through the camera itself, and the view flips. An angle simply
  turns. Yaw 0 faces down the hall (-z); a positive yaw turns left.
*/
function headingOf(from: THREE.Vector3, to: THREE.Vector3) {
  const d = to.clone().sub(from);
  return {
    yaw: Math.atan2(-d.x, -d.z),
    pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
  };
}

/** The same direction as `yaw`, wound to sit within half a turn of `near`. */
function windNear(yaw: number, near: number) {
  return yaw + Math.round((near - yaw) / (Math.PI * 2)) * Math.PI * 2;
}

type Key = { pos: THREE.Vector3; yaw: number; pitch: number };

type Route = {
  path: THREE.CatmullRomCurve3;
  /** yaw and pitch as x and y, so they ease along with the position */
  turn: THREE.CatmullRomCurve3;
  /** where each waypoint falls along the trip, 0 to 1 */
  knots: number[];
  elapsed: number;
  duration: number;
  to: RoomId | null;
};

/** Walking pace through the building, units a second, and turning pace, radians a second. */
const PACE = 6.5;
const TURN = Math.PI / 1.1;

/**
 * A walk through a list of waypoints, timed by how far there is to go
 * and how far there is to turn at each step, so the pace is even from
 * one end to the other: no leg rushed because it happens to be short.
 */
function walk(keys: Key[], to: RoomId | null): Route {
  // each heading wound onto the one before, so every turn takes the short way
  for (let i = 1; i < keys.length; i += 1) keys[i].yaw = windNear(keys[i].yaw, keys[i - 1].yaw);

  const legs = keys.slice(1).map((k, i) => {
    const prev = keys[i];
    return Math.max(k.pos.distanceTo(prev.pos) / PACE, Math.abs(k.yaw - prev.yaw) / TURN, 0.12);
  });
  const total = legs.reduce((a, b) => a + b, 0);
  const knots = [0];
  legs.forEach((l) => knots.push(knots[knots.length - 1] + l / total));

  return {
    path: new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "catmullrom", 0.3),
    turn: new THREE.CatmullRomCurve3(
      keys.map((k) => new THREE.Vector3(k.yaw, k.pitch, 0)),
      false,
      "catmullrom",
      0.3,
    ),
    knots,
    elapsed: 0,
    /*
      Long enough to be seen as a walk - the door opening, the step
      through, the room arriving around you - and no longer. The ease
      in and out adds about a tenth to the time a steady walk would take.
    */
    duration: THREE.MathUtils.clamp(total * 1.1, 0.9, 3.4),
    to,
  };
}

/** The waypoints standing in front of a door, in its opening, and just inside. */
function threshold(door: DoorSpec) {
  const dir = door.side === "left" ? -1 : 1;
  return {
    front: new THREE.Vector3(dir * (HALF_WIDTH - 5.5), CAM_Y, door.z),
    opening: new THREE.Vector3(dir * (HALF_WIDTH + 0.8), CAM_Y + 0.2, door.z),
    /* facing the door from the hall */
    inward: -dir * Math.PI * 0.5,
  };
}

/**
 * Two modes, joined by a walk.
 *
 * In the hall, scroll walks the camera straight ahead, looking down it.
 * Entering a room is a walk: turn to the door as it opens, cross the
 * hall to it, step through, and come to rest a few paces in. Leaving is
 * that walk played backwards - back out through the door still facing
 * the room, then turn to look down the hall.
 *
 * Timed, not damped: damping crawls through its last third, which reads
 * as being stuck. And each frame's step is capped, so a frame the
 * browser drops - a room's first draw, say - pauses the walk where it is
 * rather than skipping a stretch of it.
 */
export function CameraRig({
  progressRef,
  roomId,
  onArrive,
}: {
  progressRef: RefObject<number>;
  roomId: RoomId | null;
  /** Called when a walk ends: the room arrived in, or null back in the hall. */
  onArrive?: (room: RoomId | null) => void;
}) {
  const look2 = useLookControls();
  const applied = useRef({ yaw: 0, pitch: 0 });
  const pos = useRef(new THREE.Vector3(0, CAM_Y, CAM_Z_START));
  const heading = useRef({ yaw: 0, pitch: 0 });

  /* how far from its resting place the visitor has walked in a room, in metres toward the back wall (negative is back toward the door) */
  const walked = useRef({ target: 0, current: 0 });

  /*
    Scroll, or the up and down keys, walks you through the room: down or
    up-arrow goes in toward the far wall, the other way comes back toward
    the door. It stops a few metres short of each wall. The walk starts
    from where you stand on arriving, and a new room starts it again.
  */
  useEffect(() => {
    walked.current.target = 0;
    walked.current.current = 0;
    const door = roomId ? doors.find((d) => d.id === roomId) : undefined;
    if (!door) return;
    const { depth } = roomSize(door);
    const stand = viewDistance(door);
    const lo = -(depth - stand - 3);
    const hi = stand - 5;
    const move = (m: number) => {
      walked.current.target = THREE.MathUtils.clamp(walked.current.target + m, lo, hi);
    };
    const onWheel = (e: WheelEvent) => {
      // over an open card, or anything else on the page, the wheel scrolls that, not the walk
      if (!(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      move(e.deltaY * 0.012);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") move(1.6);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") move(-1.6);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [roomId]);

  const route = useRef<Route | null>(null);
  const lastRoom = useRef<RoomId | null>(null);

  /* scratch, reused every frame */
  const scratch = useRef({ turn: new THREE.Vector3(), aim: new THREE.Vector3() });

  useFrame(({ camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 15);
    const door = roomId ? doors.find((d) => d.id === roomId) : undefined;

    if (roomId !== lastRoom.current) {
      const from = lastRoom.current ? doors.find((d) => d.id === lastRoom.current) : undefined;
      lastRoom.current = roomId;
      // each room sets how far you may turn; going in or out starts you facing front
      setLookRoom(roomId === "about" || roomId === "experience" || roomId === "art");

      const keys: Key[] = [{ pos: pos.current.clone(), ...heading.current }];

      if (from) {
        /*
          Step back out the way you came: still facing the room, back
          through the doorway into the hall, and only then turn to look
          down it. Turning round inside the room swung the whole view
          about and lost the room you were leaving.
        */
        const t = threshold(from);
        keys.push({ pos: t.opening.clone(), yaw: t.inward, pitch: 0.05 });
        keys.push({ pos: t.front.clone(), yaw: t.inward, pitch: 0.02 });
      }

      if (door) {
        const t = threshold(door);
        const view = roomView(door);
        const stand = new THREE.Vector3(...view.position);
        const sight = headingOf(stand, new THREE.Vector3(...view.look));
        keys.push({ pos: t.front.clone(), yaw: t.inward, pitch: 0.02 });
        keys.push({ pos: t.opening.clone(), yaw: t.inward, pitch: 0.05 });
        keys.push({ pos: stand, ...sight });
      } else {
        keys.push({
          pos: new THREE.Vector3(0, CAM_Y, corridorZ(progressRef.current)),
          yaw: 0,
          pitch: 0,
        });
      }

      route.current = walk(keys, roomId);
    }

    const flight = route.current;
    if (flight) {
      flight.elapsed += delta;
      const t = Math.min(1, flight.elapsed / flight.duration);
      const e = ease(t);
      // which leg the eased progress is on, and how far along it
      const n = flight.knots.length - 1;
      let leg = 0;
      while (leg < n - 1 && e > flight.knots[leg + 1]) leg += 1;
      const span = flight.knots[leg + 1] - flight.knots[leg] || 1;
      const u = (leg + THREE.MathUtils.clamp((e - flight.knots[leg]) / span, 0, 1)) / n;
      flight.path.getPoint(u, pos.current);
      const turn = flight.turn.getPoint(u, scratch.current.turn);
      heading.current.yaw = turn.x;
      heading.current.pitch = turn.y;
      if (t >= 1) {
        route.current = null;
        // back within a single turn, so the next walk winds from a clean start
        heading.current.yaw = Math.atan2(Math.sin(turn.x), Math.cos(turn.x));
        if (flight.to) markArrived();
        onArrive?.(flight.to);
      }
    } else if (door) {
      // arrived: hold the room's viewing position, moved by however far you have walked
      const view = roomView(door);
      const w = walked.current;
      w.current = THREE.MathUtils.damp(w.current, w.target, 4, delta);
      const toward = door.side === "left" ? -1 : 1;
      pos.current.set(view.position[0] + toward * w.current, view.position[1], view.position[2]);
      const sight = headingOf(pos.current, new THREE.Vector3(...view.look));
      heading.current.yaw = windNear(sight.yaw, heading.current.yaw);
      heading.current.pitch = sight.pitch;
    } else {
      const z = corridorZ(progressRef.current);
      const lambda = 7;
      pos.current.x = THREE.MathUtils.damp(pos.current.x, 0, lambda, delta);
      pos.current.y = THREE.MathUtils.damp(pos.current.y, CAM_Y, lambda, delta);
      pos.current.z = THREE.MathUtils.damp(pos.current.z, z, lambda, delta);
      heading.current.yaw = THREE.MathUtils.damp(heading.current.yaw, 0, lambda, delta);
      heading.current.pitch = THREE.MathUtils.damp(heading.current.pitch, 0, lambda, delta);
      /*
        Close enough is arrived. Without this the camera never quite
        reaches the target and keeps computing a tiny residual move
        forever, which is both wasteful and visible as drift.
      */
      if (Math.abs(pos.current.z - z) < 0.02 && Math.abs(pos.current.x) < 0.02) {
        pos.current.set(0, CAM_Y, z);
      }
      if (Math.abs(heading.current.yaw) < 1e-4) heading.current.yaw = 0;
    }

    /*
      A fixed view for automated screenshots: only when a test browser has
      set window.__peek. Nothing a visitor does sets it, so for everyone
      else this is a single property read that finds nothing.
    */
    const peek = (window as unknown as { __peek?: number[] }).__peek;
    if (peek) {
      pos.current.set(peek[0], peek[1], peek[2]);
      heading.current.yaw = peek[3];
      heading.current.pitch = peek[4] ?? 0.05;
    }
    camera.position.copy(pos.current);
    const { yaw, pitch } = heading.current;
    const aim = scratch.current.aim.set(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(aim.add(pos.current));

    /*
      Drag-to-look is applied after the rig has decided where to stand and
      what to face, as a rotation of the view about the camera - never of
      the position, so it cannot push the camera through a wall. Damped
      hard while under the hand, gently on the way back to centre.
    */
    const a = applied.current;
    const lookLambda = look2.current.dragging ? 18 : 5;
    a.yaw = THREE.MathUtils.damp(a.yaw, look2.current.yaw, lookLambda, delta);
    a.pitch = THREE.MathUtils.damp(a.pitch, look2.current.pitch, lookLambda, delta);
    if (a.yaw !== 0 || a.pitch !== 0) {
      camera.rotateY(a.yaw);
      camera.rotateX(a.pitch);
    }
  });

  return null;
}
