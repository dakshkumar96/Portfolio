"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DepthOfFieldEffect } from "postprocessing";
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  Vignette,
  HueSaturation,
  BrightnessContrast,
} from "@react-three/postprocessing";
import { doors, type RoomId } from "./corridorLayout";
import { backWallX, roomView } from "./roomLayout";

/**
 * Grade is done with Hue/Saturation + Brightness/Contrast rather than a
 * LUT file: shadows cool, highlights warm, contrast lifted a little.
 * Keeps the stack asset-free.
 */
export function Effects({ roomId }: { roomId: RoomId | null }) {
  /*
    How far the camera stands from the exhibits, in a room: from its fixed
    viewing position to just in front of the back wall they stand against.
  */
  const focus = useMemo(() => {
    const door = roomId ? doors.find((d) => d.id === roomId) : undefined;
    /* the Art room is one flat wall of pictures: every one of them should be sharp */
    if (!door || door.id === "art") return null;
    return Math.abs(roomView(door).position[0] - backWallX(door)) - 1.2;
  }, [roomId]);

  /*
    The depth of field is always in the stack, and faded rather than
    added and removed. Putting an effect in or taking it out rebuilds the
    composer's shader, and that happened on the very click that opened a
    door - a stall at the start of the walk. Out of a room it is opened
    right out (an in-focus range far deeper than the hall), which draws
    nothing soft at all; in one, it eases in once you have stopped.
  */
  const dof = useRef<DepthOfFieldEffect>(null);
  const lastFocus = useRef(10);
  useFrame((_, delta) => {
    const effect = dof.current;
    if (!effect) return;
    if (focus) lastFocus.current = focus;
    const k = THREE.MathUtils.damp(effect.bokehScale, focus ? 1.2 : 0, 2.5, Math.min(delta, 1 / 15));
    effect.bokehScale = k < 0.002 ? 0 : k;
    const coc = effect.cocMaterial;
    coc.worldFocusDistance = lastFocus.current;
    coc.worldFocusRange = THREE.MathUtils.lerp(400, 7, effect.bokehScale / 1.2);
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.25} mipmapBlur />
      {/*
        A very light depth of field, in the rooms only: the exhibits sharp,
        the floor at your feet and the far corners of the ceiling a touch
        soft, the way a lens sees a room. Not in the hall, where everything
        is walked past and nothing is the subject. Half resolution: it is a
        softening, not a bokeh.
      */}
      <DepthOfField
        ref={dof}
        worldFocusDistance={10}
        worldFocusRange={400}
        bokehScale={0}
        resolutionScale={0.5}
      />
      <Vignette eskil={false} offset={0.32} darkness={0.5} />
      {/*
        Chromatic aberration and film noise used to sit here and have
        been dropped.

        Both had been tuned down until they were honest — the fringe to
        an offset of 0.00009 and the grain to 3% opacity — and at those
        values neither is visible on any display, while each still costs
        its own full-screen pass every frame. An effect you cannot see is
        not worth the pixels.
      */}
      {/* the Art wall's posters are printed to cancel these two (exactPrint in photoGrade): keep them in step */}
      <HueSaturation hue={0.0} saturation={-0.14} />
      <BrightnessContrast brightness={0.01} contrast={0.12} />
    </EffectComposer>
  );
}
