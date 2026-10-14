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

    /*
      Heavy, and tracked out.

      At 600 the lettering thinned to almost nothing once it was
      emissive - a glow spreads, so a light weight eats itself and
      leaves a smear. 800 holds its shape under bloom, and the letter
      spacing stops the glow of one character closing the gap to the
      next.
    */
    const font = `800 ${FONT_PX}px Inter, system-ui, sans-serif`;
    ctx.font = font;
    ctx.letterSpacing = "0.06em";
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + PAD * 2;
    const h = FONT_PX + PAD * 2;

    canvas.width = w;
    canvas.height = h;

    // resizing clears the context, so restate the font
    ctx.font = font;
    ctx.letterSpacing = "0.06em";
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
          {i === 0 ? (
            /*
              The face is emissive, not a flat fill.

              A basic material caps at the colour you give it, so gold
              text sat at exactly its own value and never crossed the
              bloom threshold - it read as painted-on rather than lit.
              Emitting above 1 with the base colour black means the only
              thing on screen is the glow, which is what makes lettering
              look like it is made of light.
            */
            <meshStandardMaterial
              map={data.texture}
              emissiveMap={data.texture}
              emissive={lit ? GOLD_HOT : GOLD}
              emissiveIntensity={lit ? 3.6 : 2.3}
              color="#000000"
              transparent
              depthWrite
              toneMapped={false}
            />
          ) : (
            <meshBasicMaterial
              map={data.texture}
              transparent
              depthWrite={false}
              opacity={0.35 - i * 0.08}
              color="#6b4a1e"
              toneMapped={false}
            />
          )}
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

      {/*
        There used to be a point light here, switched on whenever the
        label was hovered or active. That was the stall on clicking a
        door.

        Three bakes the number of lights in the scene into every
        material's shader. A light that appears on hover changes that
        number, so every material in the museum recompiled the moment
        the pointer touched a label - and again when it left. Clicking a
        door made its label active, so the click itself triggered a full
        recompile, and leaving the room triggered another.

        The lettering already emits its own light above the bloom
        threshold, so the glow you see when it is lit is unchanged.
      */}
    </group>
  );
}
