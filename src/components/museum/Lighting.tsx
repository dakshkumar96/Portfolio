"use client";

import { LEVEL } from "./palette";

/**
 * Fill only. Ambient and hemisphere lights consume no texture samplers,
 * which matters here: the GPU caps fragment samplers at 16, so the
 * spotlights that pick out the cases and doors have to be spent
 * carefully. General visibility is bought with free light instead.
 */
export function FillLights() {
  return (
    <>
      <ambientLight intensity={LEVEL.ambient} color="#5c4a38" />
      {/* Warm-dim: as the room darkens it shifts amber, never grey. Cool
 * shadow in a warm room reads fluorescent. */}
      <hemisphereLight args={["#c9a97a", "#100c08", LEVEL.hemisphere]} />
    </>
  );
}
