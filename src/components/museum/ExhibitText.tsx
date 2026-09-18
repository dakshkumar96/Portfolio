"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GOLD, GOLD_HOT } from "./theme";

const PAD = 48;
const FONT_PX = 128;

/**
 * Text living in the 3D scene, drawn to a canvas at runtime.
 *
 * Not extruded geometry: three ships no typeface JSON and troika fetches
 * its font from a CDN, so real TextGeometry would mean a runtime network
 * dependency. Layering a few offset copies gives it depth instead, and
 * it stays lit, occluded and clickable like any other object.
 */
function useTextTexture(text: string) {
  const result = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const font = `600 ${FONT_PX}px Inter, system-ui, sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + PAD * 2;
    const h = FONT_PX + PAD * 2;

    canvas.width = w;
    canvas.height = h;

    // resizing clears the context, so restate the font
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return { texture, aspect: w / h };
  }, [text]);

  useEffect(() => () => result?.texture.dispose(), [result]);
  return result;
}

export function ExhibitText({
  text,
  position,
  height = 0.34,
  active = false,
  onSelect,
}: {
  text: string;
  position: [number, number, number];
  height?: number;
  active?: boolean;
  onSelect?: () => void;
}) {
  const data = useTextTexture(text);
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  if (!data) return null;
  const width = height * data.aspect;

  // a few receding copies read as extrusion under bloom
  const layers = [0, -0.012, -0.024, -0.036];

  return (
    <group position={position}>
      {layers.map((z, i) => (
        <mesh key={z} position={[0, 0, z]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            map={data.texture}
            transparent
            depthWrite={i === 0}
            opacity={i === 0 ? 1 : 0.35 - i * 0.08}
            color={i === 0 ? (lit ? GOLD_HOT : GOLD) : "#6b4a1e"}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* generous invisible hit area so the words are easy to click */}
      <mesh
        position={[0, 0, 0.02]}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
      >
        <planeGeometry args={[width + 0.25, height + 0.25]} />
      </mesh>

      {lit ? (
        <pointLight position={[0, 0, 0.6]} color={GOLD_HOT} intensity={3} distance={3.5} />
      ) : null}
    </group>
  );
}
