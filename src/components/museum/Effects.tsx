"use client";

import {
  EffectComposer,
  Bloom,
  Vignette,
  HueSaturation,
  BrightnessContrast,
} from "@react-three/postprocessing";

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
      {/*
        Chromatic aberration and film noise used to sit here and have
        been dropped.

        Both had been tuned down until they were honest — the fringe to
        an offset of 0.00009 and the grain to 3% opacity — and at those
        values neither is visible on any display, while each still costs
        its own full-screen pass every frame. An effect you cannot see is
        not worth the pixels.
      */}
      <HueSaturation hue={0.0} saturation={-0.14} />
      <BrightnessContrast brightness={0.01} contrast={0.12} />
    </EffectComposer>
  );
}
