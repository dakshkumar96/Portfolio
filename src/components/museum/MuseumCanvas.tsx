"use client";

import { Suspense } from "react";
import type { RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { Corridor } from "./Corridor";
import { Effects } from "./Effects";
import { ExhibitText } from "./ExhibitText";
import { FillLights } from "./Lighting";
import { EnvLight } from "./EnvLight";
import { ATMOSPHERE } from "./palette";
import { Vitrine, type VitrineShape } from "./Vitrine";
import { PortraitWall } from "./PortraitWall";
import {
  CAM_Z_START,
  CAM_Y,
  doors,
  doorX,
  DOOR_H,
  ROOM_DEPTH,
  ROOM_WIDTH,
  roomCenter,
  type RoomId,
} from "./corridorLayout";
import { exhibitsByRoom, type ExhibitDatum } from "./exhibitData";

const SHAPES: VitrineShape[] = ["icosahedron", "octahedron", "torus", "sphere", "box"];

/** Cases for the room you have stepped into, set out in front of its door. */
function RoomContents({
  roomId,
  activeId,
  onSelect,
}: {
  roomId: RoomId;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  const door = doors.find((d) => d.id === roomId);
  if (!door) return null;

  const items = exhibitsByRoom[roomId] ?? [];

  // About is a picture gallery, not a vitrine hall: framed photographs on
  // a plain wall, each opening its own text.
  if (roomId === "about") {
    return (
      <PortraitWall door={door} items={items} activeId={activeId} onSelect={onSelect} />
    );
  }

  const sgn = door.side === "left" ? -1 : 1;
  const [cx, cz] = roomCenter(door);
  /*
    Set well out from the back wall, for two reasons.

    A case pressed against the stone sits in its own shadow, and the
    wall wash that lights the room passes behind it instead of around
    it. And in a room this deep, anything on the back wall is sixteen
    units from where the visitor stands — cases at that distance read as
    models on a shelf. Standing them a third of the way into the room
    puts them at a viewing distance instead, and leaves the lit wall
    behind them as a backdrop.
  */
  const backX = cx + sgn * (ROOM_DEPTH / 2 - 5.5);

  return (
    <group>
      {items.map((exhibit, i) => {
        /*
          Fanned along the back wall at a fixed pitch rather than spread
          to fill it. Dividing the full width by however many exhibits a
          room happens to hold put three cases 8 units apart and six of
          them almost touching; a gallery sets everything out at one
          spacing and lets a short run finish early.
        */
        const PITCH = 4.2;
        const span = Math.min((items.length - 1) * PITCH, ROOM_WIDTH - 6);
        const spread =
          items.length === 1 ? 0 : (i / (items.length - 1) - 0.5) * span;
        const p: [number, number, number] = [backX, 0, cz + spread];
        const isActive = activeId === exhibit.id;
        return (
          <group key={exhibit.id}>
            <Vitrine
              position={p}
              shape={roomId === "projects" ? "screen" : SHAPES[i % SHAPES.length]}
              seed={i}
              active={isActive}
              onSelect={() => onSelect(exhibit)}
              screenTitle={roomId === "projects" ? exhibit.title : undefined}
              screenSubtitle={
                roomId === "projects"
                  ? exhibit.meta?.split(" · ").slice(0, 2).join(" · ")
                  : undefined
              }
            />
            {/* title faces back toward the doorway you came in through */}
            <group position={[p[0], 2.5, p[2]]} rotation={[0, -sgn * Math.PI * 0.5, 0]}>
              {/* sized for the longer sightline this room now has */}
              <ExhibitText
                text={exhibit.title}
                position={[0, 0, 0]}
                height={0.34}
                active={isActive}
                onSelect={() => onSelect(exhibit)}
              />
            </group>
            <pointLight
              position={[p[0] - sgn * 1.2, 2.4, p[2]]}
              color="#ffd9a6"
              intensity={28}
              distance={11}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}

export function MuseumCanvas({
  progressRef,
  roomId,
  onEnterRoom,
  activeId,
  onSelect,
}: {
  progressRef: RefObject<number>;
  roomId: RoomId | null;
  onEnterRoom: (id: RoomId) => void;
  activeId: string | null;
  onSelect: (exhibit: ExhibitDatum) => void;
}) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ position: [0, CAM_Y, CAM_Z_START], fov: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = ATMOSPHERE.exposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <color attach="background" args={[ATMOSPHERE.background]} />
      <fogExp2 attach="fog" args={[ATMOSPHERE.background, ATMOSPHERE.fogDensity]} />

      <EnvLight intensity={0.5} />
      <FillLights />

      <Suspense fallback={null}>
        <Corridor
          activeRoom={roomId}
          onEnter={onEnterRoom}
          activeId={activeId}
          onSelect={onSelect}
        />

        {/*
          The room name sits above the arch, not on the leaf.

          The leaf carries dense engraving now, and a label laid over it
          competed with the traces for every pixel. Above the apex it has
          clear stone behind it and reads at a glance from down the hall,
          which is what a wayfinding label is for.
        */}
        {doors.map((door) => {
          const sgn = door.side === "left" ? -1 : 1;
          const yaw = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
          return (
            <group
              key={door.id}
              position={[doorX(door.side) - sgn * 0.42, DOOR_H + 1.05, door.z]}
              rotation={[0, yaw, 0]}
            >
              <ExhibitText
                text={door.label}
                position={[0, 0, 0]}
                height={0.42}
                active={roomId === door.id}
                onSelect={() => onEnterRoom(door.id)}
              />
            </group>
          );
        })}

        {roomId ? (
          <RoomContents roomId={roomId} activeId={activeId} onSelect={onSelect} />
        ) : null}
      </Suspense>

      <CameraRig progressRef={progressRef} roomId={roomId} />
      <Effects />
    </Canvas>
  );
}
