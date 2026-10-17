"use client";

import { useEffect, useRef } from "react";

/**
 * Drag-to-look.
 *
 * Costs essentially nothing: it adds no geometry, lights or materials,
 * and changes two numbers per frame. The work is all in the two problems
 * it creates rather than in the looking itself.
 *
 * 1. LOOKING AT NOTHING. The corridor is a box with an open end behind
 *    the camera — let someone spin freely and they will find the void.
 *    The yaw and pitch are therefore clamped to a range that stays
 *    inside the built geometry.
 *
 * 2. DRAGS BECOMING CLICKS. A pointerup after a drag still fires a click
 *    on whatever is under the cursor, so dragging across a door would
 *    open a room. `consumedDrag` lets click handlers ask whether the
 *    gesture that just ended was a drag, and ignore it if so.
 */

const MAX_YAW = 0.62; // ~35 degrees each way
/**
 * How far the view may turn, and whether it stays where it was turned.
 * Most rooms are seen from where you stand: a quarter turn at most, and
 * it eases back when you let go. A room with things on its side walls
 * (the About room) lets you turn nearly to the walls and stay turned, so
 * what is there can be looked at and clicked. CameraRig sets this as you
 * enter and leave a room.
 */
const lookRange = { yaw: MAX_YAW, sticky: false };
let recentre: (() => void) | null = null;

/** Called as a room is entered or left: sets how far you may turn there, and faces you front. */
export function setLookRoom(wide: boolean) {
  lookRange.yaw = wide ? 1.45 : MAX_YAW;
  lookRange.sticky = wide;
  recentre?.();
}
const MAX_PITCH = 0.32;
/** Past this much movement the gesture is a look, not a click. */
const DRAG_THRESHOLD = 6;

export type LookState = { yaw: number; pitch: number; dragging: boolean };

let dragged = false;

/** True if the gesture that just ended moved far enough to be a drag. */
export function consumedDrag() {
  return dragged;
}

export function useLookControls() {
  const look = useRef<LookState>({ yaw: 0, pitch: 0, dragging: false });

  useEffect(() => {
    recentre = () => {
      look.current.yaw = 0;
      look.current.pitch = 0;
    };
    let active = false;
    let lastX = 0;
    let lastY = 0;
    let travelled = 0;

    const down = (e: PointerEvent) => {
      // left button only, so context menus and middle-click are untouched
      if (e.button !== 0) return;
      active = true;
      look.current.dragging = true;
      dragged = false;
      travelled = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const move = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled > DRAG_THRESHOLD) dragged = true;

      /*
        How far the view turns per pixel dragged.

        At 0.0022 it took nearly three hundred pixels of drag to reach
        the clamp - most of a screen to look thirty-five degrees, which
        feels like the camera is resisting you rather than following.
        This covers the same range in about two hundred.
      */
      const l = look.current;
      l.yaw = Math.max(-lookRange.yaw, Math.min(lookRange.yaw, l.yaw - dx * 0.0032));
      l.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, l.pitch - dy * 0.0024));
      if (dragged) document.body.style.cursor = "grabbing";
    };

    const up = () => {
      if (!active) return;
      active = false;

      /*
        Let go and the view comes back.

        Holding the angle you dragged to meant every shot after a look
        was off-axis, and the hall is built to be seen straight down.
        Releasing returns the target to centre; CameraRig eases it back
        rather than snapping, and uses a gentler damping for the return
        than for the drag itself.
      */
      if (!lookRange.sticky) {
        look.current.yaw = 0;
        look.current.pitch = 0;
      }
      look.current.dragging = false;

      document.body.style.cursor = "";
      // cleared on the next frame, after any click handler has read it
      requestAnimationFrame(() => {
        dragged = false;
      });
    };

    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      recentre = null;
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  return look;
}
