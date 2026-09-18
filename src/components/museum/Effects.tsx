"use client";

import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
  HueSaturation,
  BrightnessContrast,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

/**
 * Grade is done with Hue/Saturation + Brightness/Contrast rather than a
 * LUT file: shadows cool, highlights warm, contrast lifted a little.
 * Keeps the stack asset-free.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.93} luminanceSmoothing={0.2} intensity={0.2} mipmapBlur />
      <Vignette eskil={false} offset={0.3} darkness={0.6} />
      {/* 0.0008 fringed every edge in frame. An order of magnitude lower,
          with radial modulation on, keeps it to the extreme corners. */}
      <ChromaticAberration
        offset={new THREE.Vector2(0.00009, 0.00009)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation
        modulationOffset={0.62}
      />
      <Noise opacity={0.03} blendFunction={BlendFunction.OVERLAY} />
      <HueSaturation hue={0.0} saturation={-0.14} />
      <BrightnessContrast brightness={0.01} contrast={0.12} />
    </EffectComposer>
  );
}
