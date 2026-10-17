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
 *
 * There is no depth of field. The rooms had a light one - the work sharp,
 * the floor at your feet and the walls to either side a touch soft - but
 * a visitor in a room turns to look along its walls, and everything off
 * to the sides came out blurred. Everything stays sharp now.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.25} mipmapBlur />
      <Vignette eskil={false} offset={0.32} darkness={0.5} />
      {/* the Art wall's posters are printed to cancel these two (exactPrint in photoGrade): keep them in step */}
      <HueSaturation hue={0.0} saturation={-0.14} />
      <BrightnessContrast brightness={0.01} contrast={0.12} />
    </EffectComposer>
  );
}
