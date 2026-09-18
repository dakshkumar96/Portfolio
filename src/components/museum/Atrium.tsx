"use client";

import { GOLD, MID, SHELL } from "./palette";
import { HALF_WIDTH as HW, WALL_H } from "./corridorLayout";

/**
 * A double-height chamber partway down the hall.
 *
 * Nothing hangs in it and nothing glows in it: the volume itself is the
 * event. The ceiling lifts, the walls step back behind a bronze cornice,
 * and the light comes from concealed coves in the upper corners — so the
 * hall stops reading as a tunnel because its proportions change as you
 * walk through, not because something bright was parked in the middle.
 */
export const ATRIUM_Z = -46;

export function Atrium() {
  const HALF = 11;
  const LIFT = 9;
  const top = WALL_H + LIFT;

  return (
    <group>
      {/* the raised ceiling over the chamber */}
      <mesh position={[0, top, ATRIUM_Z]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HW * 2, HALF * 2]} />
        <meshStandardMaterial color={SHELL.recess} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* the upper walls of the light well */}
      {[-1, 1].map((sgn) => (
        <mesh
          key={sgn}
          position={[sgn * HW, WALL_H + LIFT / 2, ATRIUM_Z]}
          rotation={[0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[HALF * 2, LIFT]} />
          <meshStandardMaterial color={SHELL.wall} roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      {/* and the end walls of the well, so it does not leak into the hall */}
      {[-1, 1].map((sgn) => (
        <mesh
          key={`e${sgn}`}
          position={[0, WALL_H + LIFT / 2, ATRIUM_Z + sgn * HALF]}
          rotation={[0, sgn > 0 ? Math.PI : 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[HW * 2, LIFT]} />
          <meshStandardMaterial color={SHELL.wall} roughness={0.6} metalness={0.2} />
        </mesh>
      ))}

      {/* bronze cornice where the section steps up */}
      {[-1, 1].map((sgn) => (
        <mesh key={`c${sgn}`} position={[sgn * (HW - 0.2), WALL_H, ATRIUM_Z]}>
          <boxGeometry args={[0.4, 0.26, HALF * 2]} />
          <meshStandardMaterial
            color={GOLD.metal}
            roughness={0.3}
            metalness={1}
            envMapIntensity={1.5}
          />
        </mesh>
      ))}

      {/*
        The two corner runs of the raised section.

        The corridor strips stop at the old ceiling height, so where the
        section steps up these upper corners had nothing in them — the
        run simply broke for the length of the chamber. These carry the
        same extrusion-and-diffuser build as the corridor, so the line of
        light continues through the taller volume instead of stopping at
        it.
      */}
      {[-1, 1].map((sgn) => (
        <group key={`cove${sgn}`}>
          {/* the cove lip the strip hides behind */}
          <mesh position={[sgn * (HW - 0.22), top - 0.5, ATRIUM_Z]} castShadow>
            <boxGeometry args={[0.44, 0.1, HALF * 1.92]} />
            <meshStandardMaterial
              color={GOLD.metal}
              roughness={0.32}
              metalness={1}
              envMapIntensity={1.4}
            />
          </mesh>
          {/* housing */}
          <mesh position={[sgn * (HW - 0.13), top - 0.38, ATRIUM_Z]}>
            <boxGeometry args={[0.1, 0.1, HALF * 1.92]} />
            <meshStandardMaterial color={MID.bronze} roughness={0.42} metalness={0.9} />
          </mesh>
          {/* diffuser */}
          <mesh position={[sgn * (HW - 0.2), top - 0.38, ATRIUM_Z]}>
            <boxGeometry args={[0.035, 0.07, HALF * 1.92]} />
            <meshStandardMaterial
              color="#fff4e0"
              emissive={GOLD.core}
              emissiveIntensity={1.9}
              roughness={0.6}
              transparent
              opacity={0.94}
            />
          </mesh>

          {/* the strip at the base of the raised walls, closing the step */}
          <mesh position={[sgn * (HW - 0.2), WALL_H + 0.16, ATRIUM_Z]}>
            <boxGeometry args={[0.035, 0.06, HALF * 1.92]} />
            <meshStandardMaterial
              color="#fff4e0"
              emissive={GOLD.core}
              emissiveIntensity={1.2}
              roughness={0.6}
              transparent
              opacity={0.94}
            />
          </mesh>
        </group>
      ))}

    </group>
  );
}
