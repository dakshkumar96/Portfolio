/**
 * The museum's design system: one place that decides colour, material and
 * light level, so the hall reads as a designed interior rather than a pile
 * of hex values.
 *
 * The principles it is built on:
 *
 * 1. ONE HUE FAMILY, CONTRAST IN VALUE — not hue.
 *    Everything here is warm (amber/gold). Interest comes from dark
 *    against light, matte against polished, not from adding a second
 *    colour. Mixing a cool accent into a gold room is the single fastest
 *    way to make it look unplanned.
 *
 * 2. 60 / 30 / 10.
 *    60% of the frame is the dark envelope (walls, ceiling, floor), 30%
 *    is mid-tone stone and metalwork, and only 10% is the gold accent.
 *    Gold stops looking like gold the moment everything is gold.
 *
 * 3. LAYERED LIGHT — ambient, accent, decorative.
 *    Ambient keeps the space from crushing to black. Accent picks out the
 *    exhibits. Decorative is the fixture you can actually see glowing.
 *    Each does one job; problems come from asking one layer to do all three.
 *
 * 4. CONTRAST RATIO ~8:1 between an exhibit and the wall behind it.
 *    That gap is what makes an object feel precious. Lift the ambient too
 *    far and everything flattens into a lit room with things in it.
 *
 * 5. WARM-DIM.
 *    Real light sources go warmer as they dim, the way a filament or the
 *    sun at dusk does. Dim surfaces here shift toward amber, never toward
 *    grey — cool shadow in a warm room reads as fluorescent and cheap.
 *
 * 6. GOLD IS A METAL, NOT A COLOUR.
 *    Gold reads as gold through reflection: high metalness, low roughness,
 *    and an environment to reflect. Flat yellow with no reflection is
 *    mustard paint. Every gold surface below is metalness ~1 with a real
 *    envMapIntensity.
 *
 * 7. A GLOW HAS A HOT CORE.
 *    Neon, filament and glowing metal are near-white at the centre and
 *    saturate outward. Emissive elements use the near-white core with a
 *    saturated amber halo around them, never flat yellow.
 */

/**
 * 60% — the envelope.
 *
 * Sand rather than near-black. The hall still reads dark because the
 * lighting is sparse and directional, but the surfaces themselves now
 * carry a warm stone colour, so what light does land on them has
 * something to pick up.
 */
export const SHELL = {
  /** Walls: warm sandstone, matte so they stay quiet behind the exhibits. */
  wall: "#544735",
  /** Floor and ceiling: darker sand, so the walls stay the lighter plane. */
  ground: "#2b251c",
  /** Recesses and reveals: deep enough to still hold shadow. */
  recess: "#191410",
} as const;

/** 30% — mid-tone stone and structural metal. */
export const MID = {
  stone: "#6f6046",
  /** Unlit metal: dark bronze that only brightens where light catches it. */
  bronze: "#5b4828",
  plinth: "#2a2219",
} as const;

/** 10% — the accent. Used sparingly, and always as a metal or a light. */
export const GOLD = {
  /** Polished gold: needs metalness 1 + low roughness + an env map. */
  metal: "#c9a227",
  /** Brighter gold for edges catching direct light. */
  metalLit: "#e8c565",
  /** The near-white core of anything that emits. */
  core: "#fff3d4",
  /** The saturated halo around that core. */
  halo: "#ffb63f",
  /** Warm light colour, roughly 2700K. */
  light: "#ffd9a0",
} as const;

/**
 * Light levels, as a ladder rather than isolated numbers.
 *
 * Each rung is a multiple of the one below, which is what keeps the 8:1
 * exhibit-to-wall contrast intact when any single value is tuned.
 */
export const LEVEL = {
  /** Just enough to stop true black. Layer 1. */
  ambient: 0.19,
  /** Sky/ground bounce. Still layer 1. */
  hemisphere: 0.44,
  /**
   * Wall wash. Unused by the coves, which cast nothing: a point light
   * near a ceiling makes a hotspot, not a wash. Kept for fittings that
   * genuinely need a local pool.
   */
  wallWash: 16,
  /** Doors: navigation, so brighter than walls but below the exhibits. */
  door: 120,
  doorLit: 240,
  /** Exhibits: the brightest thing in the hall. Layer 2. */
  exhibit: 44,
  /** The far focal point, which has to carry the length of the corridor. */
  vista: 240,
} as const;

/** Emissive strengths for visible fixtures. Layer 3, decorative. */
export const EMIT = {
  /** Hairline light lines: read as a filament, so they run hot. */
  hairline: 4.2,
  hairlineLit: 9,
  /** Broad emissive surfaces: must stay low or they blow out under bloom. */
  panel: 0.9,
  /** Deck inside a case. */
  deck: 1.15,
} as const;

/** Atmosphere. Warm, so distance fades to amber-black rather than grey. */
export const ATMOSPHERE = {
  /** Distance fades to warm sand haze rather than black. */
  background: "#160f0a",
  fogDensity: 0.0098,
  exposure: 0.94,
} as const;
