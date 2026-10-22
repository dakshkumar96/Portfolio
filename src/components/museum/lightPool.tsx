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

/*
  The spotlights are lit in a loop, not one copy of the lighting code per
  lamp.

  Three writes every light loop out longhand - fourteen spotlights means
  fourteen copies of the whole lighting model in every shader - and on
  Windows, where the browser hands shaders to Direct3D's compiler, that
  length is what costs: a lit material took close to a second to
  compile, the hall has forty of them, and that was most of the loading
  screen. As a loop the same shader compiles in well under half the
  time, and draws the same picture. Written longhand is only needed for
  spotlights that cast shadows or project an image, which none here do;
  if one ever does, the original code is still there and is used.

  And a lamp is only worked through for a pixel it reaches. Outside its
  cone or past its range a spotlight adds exactly nothing, but three
  still ran the whole lighting model for it - fourteen times a pixel,
  when any one pixel is lit by two or three. Skipping the rest changes
  no pixel and takes most of the work off the graphics card.
*/
const SPOT_LOOP_START = "#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )";
const SPOT_LOOP_END = "#if ( NUM_SUN_LIGHTS > 0 )";
{
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const from = chunk.indexOf(SPOT_LOOP_START);
  const to = chunk.indexOf(SPOT_LOOP_END);
  if (from >= 0 && to > from && !chunk.includes("SPOT_LIGHTS_AS_LOOP")) {
    const loop = [
      "#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct ) && ( NUM_SPOT_LIGHT_SHADOWS == 0 ) && ( NUM_SPOT_LIGHT_MAPS == 0 )",
      "\t// SPOT_LIGHTS_AS_LOOP",
      "\tSpotLight spotLight;",
      "\tfor ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {",
      "\t\tspotLight = spotLights[ i ];",
      "\t\tgetSpotLightInfo( spotLight, geometryPosition, directLight );",
      "\t\tif ( directLight.visible ) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
      "\t}",
      "#else",
      "",
    ].join("\n");
    THREE.ShaderChunk.lights_fragment_begin =
      chunk.slice(0, from) + loop + chunk.slice(from, to) + "#endif\n" + chunk.slice(to);
  }
}

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
        l.distance = 1;
        l.position.set(0, -60, 0);
        return l;
      }),
    [],
  );
  /*
    A spotlight aimed at its own position has no direction, and the shader
    turns that into NaN - which survives being multiplied by zero intensity
    and comes out as flashing white blocks once bloom spreads it. So an
    idle light is never left at the origin aimed at the origin: it waits
    below the floor, pointing down, out of reach of anything.
  */
  const targets = useMemo(
    () =>
      lights.map(() => {
        const t = new THREE.Object3D();
        t.position.set(0, -70, 0);
        return t;
      }),
    [lights],
  );
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
        light.distance = 1;
        light.position.set(0, -60, 0);
        targets[i].position.set(0, -70, 0);
        targets[i].updateMatrixWorld();
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
