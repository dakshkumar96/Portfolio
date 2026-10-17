"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { GOLD } from "./palette";
import { ROOM_ICONS, type DrawnIconId, type PlaqueIconId, type TracedIconId } from "./roomIcons";
import { drawnIcon } from "./drawnIcons";
import { useHoloOverlay } from "./CaseModels";

/**
 * A logo, as a solid.
 *
 * The traced outline is extruded into a plaque of gold with a bevelled
 * edge, so it catches light along its rim the way a struck medal does -
 * a flat shape cannot do that, and it is why this is geometry and not a
 * picture. The cut-outs stay cut out: you see through the title bar of the
 * code window and between the orbits of the atom.
 *
 * It then gets the same hologram overlay as the models in the corridor -
 * an additive rim of light, fine scan lines, and one slow band travelling
 * up it - so the cases in the Skills and Contact rooms are lit and treated the same way
 * as the ones in the hall.
 */

/*
  Depth of the plaque in the icon's own 512-unit space; about 9% of its
  height. It was 16%, and at that thickness a logo read as a block cut
  out of gold rather than a plaque cast in it.
*/
const DEPTH = 46;

function buildGeometry(id: PlaqueIconId, height: number) {
  let shapes: THREE.Shape[];
  if (id in ROOM_ICONS) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="${ROOM_ICONS[id as TracedIconId]}" fill-rule="evenodd"/></svg>`;
    shapes = new SVGLoader().parse(svg).paths.flatMap((path) => path.toShapes());
  } else {
    shapes = drawnIcon(id as DrawnIconId);
  }

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 6,
    bevelSize: 5,
    bevelSegments: 3,
    curveSegments: 6,
  });

  /*
    SVG runs y downward and the scene runs y upward, so the outline would
    come out upside down. A half turn about x puts it right way up without
    mirroring it - scaling y by -1 would flip every face inside out - and
    centring first means the turn is about the middle of the plaque.
  */
  geometry.center();
  geometry.rotateX(Math.PI);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  geometry.scale(height / (box.max.y - box.min.y), height / (box.max.y - box.min.y), height / (box.max.y - box.min.y));
  geometry.computeVertexNormals();
  return geometry;
}

export function RoomIcon({ id, height = 0.98 }: { id: PlaqueIconId; height?: number }) {
  const geometry = useMemo(() => buildGeometry(id, height), [id, height]);

  const solid = useMemo(() => {
    /*
      Gold by colour and by glow, not by reflection alone.

      A polished metal shows you what is around it, and what is around
      this is a dim room: at full metalness it came out the colour of old
      bronze. So the base is bright, the metalness is held back enough
      for that colour to show, and it carries a little light of its own,
      which is how the models in the hall are done too.
    */
    const material = new THREE.MeshStandardMaterial({
      color: GOLD.metalLit,
      metalness: 0.78,
      roughness: 0.34,
      emissive: GOLD.halo,
      emissiveIntensity: 0.42,
      envMapIntensity: 1.5,
    });
    return new THREE.Mesh(geometry, material);
  }, [geometry]);

  const holo = useHoloOverlay(solid, 0.9);

  useEffect(
    () => () => {
      geometry.dispose();
      (solid.material as THREE.Material).dispose();
    },
    [geometry, solid],
  );

  return (
    <group>
      <primitive object={solid} />
      {holo ? <primitive object={holo} /> : null}
    </group>
  );
}
