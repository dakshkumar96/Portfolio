"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * The museum's spotlights, pooled.
 *
 * Three.js lights a surface by visiting every light in the scene, for
 * every pixel, whether that light is near it or not, and whether it is on
 * or not: a lamp at the far end of the hall, or a room light switched off
 * while you are in the corridor, still costs the same on every pixel of
 * the screen. With twenty-eight lights that was the largest single cost of
 * a frame - six room lights at zero brightness alone took fifteen percent
 * of it.
 *
 * So the lights the museum is designed with are virtual (<VirtualSpot>):
 * each says where it hangs, where it points and how bright it is, and
 * lights nothing. A fixed pool of real spotlights (<LightPool>) takes on,
 * each frame, the ones that matter from where the visitor stands - the
 * ones whose reach is near the camera, the brightest first - and a light
 * leaving the pool fades out before its place is taken, so nothing pops.
 * A lamp too far away to light anything you are near is not drawn, and a
 * room's lights only exist while you are in the room. The pool's size
 * never changes, so the scene's light count never changes and no shader
 * is ever recompiled for it.
 */
export const POOL_SIZE = 14;

type Params = {
  intensity: number;
  color: string;
  angle: number;
  penumbra: number;
  distance: number;
  decay: number;
  /** always in the pool: the statue's key light, which the whole hall looks toward */
  pin: boolean;
};

type Virtual = { anchor: THREE.Object3D; aim: THREE.Object3D; p: Params };

const registry = new Map<number, Virtual>();
let nextId = 1;

export function VirtualSpot({
  position,
  target,
  intensity,
  color = "#ffffff",
  angle = Math.PI / 3,
  penumbra = 0,
  distance = 0,
  decay = 2,
  pin = false,
}: {
  position: [number, number, number];
  target: [number, number, number];
  intensity: number;
  color?: string;
  angle?: number;
  penumbra?: number;
  distance?: number;
  decay?: number;
  pin?: boolean;
}) {
  const anchor = useRef<THREE.Object3D>(null);
  const aim = useRef<THREE.Object3D>(null);
  const [id] = useState(() => nextId++);

  useEffect(() => {
    const a = anchor.current;
    const t = aim.current;
    if (!a || !t) return;
    registry.set(id, { anchor: a, aim: t, p: { intensity, color, angle, penumbra, distance, decay, pin } });
    return () => {
      registry.delete(id);
    };
  }, [id, intensity, color, angle, penumbra, distance, decay, pin]);

  return (
    <>
      <object3D ref={anchor} position={position} />
      <object3D ref={aim} position={target} />
    </>
  );
}

const here = new THREE.Vector3();

/** The real lights. Mount once, before anything is drawn. */
export function LightPool() {
  const lights = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, () => {
        const l = new THREE.SpotLight("#ffffff", 0);
        l.decay = 2;
        return l;
      }),
    [],
  );
  const targets = useMemo(() => lights.map(() => new THREE.Object3D()), [lights]);
  const slots = useRef(lights.map(() => ({ id: 0, level: 0 })));

  useEffect(() => {
    lights.forEach((l, i) => {
      l.target = targets[i];
    });
  }, [lights, targets]);

  useFrame(({ camera }, delta) => {
    const cam = camera.position;
    const held = new Set(slots.current.map((s) => s.id));

    // how much each light matters from here: its brightness, falling away once the camera is outside its reach
    const scored: [number, number][] = [];
    registry.forEach((v, id) => {
      if (v.p.intensity <= 0) return;
      v.anchor.getWorldPosition(here);
      const d = here.distanceTo(cam);
      const reach = v.p.distance > 0 ? v.p.distance : 30;
      const beyond = Math.max(0, d - reach);
      let score = v.p.pin ? Number.POSITIVE_INFINITY : (v.p.intensity / (1 + (beyond / 9) ** 2)) / (1 + d * 0.03);
      // a light already lit keeps its place against one only a little more important, so the pool does not flicker as you walk
      if (held.has(id)) score *= 1.3;
      scored.push([id, score]);
    });
    scored.sort((a, b) => b[1] - a[1]);
    const want = new Set(scored.slice(0, POOL_SIZE).map(([id]) => id));

    const rate = Math.min(delta, 0.1) * 5;
    for (const slot of slots.current) {
      if (slot.id === 0) continue;
      if (!registry.has(slot.id)) {
        slot.id = 0;
        slot.level = 0;
      } else if (!want.has(slot.id)) {
        slot.level = Math.max(0, slot.level - rate);
        if (slot.level === 0) slot.id = 0;
      } else {
        slot.level = Math.min(1, slot.level + rate);
      }
    }
    const placed = new Set(slots.current.map((s) => s.id));
    for (const [id] of scored.slice(0, POOL_SIZE)) {
      if (placed.has(id)) continue;
      const free = slots.current.find((s) => s.id === 0);
      if (!free) break;
      free.id = id;
      free.level = 0;
      placed.add(id);
    }

    slots.current.forEach((slot, i) => {
      const light = lights[i];
      const v = slot.id ? registry.get(slot.id) : undefined;
      if (!v) {
        light.intensity = 0;
        return;
      }
      v.anchor.getWorldPosition(light.position);
      v.aim.getWorldPosition(targets[i].position);
      targets[i].updateMatrixWorld();
      light.color.set(v.p.color);
      light.angle = v.p.angle;
      light.penumbra = v.p.penumbra;
      light.distance = v.p.distance;
      light.decay = v.p.decay;
      light.intensity = v.p.intensity * slot.level;
    });
  });

  return (
    <>
      {lights.map((l, i) => (
        <primitive key={`l${i}`} object={l} />
      ))}
      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
    </>
  );
}
