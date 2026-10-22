"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { HALF_WIDTH as HW, WALL_H, Z_FAR, Z_NEAR } from "./corridorLayout";

/**
 * The air in the hall.
 *
 * Two things, both faint, so the light can be seen travelling and neither
 * is ever the subject:
 *
 *  - the beam over the statue, built of a few nested cones of haze, each
 *    brightest at the lamp and fading to nothing toward the figure, so
 *    there is no hard edge to the shaft - the nested cones add up to a
 *    soft one
 *  - dust motes, sparse, drifting slowly through the hall in a warm light
 *
 * With reduced motion asked for, the motes hang still.
 *
 * The cool fill is a very low ambient light: shadows keep a little blue
 * against all the warm. Ambient light is not counted in three's light
 * count, so it never recompiles anything.
 */

const MOTES = 220;

/** A cone of haze from a lamp to a point, black (nothing) at the far end and `peak` at the lamp. */
function beamGeometry(length: number, radius: number, peak: number) {
  const g = new THREE.ConeGeometry(radius, length, 36, 6, true);
  // apex at the origin, widening along +z
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute("position");
  const colour = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) {
    const u = p.getZ(i) / length; // 0 at the lamp, 1 at the far end
    const b = peak * Math.pow(1 - u, 1.4) * Math.min(1, u * 8);
    colour[i * 3] = b;
    colour[i * 3 + 1] = b * 0.8;
    colour[i * 3 + 2] = b * 0.45;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colour, 3));
  return g;
}

function StatueBeam({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const layers = useMemo(() => {
    const length = from.distanceTo(to);
    // three widths, so the sides of the shaft fall away instead of ending
    // faint, as the haze over the exhibits in the rooms is: the light is seen in the air, never as a solid cone
    return [0.62, 0.44, 0.26].map((r, i) => ({
      geometry: beamGeometry(length, length * Math.tan(0.32) * r * 1.5, 0.009 - i * 0.0022),
    }));
  }, [from, to]);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    group.current?.lookAt(to);
  }, [to]);
  useEffect(() => () => layers.forEach((l) => l.geometry.dispose()), [layers]);
  return (
    <group ref={group} position={from}>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geometry} renderOrder={2}>
          <meshBasicMaterial
            vertexColors
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Motes() {
  const points = useRef<THREE.Points>(null);
  const still = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const data = useMemo(() => {
    let seed = 8191;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const home = new Float32Array(MOTES * 3);
    const phase = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i += 1) {
      home[i * 3] = (rand() - 0.5) * (HW * 2 - 3);
      home[i * 3 + 1] = 1 + rand() * (WALL_H - 3);
      home[i * 3 + 2] = Z_FAR + 2 + rand() * (Z_NEAR - Z_FAR - 4);
      for (let k = 0; k < 3; k += 1) phase[i * 3 + k] = rand() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(home.slice(), 3));
    return { geometry, home, phase };
  }, []);
  useEffect(() => () => data.geometry.dispose(), [data]);
  const dot = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,214,150,1)");
      g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => dot.dispose(), [dot]);

  useFrame(({ clock }) => {
    if (still) return;
    const p = points.current;
    if (!p) return;
    const pos = p.geometry.getAttribute("position") as THREE.BufferAttribute;
    const t = clock.elapsedTime * 0.12;
    for (let i = 0; i < MOTES; i += 1) {
      pos.setXYZ(
        i,
        data.home[i * 3] + Math.sin(t + data.phase[i * 3]) * 0.9,
        data.home[i * 3 + 1] + Math.sin(t * 0.8 + data.phase[i * 3 + 1]) * 0.6 - ((t * 0.25) % 1) * 0,
        data.home[i * 3 + 2] + Math.sin(t * 0.7 + data.phase[i * 3 + 2]) * 0.9,
      );
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={data.geometry} frustumCulled={false} renderOrder={2}>
      <pointsMaterial
        map={dot}
        color="#ffcf94"
        size={0.07}
        sizeAttenuation
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

export function Atmosphere({ lamp, target }: { lamp: [number, number, number]; target: [number, number, number] }) {
  const from = useMemo(() => new THREE.Vector3(...lamp), [lamp]);
  const to = useMemo(() => new THREE.Vector3(...target), [target]);
  return (
    <>
      <StatueBeam from={from} to={to} />
      <Motes />
      <ambientLight color="#334455" intensity={0.05} />
    </>
  );
}
