"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GOLD, GOLD_HOT } from "./theme";

const PAD = 48;
const FONT_PX = 128;

/** The page's Garamond, under the generated name next/font gave it. */
function labelFace() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-cormorant").trim();
  return v ? `${v}, Georgia, serif` : "Georgia, serif";
}

function drawLabel(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${FONT_PX}px ${labelFace()}`;
  ctx.letterSpacing = "0.12em";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + FONT_PX * 0.04);
}

/**
 * Text living in the 3D scene, drawn to a canvas at runtime.
 *
 * Set the way a museum letters its labels: the site's Garamond in spaced
 * capitals, gilt-coloured and lit a little from within, rather than a
 * heavy interface sans. Drawn at once in whatever serif is ready, and
 * again in the Garamond when it has loaded; the canvas keeps its size, so
 * the label never moves.
 *
 * Not extruded geometry: three ships no typeface JSON and troika fetches
 * its font from a CDN, so real TextGeometry would mean a runtime network
 * dependency. Layering a few offset copies gives it depth instead, and
 * it stays lit, occluded and clickable like any other object.
 */
function makeLabel(raw: string) {
  const text = raw.toUpperCase();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // measured in the fallback, which is wider than the Garamond, so the final face always fits
  ctx.font = `600 ${FONT_PX}px Georgia, serif`;
  ctx.letterSpacing = "0.12em";
  const w = Math.ceil(ctx.measureText(text).width * 1.04) + PAD * 2;
  const h = FONT_PX + PAD * 2;
  canvas.width = w;
  canvas.height = h;
  drawLabel(canvas, text);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  document.fonts?.load(`600 ${FONT_PX}px ${labelFace()}`, text).then(() => {
    drawLabel(canvas, text);
    texture.needsUpdate = true;
  }).catch(() => {});
  return { texture, aspect: w / h };
}

function useTextTexture(text: string) {
  const result = useMemo(() => makeLabel(text), [text]);
  useEffect(() => () => result?.texture.dispose(), [result]);
  return result;
}

export function ExhibitText({
  text,
  position,
  height: wanted = 0.34,
  maxWidth,
  active = false,
  onSelect,
}: {
  text: string;
  position: [number, number, number];
  height?: number;
  /** The most the lettering may be wide: it is made smaller, whole, rather than run past what it labels. */
  maxWidth?: number;
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
  const height = maxWidth && wanted * data.aspect > maxWidth ? maxWidth / data.aspect : wanted;
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
              emissiveIntensity={lit ? 2.4 : 1.5}
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
