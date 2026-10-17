"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { block, ease, frame, merged, placed, shade, sweptProfile, worldUV } from "./architecture";
import { gildedLettering } from "./inscriptions";
import { StoneMaterial, corniceProfile } from "./Vault";

/**
 * What stands over each door: the room's name cut in a tablet, with a
 * small cornice over it - the way a gallery names its rooms over the
 * door. The name and nothing else.
 *
 * It is set directly on the top of the door's surround, with no wall left
 * showing between the two, and at three quarters of the size it was: a
 * museum's door sign is a modest thing, in proportion to the door under
 * it. The tablet is polished black stone and the letters are cut and gilt
 * and lit from within, so they read in the dark of the hall; they brighten
 * when the door is under the pointer.
 *
 * Drawn in the door's own frame: x along the wall, y up from the floor,
 * z out of the wall into the hall.
 */

/** Where the tablet's centre stands, and its size inside the frame. */
const TABLET_Y = 7.62;
/** The whole is drawn at the size it was designed at and set at this scale, and lifted to sit on the surround. */
const SCALE = 0.75;
/** The top of the door's outer ring (6.6) with a hand's breadth of wall left between it and the sign's frame. */
const SURROUND_TOP = 6.9;
const TABLET_W = 5.0;
const TABLET_H = 0.92;
const FRAME = 0.3;
const CORNICE_Y = TABLET_Y + TABLET_H / 2 + FRAME;
const CORNICE_SCALE = 0.55;
const CORNICE_W = TABLET_W + FRAME * 2 + 0.5;

function useCrownStone() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const bevel = (depth: number, b: number) => ({ depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
    // deeper is darker, as the hollows of a moulding are
    const byDepth = (g: THREE.BufferGeometry, back: number, front: number) => shade(g, (q) => 0.55 + 0.45 * ease(back, front, q.z));

    // the tablet's frame: a moulded band round a sunk field
    const ow = TABLET_W / 2 + FRAME;
    const oh = TABLET_H / 2 + FRAME;
    const outer = new THREE.Shape([
      new THREE.Vector2(-ow, TABLET_Y - oh),
      new THREE.Vector2(ow, TABLET_Y - oh),
      new THREE.Vector2(ow, TABLET_Y + oh),
      new THREE.Vector2(-ow, TABLET_Y + oh),
    ]);
    const iw = TABLET_W / 2;
    const ih = TABLET_H / 2;
    outer.holes.push(
      new THREE.Path([
        new THREE.Vector2(-iw, TABLET_Y - ih),
        new THREE.Vector2(-iw, TABLET_Y + ih),
        new THREE.Vector2(iw, TABLET_Y + ih),
        new THREE.Vector2(iw, TABLET_Y - ih),
      ]),
    );
    const band = new THREE.ExtrudeGeometry(outer, bevel(0.12, 0.035));
    parts.push(byDepth(band, 0, 0.19));
    // a bead inside the band, standing proud at the field's edge
    const bead = new THREE.Shape([
      new THREE.Vector2(-iw - 0.07, TABLET_Y - ih - 0.07),
      new THREE.Vector2(iw + 0.07, TABLET_Y - ih - 0.07),
      new THREE.Vector2(iw + 0.07, TABLET_Y + ih + 0.07),
      new THREE.Vector2(-iw - 0.07, TABLET_Y + ih + 0.07),
    ]);
    bead.holes.push(
      new THREE.Path([
        new THREE.Vector2(-iw, TABLET_Y - ih),
        new THREE.Vector2(-iw, TABLET_Y + ih),
        new THREE.Vector2(iw, TABLET_Y + ih),
        new THREE.Vector2(iw, TABLET_Y - ih),
      ]),
    );
    const beadGeo = new THREE.ExtrudeGeometry(bead, bevel(0.17, 0.025));
    parts.push(byDepth(beadGeo, 0, 0.22));

    // the cornice over it, smaller than the hall's but drawn from it, with its dentils
    const profile = corniceProfile().map(([o, u]) => [o * CORNICE_SCALE + 0.12, u * CORNICE_SCALE] as [number, number]);
    const corniceFrame = frame(new THREE.Vector3(-CORNICE_W / 2, CORNICE_Y, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    const cornice = shade(sweptProfile(profile, CORNICE_W), (q) => 0.45 + 0.55 * ease(0.15, 0.53, q.z));
    parts.push(placed(cornice, corniceFrame));
    cornice.dispose();
    const dentils: THREE.BufferGeometry[] = [];
    for (let x = 0.06; x < CORNICE_W - 0.06; x += 0.13) dentils.push(block(0.07, 0.085, 0.37, 0.06, x));
    const row = shade(merged(dentils), (q) => 0.45 + 0.55 * ease(0.15, 0.53, q.z));
    parts.push(placed(row, corniceFrame));
    row.dispose();

    return worldUV(merged(parts), 2.6);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

export function DoorCrown({ label, lit }: { label: string; lit: boolean }) {
  const stone = useCrownStone();
  const letters = useMemo(() => gildedLettering(label.toUpperCase(), { width: 2048, height: 384, cap: 180, tracking: 0.24 }), [label]);
  useEffect(() => () => letters.dispose(), [letters]);
  const gilt = (map: THREE.Texture) => (
    <meshStandardMaterial
      map={map}
      alphaTest={0.35}
      roughness={0.3}
      metalness={1}
      envMapIntensity={1.4}
      emissive="#ffd9a0"
      emissiveMap={map}
      emissiveIntensity={lit ? 3 : 2.1}
    />
  );

  return (
    <group position={[0, SURROUND_TOP - (TABLET_Y - TABLET_H / 2 - FRAME) * SCALE, 0]} scale={SCALE}>
      <mesh geometry={stone}>
        <StoneMaterial tint={1.22} />
      </mesh>

      {/* the tablet: polished black stone, the name cut and gilded in it */}
      <mesh position={[0, TABLET_Y, 0.04]}>
        <boxGeometry args={[TABLET_W + 0.04, TABLET_H + 0.04, 0.08]} />
        <meshStandardMaterial color="#15100b" roughness={0.28} metalness={0.15} envMapIntensity={0.9} />
      </mesh>
      <mesh position={[0, TABLET_Y, 0.083]}>
        <planeGeometry args={[TABLET_W, TABLET_H]} />
        {gilt(letters)}
      </mesh>
    </group>
  );
}
