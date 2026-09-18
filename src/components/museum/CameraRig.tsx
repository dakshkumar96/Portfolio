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
  type RoomId,
} from "./corridorLayout";
import { ATRIUM_Z } from "./Atrium";
import { useLookControls } from "./lookControls";

/**
 * Two modes. In the corridor, scroll walks the camera straight ahead with
 * the view locked on the vanishing point. Once a door is entered, the
 * camera turns and walks through it into the chamber, then holds there.
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

  useFrame(({ camera }, delta) => {
    const door = roomId ? doors.find((d) => d.id === roomId) : undefined;

    let targetPos: THREE.Vector3;
    let targetLook: THREE.Vector3;

    if (door) {
      const view = roomView(door);
      targetPos = new THREE.Vector3(...view.position);
      targetLook = new THREE.Vector3(...view.look);
    } else {
      const t = THREE.MathUtils.clamp(progressRef.current, 0, 1);
      const z = THREE.MathUtils.lerp(CAM_Z_START, CAM_Z_END, t);
      /*
        Passing under the atrium the camera rises a little and tips up,
        so the core overhead is actually seen. Without this the hero sits
        above the eyeline and the walk goes straight past it.
      */
      const near = 1 - Math.min(1, Math.abs(z - ATRIUM_Z) / 16);
      const eased = near * near * (3 - 2 * near);
      targetPos = new THREE.Vector3(0, CAM_Y + eased * 0.55, z);
      targetLook = new THREE.Vector3(0, CAM_Y + eased * 2.6, z - 20 + eased * 6);
    }

    // slower entering a room so the turn through the doorway reads
    const lambda = door ? 2.4 : 4;
    pos.current.x = THREE.MathUtils.damp(pos.current.x, targetPos.x, lambda, delta);
    pos.current.y = THREE.MathUtils.damp(pos.current.y, targetPos.y, lambda, delta);
    pos.current.z = THREE.MathUtils.damp(pos.current.z, targetPos.z, lambda, delta);

    look.current.x = THREE.MathUtils.damp(look.current.x, targetLook.x, lambda, delta);
    look.current.y = THREE.MathUtils.damp(look.current.y, targetLook.y, lambda, delta);
    look.current.z = THREE.MathUtils.damp(look.current.z, targetLook.z, lambda, delta);

    camera.position.copy(pos.current);

    /*
      Drag-to-look is applied after the rig has decided where to stand and
      what to face, as a rotation of the view about the camera — never of
      the position. Keeping it purely rotational means it cannot push the
      camera through a wall or off the scroll track, whatever the visitor
      does with it.
    */
    const a = applied.current;
    a.yaw = THREE.MathUtils.damp(a.yaw, look2.current.yaw, 7, delta);
    a.pitch = THREE.MathUtils.damp(a.pitch, look2.current.pitch, 7, delta);

    camera.lookAt(look.current);
    if (a.yaw !== 0 || a.pitch !== 0) {
      camera.rotateY(a.yaw);
      camera.rotateX(a.pitch);
    }
  });

  return null;
}
