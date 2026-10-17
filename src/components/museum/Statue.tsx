"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MID } from "./palette";
import { buildFigure } from "./figure";
import { gildedLettering } from "./inscriptions";

/**
 * The statue at the end of the hall, on its plinth.
 *
 * The figure is carved from the shape of a man as he appears in his
 * photographs (see figure.ts), at about twice life size, in one block of
 * pale marble, with his name cut in the plinth under him.
 *
 * A likeness of a face cannot be made by hand from a few numbers, so the
 * figure that stands is /museum/statue.glb, a model made from his
 * photographs: the body from the London Tech Week photo, the head from a
 * close crop of the same photo, its proportions corrected toward his face
 * as measured across ten photographs, and joined at the collar. The model
 * is baked one unit tall with its origin between the feet. It takes the
 * same marble, so it reads as stone. If the file is missing, the carved
 * figure stands instead.
 *
 * In the photo his hand rests on a letter. The statue is re-posed to stand
 * on its own, the way the brief for it asks: a relaxed stance with both
 * arms hanging at his sides, one elbow a little bent, the torso turned
 * about ten degrees and the head inclined a few degrees back toward the
 * visitor. Each joint was turned about a pivot placed from the photo's
 * pose landmarks. Nothing in his hands, nothing to lean on.
 */

export const PLINTH_H = 1.45;
/** How tall the figure stands on the plinth: about twice life size. */
const FIGURE_H = 3.3;
const SCAN = "/museum/statue.glb";

const MARBLE = "#ece4d2";

let marbleMaterial: THREE.MeshStandardMaterial | null = null;
/** Statuary marble: pale, a little warm, with a soft polish. */
export function marble() {
  if (!marbleMaterial) {
    marbleMaterial = new THREE.MeshStandardMaterial({
      color: MARBLE,
      roughness: 0.42,
      metalness: 0,
      envMapIntensity: 0.8,
      emissive: new THREE.Color("#ffd9a0"),
      /* a little of its own light, so that at the far end of the hall it is the brightest thing in the frame */
      emissiveIntensity: 0.16,
      // the open overshirt is a single sheet of stone, seen from both sides
      side: THREE.DoubleSide,
    });
  }
  return marbleMaterial;
}

/** The carved figure, scaled to its height on the plinth. */
function Carved() {
  const geometry = useMemo(() => {
    const g = buildFigure();
    g.computeBoundingBox();
    const h = g.boundingBox ? g.boundingBox.max.y - g.boundingBox.min.y : 1.8;
    const k = FIGURE_H / h;
    g.scale(k, k, k);
    g.translate(0, -(g.boundingBox?.min.y ?? 0) * k, 0);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={marble()} castShadow receiveShadow dispose={null} />;
}

/**
 * A scan, if one has been saved: looked for once, and loaded only if it
 * is there, so a missing file costs one small request and nothing else.
 */
function useScan() {
  const [scan, setScan] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(SCAN, { method: "HEAD" })
      .then((r) => {
        if (!r.ok || !alive) return;
        new GLTFLoader().load(
          SCAN,
          (gltf) => {
            if (!alive) return;
            const root = gltf.scene;
            // the model is baked with its origin between the feet: scale it to the figure's height and stand its soles on the plinth
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const k = size.y > 0 ? FIGURE_H / size.y : 1;
            root.scale.setScalar(k);
            root.position.set(0, -box.min.y * k, 0);
            root.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.material = marble();
                m.castShadow = true;
                m.receiveShadow = true;
              }
            });
            setScan(root);
          },
          undefined,
          () => {},
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return scan;
}

/** His name, cut in the face of the plinth and gilded. */
function Name() {
  const tex = useMemo(() => gildedLettering("DAKSH KUMAR", { width: 1024, height: 160, cap: 58, tracking: 0.32 }), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 0.18 + (PLINTH_H - 0.5) / 2, 0.851]}>
      <planeGeometry args={[1.5, (1.5 * 160) / 1024]} />
      <meshStandardMaterial
        map={tex}
        alphaTest={0.35}
        roughness={0.3}
        metalness={1}
        envMapIntensity={1.4}
        emissive="#7a5418"
        emissiveMap={tex}
        emissiveIntensity={0.6}
      />
    </mesh>
  );
}

export function Statue({ position }: { position: [number, number, number] }) {
  const scan = useScan();
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
      <Name />
      {scan ? (
        <group position={[0, PLINTH_H, 0]}>
          <primitive object={scan} />
        </group>
      ) : (
        <group position={[0, PLINTH_H, 0]}>
          <Carved />
        </group>
      )}
    </group>
  );
}
