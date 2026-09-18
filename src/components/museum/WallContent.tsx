"use client";

import { useEffect, useMemo, useRef } from "react";
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
const CORNER_STATIONS: number[] = (() => {
  const out: number[] = [];
  for (let z = Z_NEAR - 6; z > Z_FAR + 2; z -= 13) out.push(z);
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
}: {
  position: [number, number, number];
  yaw?: number;
  intensity?: number;
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

      <SpotDown y={-0.26} intensity={intensity} />
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
            <mesh position={[sgn * (HW - 0.2), WALL_H - 0.38, midZ]}>
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
            {CORNER_STATIONS.map((z) => (
              <WallLamp
                key={`ceil${sgn}${z}`}
                position={[sgn * (HW - LAMP_REACH), WALL_H - LAMP_DROP, z]}
                yaw={sgn > 0 ? 0 : Math.PI}
              />
            ))}

            {/* floor corner: a shadow gap with a strip inside it */}
            <mesh position={[sgn * (HW - 0.14), 0.2, midZ]} rotation={[0, yaw, 0]}>
              <planeGeometry args={[runLen, 0.4]} />
              <meshStandardMaterial color={SHELL.recess} roughness={0.9} />
            </mesh>
            {/*
              Warm and very dim. This was GOLD.core — a near-white — at a
              hairline width running the full length, which drew as a hard
              graphic line along the floor rather than a light. A skirting
              strip is a faint warm glow in a shadow gap, not an outline.
            */}
            <mesh position={[sgn * (HW - 0.28), 0.1, midZ]}>
              <boxGeometry args={[0.03, 0.06, runLen]} />
              <meshStandardMaterial
                color="#fff4e0"
                emissive={GOLD.core}
                emissiveIntensity={1.3}
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

/** A framed piece with its own picture light. */
export type FrameStyle = "gallery" | "slim" | "stepped" | "mounted";

/** Proportions and frame build, per style. */
const FRAME_SPECS: Record<
  FrameStyle,
  { w: number; h: number; depth: number; border: number; steps: number; mount: number }
> = {
  // deep box frame, generous border, portrait-ish
  gallery: { w: 1.9, h: 2.4, depth: 0.22, border: 0.2, steps: 1, mount: 0.12 },
  // barely-there edge, wide landscape
  slim: { w: 3.0, h: 1.5, depth: 0.06, border: 0.05, steps: 1, mount: 0 },
  // stepped moulding, near-square
  stepped: { w: 2.2, h: 2.0, depth: 0.2, border: 0.16, steps: 3, mount: 0.06 },
  // slim frame with a wide visible mount inside it
  mounted: { w: 2.5, h: 1.9, depth: 0.1, border: 0.07, steps: 1, mount: 0.26 },
};

function FramedPiece({
  z,
  side,
  title,
  subtitle,
  seed,
  style,
}: {
  z: number;
  side: "left" | "right";
  title: string;
  subtitle: string;
  seed: number;
  style: FrameStyle;
}) {
  const sgn = side === "left" ? -1 : 1;
  const spec = FRAME_SPECS[style];
  const W = spec.w;
  const H = spec.h;

  const texture = useMemo(() => {
    const w = 768;
    const h = 512;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // Stand-in artwork drawn at runtime. Point this at a real screenshot
    // when you have one; the frame and picture light stay as they are.
    const hue = 28 + seed * 14;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue}, 42%, 15%)`);
    g.addColorStop(1, `hsl(${hue + 18}, 34%, 6%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = `hsla(${hue + 10}, 70%, 60%, 0.45)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i += 1) {
      ctx.beginPath();
      const y = (i / 14) * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 60, w * 0.7, y + 60, w, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(0, h - 122, w, 122);
    ctx.fillStyle = "#ffe0ae";
    ctx.font = "600 46px Inter, system-ui, sans-serif";
    ctx.fillText(title, 34, h - 66);
    ctx.fillStyle = "rgba(255,224,174,0.62)";
    ctx.font = "400 26px Inter, system-ui, sans-serif";
    ctx.fillText(subtitle, 34, h - 28);

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [title, subtitle, seed]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group
      position={[sgn * (HW - 0.1), WALL_H * 0.42, z]}
      rotation={[0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
    >
      {/* the frame, stepped outward for the mouldings that have steps */}
      {Array.from({ length: spec.steps }, (_, k) => {
        const grow = spec.border * (1 + k * 0.85);
        return (
          <mesh key={k} position={[0, 0, -0.03 - k * 0.03]} castShadow>
            <boxGeometry args={[W + grow * 2, H + grow * 2, spec.depth - k * 0.04]} />
            <meshStandardMaterial
              color={k === 0 ? GOLD.metal : MID.bronze}
              roughness={0.24 + k * 0.08}
              metalness={1}
              envMapIntensity={1.5 - k * 0.2}
            />
          </mesh>
        );
      })}

      {/* the mount board, where the style calls for one */}
      {spec.mount > 0 ? (
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial color="#1b1611" roughness={0.9} />
        </mesh>
      ) : null}

      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[W - spec.mount * 2, H - spec.mount * 2]} />
        <meshStandardMaterial
          map={texture ?? undefined}
          emissiveMap={texture ?? undefined}
          emissive="#ffffff"
          emissiveIntensity={0.72}
          roughness={0.85}
          metalness={0}
        />
      </mesh>

      {/*
        A plain bronze arm. It used to be emissive, which put a bright
        lozenge on the wall above every frame — with the spotlight gone
        that glow was all that remained of it, so it read as a light
        floating on the wall rather than a fitting. The artwork carries
        its own illumination now.
      */}
      <mesh position={[0, H / 2 + spec.border + 0.2, 0.34]}>
        <boxGeometry args={[W * 0.42, 0.06, 0.12]} />
        <meshStandardMaterial
          color={MID.bronze}
          roughness={0.4}
          metalness={0.9}
          envMapIntensity={1.2}
        />
      </mesh>
      {/*
        The picture light is a fitting, not a projector.

        It used to carry a spotlight, which threw a hard circle onto the
        wall behind every frame — six bright discs at mid-height, all
        obviously artificial. The fitting still glows, and the artwork
        carries its own emissive map, so the piece reads as lit without
        painting a pool on the wall around it.
      */}
    </group>
  );
}

/**
 * Four hung pieces, each framed differently.
 *
 * Identical frames in a row read as a product listing. Giving each one
 * its own profile — a deep gallery box, a slim modern edge, a stepped
 * classical moulding, a double-mount — is what makes a wall look
 * curated rather than tiled.
 */
export function WallArt() {
  const picks = projects.slice(0, 4);
  const spots: { z: number; side: "left" | "right"; style: FrameStyle }[] = [
    { z: -11, side: "right", style: "gallery" },
    { z: -29, side: "left", style: "slim" },
    { z: -65, side: "right", style: "stepped" },
    { z: -83, side: "left", style: "mounted" },
  ];

  return (
    <>
      {spots.map((spot, i) => {
        const project = picks[i % picks.length];
        return (
          <FramedPiece
            key={`${project.slug}-${spot.z}`}
            z={spot.z}
            side={spot.side}
            title={project.title}
            subtitle={project.stack.slice(0, 2).join(" · ")}
            seed={i}
            style={spot.style}
          />
        );
      })}
    </>
  );
}
