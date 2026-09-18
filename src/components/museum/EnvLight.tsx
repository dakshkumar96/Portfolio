"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { seededRandom } from "./rand";

/**
 * Indirect lighting + specular environment for every PBR material.
 *
 * PBR surfaces get their specular reflection from an environment map,
 * not from direct lights — without one, glass and polished floors have
 * nothing to reflect and read flat no matter how many spotlights you
 * add. This is the single biggest realism lever in the scene.
 *
 * drei's <Environment preset> would fetch an HDRI from a CDN at runtime.
 * This builds an equirectangular map locally and runs it through PMREM
 * instead: same effect on materials, no network dependency. Swap in a
 * real .hdr via <Environment files> if you want scanned lighting.
 */
export function EnvLight({ intensity = 0.42 }: { intensity?: number } = {}) {
  const gl = useThree((s) => s.gl);

  const envTexture = useMemo(() => {
    const w = 512;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    // dark interior: warm bounce off the sand floor, cool dim vault above
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, "#100c07");
    g.addColorStop(0.38, "#20180f");
    g.addColorStop(0.52, "#5a4425");
    g.addColorStop(0.72, "#7d5c2c");
    g.addColorStop(1.0, "#241a10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // level is baked into the map: adjusting scene.environmentIntensity
    // would mean mutating scene state from render
    ctx.globalAlpha = 1 - Math.min(0.9, Math.max(0, 1 - intensity));
    ctx.globalCompositeOperation = "source-over";

    // a few warm pools at lamp height so reflections vary along the hall
    const rand = seededRandom(7788);
    for (let i = 0; i < 12; i += 1) {
      const x = rand() * w;
      const y = h * 0.52 + (rand() - 0.5) * h * 0.16;
      const r = 26 + rand() * 58;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, "rgba(255,206,150,0.5)");
      rg.addColorStop(1, "rgba(255,206,150,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    return rt.texture;
  }, [gl, intensity]);

  useEffect(() => () => envTexture?.dispose(), [envTexture]);

  if (!envTexture) return null;
  // texture attached declaratively rather than assigning scene.environment
  return <primitive object={envTexture} attach="environment" />;
}
