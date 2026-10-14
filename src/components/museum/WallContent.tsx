"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GOLD, MID, SHELL } from "./palette";
import { HALF_WIDTH as HW, WALL_H, Z_NEAR, Z_FAR } from "./corridorLayout";
import { projects, experience, skills, site, about } from "@/content/site";

/**
 * The lines carved into the walls, drawn from the real site content so
 * the hall is inscribed with this person's record rather than filler.
 */
export function inscriptionLines(): string[] {
  const out: string[] = [
    site.name,
    site.role,
    site.location,
  ];
  for (const job of experience) {
    out.push(`${job.org} — ${job.role}`, job.dates);
  }
  for (const project of projects) {
    out.push(project.title, project.stack.slice(0, 3).join(" · "));
  }
  for (const group of skills) {
    out.push(group.title, group.items.slice(0, 5).join(" · "));
  }
  out.push(...about.whoIAm.map((p) => p.split(".")[0]));
  return out.filter(Boolean);
}

/**
 * The cove lighting that runs the length of the hall.
 *
 * Every light in here belongs to something you can see. The corridor used
 * to also carry a row of point lights floating in mid-air against the
 * walls — they lit the space, but with nothing producing them the result
 * read as painted-on patches rather than illumination. The coves below
 * are the only wall light now, and they are real fittings: a lip, a strip
 * tucked behind it, and the wash it throws.
 */
/**
 * Where the corner runs are sampled.
 *
 * Every light in a scene is compiled into the shader, so this spacing is
 * a real budget decision, not just a look: at 9 units the four runs came
 * to 56 lights on their own, which would have cost far more than the
 * evenness was worth. At 13 they still overlap into a continuous wash.
 */
export const CORNER_STATIONS: number[] = (() => {
  const out: number[] = [];
  /*
    At the centre of every other bay - 18 apart, over the doors - so a lamp
    never lands on a pilaster, which stand at the bays' edges.
  */
  for (let z = 2; z > Z_FAR + 2; z -= 18) out.push(z);
  return out;
})();

/**
 * A wall lamp: bracket, socket, and a frosted globe with the light inside
 * it.
 *
 * The cove lights previously hung in mid-air about two units off the
 * wall. They lit the hall correctly, but with nothing visible producing
 * them the illumination had no author — which is the thing that makes a
 * render feel artificial, more than any amount of brightness. Putting the
 * source inside a glowing globe fixes it at the root: you can see what is
 * doing the lighting.
 */
/** How far the lamp hangs below the ceiling, and out from the wall. */
export const LAMP_DROP = 1.5;
export const LAMP_REACH = 1.6;

/** A downward spot, with its target bound into the scene graph. */
function SpotDown({ y, intensity }: { y: number; intensity: number }) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    const l = lightRef.current;
    const t = targetRef.current;
    if (!l || !t) return;
    l.target = t;
    t.updateMatrixWorld();
  }, []);
  return (
    <>
      <spotLight
        ref={lightRef}
        position={[0, y, 0]}
        angle={1.15}
        penumbra={0.95}
        intensity={intensity}
        color={GOLD.light}
        distance={16}
        decay={2}
      />
      <object3D ref={targetRef} position={[0, y - 4, 0]} />
    </>
  );
}

/**
 * A wall lamp: bracket, socket, and a frosted globe with the light
 * inside it.
 *
 * The light is a downward spot rather than a point source. A point light
 * radiates in every direction, so modelling a shade over one changes
 * nothing — it would still wash the ceiling above. Aiming it down means
 * the shade actually does something.
 */
export function WallLamp({
  position,
  yaw = 0,
  intensity = 150,
  lightless = false,
}: {
  position: [number, number, number];
  yaw?: number;
  intensity?: number;
  /**
   * Render the fitting without its light.
   *
   * Rooms use this: their lights are mounted permanently elsewhere so
   * the scene's light count never changes, while the visible fitting
   * still appears and disappears with the room.
   */
  lightless?: boolean;
}) {
  const armLen = 1.05;

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* bracket back to the wall */}
      <mesh position={[armLen / 2 + 0.3, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, armLen, 10]} />
        <meshStandardMaterial
          color={GOLD.metal}
          roughness={0.3}
          metalness={1}
          envMapIntensity={1.4}
        />
      </mesh>
      {/* the plate it mounts on */}
      <mesh position={[armLen + 0.28, 0.26, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.06, 16]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.4} metalness={0.9} />
      </mesh>
      {/* the drop and the socket */}
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.3, 10]} />
        <meshStandardMaterial color={GOLD.metal} roughness={0.3} metalness={1} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.075, 0.09, 0.12, 16]} />
        <meshStandardMaterial color={MID.bronze} roughness={0.35} metalness={0.9} />
      </mesh>

      {/* the reflector shade */}
      <mesh position={[0, -0.06, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.27, 0.22, 22, 1, true]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.4}
          metalness={0.9}
          side={THREE.DoubleSide}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* the globe, and the filament visible through it */}
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial
          color="#fff6e2"
          emissive={GOLD.core}
          emissiveIntensity={2.4}
          roughness={0.55}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={GOLD.core}
          emissive={GOLD.core}
          emissiveIntensity={4.5}
        />
      </mesh>

      {lightless ? null : <SpotDown y={-0.26} intensity={intensity} />}
    </group>
  );
}

export function WallInscriptions() {
  const midZ = (Z_NEAR + Z_FAR) / 2;
  const runLen = Math.abs(Z_NEAR - Z_FAR) * 0.995;

  return (
    <>
      {/*
        Light lines sit in the corners — where wall meets floor and wall
        meets ceiling — rather than across the middle of the wall. That is
        where architectural cove lighting actually goes: it grazes the
        surface, describes the shape of the room, and leaves the wall face
        free for the text.
      */}
      {[-1, 1].map((sgn) => {
        const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
        return (
          <group key={`corner${sgn}`}>
            {/*
              The bronze cove lip is gone.

              It was a dark brown band projecting from the wall the whole
              length of the corridor, and at that size it read as a
              structural element competing with the doors rather than as
              trim. The strip below does not need something to hide
              behind when it is this dim.
            */}

            {/*
              The LED run itself: an extrusion with a frosted diffuser
              over it, sitting in the channel behind the lip. Continuous
              for the whole length, which is what a strip is — the light
              it appears to give is the diffuser, not a row of lamps.
            */}
            {/* under the cornice, so it lights the cornice's underside instead of vanishing inside it */}
            <mesh position={[sgn * (HW - 0.2), WALL_H - 1.05, midZ]}>
              <boxGeometry args={[0.035, 0.07, runLen]} />
              <meshStandardMaterial
                color="#fff4e0"
                emissive={GOLD.core}
                emissiveIntensity={1.9}
                roughness={0.6}
                transparent
                opacity={0.94}
              />
            </mesh>
            {/*
              The wash from the ceiling cove.

              Point lights near a surface burn hotspots into it, which is
              what went wrong before. Two things prevent that here: they
              hang well clear of both wall and ceiling rather than tucked
              into the corner, and they are spaced closely at low power,
              so the pools overlap into a continuous run instead of
              reading as separate lamps.
            */}
            {/*
              Every fitting is drawn; only every other one carries a
              light.

              Sixteen cove spotlights was a third of all the lights in
              the hall, and in a forward renderer every one of them is
              computed for every lit pixel, every frame, whether it
              reaches that pixel or not. The pools were spaced to overlap
              into a continuous run anyway, so lighting alternate
              stations at a stronger setting gives the same wash with
              half the cost - and the wall keeps its full rhythm of
              lamps, because the fittings themselves are all still here.
            */}
            {CORNER_STATIONS.map((z, i) => (
              <WallLamp
                key={`ceil${sgn}${z}`}
                position={[sgn * (HW - LAMP_REACH), WALL_H - LAMP_DROP, z]}
                yaw={sgn > 0 ? 0 : Math.PI}
                lightless={i % 2 === 1}
                intensity={240}
              />
            ))}

            {/* floor corner: a shadow gap with a strip inside it */}
            <mesh position={[sgn * (HW - 0.14), 0.2, midZ]} rotation={[0, yaw, 0]}>
              <planeGeometry args={[runLen, 0.4]} />
              <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
            </mesh>
            {/*
              Warm gold and dim: a faint glow in a shadow gap, not a white
              line drawn down the floor. At its old near-white it was the
              brightest thing at the foot of every door.
            */}
            <mesh position={[sgn * (HW - 0.28), 0.1, midZ]}>
              <boxGeometry args={[0.03, 0.06, runLen]} />
              <meshStandardMaterial
                color="#c8944a"
                emissive="#c8944a"
                emissiveIntensity={0.4}
                roughness={0.6}
                transparent
                opacity={0.94}
              />
            </mesh>
            {/*
              The skirting strip is a visible fitting only. Doubling the
              light count to wash the bottom of a wall nobody looks at is
              the wrong place to spend the budget — the ceiling run and
              the downlights carry the hall.
            */}
          </group>
        );
      })}

    </>
  );
}
