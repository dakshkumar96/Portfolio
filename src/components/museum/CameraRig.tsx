"use client";

import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CAM_Z_START,
  CAM_Z_END,
  CAM_Y,
  doors,
  roomView,
  roomPath,
  type RoomId,
} from "./corridorLayout";
import { useLookControls } from "./lookControls";

/**
 * Where the camera stands in the hall for a given scroll position.
 *
 * Pulled out of the frame loop so the room routes can end on exactly
 * the spot the scroll would have put you, and hand back without a jump.
 */
function corridorStation(t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const z = THREE.MathUtils.lerp(CAM_Z_START, CAM_Z_END, THREE.MathUtils.clamp(t, 0, 1));
  /*
    Level, the whole way down.

    The camera used to rise and tip up passing under the atrium so the
    core overhead was actually seen. It reads as a lurch in the middle
    of the walk rather than as looking up at something, so the eyeline
    now holds at CAM_Y from one end of the hall to the other.
  */
  outPos.set(0, CAM_Y, z);
  outLook.set(0, CAM_Y, z - 20);
}

/** Smootherstep: zero velocity at both ends, so a move starts and stops cleanly. */
function ease(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

type Route = {
  path: THREE.CatmullRomCurve3;
  aim: THREE.CatmullRomCurve3;
  elapsed: number;
  duration: number;
};

/**
 * Two modes, joined by a route.
 *
 * In the hall, scroll walks the camera straight ahead with the view
 * locked on the vanishing point. Entering or leaving a room lays a short
 * timed route through the doorway (see `roomPath`) and flies it.
 *
 * The route is timed rather than damped, deliberately. Exponential
 * damping approaches its target asymptotically, so the last third of a
 * long move crawls — which is what read as the transition being stuck.
 * A fixed duration arrives when it says it will, and the easing gives it
 * the acceleration and settle that damping was only approximating.
 */
export function CameraRig({
  progressRef,
  roomId,
}: {
  progressRef: RefObject<number>;
  roomId: RoomId | null;
}) {
  const look2 = useLookControls();
  const applied = useRef({ yaw: 0, pitch: 0 });
  const pos = useRef(new THREE.Vector3(0, CAM_Y, CAM_Z_START));
  const look = useRef(new THREE.Vector3(0, CAM_Y, CAM_Z_START - 20));

  const route = useRef<Route | null>(null);
  const lastRoom = useRef<RoomId | null>(null);

  /*
    Scratch vectors, reused every frame. These were being allocated with
    `new THREE.Vector3` twice per frame — 120 objects a second handed
    straight to the garbage collector.
  */
  const tPos = useRef(new THREE.Vector3());
  const tLook = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const door = roomId ? doors.find((d) => d.id === roomId) : undefined;
    const targetPos = tPos.current;
    const targetLook = tLook.current;

    // A change of destination lays a new route, starting from wherever
    // the camera happens to be — including mid-flight through another.
    if (roomId !== lastRoom.current) {
      const from = lastRoom.current ? doors.find((d) => d.id === lastRoom.current) : undefined;
      lastRoom.current = roomId;

      const points = [pos.current.clone()];
      const aims = [look.current.clone()];

      // leaving a room: back out through its own doorway, in reverse
      if (from) {
        const out = roomPath(from);
        for (let i = out.points.length - 2; i >= 0; i -= 1) {
          points.push(new THREE.Vector3(...out.points[i]));
          aims.push(new THREE.Vector3(...out.looks[i]));
        }
      }

      if (door) {
        const into = roomPath(door);
        for (let i = 0; i < into.points.length; i += 1) {
          points.push(new THREE.Vector3(...into.points[i]));
          aims.push(new THREE.Vector3(...into.looks[i]));
        }
      } else {
        const p = new THREE.Vector3();
        const l = new THREE.Vector3();
        corridorStation(progressRef.current, p, l);
        points.push(p);
        aims.push(l);
      }

      const path = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.25);
      /*
        Timed by distance so every trip moves at the same speed, then
        clamped: a short hop should not finish so fast it snaps, and the
        long way out of a far room should not become a journey.
      */
      /*
        Entering has a floor on it, and that floor is set by the doors.

        The leaves take half a second to swing, and the camera reaches
        the threshold waypoint around two thirds of the way along the
        route. Below about 0.8s it would arrive at a door that was still
        opening and clip through a leaf, so a short hop into a nearby
        room is deliberately not allowed to be any quicker.
      */
      const duration = THREE.MathUtils.clamp(
        path.getLength() / 28,
        door ? 0.82 : 0.5,
        1.15,
      );
      route.current = {
        path,
        aim: new THREE.CatmullRomCurve3(aims, false, "catmullrom", 0.25),
        elapsed: 0,
        duration,
      };
    }

    const flight = route.current;
    if (flight) {
      flight.elapsed += delta;
      const t = Math.min(1, flight.elapsed / flight.duration);
      const e = ease(t);
      flight.path.getPoint(e, pos.current);
      flight.aim.getPoint(e, look.current);
      if (t >= 1) route.current = null;
    } else if (door) {
      // arrived: hold the room's viewing position exactly
      const view = roomView(door);
      pos.current.set(...view.position);
      look.current.set(...view.look);
    } else {
      corridorStation(progressRef.current, targetPos, targetLook);
      const lambda = 5.5;
      pos.current.x = THREE.MathUtils.damp(pos.current.x, targetPos.x, lambda, delta);
      pos.current.y = THREE.MathUtils.damp(pos.current.y, targetPos.y, lambda, delta);
      pos.current.z = THREE.MathUtils.damp(pos.current.z, targetPos.z, lambda, delta);
      look.current.x = THREE.MathUtils.damp(look.current.x, targetLook.x, lambda, delta);
      look.current.y = THREE.MathUtils.damp(look.current.y, targetLook.y, lambda, delta);
      look.current.z = THREE.MathUtils.damp(look.current.z, targetLook.z, lambda, delta);
      /*
        Close enough is arrived. Without this the camera never quite
        reaches the target and keeps computing a tiny residual move
        forever, which is both wasteful and visible as drift.
      */
      if (pos.current.distanceToSquared(targetPos) < 0.0004) pos.current.copy(targetPos);
      if (look.current.distanceToSquared(targetLook) < 0.0004) look.current.copy(targetLook);
    }

    camera.position.copy(pos.current);

    /*
      Drag-to-look is applied after the rig has decided where to stand and
      what to face, as a rotation of the view about the camera — never of
      the position. Keeping it purely rotational means it cannot push the
      camera through a wall or off the scroll track, whatever the visitor
      does with it.
    */
    const a = applied.current;
    a.yaw = THREE.MathUtils.damp(a.yaw, look2.current.yaw, 9, delta);
    a.pitch = THREE.MathUtils.damp(a.pitch, look2.current.pitch, 9, delta);

    camera.lookAt(look.current);
    if (a.yaw !== 0 || a.pitch !== 0) {
      camera.rotateY(a.yaw);
      camera.rotateX(a.pitch);
    }
  });

  return null;
}
