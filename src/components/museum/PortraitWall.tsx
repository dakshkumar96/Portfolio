"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ExhibitText } from "./ExhibitText";
import { ROOM_DEPTH, roomCenter, type DoorSpec } from "./corridorLayout";
import type { ExhibitDatum } from "./exhibitData";
import { consumedDrag } from "./lookControls";
import { GOLD, MID, EMIT } from "./palette";

/**
 * Photographs to hang in the About room.
 *
 * Drop files into `public/museum/` with these names and they appear
 * automatically; until then each frame shows a neutral mount, so the room
 * is never broken by a missing file.
 */
const PHOTO_FILES = ["/museum/portrait-1.jpg", "/museum/portrait-2.jpg", "/museum/portrait-3.jpg"];

/** Plain mount used when a photograph has not been added yet. */
function useMountTexture() {
  return useMemo(() => {
    const w = 512;
    const h = 640;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#241c15");
    g.addColorStop(1, "#14100c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,182,63,0.32)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = "rgba(255,198,112,0.5)";
    ctx.font = "500 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PHOTOGRAPH", w / 2, h / 2);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Frame({
  position,
  rotation,
  exhibit,
  active,
  onSelect,
  src,
  fallback,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  exhibit: ExhibitDatum;
  active: boolean;
  onSelect: () => void;
  src: string | null;
  fallback: THREE.Texture | null;
}) {
  const [hovered, setHovered] = useState(false);
  const photo = usePhoto(src);
  const lit = hovered || active;
  /*
    Hung large. These are fixed to the back wall, so unlike the vitrines
    in the other rooms they cannot be moved forward to meet the visitor —
    across a room this deep the previous 1.55 x 1.95 read as postcards.
    A gallery sizes the work to the wall and the viewing distance, which
    is exactly the adjustment being made here.
  */
  const W = 2.3;
  const H = 2.9;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

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
    <group position={position} rotation={rotation}>
      {/* brushed dark bezel */}
      <mesh position={[0, 0, -0.04]} castShadow>
        <boxGeometry args={[W + 0.14, H + 0.14, 0.08]} />
        <meshStandardMaterial
          color={GOLD.metal}
          roughness={0.28}
          metalness={1}
          envMapIntensity={1.5}
        />
      </mesh>
      {/* the light line around the picture, which is what makes it read
          as a display rather than a painting */}
      {[
        { p: [0, H / 2 + 0.05, 0.02], s: [W + 0.1, 0.012, 0.012] },
        { p: [0, -(H / 2 + 0.05), 0.02], s: [W + 0.1, 0.012, 0.012] },
        { p: [-(W / 2 + 0.05), 0, 0.02], s: [0.012, H + 0.1, 0.012] },
        { p: [W / 2 + 0.05, 0, 0.02], s: [0.012, H + 0.1, 0.012] },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]}>
          <boxGeometry args={b.s as [number, number, number]} />
          <meshStandardMaterial
            color={GOLD.core}
            emissive={GOLD.core}
            emissiveIntensity={lit ? EMIT.hairlineLit : EMIT.hairline}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* the photograph, or the mount until one is added */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          map={photo ?? fallback ?? undefined}
          roughness={0.82}
          metalness={0}
        />
      </mesh>

      {/* picture light on a small arm */}
      <mesh position={[0, H / 2 + 0.26, 0.3]}>
        <boxGeometry args={[W * 0.45, 0.06, 0.13]} />
        <meshStandardMaterial
          color={MID.bronze}
          emissive={GOLD.core}
          emissiveIntensity={lit ? EMIT.panel * 2 : EMIT.panel}
          roughness={0.3}
          metalness={0.85}
        />
      </mesh>
      <spotLight
        ref={lightRef}
        position={[0, H / 2 + 0.24, 0.62]}
        angle={0.66}
        penumbra={0.86}
        intensity={lit ? 120 : 72}
        color={GOLD.light}
        distance={6.5}
        decay={2}
      />
      <object3D ref={targetRef} position={[0, -0.15, 0]} />

      {/* title under the frame, and the click target */}
      <group position={[0, -(H / 2 + 0.32), 0.05]}>
        <ExhibitText text={exhibit.title} position={[0, 0, 0]} height={0.17} active={active} />
      </group>

      <mesh
        position={[0, 0, 0.1]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (consumedDrag()) return;
          onSelect();
        }}
      >
        <planeGeometry args={[W + 0.4, H + 0.9]} />
      </mesh>
    </group>
  );
}

/**
 * Loads a photograph if one is present, and quietly keeps the neutral
 * mount if it is not.
 *
 * Deliberately not drei's useLoader: that throws to the nearest Suspense
 * boundary when a file is missing, which would blank the whole room until
 * the photographs are actually added.
 */
function usePhoto(src: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      src,
      (t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        loaded = t;
        setTex(t);
      },
      undefined,
      () => {
        // no file yet: the mount stays, nothing breaks
      },
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [src]);

  return tex;
}

/**
 * The About room is a picture gallery rather than a vitrine hall: plain
 * walls hung with framed photographs, each opening its own text when
 * clicked. Cases would have said "artefact"; frames say "person".
 */
export function PortraitWall({
  door,
  items,
  activeId,
  onSelect,
}: {
  door: DoorSpec;
  items: ExhibitDatum[];
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const fallback = useMountTexture();
  const sgn = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);
  const backX = cx + sgn * (ROOM_DEPTH / 2 - 0.3);

  // three frames across the back wall, evenly spaced
  const picks = items.slice(0, 3);
  const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;

  /*
    Hung at eye level, not at a fraction of the ceiling. That was
    ROOM_H * 0.46, which was already high in a nine-unit alcove and put
    the pictures six units up once the rooms took the corridor's own
    head height. A gallery hangs to the centre of the picture at about
    1.5m whatever the room does above it.
  */
  const HANG_Y = 2.85;
  /** One pitch for the run, so three frames read as a hang, not a scatter. */
  const PITCH = 4.2;

  return (
    <group>
      {picks.map((exhibit, i) => {
        const spread = picks.length === 1 ? 0 : (i - (picks.length - 1) / 2) * PITCH;
        return (
          <Frame
            key={exhibit.id}
            position={[backX, HANG_Y, cz + spread]}
            rotation={[0, yaw, 0]}
            exhibit={exhibit}
            active={activeId === exhibit.id}
            onSelect={() => onSelect(exhibit)}
            src={PHOTO_FILES[i] ?? null}
            fallback={fallback}
          />
        );
      })}

      {/*
        A low bench, so the room reads as somewhere you stand and look.
        Set back far enough from the wall to be a real viewing distance
        now that the room has the depth for one.
      */}
      <mesh position={[cx - sgn * 2.4, 0.26, cz]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.52, 4.4]} />
        <meshStandardMaterial color={MID.plinth} roughness={0.5} metalness={0.3} envMapIntensity={0.9} />
      </mesh>
    </group>
  );
}
