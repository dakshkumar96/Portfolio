"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sinceClick } from "./clickTrace";

/**
 * A readout of what the renderer is actually doing, shown only when the
 * address has `?debug` on it. Visitors never see it.
 *
 * Exists because the browser pane used for checking this project will
 * not paint unless its window is in front, so frame timing cannot be
 * measured from outside. This puts the same numbers on screen for
 * whoever is looking at it.
 *
 * Two details make the numbers honest:
 *
 * `info.autoReset` is turned off. It normally clears on every `render()`
 * call, and the post-processing stack renders several times per frame,
 * so reading it gave the last full-screen pass — one draw call and two
 * triangles — rather than the scene. It is now reset once per frame,
 * here, after the totals have been read.
 *
 * And a frame over 250ms is reported with what changed during it.
 * Geometries climbing means objects were built; programs climbing means
 * shaders were compiled. That distinction is the whole diagnosis.
 *
 * Mounted only behind `hasDebugFlag()` (debug.ts) - see its mount site.
 */
export function PerfHud() {
  const el = useRef<HTMLDivElement | null>(null);
  const acc = useRef({ frames: 0, elapsed: 0, worst: 0, peak: 0 });
  const last = useRef({ geometries: 0, programs: 0, textures: 0 });
  /*
    A hidden tab does not get frames, and `delta` is wall-clock, so
    coming back from one looks like a single enormous frame — one read
    31 seconds. That is a gap, not work, and counting it as the worst
    frame makes every other number untrustworthy. The first frame after
    the tab is visible again is therefore discarded.
  */
  const resumed = useRef(false);
  /** One-off report of the program cache, once compiling has settled. */
  const dumped = useRef(false);
  const probe = useRef(0);
  const keyed = useRef(false);
  const calm = useRef(0);

  useEffect(() => {
    const d = document.createElement("div");
    d.setAttribute("data-perf-hud", "");
    d.style.cssText = [
      "position:fixed",
      "left:10px",
      "bottom:10px",
      "z-index:99999",
      "padding:7px 10px",
      "font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
      "color:#ffd9a0",
      "background:rgba(10,7,4,.86)",
      "border:1px solid rgba(255,182,63,.3)",
      "border-radius:6px",
      "white-space:pre",
      "pointer-events:none",
    ].join(";");
    d.textContent = "measuring…";
    document.body.appendChild(d);
    el.current = d;

    const onVisibility = () => {
      if (document.hidden) resumed.current = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      d.remove();
      el.current = null;
    };
  }, []);

  useFrame(({ gl, scene }, delta) => {
    /*
      Reached through the frame's own state rather than a captured
      value: the renderer belongs to the loop, not to render. Assigning
      this every frame costs nothing and is idempotent.
    */
    gl.info.autoReset = false;

    const a = acc.current;
    const ms = delta * 1000;

    if (resumed.current) {
      resumed.current = false;
      gl.info.reset();
      return;
    }

    a.frames += 1;
    a.elapsed += delta;
    if (ms > a.worst) a.worst = ms;
    if (ms > a.peak) a.peak = ms;

    const r = gl.info.render;
    const m = gl.info.memory;
    const programs = gl.info.programs?.length ?? 0;

    // name the culprit of any frame slow enough to be felt
    if (ms > (sinceClick() === null ? 250 : 80)) {
      const dGeo = m.geometries - last.current.geometries;
      const dProg = programs - last.current.programs;
      const dTex = m.textures - last.current.textures;
      const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
      const after = sinceClick();
      console.warn(
        `[perf] ${ms.toFixed(0)}ms frame — ` +
          `geometries ${sign(dGeo)} (${m.geometries}), ` +
          `programs ${sign(dProg)} (${programs}), ` +
          `textures ${sign(dTex)} (${m.textures})` +
          (after === null ? "" : `  | ${Math.round(after)}ms after door click`),
      );
    }
    last.current.geometries = m.geometries;
    last.current.programs = programs;
    last.current.textures = m.textures;

    /*
      Name what differs between programs that ought to be one.

      Fires on a fixed count of rendered frames rather than waiting for
      the scene to go quiet, so it reports even while doors are still
      arriving. Programs are grouped by material type; for the largest
      group, two cache keys are split on their separators and every
      field that differs is printed. Two programs for the same kind of
      material differ only in what is in that list.
    */
    probe.current += 1;
    if (probe.current === 600 && !keyed.current) {
      keyed.current = true;
      const list = gl.info.programs ?? [];
      const groups = new Map<string, string[]>();
      for (const pr of list) {
        const name = (pr as unknown as { name?: string }).name ?? "?";
        const key = (pr as unknown as { cacheKey?: string }).cacheKey ?? "";
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name)!.push(key);
      }
      const sizes = [...groups.entries()]
        .map(([n, keys]) => `${n} x${keys.length}`)
        .join(", ");
      console.warn(`[keys] ${list.length} programs: ${sizes}`);
      const biggest = [...groups.values()].sort((x, y) => y.length - x.length)[0] ?? [];
      if (biggest.length >= 2) {
        const a = biggest[0].split(",");
        for (let j = 1; j < Math.min(biggest.length, 4); j += 1) {
          const b = biggest[j].split(",");
          const diffs: string[] = [];
          for (let k = 0; k < Math.max(a.length, b.length); k += 1) {
            if (a[k] !== b[k]) diffs.push(`[${k}] ${a[k]} -> ${b[k]}`);
          }
          console.warn(`[keys] program 0 vs ${j}: ${diffs.slice(0, 14).join("  |  ")}`);
        }
      }
    }

    /*
      When nothing has compiled for a while, say what the programs
      actually are. `usedTimes` is the number of materials sharing a
      program: if most are 1, nothing is being reused and the compile
      cost is all duplication.
    */
    if (!dumped.current) {
      if (programs === last.current.programs) calm.current += 1;
      else calm.current = 0;
      if (calm.current > 120 && programs > 0) {
        dumped.current = true;
        const list = gl.info.programs ?? [];
        const shared = list.filter((pr) => pr.usedTimes > 1).length;
        const once = list.length - shared;
        const tally = new Map<number, number>();
        for (const pr of list) tally.set(pr.usedTimes, (tally.get(pr.usedTimes) ?? 0) + 1);
        const spread = [...tally.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([used, n]) => `${n} program(s) used by ${used}`)
          .join(", ");
        console.warn(
          `[perf] ${list.length} programs total — ${once} used once, ${shared} shared. ${spread}`,
        );
      }
    }

    if (a.elapsed >= 0.5) {
      const fps = a.frames / a.elapsed;
      let meshes = 0;
      let drawn = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          meshes += 1;
          if (o.visible && o.parent?.visible !== false) drawn += 1;
        }
      });

      const node = el.current;
      if (node) {
        node.textContent =
          `${fps.toFixed(0)} fps    frame ${(1000 / fps).toFixed(1)}ms\n` +
          `worst ${a.worst.toFixed(0)}ms    peak ${a.peak.toFixed(0)}ms\n` +
          `calls ${r.calls}    tris ${Math.round(r.triangles / 1000)}k\n` +
          `meshes ${drawn}/${meshes}    programs ${programs}\n` +
          `geo ${m.geometries}    tex ${m.textures}`;
      }

      a.frames = 0;
      a.elapsed = 0;
      a.worst = 0;
    }

    // totals read; clear them for the frame about to be drawn
    gl.info.reset();
  });

  return null;
}
