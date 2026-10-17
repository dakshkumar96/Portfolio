import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * The sign that something opens, made of the thing itself: its own lit
 * parts - the gilt on a frame, the seams of a case, the edge of a board -
 * brighten and settle slowly, as a warm lamp behind them might. Nothing
 * is added to the scene and nothing sits behind the object; it is the
 * object that glows.
 *
 * Give the returned callback to the `ref` of each material that should
 * breathe. Each frame its emissive intensity is set to the base plus a
 * slow swell of up to `amp`. The base is read afresh each render, so a
 * hover that raises it still works. With reduced motion asked for the
 * swell is held at a gentle middle and does not move.
 */
export function usePulse(base: number, amp: number, enabled = true) {
  const materials = useRef(new Set<THREE.MeshStandardMaterial>());
  const live = useRef({ base, amp, enabled });
  useEffect(() => {
    live.current = { base, amp, enabled };
  }, [base, amp, enabled]);
  const still = useRef(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useFrame(({ clock }) => {
    const { base: b, amp: a, enabled: on } = live.current;
    const k = still.current ? 0.5 : 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.9);
    for (const m of materials.current) m.emissiveIntensity = b + (on ? a * k : 0);
  });

  return useCallback((m: THREE.MeshStandardMaterial | null) => {
    if (m) materials.current.add(m);
  }, []);
}
