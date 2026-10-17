"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { consumedDrag } from "./lookControls";
import { GOLD } from "./theme";

/** Cold grey, not gold. The only warm thing in a case is its light. */
const FRAME_METAL = "#7d8794";
/*
  The case's own light: warm gold, and tone-mapped like everything else.
  It used to run untone-mapped at full strength, which under bloom came out
  as the whitest thing in the room - the lid of every case a bar of white.
  This is under half of that, and it stays gold.
*/
const CASE_LIGHT = "#e0b070";

/* the plinth: dark lacquer on a darker base, with bronze at the fillet, the cap and the panel moulding */
const PLINTH_BASE = "#120d08";
const PLINTH_BODY = "#2a1d13";
const PANEL = "#30221a";
const BRONZE = "#4a3820";
const BRASS = "#b8935a";

/** How big a logo is in its case, against the size it was drawn at. */
const ICON_SCALE = 0.62;
import { getGlassSmudge, brushedMetalFor, getContactShadow } from "./textures";
import { isShown } from "./visibility";
import { usePulse } from "./breath";
import { RoomIcon } from "./RoomIcon";
import { BrandLogo } from "./BrandLogo";
import { isBrandIcon, type RoomIconId } from "./roomIcons";

export type VitrineShape = "icosahedron" | "sphere" | "octahedron" | "box" | "torus" | "screen" | "icon";

function ExhibitGeometry({ shape }: { shape: Exclude<VitrineShape, "screen" | "icon"> }) {
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

/** The inset panel on the plinth's face, as a share of the plinth's width and of its body: where the label is set. */
export const PANEL_W = 0.86;
export const PANEL_H = 0.86;

export function Vitrine({
  position,
  shape,
  seed = 0,
  icon,
  faceYaw = 0,
  screenTitle,
  screenSubtitle,
  /*
    Proportioned for what is actually in it.

    The corridor cases are five metres of glass because they hold real
    objects - a camera, a laptop. These hold a single small solid, and
    at that height the case was mostly empty air with something adrift
    near the bottom. A tall plinth and a shorter case puts the piece at
    the height you look at it and leaves the glass doing its job rather
    than filling the room.
  */
  height = 1.6,
  caseHeight = 2.9,
  caseWidth = 2.0,
  active = false,
  onSelect,
}: {
  position: [number, number, number];
  shape: VitrineShape;
  seed?: number;
  /** For shape "icon": which logo stands in the case. */
  icon?: RoomIconId;
  /** For shape "icon": the turn that squares the logo to whoever walks in. */
  faceYaw?: number;
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
  const smudge = useMemo(() => getGlassSmudge(), []);
  const brushed = useMemo(() => brushedMetalFor(2, 1), []);
  const contact = useMemo(() => getContactShadow(), []);
  /** The shapes were drawn for a case half this size. */
  const coreScale = (caseWidth / 1.05) * 0.78;
  /*
    The logos were filling their cases edge to edge, which is what made a
    case read as a block with a picture on it. Smaller, they read as an
    object on a mount with glass and air round it.
  */
  const pieceScale = coreScale * (shape === "icon" ? ICON_SCALE : 1);
  /* how far below its centre the piece stops, so the mount rod meets it */
  const pieceHalf =
    (shape === "icon" ? 0.49 : shape === "screen" ? 0.245 : 0.36) * pieceScale;
  const screenTexture = useScreenTexture(screenTitle, screenSubtitle);
  const [hovered, setHovered] = useState(false);
  const floatBase = height + caseHeight * 0.45;
  const lit = hovered || active;
  /* it opens a card: its own light swells and settles, slowly */
  const breathe = usePulse(lit ? 1.6 : 1, 0.9);
  const breatheTop = usePulse(lit ? 2.2 : 1.4, 1);
  const breatheRing = usePulse(lit ? 0.9 : 0.55, 0.5);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  useFrame((state, delta) => {
    const core = coreRef.current;
    if (!isShown(core)) return;
    if (shape === "icon") {
      /*
        A plaque, not a solid: spun all the way round it spends half its
        time edge-on or showing its back, and a logo should be read.
        Swaying either side of the face keeps it toward the visitor and
        still shows its thickness and its bevel catching the light.
      */
      // a company's mark is read face on: it turns less than a gold piece does
      const reach = icon && isBrandIcon(icon) ? (lit ? 0.55 : 0.32) : lit ? 1.0 : 0.72;
      core.rotation.y = Math.sin(state.clock.elapsedTime * 0.55 + seed) * reach;
    } else {
      core.rotation.y += delta * (shape === "screen" ? 0.08 : lit ? 0.7 : 0.26);
    }
    /* no bob: the piece is on a mount now, and a mounted thing does not drift */

    // the case "unseals" a touch when selected or hovered
    const glass = glassRef.current;
    if (glass) {
      const restY = height + caseHeight / 2 + 0.03;
      const target = restY + (active ? 0.16 : hovered ? 0.05 : 0);
      glass.position.y = THREE.MathUtils.lerp(glass.position.y, target, 0.12);
    }
  });

  /* the plinth, from the floor up */
  const TOE = 0.12;
  const FILLET = 0.05;
  const CAP = 0.09;
  const bodyBottom = TOE + FILLET;
  const bodyH = height - bodyBottom - CAP;
  const bodyW = caseWidth * 1.04;
  /* inside the case: the deck, then a riser the mount stands on */
  const deckY = height + 0.06;
  const RISER = 0.1;
  const riserTop = deckY + RISER;
  const rodTop = floatBase - pieceHalf + 0.03;

  return (
    <group position={position}>
      {/*
        The plinth, built the way a cabinetmaker would build one rather
        than as a single block: a dark base moulding at the floor, a bronze
        fillet above it, the body, and a bronze cap that oversails it.
        Every edge is eased, so each one catches a line of light - a box
        with knife-edge corners has none, which is most of why the old one
        looked like a stack of cubes.
      */}
      <RoundedBox args={[caseWidth * 1.12, TOE, caseWidth * 1.12]} radius={0.02} smoothness={3} position={[0, TOE / 2, 0]}>
        <meshStandardMaterial color={PLINTH_BASE} roughness={0.5} metalness={0.2} envMapIntensity={0.6} />
      </RoundedBox>
      <RoundedBox
        args={[caseWidth * 1.08, FILLET, caseWidth * 1.08]}
        radius={0.016}
        smoothness={3}
        position={[0, TOE + FILLET / 2, 0]}
      >
        <meshStandardMaterial color={BRONZE} roughness={0.38} metalness={0.75} envMapIntensity={1.2} />
      </RoundedBox>
      <RoundedBox args={[bodyW, bodyH, bodyW]} radius={0.03} smoothness={3} position={[0, bodyBottom + bodyH / 2, 0]}>
        {/* dark lacquer, its grain only where the light catches it */}
        <meshStandardMaterial
          color={PLINTH_BODY}
          roughnessMap={brushed?.roughnessMap ?? null}
          roughness={0.5}
          metalness={0.08}
          envMapIntensity={0.75}
        />
      </RoundedBox>
      <RoundedBox args={[caseWidth * 1.1, CAP, caseWidth * 1.1]} radius={0.025} smoothness={3} position={[0, height - CAP / 2, 0]}>
        <meshStandardMaterial color={BRONZE} roughness={0.34} metalness={0.78} envMapIntensity={1.3} />
      </RoundedBox>

      {/*
        An inset panel on the face you walk up to, framed by a fine bronze
        moulding, where the label sits. It is what turns a block into a
        piece of furniture.
      */}
      <group rotation={[0, faceYaw, 0]}>
        <mesh position={[0, bodyBottom + bodyH / 2, bodyW / 2 + 0.002]}>
          <planeGeometry args={[caseWidth * PANEL_W, bodyH * PANEL_H]} />
          <meshStandardMaterial color={PANEL} roughness={0.62} metalness={0.06} envMapIntensity={0.5} />
        </mesh>
        {[
          { p: [0, (bodyH * PANEL_H) / 2, 0], s: [caseWidth * PANEL_W + 0.035, 0.035, 0.03] },
          { p: [0, -(bodyH * PANEL_H) / 2, 0], s: [caseWidth * PANEL_W + 0.035, 0.035, 0.03] },
          { p: [-(caseWidth * PANEL_W) / 2, 0, 0], s: [0.035, bodyH * PANEL_H + 0.035, 0.03] },
          { p: [(caseWidth * PANEL_W) / 2, 0, 0], s: [0.035, bodyH * PANEL_H + 0.035, 0.03] },
        ].map((m, i) => (
          <RoundedBox
            key={i}
            args={m.s as [number, number, number]}
            radius={0.008}
            smoothness={2}
            position={[m.p[0], bodyBottom + bodyH / 2 + m.p[1], bodyW / 2 + 0.012]}
          >
            <meshStandardMaterial color={BRONZE} roughness={0.36} metalness={0.7} envMapIntensity={1.2} />
          </RoundedBox>
        ))}
      </group>

      {/*
        A painted contact shadow under the plinth.

        A shadow map cannot resolve the very tight, very dark line right
        where an object meets the floor - it is below the resolution of
        the map. Compositing an ambient-occlusion decal there is what
        stops furniture looking like it is hovering a centimetre up.
      */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[caseWidth * 1.8, caseWidth * 1.8]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.42}
          depthWrite={false}
          map={contact ?? undefined}
        />
      </mesh>

      {/* the deck inside the case: a brushed plate */}
      <mesh position={[0, deckY + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[caseWidth * 0.94, caseWidth * 0.94]} />
        <meshStandardMaterial
          color="#14110d"
          roughnessMap={brushed?.roughnessMap ?? null}
          roughness={0.5}
          metalness={0.3}
          envMapIntensity={0.5}
        />
      </mesh>

      {/*
        The mount: a small eased riser and a slim brass rod up to the
        piece, the way a museum shows a small object. Nothing in a real
        case floats.
      */}
      <RoundedBox args={[caseWidth * 0.42, RISER, caseWidth * 0.42]} radius={0.02} smoothness={3} position={[0, deckY + RISER / 2, 0]}>
        <meshStandardMaterial color={PLINTH_BODY} roughness={0.45} metalness={0.15} envMapIntensity={0.8} />
      </RoundedBox>
      <mesh position={[0, (riserTop + rodTop) / 2, 0]}>
        <cylinderGeometry args={[0.014, 0.014, Math.max(0.05, rodTop - riserTop), 12]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={1} envMapIntensity={1.4} />
      </mesh>

      {/*
        The frame, and why it is thin and cold.

        Bronze posts with a cornice over them is Victorian cabinetry -
        the case read as furniture an object had been put away in. A
        futuristic vitrine is mostly glass held by as little as it can
        get away with, in a metal that is grey rather than golden, so
        the only warm thing in the piece is the light inside it.

        Thin posts with their arrises eased, each with a lit seam let into
        its inner face.
      */}
      {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as const).map(([sx, sz]) => (
        <group
          key={`${sx}${sz}`}
          position={[
            sx * (caseWidth / 2 - 0.02),
            height + caseHeight / 2 + 0.03,
            sz * (caseWidth / 2 - 0.02),
          ]}
        >
          <RoundedBox args={[0.045, caseHeight, 0.045]} radius={0.01} smoothness={2}>
            <meshStandardMaterial
              color={FRAME_METAL}
              roughness={0.24}
              metalness={0.96}
              envMapIntensity={1.7}
            />
          </RoundedBox>
          {/* the seam of light down the inside of the post */}
          <mesh position={[-sx * 0.025, 0, -sz * 0.025]}>
            <boxGeometry args={[0.012, caseHeight * 0.94, 0.012]} />
            <meshStandardMaterial
              ref={breathe}
              color={CASE_LIGHT}
              emissive={CASE_LIGHT}
              emissiveIntensity={lit ? 1.6 : 1}
            />
          </mesh>
        </group>
      ))}

      {/* a shallow sill where the glass meets the plinth */}
      <RoundedBox args={[caseWidth + 0.06, 0.06, caseWidth + 0.06]} radius={0.014} smoothness={2} position={[0, height + 0.03, 0]}>
        <meshStandardMaterial
          color={FRAME_METAL}
          roughness={0.26}
          metalness={0.94}
          envMapIntensity={1.5}
        />
      </RoundedBox>

      {/*
        The head: a thin cap, and the light the case is actually lit by.

        The strip faces down into the volume from just under the cap, so
        the glass catches along its top edge and the piece below is lit
        from above - which is where an edge-lit case puts its light. It
        is emissive, not a lamp: a light per case would change the
        scene's light count from room to room and recompile every
        material in the museum on the click that opens a door.
      */}
      <RoundedBox
        args={[caseWidth + 0.08, 0.08, caseWidth + 0.08]}
        radius={0.016}
        smoothness={2}
        position={[0, height + caseHeight + 0.06, 0]}
      >
        <meshStandardMaterial
          color={FRAME_METAL}
          roughness={0.22}
          metalness={0.96}
          envMapIntensity={1.8}
        />
      </RoundedBox>
      <mesh position={[0, height + caseHeight - 0.01, 0]}>
        <boxGeometry args={[caseWidth - 0.06, 0.03, caseWidth - 0.06]} />
        <meshStandardMaterial
          ref={breatheTop}
          color={CASE_LIGHT}
          emissive={CASE_LIGHT}
          emissiveIntensity={lit ? 2.2 : 1.4}
        />
      </mesh>

      {/*
        And the pool of light the mount stands in: a soft ring on the deck
        round the riser, so the glow inside the case has somewhere to come
        from.
      */}
      <mesh position={[0, deckY + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[caseWidth * 0.24, caseWidth * 0.38, 48]} />
        <meshStandardMaterial
          ref={breatheRing}
          color={CASE_LIGHT}
          emissive={CASE_LIGHT}
          emissiveIntensity={lit ? 0.9 : 0.55}
          transparent
          opacity={0.7}
        />
      </mesh>

      <group ref={coreRef} position={[0, floatBase, 0]} scale={pieceScale}>
        {shape === "screen" && screenTexture ? (
          <mesh>
            <planeGeometry args={[0.78, 0.49]} />
            <meshStandardMaterial
              map={screenTexture}
              emissiveMap={screenTexture}
              emissive="#ffe9cc"
              emissiveIntensity={0.85}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ) : shape === "icon" ? (
          icon ? (
            <group rotation={[0, faceYaw, 0]}>
              {isBrandIcon(icon) ? <BrandLogo id={icon} /> : <RoomIcon id={icon} />}
            </group>
          ) : null
        ) : shape !== "screen" ? (
          <mesh>
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

      {/*
        Glass without transmission. This is the click target — the
        placard only opens from here.

        `transmission: 1` costs a great deal more than it looks. Three
        renders transmissive surfaces by drawing the entire scene a
        second time into an offscreen target and building a mipmap chain
        for it, every frame that any such surface is in view — so one
        pane roughly doubles what the GPU does per frame, and it stayed
        doubled for the rest of the session once a furnished room was
        behind you. It was also what blurred everything seen through the
        panes. Opacity and a clearcoat give the same read at this size.
      */}
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
        {/*
          Glass is never perfectly clean or perfectly even. A smudge map
          on the roughness channel gives the surface something to catch
          light on, which is the difference between a pane and a flat
          tinted quad - the reflections break up instead of sliding
          across as one sheet. Same treatment as the hall.
        */}
        <meshPhysicalMaterial
          transmission={0}
          roughnessMap={smudge ?? undefined}
          roughness={0.16}
          metalness={0}
          ior={1.46}
          specularIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0.04}
          transparent
          opacity={0.15}
          color={lit ? "#f6fbff" : "#eef4fb"}
        />
      </mesh>
    </group>
  );
}
