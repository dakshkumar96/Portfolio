"use client";

import { useState } from "react";
import { site } from "@/content/site";

/**
 * The loading screen.
 *
 * Plain DOM, deliberately. A 3D loader has to wait for the very thing it
 * is covering for, so it appears late and competes for the GPU at exactly
 * the moment the scene is compiling shaders and uploading textures. This
 * paints on the first frame and costs nothing.
 *
 * Both the creeping bar and the unmount are driven by CSS rather than
 * React:
 *
 *  - the bar is a keyframe animation easing toward 88%, so no per-frame
 *    state update is needed to make it move
 *  - the element removes itself on transitionend, the moment its fade
 *    actually completes, instead of after a guessed number of
 *    milliseconds
 *
 * Both matter here: this component is on screen precisely when the main
 * thread is busiest, so it should ask nothing of React at all.
 */
export function LoadingVeil({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);

  if (gone) return null;

  return (
    <div
      className={`veil${ready ? " veil-out" : ""}`}
      aria-hidden="true"
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity" && ready) setGone(true);
      }}
    >
      <div className="veil-inner">
        <p className="veil-eyebrow">{site.role}</p>
        <h2 className="veil-name serif">{site.name}</h2>

        <div className="veil-track">
          <span className={`veil-fill${ready ? " veil-fill-done" : ""}`} />
        </div>

        <p className="veil-status">
          {ready ? "Entering" : "Preparing the hall"}
          <span className="veil-dots" />
        </p>
      </div>
    </div>
  );
}
