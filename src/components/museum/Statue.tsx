"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { MID } from "./palette";

/**
 * The statue at the end of the hall, on its plinth.
 *
 * What stands on the plinth now is a stand-in: a plain standing figure in
 * pale marble, so the end of the hall has its subject and its light and
 * the proportions can be judged. It is deliberately one group, `Figure`,
 * with nothing else depending on its shape. To put the real statue there,
 * replace `<Figure />` with the model, standing on y = 0 with its feet at
 * the origin and about 3.3 units tall; the plinth, the light over it and
 * the wall behind need no change.
 */

export const PLINTH_H = 1.45;

const MARBLE = "#ece4d2";

function Figure() {
  // the body: a robe that flares to the ground, narrows at the waist, and rises to the shoulders
  const body = useMemo(() => {
    const spine = new THREE.SplineCurve(
      [
        [0.66, 0],
        [0.64, 0.1],
        [0.54, 0.55],
        [0.42, 1.1],
        [0.33, 1.55],
        [0.29, 1.85],
        [0.34, 2.05],
        [0.36, 2.2],
        [0.29, 2.32],
        [0.11, 2.4],
        [0.1, 2.46],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
    );
    const g = new THREE.LatheGeometry(spine.getPoints(90), 96);
    /*
      Drapery. A lathe is a plain solid of revolution, so the robe is
      given folds by pushing each ring in and out round its circumference,
      deepest low down where cloth gathers and gone by the chest, and
      twisting a little as it rises so the folds do not run straight.
    */
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      const gather = Math.max(0, 1 - y / 1.9);
      const k = 1 + gather * (0.07 * Math.sin(9 * a + y * 2.4) + 0.035 * Math.sin(17 * a - y * 1.3));
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => body.dispose(), [body]);

  const marble = (
    <meshStandardMaterial
      color={MARBLE}
      roughness={0.46}
      metalness={0}
      envMapIntensity={0.8}
      emissive="#ffd9a0"
      emissiveIntensity={0.03}
    />
  );
  return (
    <group rotation={[0, -0.18, 0]} scale={1.12}>
      <mesh geometry={body}>{marble}</mesh>
      {/* the shoulders, wider than the chest */}
      <mesh position={[0, 2.22, 0]} scale={[1.45, 0.52, 0.8]}>
        <sphereGeometry args={[0.3, 40, 20]} />
        {marble}
      </mesh>
      {/* the arms, down the sides, a little away from the body */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.47, 1.62, 0.02]} rotation={[0, 0, s * 0.07]}>
          <capsuleGeometry args={[0.085, 1.0, 8, 20]} />
          {marble}
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.18, 24]} />
        {marble}
      </mesh>
      {/* the head, turned a little and lifted */}
      <mesh position={[0, 2.72, 0]} rotation={[-0.06, 0.32, 0]} scale={[0.86, 1.1, 0.96]}>
        <sphereGeometry args={[0.2, 40, 28]} />
        {marble}
      </mesh>
    </group>
  );
}

export function Statue({ position }: { position: [number, number, number] }) {
  const stone = <meshStandardMaterial color="#9a8a70" roughness={0.78} metalness={0} envMapIntensity={0.45} />;
  return (
    <group position={position}>
      {/* the plinth: a stepped base, a die, and a cap */}
      <RoundedBox args={[2.1, 0.18, 2.1]} radius={0.03} smoothness={3} position={[0, 0.09, 0]}>
        {stone}
      </RoundedBox>
      <RoundedBox args={[1.7, PLINTH_H - 0.5, 1.7]} radius={0.03} smoothness={3} position={[0, 0.18 + (PLINTH_H - 0.5) / 2, 0]}>
        {stone}
      </RoundedBox>
      <RoundedBox args={[1.95, 0.22, 1.95]} radius={0.03} smoothness={3} position={[0, PLINTH_H - 0.11, 0]}>
        {stone}
      </RoundedBox>
      {/* a fine bronze band under the cap */}
      <mesh position={[0, PLINTH_H - 0.29, 0]}>
        <boxGeometry args={[1.76, 0.035, 1.76]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.38} metalness={0.9} envMapIntensity={1.1} />
      </mesh>
      <group position={[0, PLINTH_H, 0]}>
        <Figure />
      </group>
    </group>
  );
}
