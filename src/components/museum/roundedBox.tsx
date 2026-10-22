"use client";

import { forwardRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import type { ThreeElements } from "@react-three/fiber";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
  drei's RoundedBox, with its geometry made once per size.

  drei builds a fresh bevelled box for every RoundedBox on the page and
  then re-smooths its normals vertex by vertex. The display cases are
  made of them - nine to a case, thirty-odd cases - so the loading
  screen spent over a second building the same few dozen boxes three
  hundred times. The shape here is drei's own, step for step; boxes of
  one size now share one geometry.
*/

const EPS = 0.00001;
const CREASE = 0.4;
const BEVEL_SEGMENTS = 4;

function outline(width: number, height: number, radius0: number) {
  const shape = new THREE.Shape();
  const radius = radius0 - EPS;
  shape.absarc(EPS, EPS, EPS, -Math.PI / 2, -Math.PI, true);
  shape.absarc(EPS, height - radius * 2, EPS, Math.PI, Math.PI / 2, true);
  shape.absarc(width - radius * 2, height - radius * 2, EPS, Math.PI / 2, 0, true);
  shape.absarc(width - radius * 2, EPS, EPS, 0, -Math.PI / 2, true);
  return shape;
}

const made = new Map<string, THREE.BufferGeometry>();

export function roundedBoxGeometry(width: number, height: number, depth: number, radius: number, smoothness: number) {
  const key = `${width}|${height}|${depth}|${radius}|${smoothness}`;
  let g = made.get(key);
  if (!g) {
    const extruded = new THREE.ExtrudeGeometry(outline(width, height, radius), {
      depth: depth - radius * 2,
      bevelEnabled: true,
      bevelSegments: BEVEL_SEGMENTS * 2,
      steps: 1,
      bevelSize: radius - EPS,
      bevelThickness: radius,
      curveSegments: smoothness,
    });
    extruded.center();
    g = toCreasedNormals(extruded, CREASE);
    made.set(key, g);
  }
  return g;
}

type Props = Omit<ThreeElements["mesh"], "args"> & {
  args?: [number?, number?, number?];
  radius?: number;
  smoothness?: number;
  children?: ReactNode;
};

export const RoundedBox = forwardRef<THREE.Mesh, Props>(function RoundedBox(
  { args: [width = 1, height = 1, depth = 1] = [], radius = 0.05, smoothness = 4, children, ...rest },
  ref,
) {
  // passed as a prop, not a child, so it is never disposed along with any one box that uses it
  return (
    <mesh ref={ref} geometry={roundedBoxGeometry(width, height, depth, radius, smoothness)} {...rest}>
      {children}
    </mesh>
  );
});
