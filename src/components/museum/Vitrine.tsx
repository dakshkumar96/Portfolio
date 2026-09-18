"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { consumedDrag } from "./lookControls";
import { GOLD, GOLD_HOT } from "./theme";

export type VitrineShape = "icosahedron" | "sphere" | "octahedron" | "box" | "torus" | "screen";

function ExhibitGeometry({ shape }: { shape: Exclude<VitrineShape, "screen"> }) {
  switch (shape) {
    case "icosahedron":
      return <icosahedronGeometry args={[0.34, 0]} />;
    case "sphere":
      return <sphereGeometry args={[0.32, 32, 32]} />;
    case "octahedron":
      return <octahedronGeometry args={[0.38, 0]} />;
    case "box":
      return <boxGeometry args={[0.5, 0.5, 0.5]} />;
    case "torus":
      return <torusGeometry args={[0.3, 0.12, 16, 40]} />;
  }
}

/**
 * Stand-in for a real project screenshot: a dark "screen" drawn at
 * runtime with the project's title and stack, so the Projects room reads
 * as displaying actual work rather than blank planes. Swap for real
 * texture loads once screenshots exist.
 */
function useScreenTexture(title?: string, subtitle?: string) {
  const texture = useMemo(() => {
    if (!title) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#0d0d10";
    ctx.fillRect(0, 0, 512, 320);

    const grad = ctx.createLinearGradient(0, 0, 512, 320);
    grad.addColorStop(0, "rgba(240,180,95,0.16)");
    grad.addColorStop(1, "rgba(240,180,95,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 320);

    ctx.fillStyle = GOLD;
    ctx.fillRect(40, 60, 56, 4);

    ctx.fillStyle = "#f5f5f5";
    ctx.font = "600 38px Inter, system-ui, sans-serif";
    ctx.fillText(title, 40, 122);

    if (subtitle) {
      ctx.fillStyle = "rgba(245,245,245,0.55)";
      ctx.font = "400 20px Inter, system-ui, sans-serif";
      ctx.fillText(subtitle, 40, 160);
    }

    ctx.strokeStyle = "rgba(245,245,245,0.10)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const y = 210 + i * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(40 + 300 - i * 52, y);
      ctx.stroke();
    }

    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [title, subtitle]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function Vitrine({
  position,
  shape,
  seed = 0,
  screenTitle,
  screenSubtitle,
  height = 0.95,
  caseHeight = 1.35,
  caseWidth = 1.05,
  active = false,
  onSelect,
}: {
  position: [number, number, number];
  shape: VitrineShape;
  seed?: number;
  screenTitle?: string;
  screenSubtitle?: string;
  height?: number;
  caseHeight?: number;
  caseWidth?: number;
  active?: boolean;
  onSelect?: () => void;
}) {
  const coreRef = useRef<THREE.Group>(null);
  const glassRef = useRef<THREE.Mesh>(null);
  const screenTexture = useScreenTexture(screenTitle, screenSubtitle);
  const [hovered, setHovered] = useState(false);
  const floatBase = height + caseHeight * 0.45;
  const lit = hovered || active;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  useFrame((state, delta) => {
    const core = coreRef.current;
    if (!core) return;
    core.rotation.y += delta * (shape === "screen" ? 0.08 : lit ? 0.7 : 0.26);
    core.position.y = floatBase + Math.sin(state.clock.elapsedTime * 0.9 + seed) * 0.045;

    // the case "unseals" a touch when selected or hovered
    const glass = glassRef.current;
    if (glass) {
      const restY = height + caseHeight / 2 + 0.03;
      const target = restY + (active ? 0.16 : hovered ? 0.05 : 0);
      glass.position.y = THREE.MathUtils.lerp(glass.position.y, target, 0.12);
    }
  });

  return (
    <group position={position}>
      {/* pedestal */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[caseWidth * 0.92, height, caseWidth * 0.92]} />
        <meshStandardMaterial color="#0e0e10" roughness={0.28} metalness={0.55} />
      </mesh>
      {/* lit cap the case sits on */}
      <mesh position={[0, height + 0.015, 0]}>
        <boxGeometry args={[caseWidth, 0.03, caseWidth]} />
        <meshStandardMaterial
          color={GOLD}
          emissive={GOLD}
          emissiveIntensity={lit ? 3.2 : 1.6}
          toneMapped={false}
        />
      </mesh>

      {/* internal light, hidden at the top of the pedestal, throwing up
          into the case — separate from the room's main spotlight */}
      <pointLight
        position={[0, height + 0.12, 0]}
        color={GOLD_HOT}
        intensity={lit ? 7 : 3.2}
        distance={lit ? 3.6 : 2.6}
        decay={2}
      />

      <group ref={coreRef} position={[0, floatBase, 0]}>
        {shape === "screen" && screenTexture ? (
          <mesh castShadow>
            <planeGeometry args={[0.78, 0.49]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffffff"
              emissiveIntensity={0.85}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : shape !== "screen" ? (
          <mesh castShadow>
            <ExhibitGeometry shape={shape} />
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={0.5}
              metalness={0.45}
              roughness={0.25}
            />
          </mesh>
        ) : null}
      </group>

      {/* glass: transmission 1, near-zero roughness, real IOR.
          This is the click target — the placard only opens from here. */}
      <mesh
        ref={glassRef}
        position={[0, height + caseHeight / 2 + 0.03, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (consumedDrag()) return;
          onSelect?.();
        }}
      >
        <boxGeometry args={[caseWidth, caseHeight, caseWidth]} />
        <meshPhysicalMaterial
          transmission={1}
          thickness={0.35}
          ior={1.5}
          roughness={0.03}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.04}
          transparent
          opacity={0.92}
          color={lit ? "#fff4de" : "#f6ead6"}
        />
      </mesh>
    </group>
  );
}
